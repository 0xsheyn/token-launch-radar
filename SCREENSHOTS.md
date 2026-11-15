# Screenshots — DONE 2026-11-15 ~15:19 WITA (headless Chromium 140 via
Playwright 1.55.0 on the build VM; see STATUS.md for sizes + verification).
Captured from `entry/out/dashboard/index.html` at 1440x900, zero console
errors, each shot visually inspected. The starter kit's three screenshots
show the starter dashboard, not this one, so they were NOT copied in.

## What to capture (exactly 3, PNG, 1440 x 900, each 300–350 KB, at most 512 KiB)

1. `1-board.png` — the board: the ranked table, top rows visible, no dialog open.
2. `2-detail.png` — a protocol detail view: click the rank-1 row so the detail
   drawer opens on the right, then capture the page with the drawer visible.
3. `3-filtered.png` — a filtered view: type a search (e.g. `Lending`) or pick
   a category in the Category filter so the board shows only matching rows,
   then capture.

## How to capture them

No desktop browser binary exists on the build VM, so take them in the live
browser (the parent agent's browser task):

1. Run the entry once with placeholder screenshots to produce `out/` — or
   serve the built output directly: the page is `out/dashboard/index.html`
   and it reads `out/data.js` beside it, so open that file in the browser
   (no server and no network needed; the page fetches nothing).
2. Set the browser window to 1440 x 900.
3. Capture the three views above as PNG and save them as
   `entry/screenshots/1-board.png`, `2-detail.png`, `3-filtered.png`.
4. Re-run the entry for real:
   `MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json`
   from `entry/`. It copies `dashboard/` and `screenshots/` into `out/`,
   writes `board.json`, `data.js` and `dossier.json`, and prints the row
   counts. Verify the dossier rebuilds byte for byte (run the entry twice
   and compare the outputs) and that each screenshot is a whole PNG at most
   512 KiB with a long side of at most 1440 and a short side of at least 800.
