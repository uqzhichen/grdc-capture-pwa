# GRDC Capture PWA

Static Progressive Web App for glasshouse image capture. It is designed for GitHub Pages and works on iPhone Safari and Android Chrome from the same URL.

## What It Does

- Loads two separate 96-pot temperature runs from `data/pot_map.csv`.
- Uses Noel Knight's confirmed Winter/Cool photo order and physical pot labels.
- Limits pot selection to one 16-pot photo group at a time and requires confirmation before entering the next group.
- Captures or imports phone photos.
- Saves photos locally in browser storage with controlled filenames.
- Lets technicians search, review, edit quality flags/notes, and delete blurry captures.
- Exports today, filtered, or all captures as a ZIP package containing `capture_log.csv`, `pot_map.csv`, and image files. Today and filtered exports are limited to the selected temperature run.
- Caches the app shell for offline use after the first successful load.

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
POC-001_2026-07-14_W4_CAM1_FRONT_H1.jpg
```

Focused affected-leaf image:

```text
POC-001_2026-07-14_W4_CAM1_AFFECTED_FL1.jpg
```

Retakes with the same filename fields get an automatic suffix, for example `_R2`.

## Pot Map

The confirmed Winter/Cool map uses:

- Varieties: Maximus CL, RGT Planet, Rosalind, Granite CL.
- Disease classes: CTRL, NFNB, SFNB.
- Fertiliser levels: LOW, HIGH.
- Replicates: 1, 2, 3, 4.
- Six photo groups of 16 pots: Control/High, NFNB/High, SFNB/High, Control/Low, NFNB/Low, and SFNB/Low.

The Winter/Cool physical labels and treatment assignments come from the `Photo order` tab in Noel Knight's `Experiment Design and Pot ID.xlsx` workbook dated 2026-07-30. The app displays the full physical label while retaining `POC-001` through `POC-096` as the stable pot IDs and filename keys.

The Summer/Warm run remains separate as `POC-097` through `POC-192`. Its existing map is retained until a confirmed randomised label sheet is supplied.
