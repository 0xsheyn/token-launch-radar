// The token radar's model, version radar-2: one snapshot of the protocol universe in, one
// ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A
// protocol is pre-token when its index entry records no token (no market cap, no CoinGecko id,
// no symbol); the snapshot's live-token protocols are kept apart and shown as the market's own
// values, never mixed into the ranked board. Say a protocol records no token, never that it has
// none: the snapshot is DefiLlama's record, not proof.
//
// Implied value follows only from the snapshot's own figures, in four factors:
//
//   sector     = the sector's own FDV/TVL benchmark: the median market-cap-to-TVL ratio of the
//                live-token protocols in the same category, shrunk toward the global median
//                with a prior weight of 8 so a category with few live tokens does not set the
//                price on its own. A category with fewer than three live tokens carries no
//                sector signal of its own and takes the global benchmark: one live token,
//                however large its ratio, must not price a whole sector. Clamped to [0.05, 1.00].
//   base       = tvl_usd x sector
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   chains     = 1 + 0.04 x min(chains - 1, 4)            (one chain: 1.00, five or more: 1.16)
//   implied    = max(1, round(base x growthMult x maturity x chains))
//
// The constants are stated in the dashboard and changeable in the model sandbox. No protocol
// name is ever special-cased: the same function scores every row, and the sector benchmark is
// computed from the snapshot itself at run time, so the same code re-scores a future snapshot
// with no hand-kept list.

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

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  prior_weight: number;
  benchmark_floor: number;
  benchmark_cap: number;
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
  benchmark_floor: 0.05,
  benchmark_cap: 1.0,
  chain_step: 0.04,
  chain_cap: 4,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

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

/** One sector's benchmark: how its live tokens are valued against their TVL. */
export interface SectorBenchmark {
  category: string;
  live_count: number;
  median_ratio: number | null;
  benchmark: number;
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
    sector_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
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
  /** The gas the plan is assumed to spend. */
  gas_usd: number;
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
  sector_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
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
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  record_no_token: number;
  set_aside: SetAsideGroup[];
  benchmarks: SectorBenchmark[];
  global_benchmark: number;
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

/** Minimum live tokens for a category to price itself; fewer take the global benchmark. */
export const MIN_SECTOR_LIVE = 3;

/**
 * The sector benchmarks, computed from this snapshot's own live-token protocols: for every
 * category with at least three live tokens, the median market-cap-to-TVL ratio of its live
 * tokens, shrunk toward the global median with the model's prior weight, then clamped. A
 * category with fewer than three live tokens takes the global median: one live token's ratio
 * must not price a whole sector. Deterministic: the same snapshot always gives the same table.
 */
export function computeBenchmarks(snapshot: Snapshot, model: ModelConstants = MODEL): { global: number; byCategory: SectorBenchmark[] } {
  const allRatios: number[] = [];
  const byCategory = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    allRatios.push(ratio);
    const key = p.category ?? 'Other';
    const list = byCategory.get(key);
    if (list === undefined) byCategory.set(key, [ratio]);
    else list.push(ratio);
  }
  allRatios.sort((a, b) => a - b);
  const globalMedian = medianOf(allRatios) ?? 0.2;
  const global = Math.min(model.benchmark_cap, Math.max(model.benchmark_floor, globalMedian));
  const out: SectorBenchmark[] = [];
  const categories = new Set<string>(snapshot.protocols.map((p) => p.category ?? 'Other'));
  for (const category of [...categories].sort()) {
    const ratios = (byCategory.get(category) ?? []).sort((a, b) => a - b);
    const catMedian = medianOf(ratios);
    const benchmark =
      catMedian === null || ratios.length < MIN_SECTOR_LIVE
        ? global
        : Math.min(
            model.benchmark_cap,
            Math.max(model.benchmark_floor, (ratios.length * catMedian + model.prior_weight * globalMedian) / (ratios.length + model.prior_weight)),
          );
    out.push({ category, live_count: ratios.length, median_ratio: catMedian === null ? null : Math.round(catMedian * 10000) / 10000, benchmark: Math.round(benchmark * 10000) / 10000 });
  }
  return { global: Math.round(global * 10000) / 10000, byCategory: out };
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The four multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  benchmarks: { global: number; byCategory: SectorBenchmark[] },
): { implied: number; sector: number; growthPct: number; growthMult: number; maturityMult: number; chainMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const chainMult = 1 + model.chain_step * Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_cap);
  const sector = benchmarks.byCategory.find((b) => b.category === (protocol.category ?? 'Other'))?.benchmark ?? benchmarks.global;
  const base = protocol.tvl_usd * sector;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * chainMult));
  return { implied, sector, growthPct, growthMult, maturityMult, chainMult, age };
}

// ---------------------------------------------------------------------------
// Launch-value sensitivity
// An implied value is a point estimate, and a point estimate hides how much
// it leans on its inputs. Two of the four factors move fast around a launch:
// the TVL, which one large deposit or withdrawal can move overnight, and the
// 7-day growth, the noisiest number the snapshot carries. The sector
// benchmark, the protocol's age and its chain count move slowly, so this
// section holds those three still and shakes only the two fast inputs:
//   TVL 20% higher at launch          -> tvlShockUp
//   TVL 20% lower at launch           -> tvlShockDown
//   growth multiplier 0.25 hotter     -> growthShockUp
//   growth multiplier 0.25 colder     -> growthShockDown
//
// The growth shocks are clamped to [0.5, 1.8]: below 0.5 would mean a
// shrinkage worse than the growth floor allows, above 1.8 a weekly run
// hotter than the growth cap allows. The spread between the highest and the
// lowest shocked value, as a percentage of the row's own implied value, is
// the row's sensitivitySpreadPct: a wide spread means the launch value is
// fragile, a narrow one means it barely moves when the fast inputs turn
// against it. Nothing here changes the ranking or the implied value; the
// board sorts exactly as before, and the shocks are reported alongside it
// so a reader can carry the range instead of a single number.
// ---------------------------------------------------------------------------

/** How far a protocol's TVL may swing in the shock, up or down. */
export const TVL_SHOCK = 0.2;

/** How far the growth multiplier may swing in the shock, up or down. */
export const GROWTH_SHOCK = 0.25;

/** The coldest growth multiplier a shock may reach. */
export const GROWTH_MULT_FLOOR = 0.5;

/** The hottest growth multiplier a shock may reach. */
export const GROWTH_MULT_CEILING = 1.8;

/** One row's launch-value sensitivity: four shocked implied values and their spread. */
export interface LaunchSensitivity {
  /** Implied value with TVL 20% higher at launch, everything else held. */
  tvlShockUp: number;
  /** Implied value with TVL 20% lower at launch, everything else held. */
  tvlShockDown: number;
  /** Implied value with the growth multiplier 0.25 hotter, everything else held. */
  growthShockUp: number;
  /** Implied value with the growth multiplier 0.25 colder, everything else held. */
  growthShockDown: number;
  /** The four shocks' spread as a percentage of the row's own implied value. */
  sensitivitySpreadPct: number;
}

/** A growth multiplier held inside the shock's sane range. */
function clampGrowthMult(mult: number): number {
  return Math.min(GROWTH_MULT_CEILING, Math.max(GROWTH_MULT_FLOOR, mult));
}

/**
 * One implied value from its parts, on the same rule as the model itself:
 * the base times the three multipliers, rounded, never below one dollar.
 */
function rescoreImplied(base: number, growthMult: number, maturityMult: number, chainMult: number): number {
  return Math.max(1, Math.round(base * growthMult * maturityMult * chainMult));
}

/**
 * A protocol's launch-value sensitivity: the implied value under a TVL shock
 * of twenty per cent either way and a growth-multiplier shock of a quarter
 * either way, with the sector, the maturity and the chain multipliers held
 * exactly as the model scored them. The spread is the distance between the
 * highest and the lowest shocked value, in per cent of the row's own
 * implied value, rounded to two decimals.
 */
export function launchSensitivity(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  benchmarks: { global: number; byCategory: SectorBenchmark[] },
): LaunchSensitivity {
  const v = impliedValue(protocol, asOf, model, benchmarks);
  const base = protocol.tvl_usd * v.sector;
  const tvlShockUp = rescoreImplied(base * (1 + TVL_SHOCK), v.growthMult, v.maturityMult, v.chainMult);
  const tvlShockDown = rescoreImplied(base * (1 - TVL_SHOCK), v.growthMult, v.maturityMult, v.chainMult);
  const growthShockUp = rescoreImplied(base, clampGrowthMult(v.growthMult + GROWTH_SHOCK), v.maturityMult, v.chainMult);
  const growthShockDown = rescoreImplied(base, clampGrowthMult(v.growthMult - GROWTH_SHOCK), v.maturityMult, v.chainMult);
  const highest = Math.max(tvlShockUp, tvlShockDown, growthShockUp, growthShockDown);
  const lowest = Math.min(tvlShockUp, tvlShockDown, growthShockUp, growthShockDown);
  const sensitivitySpreadPct = Math.round(((highest - lowest) / v.implied) * 10000) / 100;
  return { tvlShockUp, tvlShockDown, growthShockUp, growthShockDown, sensitivitySpreadPct };
}

/**
 * Why one row's sensitivity is not one the gate will take, or null: the
 * four shocked values must be positive whole dollars, the TVL shock up must
 * sit above the TVL shock down, the growth shock up must sit above the
 * growth shock down, and the spread must be a finite, non-negative
 * percentage of a positive implied value.
 */
export function sensitivityIssue(s: LaunchSensitivity, implied: number): string | null {
  const shocks: [string, number][] = [
    ['tvlShockUp', s.tvlShockUp],
    ['tvlShockDown', s.tvlShockDown],
    ['growthShockUp', s.growthShockUp],
    ['growthShockDown', s.growthShockDown],
  ];
  for (const [name, value] of shocks) {
    if (!Number.isSafeInteger(value) || value <= 0) return `sensitivity ${name} is ${value}`;
  }
  if (s.tvlShockUp < s.tvlShockDown) return 'sensitivity TVL shocks are inverted';
  if (s.growthShockUp < s.growthShockDown) return 'sensitivity growth shocks are inverted';
  if (!Number.isFinite(s.sensitivitySpreadPct) || s.sensitivitySpreadPct < 0) return `sensitivity spread is ${s.sensitivitySpreadPct}`;
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
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const benchmarks = computeBenchmarks(snapshot, model);
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
    const v = impliedValue(p, snapshot.as_of, model, benchmarks);
    const sensitivity = launchSensitivity(p, snapshot.as_of, model, benchmarks);
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
      sector_multiple: round4(s.sector),
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      chain_multiplier: round4(s.chainMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

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
// The costs are stated, not hidden: $1.50 of gas for the plan's transactions,
// and the 4% T-bill yield the $1,000 forgoes over the 30 days the plan holds
// it ($3.29). Hands-on time is the plan's own step times added up: 5 minutes
// to set up the wallet, 15 to place the position, 10 minutes a week for the
// weekly action over the hold, 10 to check the rewards page, 5 to log it.
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

/** The gas the farm plan is assumed to spend, in dollars. */
export const FARM_GAS_USD = 1.5;

/** The T-bill rate the deposit forgoes while held. */
export const FARM_TBILL_RATE = 0.04;

/** The days of T-bill yield the deposit forgoes. */
export const FARM_TBILL_DAYS = 30;

/** A dollar figure to two decimals. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
  const gas = FARM_GAS_USD;
  const forgone = round2((FARM_DEPOSIT_USD * FARM_TBILL_RATE * FARM_TBILL_DAYS) / 365);
  const net = round2(slice - gas - forgone);
  const minutes = 5 + 15 + 10 * Math.ceil(hold / 7) + 10 + 5;
  const hours = round2(minutes / 60);
  const verdict: FarmEconomics['verdict'] = net > 0 ? 'FARM' : slice - gas > 0 ? 'THIN' : 'SKIP';
  return {
    deposit_usd: FARM_DEPOSIT_USD,
    slice_usd: slice,
    gas_usd: gas,
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
    sector_multiple: row.model.sector_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    watchlist: false,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const benchmarks = computeBenchmarks(snapshot, model);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    record_no_token: snapshot.protocols.filter(isPreToken).length,
    set_aside: setAsideGroups(snapshot, board, live),
    benchmarks: benchmarks.byCategory,
    global_benchmark: benchmarks.global,
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

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
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
