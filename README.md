# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/0xsheyn/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/0xsheyn/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A radar for pre-token protocols, ranked by implied value, with a farm plan for every row. Built for the make.fun competition "Build the best token launch radar" (entries close 2026-12-14 10:00 UTC). Free to enter; the $1,325 reward is locked in escrow on Solana.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

The program runs twice with the same bytes: deterministic, no wall clock, no unseeded randomness, no network. It needs `screenshots/` to hold the three images; without them it refuses to write an output.

---

Entered on [make.fun](https://make.fun/?ref=pcgavhkz&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards

## What it does

`main.ts` (Node 22, standard library only) reads the sealed DefiLlama snapshot
at `/input/snapshot.json`, scores every pre-token protocol, and writes:

- `board.json` — 200 ranked rows (the 40-protocol watchlist plus 160 early
  pre-token protocols below the $50M floor), each with an implied value in USD
  and six concrete farm steps with cost and time.
- `data.js` — the same board in compact form for the dashboard.
- `dashboard/` — a static page (no network, no framework): dark-blue
  editorial theme with a lime accent; hero with a log-log scatter of TVL
  against implied value; a six-stat strip; top-5 cards; four tabs
  (pre-token board, live-token, set aside, model & calibration); sortable
  and filterable board with a sensitivity range bar, an airdrop slice per
  $1,000 and a FARM / THIN / SKIP verdict per row; a centred detail modal
  for every protocol with a TVL slider, the value breakdown, farm
  economics and the farm plan; and the model with its sector benchmarks.
- `screenshots/` — three screenshots of the dashboard: the board, a protocol
  detail view, and a filtered view.
- `dossier.json` — built with `buildDossier` from `vendor/makefun-board.ts`
  (the kit's library, copied unchanged).

## The model (radar-2)

Implied value follows only from the snapshot's own figures, in four factors.
No protocol name is special-cased; the same function scores every row, and
the sector benchmark is computed from the snapshot itself at run time, so the
same code re-scores a future snapshot with no hand-kept list.

```
implied = round( tvl_usd x sector
               x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
               x (0.6 + min(age_days, 1095) / 1095 x 0.4)
               x (1 + 0.04 x min(chains - 1, 4)) )
```

- **sector** — the sector's FDV/TVL benchmark: the median market-cap-to-TVL
  ratio of the live-token protocols in the same category, shrunk toward the
  global median with a prior weight of 8, clamped to [0.05, 1.00]. A sector
  with fewer than three live tokens takes the global benchmark — one live
  token's ratio must not price a whole sector.
- **growth** — the protocol's 7-day TVL change, clamped to [-60%, +120%].
- **maturity** — how long it has run with no token on record, from
  `listed_at`; an unlisted age uses 365 days.
- **chains** — how many chains it runs on: 1.00 for one chain, up to 1.16
  for five or more.

A protocol "records no token" when the snapshot carries no market cap, no
CoinGecko id and no symbol for it. That is DefiLlama's record, not proof it
has none. Live-token protocols are set aside on their own tab at their market
caps, never mixed into the ranking. Implied value is a model, not a promise
and not a price.

## Sensitivity

Every row of `board.json` carries a `sensitivity` object next to its
implied value. It answers one question the point estimate cannot: how far
does this row's launch value move when the inputs it leans on turn against
it?

```
sensitivity: {
  tvlShockUp, tvlShockDown,       // TVL 20% higher / lower at launch
  growthShockUp, growthShockDown, // growth multiplier 0.25 hotter / colder
  sensitivitySpreadPct            // the four shocks' spread, in %
}
```

Two of the model's four factors move fast around a launch, so those are the
two that get shaken. A protocol's TVL can jump on one large deposit or fall
on one large withdrawal, and a single week's change is the noisiest number
the snapshot carries. The sector benchmark, the protocol's age and its chain
count move slowly by comparison, so the shocks hold those three still and
move only TVL and the growth multiplier.

The growth shocks are clamped to [0.5, 1.8]. Below 0.5 the multiplier would
mean a shrinkage worse than the growth floor already allows, and above 1.8
it would mean a weekly run hotter than the growth cap already allows, so
neither end of the clamp invents a world the model itself refuses to price.

Read `sensitivitySpreadPct` as the row's fragility: the distance between
the highest and the lowest shocked value, as a percentage of the row's own
implied value. A row whose shocks span 40% nearly halves on a bad week or
a big withdrawal; a row at 15% barely moves. Two rows can sit next to each
other with the same implied value and very different spreads — the spread
is what tells them apart when the launch does not go as planned.

Sensitivity changes nothing about the ranking. The board sorts on implied
value exactly as before, every implied value is the same number it was, and
the shocks are reported alongside so a reader can carry the range in their
head instead of a single number. The dashboard shows the range too: a
range bar on every table row and a Sensitivity section in the protocol
detail modal, labelled as the TVL ±20% and growth ±0.25 shocks — not a
confidence interval.

## Farm verdicts

Every row carries a verdict on its farm economics at a $1,000 deposit,
computed from the row's own implied value and farm plan:

```
slice   = 10% of the launch to depositors pro rata: 0.10 x implied x $1,000 / TVL
gas     = total gas of every transaction in the farm plan over the hold
          ($3 first transaction + $8 setup, $4 when the capital tier is
          under $150, + $2 per week of top-ups)
forgone = 4% T-bill yield over the 30-day hold = $3.29
net     = slice - gas - forgone
```

- **FARM** — net beats the T-bill: net > 0.
- **THIN** — beats the fees only: net <= 0 but slice - gas > 0.
- **SKIP** — does not beat the fees: slice - gas <= 0.

On this snapshot the board splits FARM 48 / THIN 36 / SKIP 116, including
6 of the top 10 as SKIP — the biggest implied values are not the best
farms once the whole plan's gas is counted. The verdict never changes the
ranking; it only prices the farm. The definitions, the gas accounting and
the split are stated in the dashboard's Model & calibration tab.

## Farm plans

Each row's six steps are derived from the protocol's own record (category,
chains, TVL, age): a fresh wallet, the category's main action with a capital
tier ($50 / $100 / $150 / $250 by TVL), a weekly qualifying action, a hold of
30–60 days, a check of the protocol's own points page before withdrawing, and
a farm log. Every step states what it costs and how long it takes.

## Files

```
main.ts                  entrypoint: reads /input/snapshot.json, writes /output
lib/model.ts             the radar-2 model, farm plans, board validation
vendor/makefun-board.ts  make.fun's dossier library, copied unchanged
dashboard/index.html     the page shell
dashboard/app.css        the theme (dark blue, lime accent, no network)
dashboard/app.js         hero, scatter, stats, verdicts, tabs, filters,
                         histogram, board, detail modal, benchmarks
screenshots/              1-board.png, 2-detail.png, 3-filtered.png
LICENSE                  MIT
README.md                this file
SCREENSHOTS.md           how the three screenshots were taken
```

## Entry

This repository is the entry for the make.fun competition "Build the best
token launch radar", submitted from the account @optimysthic with the
transcripts of the sessions that built it bundled alongside. It carries an
OSI-approved license (MIT) and is public. See the kit's RULES.txt for the
`check` and `submit` steps.
