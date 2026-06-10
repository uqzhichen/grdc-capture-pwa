const DB_NAME = "grdc-capture-pwa";
const DB_VERSION = 1;
const CAPTURE_STORE = "captures";
const QUALITY_FLAGS = [
  "OK",
  "blurry",
  "overexposed",
  "label_missing",
  "wrong_angle",
  "symptom_absent",
  "partial_symptom",
  "other"
];

const state = {
  db: null,
  pots: [],
  captures: [],
  activeEditId: null,
  imageUrls: [],
  deferredInstallPrompt: null
};

const els = {
  networkStatus: document.querySelector("#networkStatus"),
  captureCount: document.querySelector("#captureCount"),
  installButton: document.querySelector("#installButton"),
  potSearch: document.querySelector("#potSearch"),
  potSelect: document.querySelector("#potSelect"),
  potCard: document.querySelector("#potCard"),
  weekSelect: document.querySelector("#weekSelect"),
  cameraSelect: document.querySelector("#cameraSelect"),
  wholePlantFields: document.querySelector("#wholePlantFields"),
  focusedLeafFields: document.querySelector("#focusedLeafFields"),
  qualitySelect: document.querySelector("#qualitySelect"),
  notesInput: document.querySelector("#notesInput"),
  filenamePreview: document.querySelector("#filenamePreview"),
  captureButton: document.querySelector("#captureButton"),
  importButton: document.querySelector("#importButton"),
  cameraInput: document.querySelector("#cameraInput"),
  importInput: document.querySelector("#importInput"),
  refreshButton: document.querySelector("#refreshButton"),
  todayCount: document.querySelector("#todayCount"),
  totalCount: document.querySelector("#totalCount"),
  storageEstimate: document.querySelector("#storageEstimate"),
  captureSearch: document.querySelector("#captureSearch"),
  exportTodayButton: document.querySelector("#exportTodayButton"),
  exportFilteredButton: document.querySelector("#exportFilteredButton"),
  exportAllButton: document.querySelector("#exportAllButton"),
  captureList: document.querySelector("#captureList"),
  editDialog: document.querySelector("#editDialog"),
  editImage: document.querySelector("#editImage"),
  editFilename: document.querySelector("#editFilename"),
  editQuality: document.querySelector("#editQuality"),
  editNotes: document.querySelector("#editNotes"),
  saveEditButton: document.querySelector("#saveEditButton"),
  deleteCaptureButton: document.querySelector("#deleteCaptureButton"),
  toast: document.querySelector("#toast")
};

init().catch((error) => {
  console.error(error);
  showToast("Could not start the app. Refresh and try again.");
});

async function init() {
  state.db = await openDatabase();
  fillQualityOptions();
  bindEvents();
  updateNetworkStatus();
  await loadPotMap();
  await refreshCaptures();
  registerServiceWorker();
}

function bindEvents() {
  window.addEventListener("online", updateNetworkStatus);
  window.addEventListener("offline", updateNetworkStatus);
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    els.installButton.hidden = false;
  });

  els.installButton.addEventListener("click", async () => {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    els.installButton.hidden = true;
  });

  els.potSearch.addEventListener("input", () => {
    renderPotOptions();
    updatePotCard();
    updateFilenamePreview();
  });
  els.potSelect.addEventListener("change", () => {
    updatePotCard();
    updateFilenamePreview();
  });

  [
    els.weekSelect,
    els.cameraSelect,
    els.qualitySelect,
    els.notesInput,
    ...document.querySelectorAll("input[name='mode'], input[name='angle'], input[name='height'], input[name='focusedLeaf']")
  ].forEach((control) => {
    control.addEventListener("change", () => {
      syncModeFields();
      updateFilenamePreview();
    });
    control.addEventListener("input", updateFilenamePreview);
  });

  els.captureButton.addEventListener("click", () => els.cameraInput.click());
  els.importButton.addEventListener("click", () => els.importInput.click());
  els.cameraInput.addEventListener("change", () => handleImageInput(els.cameraInput));
  els.importInput.addEventListener("change", () => handleImageInput(els.importInput));
  els.refreshButton.addEventListener("click", refreshCaptures);
  els.captureSearch.addEventListener("input", renderCaptureList);
  els.exportTodayButton.addEventListener("click", () => exportCaptures("today"));
  els.exportFilteredButton.addEventListener("click", () => exportCaptures("filtered"));
  els.exportAllButton.addEventListener("click", () => exportCaptures("all"));

  els.editDialog.addEventListener("close", () => {
    state.activeEditId = null;
    if (els.editImage.src) {
      URL.revokeObjectURL(els.editImage.src);
      els.editImage.removeAttribute("src");
    }
  });

  els.saveEditButton.addEventListener("click", async (event) => {
    event.preventDefault();
    await saveEditedCapture();
  });

  els.deleteCaptureButton.addEventListener("click", async () => {
    await deleteActiveCapture();
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CAPTURE_STORE)) {
        const store = db.createObjectStore(CAPTURE_STORE, { keyPath: "id" });
        store.createIndex("capturedAt", "capturedAt");
        store.createIndex("potID", "potID");
        store.createIndex("filename", "filename", { unique: true });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function transaction(storeName, mode = "readonly") {
  return state.db.transaction(storeName, mode).objectStore(storeName);
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function putCapture(entry) {
  return requestToPromise(transaction(CAPTURE_STORE, "readwrite").put(entry));
}

async function getCapture(id) {
  return requestToPromise(transaction(CAPTURE_STORE).get(id));
}

async function getAllCaptures() {
  return requestToPromise(transaction(CAPTURE_STORE).getAll());
}

async function deleteCapture(id) {
  return requestToPromise(transaction(CAPTURE_STORE, "readwrite").delete(id));
}

async function loadPotMap() {
  const response = await fetch("./data/pot_map.csv", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Pot map fetch failed: ${response.status}`);
  }
  const rows = parseCSV(await response.text());
  const header = rows.shift();
  state.pots = rows
    .map((row) => Object.fromEntries(header.map((key, index) => [key, row[index] || ""])))
    .filter((record) => record.pot_id);
  renderPotOptions();
  updatePotCard();
  updateFilenamePreview();
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        field += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

function renderPotOptions() {
  const current = els.potSelect.value;
  const query = els.potSearch.value.trim().toLowerCase();
  const filtered = state.pots.filter((pot) => {
    if (!query) return true;
    return [
      pot.pot_id,
      pot.bench,
      pot.temperature_regime,
      pot.replicate,
      pot.variety_code,
      pot.variety_name,
      pot.disease_code,
      pot.disease_class,
      pot.fertiliser_code,
      pot.fertiliser_level
    ].join(" ").toLowerCase().includes(query);
  });

  const selectedStillVisible = filtered.some((pot) => pot.pot_id === current);
  const selected = selectedStillVisible ? current : filtered[0]?.pot_id || state.pots[0]?.pot_id || "";

  els.potSelect.replaceChildren(...filtered.slice(0, 192).map((pot) => {
    const option = document.createElement("option");
    option.value = pot.pot_id;
    option.textContent = `${pot.pot_id}  ${pot.disease_code} ${pot.variety_code} R${pot.replicate} ${pot.fertiliser_code}`;
    return option;
  }));
  els.potSelect.value = selected;
}

function selectedPot() {
  return state.pots.find((pot) => pot.pot_id === els.potSelect.value) || state.pots[0] || null;
}

function updatePotCard() {
  const pot = selectedPot();
  if (!pot) {
    els.potCard.innerHTML = "<div><p class=\"pot-id\">No pot loaded</p><p class=\"pot-meta\">Check the pot map file.</p></div>";
    return;
  }
  els.potCard.innerHTML = `
    <div>
      <p class="pot-id">${escapeHtml(pot.pot_id)}</p>
      <p class="pot-meta">${escapeHtml(pot.disease_code)} - ${escapeHtml(pot.disease_class)}</p>
      <p class="pot-meta">Rep ${escapeHtml(pot.replicate)} | ${escapeHtml(pot.variety_code)} ${escapeHtml(pot.variety_name)} | ${escapeHtml(pot.fertiliser_level)}</p>
      <p class="pot-meta">${escapeHtml(pot.temperature_regime)} | ${escapeHtml(pot.bench)}</p>
    </div>
  `;
}

function syncModeFields() {
  const isWholePlant = getRadioValue("mode") === "Whole plant";
  els.wholePlantFields.hidden = !isWholePlant;
  els.focusedLeafFields.hidden = isWholePlant;
}

function updateFilenamePreview() {
  const pot = selectedPot();
  els.filenamePreview.textContent = pot ? makeFilename(pot.pot_id, new Date(), false) : "-";
}

async function handleImageInput(input) {
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  const pot = selectedPot();
  if (!pot) {
    showToast("No pot selected.");
    return;
  }

  try {
    const now = new Date();
    const filename = await uniqueFilename(makeFilename(pot.pot_id, now, true));
    const mode = getRadioValue("mode");
    const isWholePlant = mode === "Whole plant";
    const entry = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      filename,
      relativePath: `images/${filename}`,
      capturedAt: now.toISOString(),
      potID: pot.pot_id,
      week: cleanComponent(els.weekSelect.value.toUpperCase()),
      cameraID: els.cameraSelect.value,
      mode,
      angle: isWholePlant ? getRadioValue("angle") : "NA",
      heightOrLeaf: isWholePlant ? getRadioValue("height") : getRadioValue("focusedLeaf"),
      qualityFlag: els.qualitySelect.value,
      notes: els.notesInput.value.trim(),
      temperatureRegime: pot.temperature_regime,
      replicate: pot.replicate,
      varietyCode: pot.variety_code,
      varietyName: pot.variety_name,
      diseaseCode: pot.disease_code,
      diseaseClass: pot.disease_class,
      fertiliserCode: pot.fertiliser_code,
      fertiliserLevel: pot.fertiliser_level,
      imageType: file.type || "image/jpeg",
      imageSize: file.size,
      imageBlob: file
    };
    await putCapture(entry);
    els.notesInput.value = "";
    await refreshCaptures();
    showToast(`Saved ${filename}`);
  } catch (error) {
    console.error(error);
    showToast("Could not save the image.");
  }
}

function makeFilename(potID, date, includeExtension) {
  const dateString = formatDate(date);
  const week = cleanComponent(els.weekSelect.value.toUpperCase()) || "W0";
  const cameraID = cleanComponent(els.cameraSelect.value.toUpperCase()) || "CAM1";
  const mode = getRadioValue("mode");
  const suffix = mode === "Whole plant"
    ? `${getRadioValue("angle")}_${getRadioValue("height")}`
    : `AFFECTED_${getRadioValue("focusedLeaf")}`;
  return `${cleanComponent(potID)}_${dateString}_${week}_${cameraID}_${suffix}${includeExtension ? ".jpg" : ".jpg"}`;
}

async function uniqueFilename(initial) {
  const existing = new Set((await getAllCaptures()).map((entry) => entry.filename));
  if (!existing.has(initial)) return initial;
  const dot = initial.lastIndexOf(".");
  const stem = dot > -1 ? initial.slice(0, dot) : initial;
  const ext = dot > -1 ? initial.slice(dot) : "";
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${stem}_R${index}${ext}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new Error("Could not create a unique filename.");
}

async function refreshCaptures() {
  state.captures = (await getAllCaptures()).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  renderCounts();
  renderCaptureList();
  updateStorageEstimate();
}

function renderCounts() {
  const today = state.captures.filter((entry) => isToday(entry.capturedAt));
  els.todayCount.textContent = String(today.length);
  els.totalCount.textContent = String(state.captures.length);
  els.captureCount.textContent = `${state.captures.length} captures`;
  els.exportTodayButton.disabled = today.length === 0;
  els.exportAllButton.disabled = state.captures.length === 0;
  els.exportFilteredButton.disabled = state.captures.length === 0;
}

function renderCaptureList() {
  state.imageUrls.forEach((url) => URL.revokeObjectURL(url));
  state.imageUrls = [];

  const query = els.captureSearch.value.trim().toLowerCase();
  const captures = filteredCaptures();
  els.exportFilteredButton.disabled = captures.length === 0;

  if (!captures.length) {
    els.captureList.innerHTML = "<div class=\"empty-state\">No captures match the current filter.</div>";
    return;
  }

  const fragment = document.createDocumentFragment();
  captures.slice(0, 120).forEach((entry) => {
    const button = document.createElement("button");
    button.className = "capture-item";
    button.type = "button";
    button.dataset.id = entry.id;

    const url = URL.createObjectURL(entry.imageBlob);
    state.imageUrls.push(url);
    const image = document.createElement("img");
    image.src = url;
    image.alt = "";

    const content = document.createElement("div");
    const filename = document.createElement("strong");
    filename.textContent = entry.filename;
    const meta = document.createElement("span");
    meta.textContent = `${entry.potID} | ${entry.mode} | ${entry.week} | ${formatShortDate(entry.capturedAt)}`;
    const treatment = document.createElement("span");
    treatment.textContent = `${entry.diseaseCode || ""} ${entry.varietyCode || ""} R${entry.replicate || ""} ${entry.fertiliserCode || ""}`;
    const badge = document.createElement("span");
    badge.className = `quality-badge${entry.qualityFlag === "OK" ? "" : " warn"}`;
    badge.textContent = entry.qualityFlag;

    content.append(filename, meta, treatment, badge);
    button.append(image, content);
    button.addEventListener("click", () => openEditDialog(entry.id));
    fragment.append(button);
  });

  els.captureList.replaceChildren(fragment);
}

async function openEditDialog(id) {
  const entry = await getCapture(id);
  if (!entry) return;
  state.activeEditId = id;
  els.editFilename.textContent = entry.filename;
  els.editQuality.value = entry.qualityFlag;
  els.editNotes.value = entry.notes || "";
  const url = URL.createObjectURL(entry.imageBlob);
  els.editImage.src = url;
  els.editDialog.showModal();
}

async function saveEditedCapture() {
  if (!state.activeEditId) return;
  const entry = await getCapture(state.activeEditId);
  if (!entry) return;
  entry.qualityFlag = els.editQuality.value;
  entry.notes = els.editNotes.value.trim();
  await putCapture(entry);
  els.editDialog.close();
  await refreshCaptures();
  showToast("Capture updated.");
}

async function deleteActiveCapture() {
  if (!state.activeEditId) return;
  const entry = await getCapture(state.activeEditId);
  if (!entry) return;
  const confirmed = window.confirm(`Delete ${entry.filename}?`);
  if (!confirmed) return;
  await deleteCapture(state.activeEditId);
  els.editDialog.close();
  await refreshCaptures();
  showToast("Capture deleted.");
}

async function exportCaptures(scope) {
  const entries = scope === "today"
    ? state.captures.filter((entry) => isToday(entry.capturedAt))
    : scope === "filtered"
      ? filteredCaptures()
      : state.captures;
  if (!entries.length) {
    showToast("No captures to export.");
    return;
  }

  try {
    setExportBusy(true);
    const sorted = [...entries].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
    const label = scope === "today" ? formatDate(new Date()) : scope;
    const week = cleanComponent(els.weekSelect.value.toUpperCase());
    const packageName = `GRDC_Captures_${label}${week ? `_${week}` : ""}.zip`;
    const csv = captureCSV(sorted);
    const potMap = potMapCSV(state.pots);
    const files = [
      { name: "capture_log.csv", blob: new Blob([csv], { type: "text/csv" }), date: new Date() },
      { name: "pot_map.csv", blob: new Blob([potMap], { type: "text/csv" }), date: new Date() }
    ];
    sorted.forEach((entry) => {
      files.push({
        name: `images/${entry.filename}`,
        blob: entry.imageBlob,
        date: new Date(entry.capturedAt)
      });
    });
    const zip = await createStoredZip(files);
    downloadBlob(zip, packageName);
    showToast(`Exported ${packageName}`);
  } catch (error) {
    console.error(error);
    showToast("Could not export the ZIP package.");
  } finally {
    setExportBusy(false);
    renderCounts();
    renderCaptureList();
  }
}

function setExportBusy(isBusy) {
  els.exportTodayButton.disabled = isBusy;
  els.exportFilteredButton.disabled = isBusy;
  els.exportAllButton.disabled = isBusy;
  els.exportTodayButton.textContent = isBusy ? "Preparing ZIP" : "Export Today ZIP";
  els.exportFilteredButton.textContent = isBusy ? "Preparing ZIP" : "Export Filtered ZIP";
  els.exportAllButton.textContent = isBusy ? "Preparing ZIP" : "Export All ZIP";
}

function filteredCaptures() {
  const query = els.captureSearch.value.trim().toLowerCase();
  return state.captures.filter((entry) => {
    if (!query) return true;
    return [
      entry.filename,
      entry.potID,
      entry.week,
      entry.cameraID,
      entry.mode,
      entry.angle,
      entry.heightOrLeaf,
      entry.qualityFlag,
      entry.notes,
      entry.varietyName,
      entry.diseaseCode
    ].join(" ").toLowerCase().includes(query);
  });
}

function captureCSV(entries) {
  const headers = [
    "filename",
    "relative_path",
    "captured_at",
    "pot_id",
    "week",
    "camera_id",
    "mode",
    "angle",
    "height_or_leaf",
    "quality_flag",
    "notes",
    "temperature_regime",
    "replicate",
    "variety_code",
    "variety_name",
    "disease_code",
    "disease_class",
    "fertiliser_code",
    "fertiliser_level"
  ];
  const rows = entries.map((entry) => [
    entry.filename,
    entry.relativePath,
    entry.capturedAt,
    entry.potID,
    entry.week,
    entry.cameraID,
    entry.mode,
    entry.angle,
    entry.heightOrLeaf,
    entry.qualityFlag,
    entry.notes,
    entry.temperatureRegime,
    entry.replicate,
    entry.varietyCode,
    entry.varietyName,
    entry.diseaseCode,
    entry.diseaseClass,
    entry.fertiliserCode,
    entry.fertiliserLevel
  ]);
  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

function potMapCSV(pots) {
  if (!pots.length) return "";
  const headers = Object.keys(pots[0]);
  const rows = pots.map((pot) => headers.map((key) => pot[key] || ""));
  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }
  return text;
}

async function createStoredZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(data);
    const { dosDate, dosTime } = dateToDos(file.date || new Date());
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);
  return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dateToDos(date) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosDate, dosTime };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function updateStorageEstimate() {
  if (!navigator.storage?.estimate) {
    els.storageEstimate.textContent = "-";
    return;
  }
  const estimate = await navigator.storage.estimate();
  if (!estimate.usage) {
    els.storageEstimate.textContent = "-";
    return;
  }
  els.storageEstimate.textContent = formatBytes(estimate.usage);
}

function updateNetworkStatus() {
  const online = navigator.onLine;
  els.networkStatus.textContent = online ? "Online" : "Offline";
  els.networkStatus.classList.toggle("online", online);
  els.networkStatus.classList.toggle("offline", !online);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const register = () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  };
  if (document.readyState === "complete") {
    register();
  } else {
    window.addEventListener("load", register, { once: true });
  }
}

function fillQualityOptions() {
  els.editQuality.replaceChildren(...QUALITY_FLAGS.map((flag) => {
    const option = document.createElement("option");
    option.value = flag;
    option.textContent = flag;
    return option;
  }));
}

function getRadioValue(name) {
  return document.querySelector(`input[name='${name}']:checked`)?.value || "";
}

function cleanComponent(value) {
  return String(value || "").trim().replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDate(isoDate) {
  const date = new Date(isoDate);
  return `${formatDate(date)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function isToday(isoDate) {
  return formatDate(new Date(isoDate)) === formatDate(new Date());
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

let toastTimer = null;
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 3200);
}
