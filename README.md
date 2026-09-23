# GRDC Capture PWA

Static Progressive Web App for glasshouse image capture. It is designed for GitHub Pages and works on iPhone Safari and Android Chrome from the same URL.

## What It Does

- Loads two separate 96-pot temperature runs from `data/pot_map.csv`.
- Uses Noel Knight's confirmed Winter/Cool physical pot labels, sorted numerically by their leading label number within each 16-pot group.
- Limits pot selection to one 16-pot photo group at a time and requires confirmation before entering the next group.
- Captures or imports phone photos using the seven-image protocol for each pot.
- Tracks the seven unique required image slots for the selected pot and imaging day.
- Warns before leaving a partially completed pot while allowing a confirmed override.
- Warns when returning to an already photographed pot, or capturing/importing the same pot, imaging day and view again. Intentional retakes require confirmation and keep the original image.
- Saves photos locally in browser storage with controlled filenames.
- Lets technicians search, review, edit quality flags/notes, and delete blurry captures.
- Exports the current imaging event, filtered captures, or all captures as a ZIP package containing `capture_log.csv`, `pot_map.csv`, and image files. Current-event and filtered exports are limited to the selected temperature run.
- Caches the app shell for offline use after the first successful load.

## Imaging Protocol

Each pot requires seven images at each imaging event:

- Four whole-plant images: Front, Right, Back, and Left, all captured at fixed mid-level height H2.
- Three close-up images of symptomatic areas on three randomly selected affected leaves: Leaf 1, Leaf 2, and Leaf 3. Frame the symptom rather than the entire leaf.
- Keep the white background behind the pot for both image types. It does not need to be placed directly behind an individual leaf.

Imaging events are Day 3 (D03), Day 7 (D07), Day 13 (D13), and Day 20 (D20). Each separate Winter/Cool or Summer/Warm run contains 96 pots, so the planned volume is 672 required images per event and 2,688 required images across all four events for one temperature run. Retakes remain in storage and export, but they do not increase the seven-slot completion progress.

## Technician Install

### iPhone

1. Open the GitHub Pages URL in Safari.
2. Tap Share.
3. Tap Add to Home Screen.
4. Open GRDC Capture from the Home Screen.

### Samsung / Google Android

1. Open the GitHub Pages URL in Chrome.
2. Tap the menu button.
3. Tap Add to Home screen or Install app.
4. Open GRDC Capture from the Home Screen.

## GitHub Pages Deployment

Use this folder as the repository root.

1. Create a GitHub repository, for example `grdc-capture-pwa`.
2. Upload every file in this `GRDCCapturePWA` folder.
3. In GitHub, open Settings > Pages.
4. Set Source to Deploy from a branch.
5. Select the `main` branch and `/ (root)`.
6. Save.
7. Use the HTTPS Pages URL on each phone.

The app must be loaded from HTTPS for PWA installation and reliable camera/storage behaviour. GitHub Pages provides HTTPS.

## Data Safety Workflow

The app saves captured images locally first. Technicians should export a ZIP at the end of each imaging session and transfer it to the project OneDrive or another managed storage location.

Browser storage is not a permanent archive. If a phone is lost, reset, or has browser data cleared, unexported captures can be lost.

## Filename Format

Whole-plant image:

```text
POC-001_2026-07-14_D03_CAM1_FRONT_H2.jpg
```

Focused affected-leaf image:

```text
POC-001_2026-07-14_D03_CAM1_AFFECTED_FL1.jpg
```

Retakes with the same filename fields get an automatic suffix, for example `_R2`. Existing records created with the earlier W1-W6 schedule remain visible, searchable, and exportable.

Duplicate checks use the selected temperature run, pot ID, imaging day and view (direction at H2 or leaf number), regardless of the camera ID or calendar date. Different required views and different imaging days are not duplicates. The warning uses saved records on the current device, including after restarting the app; it cannot detect captures stored only on another phone. Removing a capture also removes it from duplicate checks.

## Pot Map

The confirmed Winter/Cool map uses:

- Varieties: Maximus CL, RGT Planet, Rosalind, Granite CL.
- Disease classes: CTRL, NFNB, SFNB.
- Fertiliser levels: LOW, HIGH.
- Replicates: 1, 2, 3, 4.
- Six photo groups of 16 pots: Control/High, NFNB/High, SFNB/High, Control/Low, NFNB/Low, and SFNB/Low.

The Winter/Cool physical labels and treatment assignments come from the `Photo order` tab in Noel Knight's `Experiment Design and Pot ID.xlsx` workbook dated 2026-07-30. The app displays the full physical label while retaining `POC-001` through `POC-096` as the stable pot IDs and filename keys.

The first Winter/Cool label is now `01_POC-015_C_Ro_H_R4`, followed by `02_POC-010_C_Pl_H_R3`. Sorting uses the leading number, not the number after `POC`. The app recalculates photo positions, STOP locations and exported pot-map sequence fields together. The source CSV retains the original workbook order; existing capture records retain their original sequence metadata.

The Summer/Warm run remains separate as `POC-097` through `POC-192`. Its existing map is retained until a confirmed randomised label sheet is supplied.
