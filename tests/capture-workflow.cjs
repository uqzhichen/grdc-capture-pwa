// Run with Playwright installed; BROWSER_EXECUTABLE can select a local Chrome binary.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const previousRelease = "3760d79";
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".csv": "text/csv", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };

async function main() {
  let servePreviousRelease = true;
  const server = http.createServer(async (req, res) => {
    const relative = decodeURIComponent(new URL(req.url, "http://localhost").pathname)
      .replace(/^\/grdc-capture-pwa\//, "") || "index.html";
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const contents = servePreviousRelease
        ? execFileSync("git", ["show", `${previousRelease}:${relative}`], { cwd: root, stdio: ["ignore", "pipe", "ignore"] })
        : await fs.readFile(file);
      res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(contents);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/grdc-capture-pwa/`;
  const artifacts = await fs.mkdtemp(path.join(os.tmpdir(), "grdc-capture-v9-"));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const unexpectedDialogs = [];
    let dialogQueue = [];
    page.on("dialog", async (dialog) => {
      const expected = dialogQueue.shift();
      if (!expected) {
        unexpectedDialogs.push(dialog.message());
        await dialog.dismiss();
        return;
      }
      expected.message = dialog.message();
      await (expected.accept ? dialog.accept() : dialog.dismiss());
    });
    function expectDialog(accept) {
      const result = { accept, message: "" };
      dialogQueue.push(result);
      return result;
    }
    async function total(expected) {
      await page.waitForFunction((count) => document.querySelector("#totalCount").textContent === String(count), expected);
    }
    async function records() {
      return page.evaluate(() => new Promise((resolve, reject) => {
        const open = indexedDB.open("grdc-capture-pwa");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const transaction = db.transaction("captures", "readonly");
          const request = transaction.objectStore("captures").getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
          transaction.oncomplete = () => db.close();
        };
      }));
    }
    async function uploadViaButton(button, payload) {
      const chooserPromise = page.waitForEvent("filechooser");
      await page.click(button);
      const chooser = await chooserPromise;
      await chooser.setFiles(payload);
    }

    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelectorAll(".protocol-slot").length === 7);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.selectOption("#potSelect", "POC-015");
    const payload = { name: "test-photo.jpg", mimeType: "image/jpeg", buffer: await page.screenshot({ type: "jpeg", clip: { x: 0, y: 0, width: 64, height: 64 } }) };
    await uploadViaButton("#importButton", payload);
    await total(1);
    const original = (await records())[0];

    // Upgrade the same origin from the deployed v8 build, with a real saved capture.
    servePreviousRelease = false;
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await page.waitForFunction(async () => (await caches.keys()).includes("grdc-capture-pwa-v9"));
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelector("#potSelect").value === "POC-015");
    await total(1);
    assert.equal(await page.textContent("#potProgressCount"), "1/7");
    assert.deepEqual((await records())[0], original);
    assert.equal(await page.locator("#potSelect option").first().textContent(), "01/16 - 01_POC-015_C_Ro_H_R4");
    assert.equal(await page.locator("#potSelect option").nth(1).textContent(), "02/16 - 02_POC-010_C_Pl_H_R3");
    assert.equal(await page.locator(".block-stop").count(), 0);

    const leave = expectDialog(true);
    await page.selectOption("#potSelect", "POC-007");
    assert.match(leave.message, /1\/7/);
    assert.equal(await page.locator(".block-stop").count(), 1);
    assert.match(await page.textContent(".pot-sequence"), /Photo 16 of 16/);
    // Check all six groups, including positions after applying a search filter.
    for (let group = 1; group <= 6; group += 1) {
      if (group > 1) {
        expectDialog(true);
        await page.selectOption("#blockSelect", String(group));
      }
      const options = await page.locator("#potSelect option").evaluateAll((nodes) => nodes.map((node) => node.textContent));
      assert.equal(options.length, 16);
      const prefixes = options.map((label) => Number(label.match(/ - (\d+)_/)[1]));
      assert.deepEqual(prefixes, Array.from({ length: 16 }, (_, i) => (group - 1) * 16 + i + 1));
      assert.match(options[0], /^01\/16/);
      assert.match(options[15], /^16\/16/);
    }
    expectDialog(true);
    await page.selectOption("#blockSelect", "1");
    await page.fill("#potSearch", "08_POC-001");
    expectDialog(true);
    await page.selectOption("#potSelect", "POC-001");
    assert.match(await page.locator("#potSelect option:checked").textContent(), /^08\/16 - 08_POC-001/);
    await page.fill("#potSearch", "01_POC-015");
    const returnCancel = expectDialog(false);
    await page.selectOption("#potSelect", "POC-015");
    assert.match(returnCancel.message, /Already photographed/);
    assert.equal(await page.inputValue("#potSelect"), "POC-001");
    const returnAccept = expectDialog(true);
    await page.selectOption("#potSelect", "POC-015");
    assert.match(returnAccept.message, /Already photographed/);

    // A duplicate is caught before the native camera opens, including old captures.
    let chooserCount = 0;
    page.on("filechooser", () => { chooserCount += 1; });
    const duplicateCancel = expectDialog(false);
    await page.click("#captureButton");
    assert.match(duplicateCancel.message, /Possible duplicate photo/);
    assert.match(duplicateCancel.message, /01_POC-015_C_Ro_H_R4/);
    assert.equal(chooserCount, 0);
    assert.equal((await records()).length, 1);
    const retake = expectDialog(true);
    await uploadViaButton("#importButton", payload);
    await total(2);
    assert.match(retake.message, /Possible duplicate/);
    assert.equal(dialogQueue.length, 0);
    assert.ok((await records()).some((entry) => entry.filename.endsWith("_R2.jpg")));
    assert.equal(await page.textContent("#potProgressCount"), "1/7");
    assert.equal(await page.textContent("#eventCount"), "1/672");

    // A different camera does not bypass duplicate detection; a new view is allowed.
    await page.selectOption("#cameraSelect", "CAM2");
    const cameraDuplicate = expectDialog(false);
    await page.click("#importButton");
    assert.match(cameraDuplicate.message, /Possible duplicate/);
    await page.locator(".protocol-slot").nth(1).click();
    await uploadViaButton("#importButton", payload);
    await total(3);
    assert.equal(await page.textContent("#potProgressCount"), "2/7");
    await page.locator(".protocol-slot").nth(4).click();
    await uploadViaButton("#importButton", payload);
    await total(4);
    const leafDuplicate = expectDialog(false);
    await page.click("#captureButton");
    assert.match(leafDuplicate.message, /Leaf 1/);

    // The save-time check also protects imports when no pre-capture approval exists.
    const saveDuplicate = expectDialog(false);
    await page.setInputFiles("#importInput", payload);
    await page.waitForFunction(() => document.querySelector("#toast").textContent.startsWith("Duplicate cancelled"));
    assert.match(saveDuplicate.message, /Possible duplicate/);
    assert.equal((await records()).length, 4);

    // Deletion removes the duplicate block for that view.
    await page.locator(".capture-item").filter({ hasText: "_AFFECTED_FL1.jpg" }).click();
    expectDialog(true);
    await page.click("#deleteCaptureButton");
    await total(3);
    await uploadViaButton("#importButton", payload);
    await total(4);

    expectDialog(true);
    await page.selectOption("#eventSelect", "D07");
    await uploadViaButton("#importButton", payload);
    await total(5);
    assert.equal(await page.textContent("#potProgressCount"), "1/7");
    const exportPromise = page.waitForEvent("download");
    await page.click("#exportEventButton");
    const download = await exportPromise;
    assert.equal(download.suggestedFilename(), "GRDC_Captures_WINTER_D07.zip");
    const zipPath = path.join(artifacts, download.suggestedFilename());
    await download.saveAs(zipPath);
    const log = execFileSync("unzip", ["-p", zipPath, "capture_log.csv"], { encoding: "utf8" });
    assert.match(log, /POC-015,01_POC-015_C_Ro_H_R4,01_POC-015,1,1,1,01,/);
    const potMap = execFileSync("unzip", ["-p", zipPath, "pot_map.csv"], { encoding: "utf8" });
    assert.ok(potMap.split("\n")[1].startsWith("POC-015,01_POC-015_C_Ro_H_R4,01_POC-015,1,1,1,01,"));

    // Reopening offline retains captures and duplicate detection after the upgrade.
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#totalCount").textContent === "5");
    assert.equal(await page.inputValue("#potSelect"), "POC-015");
    const offlineDuplicate = expectDialog(false);
    await page.click("#captureButton");
    assert.match(offlineDuplicate.message, /Possible duplicate/);
    assert.deepEqual(await page.evaluate(() => caches.keys()), ["grdc-capture-pwa-v9"]);
    await context.setOffline(false);

    for (const width of [1280, 390, 360]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(artifacts, `width-${width}.png`), fullPage: true });
    }
    expectDialog(true);
    await page.selectOption("#runSelect", "Warm/Summer");
    assert.equal(await page.inputValue("#potSelect"), "POC-097");
    assert.equal(await page.locator("#potSelect option").count(), 16);
    assert.equal(await page.textContent("#totalCount"), "0");
    assert.deepEqual(unexpectedDialogs, []);
    assert.deepEqual(errors, []);
    assert.equal(dialogQueue.length, 0);
    console.log(JSON.stringify({ status: "passed", artifacts, checks: "v8 upgrade/data retention; six groups sorted by prefix; group STOP and search positions; return-to-pot warning; duplicate cancel/retake; cross-camera and leaf checks; save-time guard; deletion; day isolation; ZIP metadata; offline reload; mobile layouts; Summer fallback" }, null, 2));
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
