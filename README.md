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
  and seven concrete farm steps, each with its gas cost and hands-on minutes.
- `data.js` — the same board in compact form for the dashboard, plus the
  costed plan, the net at $1K / $10K / $100K deposits under a 5% / 10% / 20%
  drop in the launch value, and the three live tokens nearest each row by TVL.
- `dashboard/` — a static page (no network, no framework): dark-blue
  editorial theme with a lime accent; hero with a log-log scatter of TVL
  against implied value and the fitted size curve, and one honest sentence
  of backtest (leave-one-out and time-split median miss, model and flat);
  a six-stat strip; five tabs
  (pre-token board, live-token, set aside, model & calibration, method and
  backtest); sortable
  and filterable board with a sensitivity range bar, an airdrop slice per
  $1,000 and a FARM / THIN / SKIP verdict per row; a full-page detail view
  for every protocol — the value breakdown, the nearest traded peers, the
  costed seven-step farm plan and the net by deposit and drop; and the model
  with its sector offsets and the variant comparison.
- `screenshots/` — three screenshots of the dashboard: the board, a protocol
  detail view, and a filtered view.
- `dossier.json` — built with `buildDossier` from `vendor/makefun-board.ts`
  (the kit's library, copied unchanged).

## The model (curve-1)

Implied value is a fitted size curve, not a sector multiple. The
snapshot's 128 live tokens are fitted by ordinary least squares on
log10(market cap) against log10(TVL / $100M), and each sector carries an
offset around that curve. No protocol name is special-cased; the same
function scores every row, and the curve, the offsets and the variant
choice are all computed from the snapshot itself at run time, so the same
code re-scores a future snapshot with no hand-kept list and no hard-coded
coefficient.

```
log10(mcap) = 7.202797 + 0.522266 x log10(TVL / $100M)     R² 0.1939, n = 128
implied     = round( 10^(7.202797 + 0.522266 x log10(TVL / $100M)) x sector_offset )
```

- **curve** — the fitted size curve. The slope is well under 1: a tenfold
  TVL buys about 3.3x the market cap, so the biggest protocols are not
  priced at a flat multiple of their TVL. At TVL $100M the curve reads
  $15.95M.
- **sector_offset** — the sector's offset around the curve: the median
  log10 residual of its live tokens, shrunk toward 0 with a prior weight
  of 8 (offset = 10^(median residual x n / (n + 8))), clamped to
  [0.25, 4]. A sector with fewer than three live tokens takes offset 1 —
  one live token's residual must not price a whole sector. On this
  snapshot the offsets run from 0.589 (Liquid Staking) to 1.784
  (Canonical Bridge); 14 of the 34 categories carry an offset of their
  own.

Two variants were tested, and the variant with the better leave-one-out
median miss is the one the board uses:

- **Variant A (selected): curve + sector offset.** Leave-one-out median
  miss x3.62, time-split x2.91.
- **Variant B (rejected): A times the growth, maturity and chain factors**
  of the previous model, with their product capped to [0.67, 1.5].
  Leave-one-out median miss x3.85, time-split x3.09 — worse on both
  tests. The factors add variance without signal, so the board does not
  use them. Both variants' numbers are in the dashboard's Model &
  calibration tab and in `data.js` (`validation.variant_a` /
  `variant_b`); the rejected variant is shown, not hidden.

A protocol "records no token" when the snapshot carries no market cap, no
CoinGecko id and no symbol for it. That is DefiLlama's record, not proof it
has none. Live-token protocols are set aside on their own tab at their market
caps, never mixed into the ranking. Implied value is a model, not a promise
and not a price.

Top of the board on this snapshot: Steakhouse Financial $90.1M, Gauntlet
$67.4M, Veda $67.1M, USDD $50.7M, Nonce Capital $37.5M; the 200 rows sum
to $2.09B implied, median $7.1M.

## Sensitivity

Every row of `board.json` carries a `sensitivity` object next to its
implied value. It answers one question the point estimate cannot: how far
does the model itself miss on tokens like this one?

```
sensitivity: {
  p10, p25, p75, p90,   // implied x the leave-one-out residual quantiles
  spread_pct            // (p90 - p10) / implied, in %
}
```

The range is not a shock to the row's inputs. It is the model's own
out-of-sample error: the leave-one-out residuals of the selected variant,
log10(actual / predicted) over the 128 live tokens. The 10th, 25th, 75th
and 90th percentiles of those residuals (linear interpolation) are the
linear factors the range is priced from — on this snapshot 0.0769,
0.2920, 4.1058 and 8.5527. A row's P10–P90 is its implied value times
0.0769 and 8.5527; its P25–P75 times 0.2920 and 4.1058.

The range is wide, and it is shown wide rather than shrunk: the median
miss is above 3x, so a row's P10–P90 spans roughly a factor of 111. Read
`spread_pct` as the row's fragility: the distance between the P90 and the
P10, as a percentage of the row's own implied value. Two rows can sit next
to each other with the same implied value and very different spreads — the
spread is what tells them apart when the launch does not go as planned.

Sensitivity changes nothing about the ranking. The board sorts on implied
value exactly as before, every implied value is the same number it was, and
the range is reported alongside so a reader can carry the model's own
error instead of a single number. The dashboard shows the range too: a
range bar on every table row (P10–P90, dot at the implied value), the detail
page's first stat card (P25–P90) and the value breakdown's implied-value line
(P10–P90) — labelled as the model's leave-one-out error, not a confidence
interval. There is no TVL slider: the range is the sensitivity, not a what-if
on the input.

## Backtest

The dashboard's Method and backtest tab tests curve-1 against the
snapshot's own live tokens, computed at run time — nothing here is typed
in by hand. A miss is max(predicted / actual, actual / predicted).

- **Leave-one-out (blind):** all 128 live tokens, each predicted with the
  curve and the offsets refitted without it. Curve-1: median miss x3.62,
  33.6% within 2x, 46.1% within 3x, 80% band x9.95. Flat benchmark (global
  median mcap/TVL x TVL): x5.07, 28.1%, 35.2%, x14.77.
- **Time-split:** curve and offsets fitted on the 44 live tokens listed
  before 2024-01-01, tested on the 51 listed in 2024 or later; 33 live
  tokens carry no listing date and are excluded. Curve-1: median miss
  x2.91, 35.3% within 2x, 51.0% within 3x, 80% band x10.63. Flat: x5.20,
  25.5%, 35.3%, x11.07.

On the median miss, curve-1 beats the flat benchmark on both tests — the
first version of this radar to do so. The previous model, radar-2
(sector medians times growth, maturity and chain factors), did not: it
missed x5.15 leave-one-out and x5.46 on the time split, against flat x5.07
and x5.20. Variant B (curve times the capped growth, maturity and chain
factors) also loses to variant A on both tests (x3.85 and x3.09), which is
why the board uses variant A. Ground truth is the market cap today, not
the price at launch, which no snapshot carries.

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

On this snapshot the board splits FARM 146 / THIN 13 / SKIP 41, including
all 10 of the top 10 as SKIP — the biggest implied values are not the best
farms once the whole plan's gas is counted. The sub-linear curve is what
flipped the split from the previous model:
a small protocol's implied value is a much larger share of its TVL, so its
$1,000 slice covers the plan's gas far more often. The verdict never
changes the ranking; it only prices the farm. The definitions, the gas
accounting and the split are stated in the dashboard's Model & calibration tab.

## Farm plans

Each row's seven steps are derived from the protocol's own record (category,
chains, TVL, age): Fund (a fresh wallet, $3 of gas, 5 minutes), Verify (check
the farm is live on the protocol's own site, no gas, 5 minutes), Mint (the
category's main action with a capital tier of $50 / $100 / $150 / $250 by TVL,
$8 of setup gas, $4 when the capital is under $150, 10 minutes), Upkeep (a
weekly qualifying action, $2 of gas a week, 10 minutes a week), Risk (hold of
30–60 days, watched each week alongside the weekly action — the capital stays
in the position, no gas and no extra minutes), Claim (check the protocol's own
points page and claim only from the link it publishes, no fee, 10 minutes),
and Exit (a farm log, 5 minutes). Every step states what it costs and how
long it takes, in words and in numbers: the detail page shows them as a
table, and the footer under it carries the slice, the fees, the forgone
yield, the net, the work and the net per hour — $17–$25 of gas and 35 + 10
minutes per week of the hold,
summed from the same steps, not a second accounting. The setup is 15 minutes
split across Verify and Mint: 5 to check, 10 to place the position.

The same view prices the net at bigger deposits and smaller launches: a
table of the net at $1,000, $10,000 and $100,000 deposits under a 5%, 10%
and 20% drop in the launch value. The slice scales linearly with the deposit,
the forgone T-bill yield scales with it at the same 30-day convention as the
$1,000 economics, and the gas is the plan's gas, which does not grow with
the deposit. At $1,000 with no drop the net is the economics' own net
exactly. A bigger deposit does not rescue a bad farm: the slice grows with
the deposit, but so does the forgone yield.

The detail page also names the three live tokens nearest the row by TVL —
same category first — with their market caps and mcap/TVL ratios, so the
reader can see which live tokens price a protocol like this one. When the
row's own category has fewer than three live tokens, the rest come from
across categories, and the page says so.

## Files

```
main.ts                  entrypoint: reads /input/snapshot.json, writes /output
lib/model.ts             the curve-1 model, farm plans, board validation
vendor/makefun-board.ts  make.fun's dossier library, copied unchanged
dashboard/index.html     the page shell
dashboard/app.css        the theme (dark blue, lime accent, no network)
dashboard/app.js         hero, scatter, stats, verdicts, tabs, filters,
                         board, histogram, detail page, offsets, backtest
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
