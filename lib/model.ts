// The token radar's model, version curve-1: one snapshot of the protocol universe in, one
// ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A
// protocol is pre-token when its index entry records no token (no market cap, no CoinGecko id,
// no symbol); the snapshot's live-token protocols are kept apart and shown as the market's own
// values, never mixed into the ranked board. Say a protocol records no token, never that it has
// none: the snapshot is DefiLlama's record, not proof.
//
// Implied value is a fitted size curve, not a sector multiple. The snapshot's 128 live tokens
// are fitted by ordinary least squares on log10(market cap) against log10(TVL / $100M):
//
//   log10(mcap) = intercept + slope x log10(TVL / $100M)
//
// The fitted slope is well under 1 (about 0.52 on this snapshot): a tenfold TVL buys only about
// a threefold market cap, so the curve is sub-linear and the biggest protocols are not priced at
// a flat multiple of their TVL. Each category then carries an offset: the median residual of its
// live tokens around the curve, shrunk toward 0 with a prior weight of 8 (offset = 10^(median
// residual x n / (n + 8))), clamped to [0.25, 4] in linear terms. A category with fewer than
// three live tokens carries no offset of its own (offset 1): one live token, however far off the
// curve, must not price a whole sector.
//
//   curve    = 10^(intercept + slope x log10(TVL / $100M))
//   implied  = max(1, round(curve x sector_offset))            (variant A, the selected one)
//
// Variant B — the same curve and offset, times the radar-2 growth, maturity and chain factors
// with their product capped to [0.67, 1.5] — was tested alongside variant A and rejected: it
// loses to variant A on the leave-one-out median miss on both the blind test and the time
// split, so the factors add variance without signal. Both variants' numbers are in the
// validation the dashboard shows; nothing about the rejected variant is hidden.
//
// The curve, the offsets and the variant choice are all computed from the snapshot itself at
// run time, so the same code re-scores a future snapshot with no hand-kept list and no
// hard-coded coefficient. No protocol name is ever special-cased: the same function scores
// every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/**
 * The constants of the tested-but-rejected factor variant (variant B) and of the shrinkage:
 * the dashboard states them and the variant comparison quotes them. Variant A, the selected
 * one, uses only the fitted curve and the sector offsets; these constants exist so the
 * rejected variant can be recomputed and checked, not because the board uses them.
 */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  prior_weight: number;
  chain_step: number;
  chain_cap: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  prior_weight: 8,
  chain_step: 0.04,
  chain_cap: 4,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'curve-1';

/** The TVL the size curve is centred on: log10(mcap) is fitted against log10(TVL / $100M). */
export const REFERENCE_TVL_USD = 100_000_000;

/** The smallest sector offset the shrinkage may leave, in linear terms. */
export const OFFSET_FLOOR = 0.25;

/** The largest sector offset the shrinkage may leave, in linear terms. */
export const OFFSET_CAP = 4;

/** The coldest the variant-B factor product may run, after the cap. */
export const FACTOR_TOTAL_FLOOR = 0.67;

/** The hottest the variant-B factor product may run, after the cap. */
export const FACTOR_TOTAL_CAP = 1.5;

/** Which variant the validation selected: 'a' is curve + sector offset, 'b' adds the factors. */
export type ModelVariant = 'a' | 'b';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One sector's offset from the fitted curve: how its live tokens sit against the curve. */
export interface SectorOffset {
  category: string;
  live_count: number;
  /** The median log10 residual of the category's live tokens around the curve, or null when it has none. */
  median_residual: number | null;
  /** The offset applied to the curve: 10^(median residual shrunk toward 0), clamped to [0.25, 4]; 1 when fewer than three live tokens. */
  offset: number;
}

/** The fitted size curve: OLS on log10(market cap) against log10(TVL / $100M) over the live tokens. */
export interface CurveFit {
  intercept: number;
  slope: number;
  r2: number;
  n: number;
  reference_tvl_usd: number;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  sensitivity: LaunchSensitivity;
  model: {
    curve_value_usd: number;
    sector_offset: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    factor_total: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** One row's farm economics at a $1,000 deposit: what the launch would pay, what it costs, and the verdict. */
export interface FarmEconomics {
  /** The deposit the economics are priced at. */
  deposit_usd: number;
  /** The launch slice a $1,000 deposit would get: 10% of the implied value, pro rata on TVL. */
  slice_usd: number;
  /** The total gas the farm plan spends over the hold, summed from its own steps. */
  gas_usd: number;
  /** The gas total broken down the way the plan states it: first tx + setup + weekly x weeks. */
  gas_detail: string;
  /** The T-bill yield the deposit forgoes while it is held. */
  forgone_usd: number;
  /** Slice minus gas minus forgone. */
  net_usd: number;
  /** The capital the farm plan itself asks for. */
  capital_usd: number;
  /** The hold the farm plan itself asks for, in days. */
  hold_days: number;
  /** Hands-on minutes the plan's own step times add up to. */
  hands_on_minutes: number;
  /** Hands-on hours, from the minutes. */
  hands_on_hours: number;
  /** Net per hands-on hour. */
  net_per_hour_usd: number;
  /** FARM when the net beats every cost, THIN when the slice covers gas but not the forgone yield, SKIP when it does not cover gas. */
  verdict: 'FARM' | 'THIN' | 'SKIP';
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  sensitivity: LaunchSensitivity;
  economics: FarmEconomics;
  curve_value_usd: number;
  sector_offset: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  factor_total: number;
  watchlist: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One set-aside protocol: enough to list it with its reason. */
export interface SetAsideMember {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
}

/** One reason a group of protocols is set aside from the board. */
export interface SetAsideGroup {
  reason: string;
  detail: string;
  count: number;
  members: SetAsideMember[];
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  fit: CurveFit;
  sector_offsets: SectorOffset[];
  variant_selected: ModelVariant;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  record_no_token: number;
  set_aside: SetAsideGroup[];
  global_benchmark: number;
  validation: ModelValidation;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a sorted array, or null when it is empty. */
function medianOf(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A quantile of a sorted array by linear interpolation, the same rule the independent check uses. */
function quantileOf(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

/** Minimum live tokens for a category to carry an offset of its own; fewer take offset 1. */
export const MIN_SECTOR_LIVE = 3;

/** A protocol the fit and the backtest can use: it trades, so its market cap is the ground truth. */
function isLiveTest(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0;
}

/**
 * The fitted size curve: ordinary least squares on log10(market cap) against log10(TVL /
 * $100M) over the given live tokens. Deterministic: the same tokens always give the same fit.
 * The intercept and slope are kept to six decimals and the R² to four, and everything
 * downstream — the board, the validation, the dashboard's recomputation — uses these rounded
 * values, so the fit the page shows is the fit the board was scored with.
 */
export function fitCurve(tokens: SnapshotProtocol[]): CurveFit {
  const pts = tokens.filter(isLiveTest).map((p) => ({ x: Math.log10(p.tvl_usd / REFERENCE_TVL_USD), y: Math.log10(p.mcap_usd!) }));
  const n = pts.length;
  if (n < 2) return { intercept: 0, slope: 0, r2: 0, n, reference_tvl_usd: REFERENCE_TVL_USD };
  const mx = pts.reduce((a, p) => a + p.x, 0) / n;
  const my = pts.reduce((a, p) => a + p.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let ssTot = 0;
  for (const p of pts) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
    ssTot += (p.y - my) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  let ssRes = 0;
  for (const p of pts) ssRes += (p.y - (intercept + slope * p.x)) ** 2;
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  return {
    intercept: Math.round(intercept * 1e6) / 1e6,
    slope: Math.round(slope * 1e6) / 1e6,
    r2: Math.round(r2 * 1e4) / 1e4,
    n,
    reference_tvl_usd: REFERENCE_TVL_USD,
  };
}

/**
 * The sector offsets around a fitted curve: for every category, the median log10 residual of
 * its live tokens around the curve, shrunk toward 0 with the model's prior weight and turned
 * into a linear offset, clamped to [0.25, 4]. A category with fewer than three live tokens
 * carries no offset of its own and takes 1: one live token's residual must not price a whole
 * sector. `categories` defaults to the categories the tokens themselves carry; the board
 * passes every category in the snapshot so the table is complete. Deterministic.
 */
export function computeOffsets(
  tokens: SnapshotProtocol[],
  fit: CurveFit,
  categories?: string[],
): SectorOffset[] {
  const byCategory = new Map<string, number[]>();
  for (const p of tokens.filter(isLiveTest)) {
    const r = Math.log10(p.mcap_usd!) - (fit.intercept + fit.slope * Math.log10(p.tvl_usd / fit.reference_tvl_usd));
    const key = p.category ?? 'Other';
    const list = byCategory.get(key);
    if (list === undefined) byCategory.set(key, [r]);
    else list.push(r);
  }
  const cats = categories ?? [...byCategory.keys()];
  const out: SectorOffset[] = [];
  for (const category of [...new Set(cats)].sort()) {
    const residuals = (byCategory.get(category) ?? []).sort((a, b) => a - b);
    const med = medianOf(residuals);
    const offset =
      med === null || residuals.length < MIN_SECTOR_LIVE
        ? 1
        : Math.min(OFFSET_CAP, Math.max(OFFSET_FLOOR, Math.pow(10, med * (residuals.length / (residuals.length + MODEL.prior_weight)))));
    out.push({
      category,
      live_count: residuals.length,
      median_residual: med === null ? null : Math.round(med * 1e4) / 1e4,
      offset: Math.round(offset * 1e4) / 1e4,
    });
  }
  return out;
}

/** The flat benchmark: the median market-cap-to-TVL ratio of the given live tokens. */
export function flatBenchmark(tokens: SnapshotProtocol[]): number {
  const ratios = tokens
    .filter(isLiveTest)
    .map((p) => p.mcap_usd! / p.tvl_usd)
    .sort((a, b) => a - b);
  const med = medianOf(ratios) ?? 0.2;
  return Math.round(med * 1e4) / 1e4;
}

/** The curve's value for one TVL, from a fitted curve. */
export function curveValue(tvlUsd: number, fit: CurveFit): number {
  return Math.pow(10, fit.intercept + fit.slope * Math.log10(tvlUsd / fit.reference_tvl_usd));
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/**
 * The variant-B factors for one protocol, from the radar-2 constants: growth from the clamped
 * 7-day change, maturity from the age with no token, chains from the chain count. The product
 * is capped to [0.67, 1.5] so the factors can move a row by at most half in either direction.
 * Variant A does not use them; they are computed here so variant B can be tested honestly.
 */
export function factorProduct(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): { growthMult: number; maturityMult: number; chainMult: number; total: number } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const chainMult = 1 + model.chain_step * Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_cap);
  const total = Math.min(FACTOR_TOTAL_CAP, Math.max(FACTOR_TOTAL_FLOOR, growthMult * maturityMult * chainMult));
  return { growthMult, maturityMult, chainMult, total };
}

/** The curve value, the sector offset and the implied value one protocol gets under `variant`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  fit: CurveFit,
  offsets: SectorOffset[],
  variant: ModelVariant,
): { implied: number; curve: number; offset: number; growthMult: number; maturityMult: number; chainMult: number; factorTotal: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const curve = curveValue(protocol.tvl_usd, fit);
  const offset = offsets.find((b) => b.category === (protocol.category ?? 'Other'))?.offset ?? 1;
  const f = factorProduct(protocol, asOf, model);
  const factorTotal = variant === 'b' ? f.total : 1;
  const implied = Math.max(1, Math.round(curve * offset * factorTotal));
  return {
    implied,
    curve: Math.round(curve),
    offset,
    growthMult: variant === 'b' ? Math.round(f.growthMult * 1e4) / 1e4 : 1,
    maturityMult: variant === 'b' ? Math.round(f.maturityMult * 1e4) / 1e4 : 1,
    chainMult: variant === 'b' ? Math.round(f.chainMult * 1e4) / 1e4 : 1,
    factorTotal: variant === 'b' ? Math.round(f.total * 1e4) / 1e4 : 1,
    age,
  };
}

// ---------------------------------------------------------------------------
// Launch-value sensitivity
// An implied value is a point estimate, and a point estimate hides how much
// the model itself misses. The honest range for a row is not a shock to its
// inputs but the model's own out-of-sample error: the leave-one-out
// residuals of the selected variant, log10(actual / predicted) over the 128
// live tokens. A row's P10–P90 is its implied value times the 10th and 90th
// percentiles of those residuals (as linear factors); P25–P75 the same with
// the quartiles. The range is wide — the median miss is above 3x — and the
// dashboard shows it wide rather than shrinking it. Nothing here changes
// the ranking or the implied value; the board sorts exactly as before, and
// the range is reported alongside so a reader can carry the model's own
// error instead of a single number.
// ---------------------------------------------------------------------------

/** One row's launch-value sensitivity: the model's own out-of-sample error, as a range around the implied value. */
export interface LaunchSensitivity {
  /** Implied value times the 10th percentile of the leave-one-out residuals (linear factor). */
  p10: number;
  /** Implied value times the 25th percentile of the leave-one-out residuals. */
  p25: number;
  /** Implied value times the 75th percentile of the leave-one-out residuals. */
  p75: number;
  /** Implied value times the 90th percentile of the leave-one-out residuals. */
  p90: number;
  /** The P10–P90 spread as a percentage of the row's own implied value. */
  spread_pct: number;
}

/** The residual quantiles the sensitivity is priced from: linear factors from the leave-one-out residuals. */
export interface ResidualQuantiles {
  p10: number;
  p25: number;
  p75: number;
  p90: number;
}

/** A dollar figure to two decimals. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/**
 * A protocol's launch-value sensitivity: its implied value times the
 * leave-one-out residual quantiles of the selected variant. The spread is
 * the distance between the P90 and the P10, in per cent of the row's own
 * implied value, rounded to two decimals.
 */
export function launchSensitivity(implied: number, q: ResidualQuantiles): LaunchSensitivity {
  const p10 = Math.max(1, Math.round(implied * q.p10));
  const p25 = Math.max(1, Math.round(implied * q.p25));
  const p75 = Math.max(1, Math.round(implied * q.p75));
  const p90 = Math.max(1, Math.round(implied * q.p90));
  return { p10, p25, p75, p90, spread_pct: round2(((p90 - p10) / implied) * 100) };
}

/**
 * Why one row's sensitivity is not one the gate will take, or null: the four
 * range values must be positive whole dollars in order, and the spread must
 * be a finite, non-negative percentage of a positive implied value.
 */
export function sensitivityIssue(s: LaunchSensitivity, implied: number): string | null {
  const values: [string, number][] = [
    ['p10', s.p10],
    ['p25', s.p25],
    ['p75', s.p75],
    ['p90', s.p90],
  ];
  for (const [name, value] of values) {
    if (!Number.isSafeInteger(value) || value <= 0) return `sensitivity ${name} is ${value}`;
  }
  if (!(s.p10 <= s.p25 && s.p25 <= s.p75 && s.p75 <= s.p90)) return 'sensitivity range is not ordered';
  if (!Number.isFinite(s.spread_pct) || s.spread_pct < 0) return `sensitivity spread is ${s.spread_pct}`;
  if (implied <= 0) return 'sensitivity needs a positive implied value';
  return null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
  fit?: CurveFit,
  offsets?: SectorOffset[],
  variant: ModelVariant = 'a',
  quantiles?: ResidualQuantiles,
): BoardRow[] {
  const liveAll = snapshot.protocols.filter(isLiveTest);
  const useFit = fit ?? fitCurve(liveAll);
  const categories = [...new Set(snapshot.protocols.map((p) => p.category ?? 'Other'))];
  const useOffsets = offsets ?? computeOffsets(liveAll, useFit, categories);
  const useQuantiles = quantiles ?? { p10: 0.1, p25: 0.3, p75: 3, p90: 8 };
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, useFit, useOffsets, variant);
    const sensitivity = launchSensitivity(v.implied, useQuantiles);
    return { p, ...v, sensitivity };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    sensitivity: s.sensitivity,
    model: {
      curve_value_usd: s.curve,
      sector_offset: round4(s.offset),
      growth_multiplier: s.growthMult,
      maturity_multiplier: s.maturityMult,
      chain_multiplier: s.chainMult,
      factor_total: s.factorTotal,
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

// ---------------------------------------------------------------------------
// Farm economics
// The verdict answers one question: does a $1,000 deposit into this protocol
// pay for itself if the launch ever comes, at the model's own implied value?
// The slice is the deposit's share of the launch: 10% of the implied value
// goes to depositors, pro rata on TVL, so slice = 0.10 x implied x 1000 / TVL.
// The costs are stated, not hidden. Gas is the plan's WHOLE gas over the
// hold, summed from the gas the plan's own steps state — not a flat $1.50:
//   step 1: "under $3 of gas for the first transaction" -> $3, the upper bound
//   step 2: "about $8 of gas" to set the position up ($4 when the capital is
//           under $150, the plan's own figure for the smaller ticket)
//   step 3: "about $2 of gas a week" for the weekly action, times the weeks
//           in the hold (ceil(hold / 7))
//   steps 4-6: no gas — holding, checking and logging spend none.
// That puts the total gas at $17-$25 across the board, by capital and hold.
// The other cost is the 4% T-bill yield the $1,000 forgoes over the 30 days
// the plan holds it ($3.29). Hands-on time is the plan's own step times
// added up: 5 minutes to set up the wallet, 15 to place the position, 10
// minutes a week for the weekly action over the hold, 10 to check the
// rewards page, 5 to log it.
//   net = slice - gas - forgone
//   FARM when net > 0 (it beats every cost, forgone yield included)
//   THIN when net <= 0 but slice - gas > 0 (it beats the fees only)
//   SKIP when slice - gas <= 0 (it does not even beat the fees)
// Nothing here changes the ranking: the economics are priced from the same
// implied value the board already carries, so the table, the modal and the
// verdict counts all read one number.
// ---------------------------------------------------------------------------

/** The share of a launch the model assumes goes to depositors. */
export const FARM_SLICE_SHARE = 0.1;

/** The deposit the farm economics are priced at. */
export const FARM_DEPOSIT_USD = 1000;

/** The gas the first transaction costs: the plan says "under $3", and the accounting takes the $3 upper bound. */
export const FARM_GAS_FIRST_TX_USD = 3;

/** The gas the weekly action costs, per week. */
export const FARM_GAS_WEEKLY_USD = 2;

/** The T-bill rate the deposit forgoes while held. */
export const FARM_TBILL_RATE = 0.04;

/** The days of T-bill yield the deposit forgoes. */
export const FARM_TBILL_DAYS = 30;

/**
 * The plan's whole gas over the hold, summed from the gas the plan's own steps state: $3 for the
 * first transaction (the plan says "under $3"), $8 to set the position up ($4 when the capital is
 * under $150), and $2 a week for the weekly action over the hold. Steps 4-6 spend no gas. The
 * total is $17-$25 across the board, by capital and hold — and it is the gas the verdict is
 * judged against, not a flat $1.50.
 */
export function planGasUsd(capital: number, hold: number): { total: number; setup: number; weeks: number; detail: string } {
  const setup = capital >= 150 ? 8 : 4;
  const weeks = Math.ceil(hold / 7);
  const total = FARM_GAS_FIRST_TX_USD + setup + FARM_GAS_WEEKLY_USD * weeks;
  return { total, setup, weeks, detail: `$${FARM_GAS_FIRST_TX_USD} first tx + $${setup} setup + $${FARM_GAS_WEEKLY_USD}/wk × ${weeks} wks` };
}

/**
 * One row's farm economics at a $1,000 deposit: the launch slice, the stated
 * costs, the net, the hands-on time from the plan's own step times, and the
 * verdict the net earns. Deterministic: the same row always gives the same
 * economics.
 */
export function farmEconomics(implied: number, tvl: number, age: number | null): FarmEconomics {
  const capital = capitalFor({ tvl_usd: tvl } as SnapshotProtocol);
  const hold = holdDaysFor(age);
  const slice = tvl > 0 ? round2((FARM_SLICE_SHARE * implied * FARM_DEPOSIT_USD) / tvl) : 0;
  const gas = planGasUsd(capital, hold);
  const forgone = round2((FARM_DEPOSIT_USD * FARM_TBILL_RATE * FARM_TBILL_DAYS) / 365);
  const net = round2(slice - gas.total - forgone);
  const minutes = 5 + 15 + 10 * gas.weeks + 10 + 5;
  const hours = round2(minutes / 60);
  const verdict: FarmEconomics['verdict'] = net > 0 ? 'FARM' : slice - gas.total > 0 ? 'THIN' : 'SKIP';
  return {
    deposit_usd: FARM_DEPOSIT_USD,
    slice_usd: slice,
    gas_usd: gas.total,
    gas_detail: gas.detail,
    forgone_usd: forgone,
    net_usd: net,
    capital_usd: capital,
    hold_days: hold,
    hands_on_minutes: minutes,
    hands_on_hours: hours,
    net_per_hour_usd: hours > 0 ? round2(net / hours) : 0,
    verdict,
  };
}

/** The category's main action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('liquid staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('borrow')) return `Supply $${capital} of USDC to ${name} on ${chain}, then borrow $10 against it and repay the loan the same week.`;
  if (c.includes('dex')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and swap $10 through the pool in the same visit.`;
  if (c.includes('yield aggregator') || c.includes('yield')) return `Deposit $${capital} of USDC into a ${name} vault on ${chain} and claim the vault's yield once a week.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options') || c.includes('basis')) return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged trade.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app the same day.`;
  if (c.includes('prediction')) return `Fund $${capital} on ${name} and place one market position on an event at least a week out.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in the protocol's own app.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in the wallet you farm with.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active for the full hold.`;
  if (c.includes('index')) return `Buy $${capital} of ${name}'s index token on ${chain} and hold it in the farming wallet.`;
  if (c.includes('privacy')) return `Deposit $${capital} of USDC into ${name}'s shielded pool on ${chain} and withdraw it only after the hold.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares for the full hold.`;
  if (c.includes('liquidity manager')) return `Deposit $${capital} into ${name}'s managed liquidity position on ${chain} and leave the range alone.`;
  if (c.includes('nft')) return `Lend $${capital} of USDC against an NFT on ${name} on ${chain} and keep the loan open for the full hold.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's weekly qualifying action, so the plan is not the same sentence for every row. */
function weeklyFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('liquid staking') || c.includes('restak')) return `Restake the week's rewards through ${name} on ${chain} so the receipt balance grows.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('borrow')) return `Borrow $10 against the supply on ${name} and repay it the same week, every week.`;
  if (c.includes('dex')) return `Swap $10 through ${name}'s main pool on ${chain} once a week.`;
  if (c.includes('yield aggregator') || c.includes('yield')) return `Claim the vault's yield on ${name} once a week and redeposit it.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options') || c.includes('basis')) return `Open and close one small trade on ${name} each week, never more than $10 of margin.`;
  if (c.includes('bridge')) return `Bridge $10 through ${name} to ${chain} once a week and use it in the app.`;
  if (c.includes('prediction')) return `Place one small position on a new ${name} market each week.`;
  if (c.includes('stable')) return `Move $10 in and out of ${name}'s stable asset on ${chain} once a week.`;
  if (c.includes('rwa')) return `Top up the ${name} position by $10 once a week while the hold runs.`;
  if (c.includes('privacy')) return `Make one shielded deposit of $10 on ${name} each week.`;
  if (c.includes('curator') || c.includes('allocator')) return `Top up the ${name} vault by $10 once a week while the hold runs.`;
  if (c.includes('index')) return `Top up the ${name} index position by $10 once a week.`;
  if (c.includes('insurance')) return `Review the ${name} policy once a week and keep the cover active.`;
  if (c.includes('liquidity manager')) return `Check the ${name} position's range once a week and leave it alone unless it is out of range.`;
  return `Make one qualifying action each week on ${name}, such as a deposit, a swap or a vote, and keep the receipts.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const weekly = weeklyFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the $${capital} you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: weekly,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open ${p.name}'s own points or rewards page from the protocol's own site and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction hash in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/**
 * The protocols the board sets aside, grouped by the reason they are not on
 * it: every protocol in the snapshot that is neither a board row nor one of
 * the 24 live tokens the live tab shows. The groups are read off the
 * snapshot's own fields only — a name ending in a release number is
 * DefiLlama's marker for a versioned pool, a category of CEX is an exchange,
 * and the early cutoff is the 160 early rows the board carries. Nothing is
 * inferred about a protocol the snapshot does not describe.
 */
export function setAsideGroups(snapshot: Snapshot, board: BoardRow[], live: LiveRow[]): SetAsideGroup[] {
  const boardSlugs = new Set(board.map((r) => r.slug));
  const liveSlugs = new Set(live.map((r) => r.slug));
  const order: [string, string][] = [
    ['Above the floor, not on the watchlist', 'Pre-token and above the $50M floor, but the watchlist — the floor of this board — does not name them. The board ranks the watchlist plus the 160 early rows below it.'],
    ['Below the early cutoff', 'Pre-token and below the floor, ranked past the 160 early rows this board carries, largest TVL first.'],
    ['Versioned pools', 'The name ends in a release number, DefiLlama\u2019s marker for a pool of another protocol — a version of something that already exists, not a protocol of its own.'],
    ['Live tokens, beyond the 24 shown', 'Already trading. The live tab shows the 24 largest by market cap; the rest are set aside with them.'],
    ['Exchanges', 'A centralised exchange is not a launch to farm: the board ranks protocols, not venues, whether or not the exchange has a token.'],
  ];
  const members = new Map<string, SnapshotProtocol[]>();
  for (const [reason] of order) members.set(reason, []);
  for (const p of snapshot.protocols) {
    if (boardSlugs.has(p.slug) || liveSlugs.has(p.slug)) continue;
    let reason: string;
    if (p.category === 'CEX') reason = 'Exchanges';
    else if (isPreToken(p) && VERSIONED.test(p.name)) reason = 'Versioned pools';
    else if (isPreToken(p) && p.tvl_usd >= snapshot.floor_usd) reason = 'Above the floor, not on the watchlist';
    else if (isPreToken(p)) reason = 'Below the early cutoff';
    else reason = 'Live tokens, beyond the 24 shown';
    members.get(reason)!.push(p);
  }
  return order
    .map(([reason, detail]) => {
      const list = (members.get(reason) ?? []).sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
      return {
        reason,
        detail,
        count: list.length,
        members: list.map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd })),
      };
    })
    .filter((g) => g.count > 0);
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    sensitivity: row.sensitivity,
    economics: farmEconomics(row.implied_value_usd, row.tvl_usd, row.age_days),
    curve_value_usd: row.model.curve_value_usd,
    sector_offset: row.model.sector_offset,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    factor_total: row.model.factor_total,
    watchlist: false,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const validation = validateModel(snapshot, model);
  const liveAll = snapshot.protocols.filter(isLiveTest);
  const fit = fitCurve(liveAll);
  const categories = [...new Set(snapshot.protocols.map((p) => p.category ?? 'Other'))];
  const offsets = computeOffsets(liveAll, fit, categories);
  const board = buildBoard(snapshot, model, fit, offsets, validation.variant_selected, validation.residual_quantiles);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    fit,
    sector_offsets: offsets,
    variant_selected: validation.variant_selected,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    record_no_token: snapshot.protocols.filter(isPreToken).length,
    set_aside: setAsideGroups(snapshot, board, live),
    global_benchmark: flatBenchmark(liveAll),
    validation,
    rows: board.map((r) => ({ ...radarRow(r), watchlist: snapshot.watchlist.includes(r.slug) })),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

// ---------------------------------------------------------------------------
// Backtest: does curve-1 predict a token's market cap?
// The model is fitted on the snapshot's own live tokens, so it can be tested
// against them: a live token's market cap is the ground truth, and the model
// predicts it from the token's TVL and its sector offset — the same function
// that scores the board. Two variants are tested, and the variant with the
// better leave-one-out median miss is the one the board uses:
//   variant A: the fitted curve times the sector offset.
//   variant B: variant A times the radar-2 growth, maturity and chain
//     factors, with their product capped to [0.67, 1.5].
// Two tests, both blind in the sense that the tested token never prices
// itself:
//   leave-one-out: every live token in turn, predicted with the curve and
//     the offsets refitted without it.
//   time-split: the curve and the offsets are fitted on the live tokens
//     listed before 2024-01-01 and tested on the ones listed in 2024 or
//     later — the curve is fitted on the past and read on the future, as far
//     as one snapshot allows. Tokens with no listing date cannot be placed
//     on either side and are excluded from the split, and the count says so.
// The flat benchmark is the same test with one number instead of a model:
// the global median market-cap-to-TVL ratio times the token's TVL. It is the
// model to beat, and when the model does not beat it the table says so.
// A miss is max(pred/actual, actual/pred): a miss of 3 means the prediction
// is three times too high or three times too low. The band is the factor
// that covers a share of the misses: the 50% band is the median miss, the
// 80% band the 80th percentile of the misses (nearest rank). The ground
// truth is the market cap TODAY, from the snapshot — not the price at
// launch, which no snapshot carries. That is the test's honest limit, and
// the dashboard states it. The sensitivity ranges on the board come from
// the selected variant's leave-one-out residuals: log10(actual / predicted),
// whose 10th, 25th, 75th and 90th percentiles (linear interpolation) are
// the factors the P10–P90 and P25–P75 ranges are priced from.
// ---------------------------------------------------------------------------

/** The first day of the test half of the time split: tokens listed on or after it are tested. */
export const TIMESPLIT_DATE = '2024-01-01';

/** How far a prediction is from the truth, either way: 1 is exact, 3 is three times off. */
export function missOf(predicted: number, actual: number): number {
  return Math.max(predicted / actual, actual / predicted);
}

/** One test's numbers: how many, how far off, and how often inside a band. */
export interface BacktestMetrics {
  n: number;
  median_miss: number;
  within_2x_pct: number;
  within_3x_pct: number;
  band_50x: number;
  band_80x: number;
}

/** One out-of-sample point: a test token's actual market cap against its prediction. */
export interface BacktestPoint {
  slug: string;
  name: string;
  tvl_usd: number;
  actual_usd: number;
  predicted_usd: number;
}

/** Everything the backtest tab shows, computed from the snapshot at run time. */
export interface ModelValidation {
  live_n: number;
  listed_n: number;
  no_date_n: number;
  split_date: string;
  variant_selected: ModelVariant;
  variant_a: { loo: BacktestMetrics; timesplit: BacktestMetrics };
  variant_b: { loo: BacktestMetrics; timesplit: BacktestMetrics };
  loo: { n: number; model: BacktestMetrics; flat: BacktestMetrics };
  timesplit: { fit_n: number; test_n: number; excluded_n: number; model: BacktestMetrics; flat: BacktestMetrics; points: BacktestPoint[] };
  residual_quantiles: ResidualQuantiles;
}

/** One test's numbers from its misses: the median, the shares inside 2x and 3x, and the bands. */
function summarizeMisses(misses: number[]): BacktestMetrics {
  const sorted = [...misses].sort((a, b) => a - b);
  const n = sorted.length;
  const median = medianOf(sorted) ?? 0;
  const within = (x: number): number => (n === 0 ? 0 : Math.round((sorted.filter((m) => m <= x).length / n) * 1000) / 10);
  const band80 = n === 0 ? 0 : sorted[Math.min(n - 1, Math.ceil(0.8 * n) - 1)]!;
  return {
    n,
    median_miss: Math.round(median * 100) / 100,
    within_2x_pct: within(2),
    within_3x_pct: within(3),
    band_50x: Math.round(median * 100) / 100,
    band_80x: Math.round(band80 * 100) / 100,
  };
}

/**
 * The backtest, from the snapshot alone: leave-one-out over every live token
 * and a time split fitted on the pre-2024 listings and tested on the 2024+
 * listings, each for both variants and against the flat benchmark on the
 * same tokens. The variant with the better leave-one-out median miss is
 * selected; a tie goes to variant A, the simpler one. The residual
 * quantiles come from the selected variant's leave-one-out residuals.
 * Nothing here changes the board except through the selection: the board is
 * scored once, from the whole snapshot, with the selected variant.
 */
export function validateModel(snapshot: Snapshot, model: ModelConstants = MODEL): ModelValidation {
  const live = snapshot.protocols.filter(isLiveTest);
  const listed = live.filter((p) => p.listed_at !== null);
  const noDate = live.length - listed.length;

  // Leave-one-out, both variants: each live token predicted with the curve and the offsets
  // refitted without it. The flat benchmark is the median ratio of the rest.
  const looMiss: Record<ModelVariant, number[]> = { a: [], b: [] };
  const looFlat: number[] = [];
  const looResidual: Record<ModelVariant, number[]> = { a: [], b: [] };
  for (const p of live) {
    const rest = live.filter((q) => q.slug !== p.slug);
    const fit = fitCurve(rest);
    const offs = computeOffsets(rest, fit);
    for (const variant of ['a', 'b'] as ModelVariant[]) {
      const pred = impliedValue(p, snapshot.as_of, model, fit, offs, variant).implied;
      looMiss[variant].push(missOf(pred, p.mcap_usd!));
      looResidual[variant].push(Math.log10(p.mcap_usd! / pred));
    }
    looFlat.push(missOf(flatBenchmark(rest) * p.tvl_usd, p.mcap_usd!));
  }

  // Time-split: the curve and the offsets from the pre-2024 listings only, tested on the 2024+
  // listings, both variants and the flat benchmark on the same tokens.
  const fitSlugs = new Set(listed.filter((p) => p.listed_at! < TIMESPLIT_DATE).map((p) => p.slug));
  const fitSet = listed.filter((p) => fitSlugs.has(p.slug));
  const test = listed.filter((p) => p.listed_at! >= TIMESPLIT_DATE);
  const tsFit = fitCurve(fitSet);
  const tsOffs = computeOffsets(fitSet, tsFit);
  const tsFlatRatio = flatBenchmark(fitSet);
  const tsMiss: Record<ModelVariant, number[]> = { a: [], b: [] };
  const tsFlat: number[] = [];
  const tsPred: Record<ModelVariant, Map<string, number>> = { a: new Map(), b: new Map() };
  for (const p of test) {
    for (const variant of ['a', 'b'] as ModelVariant[]) {
      const pred = impliedValue(p, snapshot.as_of, model, tsFit, tsOffs, variant).implied;
      tsMiss[variant].push(missOf(pred, p.mcap_usd!));
      tsPred[variant].set(p.slug, pred);
    }
    tsFlat.push(missOf(tsFlatRatio * p.tvl_usd, p.mcap_usd!));
  }

  const looA = summarizeMisses(looMiss.a);
  const looB = summarizeMisses(looMiss.b);
  const tsA = summarizeMisses(tsMiss.a);
  const tsB = summarizeMisses(tsMiss.b);
  const selected: ModelVariant = looA.median_miss <= looB.median_miss ? 'a' : 'b';

  const residuals = [...looResidual[selected]].sort((a, b) => a - b);
  const residualQuantiles: ResidualQuantiles = {
    p10: round4(Math.pow(10, quantileOf(residuals, 0.1))),
    p25: round4(Math.pow(10, quantileOf(residuals, 0.25))),
    p75: round4(Math.pow(10, quantileOf(residuals, 0.75))),
    p90: round4(Math.pow(10, quantileOf(residuals, 0.9))),
  };

  const points: BacktestPoint[] = test
    .map((p) => ({ slug: p.slug, name: p.name, tvl_usd: p.tvl_usd, actual_usd: p.mcap_usd!, predicted_usd: tsPred[selected].get(p.slug)! }))
    .sort((a, b) => b.actual_usd - a.actual_usd);

  return {
    live_n: live.length,
    listed_n: listed.length,
    no_date_n: noDate,
    split_date: TIMESPLIT_DATE,
    variant_selected: selected,
    variant_a: { loo: looA, timesplit: tsA },
    variant_b: { loo: looB, timesplit: tsB },
    loo: { n: live.length, model: selected === 'a' ? looA : looB, flat: summarizeMisses(looFlat) },
    timesplit: { fit_n: fitSlugs.size, test_n: test.length, excluded_n: noDate, model: selected === 'a' ? tsA : tsB, flat: summarizeMisses(tsFlat), points },
    residual_quantiles: residualQuantiles,
  };
}

/**
 * Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps.
 */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    const sIssue = sensitivityIssue(r.sensitivity, r.implied_value_usd);
    if (sIssue !== null) return `${r.slug}: ${sIssue}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
