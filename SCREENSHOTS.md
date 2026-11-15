# Screenshots — DONE 2026-11-15 ~17:28 WITA (headless Chromium via
Playwright on the build VM; see STATUS.md for sizes + verification).
Captured from `entry/out/dashboard/index.html` at 1440x900, zero console
errors, each shot visually inspected. The starter kit's three screenshots
show the starter dashboard, not this one, so they were NOT copied in.

## What to capture (exactly 3, PNG, 1440 x 900, at most 512 KiB)

1. `1-board.png` — the board: hero, stats and the ranked
   table, no modal open.
2. `2-detail.png` — a protocol detail view: click the rank-1 row so the
   detail modal opens in the centre, then capture the page with the modal
   visible.
3. `3-filtered.png` — a filtered view: type a search (e.g. `Lending`) or pick
   a category in the Category filter so the board shows only matching rows,
   then capture.

## How to capture them

With Playwright (headless Chromium) from `~/workspace/makefun/token-radar-01/shot/`
(`shoot.mjs`; `node_modules` lives there): open
`file://<entry>/out/dashboard/index.html` at 1440x900, wait for the rows,
shoot 1-board; click the first row, wait for the modal, shoot 2-detail;
close it, fill the search, shoot 3-filtered. Zero console errors on every
shot. Then re-run the entry for real:
`MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json`
from `entry/`. It copies `dashboard/` and `screenshots/` into `out/`,
writes `board.json`, `data.js` and `dossier.json`, and prints the row
counts. Verify the outputs rebuild byte for byte (run the entry twice
and compare) and that each screenshot is a whole PNG at most 512 KiB
with a long side of at most 1440 and a short side of at least 800.
