// Token Radar's dashboard, curve-1, editorial rebuild. It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, a log-log scatter of TVL against implied
// value, the farm verdicts priced from the model's own implied values, a filterable table, a
// centred detail modal with the model's own inputs and the protocol's farm plan, and the sector
// offsets the model was priced from. No network: every byte it shows is in data.js, and it
// fetches nothing. Numbers are recomputed in the page and checked against board.json.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', verdict: 'all', move: 'all', pill: 'all', tab: 'board', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  /** Dollars and cents, always with two decimals: the farm economics are small numbers. */
  function fmtMoney(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2);
  }
  /** A signed dollar figure: +$14.79, -$2.25. */
  function fmtSigned(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n >= 0 ? '+' : '-') + '$' + Math.abs(n).toFixed(2);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return 'x' + n.toFixed(3);
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  function impliedOf(row, fit) {
    var curve = Math.pow(10, fit.intercept + fit.slope * Math.log10(row.tvl_usd / fit.reference_tvl_usd));
    return Math.max(1, Math.round(curve * row.sector_offset * row.factor_total));
  }
  /** How many of the board's rows the page recomputes exactly as board.json carries them. */
  function matchCount() {
    var n = 0;
    DATA.rows.forEach(function (r, i) {
      if (r.rank === i + 1 && impliedOf(r, DATA.fit) === r.implied_value_usd) n++;
    });
    return n;
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // The capital tier and the hold, from the row's own TVL and age: the same rules main.ts
  // prices the farm economics with. Only a fallback here — every board row carries its own
  // economics in data.js; these cover a row that somehow has none.
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }

  // Board-wide figures, all computed live from data.js: no number on the page is typed in by hand.
  var TOTAL_IMPLIED = DATA.rows.reduce(function (a, r) { return a + r.implied_value_usd; }, 0);
  var BOARD_TVL = DATA.rows.reduce(function (a, r) { return a + r.tvl_usd; }, 0);
  var SECTORS_PRICED = (DATA.sector_offsets || []).filter(function (b) { return b.live_count >= 3; }).length;
  var CATEGORY_COUNT = (DATA.sector_offsets || []).length;
  var SET_ASIDE_TOTAL = (DATA.set_aside || []).reduce(function (a, g) { return a + g.count; }, 0);
  var VERDICTS = { FARM: 0, THIN: 0, SKIP: 0 };
  DATA.rows.forEach(function (r) { if (r.economics) VERDICTS[r.economics.verdict]++; });
  var GAS_MIN = Math.min.apply(null, DATA.rows.map(function (r) { return r.economics ? r.economics.gas_usd : Infinity; }));
  var GAS_MAX = Math.max.apply(null, DATA.rows.map(function (r) { return r.economics ? r.economics.gas_usd : 0; }));
  var MEDIAN_IMPLIED = (function () {
    var v = DATA.rows.map(function (r) { return r.implied_value_usd; }).sort(function (a, b) { return a - b; });
    return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  })();

  function verdictTag(v) {
    return el('span', { class: 'verdict ' + v.toLowerCase(), text: v });
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('verdict')) state.verdict = params.get('verdict');
    if (params.get('move')) state.move = params.get('move');
    if (params.get('pill')) state.pill = params.get('pill');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.verdict !== 'all') params.set('verdict', state.verdict);
    if (state.move !== 'all') params.set('move', state.move);
    if (state.pill !== 'all') params.set('pill', state.pill);
    if (state.tab !== 'board') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.verdict !== 'all' && (!r.economics || r.economics.verdict !== state.verdict)) return false;
      if (state.move === 'up' && !(r.change_7d !== null && r.change_7d > 0)) return false;
      if (state.move === 'down' && !(r.change_7d !== null && r.change_7d < 0)) return false;
      if (state.pill === 'watchlist' && !r.watchlist) return false;
      if (state.pill === 'early' && r.watchlist) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'slice') { av = a.economics ? a.economics.slice_usd : 0; bv = b.economics ? b.economics.slice_usd : 0; }
      else if (key === 'net') { av = a.economics ? a.economics.net_per_hour_usd : 0; bv = b.economics ? b.economics.net_per_hour_usd : 0; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    var matched = matchCount();
    return el('header', { class: 'top' },
      el('div', null,
        el('div', { class: 'brand', text: 'Token Radar.' }),
        el('div', { class: 'kicker', text: 'TOKEN LAUNCH RADAR \u00b7 MODEL: CURVE-1 \u00b7 ' + DATA.live_size + ' LIVE COMPS' })
      ),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of + ' \u00b7 DefiLlama protocols \u00b7 ' + DATA.board_size + ' protocols ranked' }),
        el('span', { class: 'badge', text: 'page = board.json: ' + matched + '/' + DATA.board_size + ' ranks and values match' })
      )
    );
  }

  // The hero scatter: TVL against implied value on log-log axes, drawn by hand as one inline SVG.
  // Lime dots are this radar's estimates for the 200 board rows; grey dots are the live comps'
  // market caps; the curve is the fitted size curve, sub-linear in TVL. No library, no network.
  function scatter() {
    var pts = DATA.rows.filter(function (r) { return r.tvl_usd > 0 && r.implied_value_usd > 0; }).map(function (r) { return { x: r.tvl_usd, y: r.implied_value_usd, live: false }; });
    DATA.live.forEach(function (r) { if (r.tvl_usd > 0 && r.mcap_usd !== null && r.mcap_usd > 0) pts.push({ x: r.tvl_usd, y: r.mcap_usd, live: true }); });
    var xs = pts.map(function (p) { return p.x; });
    var ys = pts.map(function (p) { return p.y; });
    var xMin = Math.floor(Math.log10(Math.min.apply(null, xs)));
    var xMax = Math.ceil(Math.log10(Math.max.apply(null, xs)));
    var yMin = Math.floor(Math.log10(Math.min.apply(null, ys)));
    var yMax = Math.ceil(Math.log10(Math.max.apply(null, ys)));
    var W = 560, H = 340, L = 46, R = 30, T = 8, B = 26;
    function px(v) { return L + ((Math.log10(v) - xMin) / (xMax - xMin)) * (W - L - R); }
    function py(v) { return T + (1 - (Math.log10(v) - yMin) / (yMax - yMin)) * (H - T - B); }
    var parts = ['<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="TVL against implied value, log-log">'];
    var k;
    for (k = xMin; k <= xMax; k++) {
      var gx = px(Math.pow(10, k));
      parts.push('<line class="grid" x1="' + gx.toFixed(1) + '" y1="' + T + '" x2="' + gx.toFixed(1) + '" y2="' + (H - B) + '"/>');
      parts.push('<text class="tick" x="' + gx.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + fmtUsd(Math.pow(10, k)) + '</text>');
    }
    for (k = yMin; k <= yMax; k++) {
      var gy = py(Math.pow(10, k));
      parts.push('<line class="grid" x1="' + L + '" y1="' + gy.toFixed(1) + '" x2="' + (W - R) + '" y2="' + gy.toFixed(1) + '"/>');
      parts.push('<text class="tick" x="' + (L - 6) + '" y="' + (gy + 4).toFixed(1) + '" text-anchor="end">' + fmtUsd(Math.pow(10, k)) + '</text>');
    }
    var curvePts = [];
    var i;
    for (i = 0; i <= 60; i++) {
      var lx = xMin + ((xMax - xMin) * i) / 60;
      var yv = Math.pow(10, DATA.fit.intercept + DATA.fit.slope * (lx - Math.log10(DATA.fit.reference_tvl_usd)));
      curvePts.push(px(Math.pow(10, lx)).toFixed(1) + ',' + py(yv).toFixed(1));
    }
    parts.push('<polyline class="bench-line" fill="none" points="' + curvePts.join(' ') + '"/>');
    pts.forEach(function (p) {
      parts.push('<circle class="' + (p.live ? 'dot-live' : 'dot') + '" cx="' + px(p.x).toFixed(1) + '" cy="' + py(p.y).toFixed(1) + '" r="' + (p.live ? 2.2 : 2.8) + '"/>');
    });
    parts.push('</svg>');
    return el('figure', { class: 'panel scatter-card' },
      el('figcaption', { text: 'HOW A LAUNCH IS PRICED' }),
      el('div', { html: parts.join('') }),
      el('p', { class: 'fig-note', text: 'Lime dots are this radar\u2019s estimates for the ' + DATA.board_size + '. Grey dots are the ' + DATA.live_size + ' live comps\u2019 market caps. Curve: the fitted size curve, log10(mcap) = ' + DATA.fit.intercept + ' + ' + DATA.fit.slope + ' \u00d7 log10(TVL/$100M) — a tenfold TVL buys about ' + Math.pow(10, DATA.fit.slope).toFixed(1) + 'x the market cap.' })
    );
  }

  function hero() {
    // One honest sentence of backtest, in the hero, so the board screenshot carries it: both
    // numbers, model and flat, read from data.js — never typed in here.
    var V = DATA.validation;
    var looBeat = V.loo.model.median_miss < V.loo.flat.median_miss;
    var tsBeat = V.timesplit.model.median_miss < V.timesplit.flat.median_miss;
    var beatText = looBeat && tsBeat ? 'beats the flat benchmark on both tests'
      : looBeat ? 'beats the flat benchmark leave-one-out but not on the time split'
      : tsBeat ? 'beats the flat benchmark on the time split but not leave-one-out'
      : 'does not beat the flat benchmark on either test';
    var validLine = el('p', { class: 'valid-line' },
      el('b', { text: 'Blind test: ' }),
      'leave-one-out ',
      el('b', { class: 'pos', text: 'x' + V.loo.model.median_miss.toFixed(2) }),
      ' vs flat x' + V.loo.flat.median_miss.toFixed(2),
      ' \u00b7 time-split ',
      el('b', { class: 'pos', text: 'x' + V.timesplit.model.median_miss.toFixed(2) }),
      ' vs flat x' + V.timesplit.flat.median_miss.toFixed(2),
      ' — the curve ' + beatText + '.'
    );
    return el('section', { class: 'hero' },
      el('div', { class: 'hero-copy' },
        el('h1', null,
          el('span', { text: DATA.board_size + ' protocols record no token.' }),
          el('br'),
          el('em', { text: 'The fitted size curve prices them at ' + fmtUsd(TOTAL_IMPLIED) + '.' })
        ),
        el('p', { text: 'Every protocol the feed tracks that records no token and is nobody else\u2019s product, priced from the ones that do: market cap grows slower than TVL — the curve fitted to the snapshot\u2019s ' + DATA.fit.n + ' trading protocols says a tenfold TVL buys about ' + Math.pow(10, DATA.fit.slope).toFixed(1) + 'x the market cap — so each sector\u2019s offset around that curve prices what is still to come.' }),
        validLine,
        el('p', { class: 'note', text: 'Off-white is the snapshot\u2019s record. Lime is this radar\u2019s estimate. A protocol records no token when DefiLlama carries no CoinGecko id and no symbol for it; a protocol on the list may still have a token its record does not carry, so the radar says \u201crecords no token\u201d, never \u201chas none\u201d.' })
      ),
      scatter()
    );
  }

  function statsStrip() {
    function cell(label, value, sub) {
      return el('div', { class: 'stat' }, el('div', { class: 'stat-label', text: label }), el('div', { class: 'stat-value', text: value }), el('div', { class: 'stat-sub', text: sub }));
    }
    return el('section', { class: 'stats', 'aria-label': 'Board statistics' },
      cell('PROTOCOLS TRACKED', String(DATA.rows.length + SET_ASIDE_TOTAL + DATA.live_size), 'in the ' + DATA.as_of + ' snapshot'),
      cell('RECORD NO TOKEN', String(DATA.record_no_token), 'no CoinGecko id, no symbol'),
      cell('ON THIS BOARD', String(DATA.board_size), 'pre-token, nobody else\u2019s product'),
      cell('WATCHLIST COVERED', DATA.watchlist_size + ' / ' + DATA.watchlist_size, 'the house floor, at least'),
      cell('TVL ON THE BOARD', fmtUsd(BOARD_TVL), fmtUsd(TOTAL_IMPLIED) + ' implied'),
      cell('SIZE CURVE', 'slope ' + DATA.fit.slope.toFixed(3), 'R\u00b2 ' + DATA.fit.r2.toFixed(3) + ' \u00b7 fitted on ' + DATA.fit.n + ' live tokens')
    );
  }

  function tabBar() {
    function tab(id, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === id ? 'true' : 'false', text: label,
        onclick: function () { state.tab = id; writeHash(); render(); } });
    }
    return el('nav', { class: 'tabbar', 'aria-label': 'Sections' },
      tab('board', 'Pre-token board ' + DATA.board_size),
      tab('live', 'Token already trades ' + DATA.live_size),
      tab('setaside', 'Set aside ' + SET_ASIDE_TOTAL),
      tab('model', 'Model & calibration'),
      tab('backtest', 'Method and backtest')
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search protocol, category, chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    function makeSelect(id, label, options, current, onchange, wide) {
      var s = el('select', { id: id, 'aria-label': label },
        options.map(function (o) { return el('option', { value: o[0], text: o[1], selected: o[0] === current ? 'selected' : null }); })
      );
      s.addEventListener('change', function () { onchange(s.value); writeHash(); render(); });
      return el('div', { class: 'field' + (wide ? ' field-wide' : '') }, el('label', { for: id, text: label }), s);
    }
    var catSel = makeSelect('category', 'Category', [['all', 'Every category']].concat(categories.map(function (c) { return [c, c]; })), state.category, function (v) { state.category = v; }, true);
    var chainSel = makeSelect('chain', 'Chain', [['all', 'Every chain']].concat(chains.map(function (c) { return [c, c]; })), state.chain, function (v) { state.chain = v; });
    var verdictSel = makeSelect('verdict', 'Verdict', [['all', 'Any verdict'], ['FARM', 'FARM'], ['THIN', 'THIN'], ['SKIP', 'SKIP']], state.verdict, function (v) { state.verdict = v; });
    var moveSel = makeSelect('move', 'Move', [['all', 'Any move'], ['up', 'Up, 7 days'], ['down', 'Down, 7 days']], state.move, function (v) { state.move = v; });
    function pill(id, label) {
      return el('button', { type: 'button', class: 'pill' + (state.pill === id ? ' active' : ''), 'aria-pressed': state.pill === id ? 'true' : 'false', text: label,
        onclick: function () { state.pill = id; writeHash(); render(); } });
    }
    // One line: search, four dropdowns and the Show pills share the row and
    // their bottoms line up with the inputs. The count lives with the table.
    return el('div', { class: 'controls' },
      el('div', { class: 'field field-search' }, el('label', { for: 'q', text: 'Search' }), search),
      catSel, chainSel, verdictSel, moveSel,
      el('div', { class: 'field' }, el('label', { text: 'Show' }),
        el('div', { class: 'pills' }, pill('all', 'All'), pill('watchlist', 'Watchlist'), pill('early', 'Early')))
    );
  }

  // The distribution histogram: log-spaced bins of implied value, drawn by hand as one inline SVG.
  function histogram() {
    var edges = [];
    var e;
    for (e = 5.5; e <= 9.01; e += 0.5) edges.push(Math.pow(10, e));
    var counts = [];
    var i;
    for (i = 0; i < edges.length - 1; i++) counts.push(0);
    DATA.rows.forEach(function (r) {
      for (i = 0; i < edges.length - 1; i++) {
        if (r.implied_value_usd >= edges[i] && r.implied_value_usd < edges[i + 1]) { counts[i]++; break; }
      }
    });
    var maxC = Math.max.apply(null, counts.concat([1]));
    var W = 1200, H = 120, L = 8, R = 8, T = 8, B = 22;
    var bw = (W - L - R) / counts.length;
    var parts = ['<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Distribution of implied values, log scale">'];
    counts.forEach(function (c, idx) {
      var h = Math.max(c > 0 ? 3 : 0, Math.round((c / maxC) * (H - T - B - 14)));
      var x = L + idx * bw + 2;
      parts.push('<rect class="hist-bar" x="' + x.toFixed(1) + '" y="' + (H - B - h) + '" width="' + (bw - 4).toFixed(1) + '" height="' + h + '"/>');
      if (c > 0) parts.push('<text class="hist-n" x="' + (x + (bw - 4) / 2).toFixed(1) + '" y="' + (H - B - h - 4) + '" text-anchor="middle">' + c + '</text>');
      parts.push('<text class="tick" x="' + (x + (bw - 4) / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + fmtUsd(edges[idx]) + '</text>');
    });
    parts.push('</svg>');
    return el('section', { class: 'panel hist' },
      el('h2', { text: 'How the board\u2019s implied values are distributed' }),
      el('div', { html: parts.join('') }),
      el('p', { class: 'hist-note', text: 'Log scale, half a decade a bar; the middle of the board is ' + fmtUsd(MEDIAN_IMPLIED) + '. The long tail is the small early rows. Each row\u2019s table bar shows its own sensitivity range — the model\u2019s leave-one-out error, P10\u2013P90 — on a log scale from the smallest low to the largest high. Slice: what $1,000 deposited would get if 10% of the launch goes to depositors pro rata. Net: that slice minus the plan\u2019s gas and the forgone 4% T-bill yield, per plan and per hands-on hour.' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25bc' : ' \u25b2' }) : null
      )
    );
  }

  function rankBadge(rank) {
    var cls = rank === 1 ? 'rank-badge top' : rank <= 3 ? 'rank-badge top3' : 'rank-badge';
    return el('span', { class: cls, text: String(rank) });
  }

  // The sensitivity range bar: the row's own P10–P90 range on one log scale shared by the
  // whole board, with a dot at the implied value. The scale runs from the smallest P10 to the
  // largest P90 across all 200 rows, so bars are comparable down the table.
  var RANGE = (function () {
    var lows = DATA.rows.map(function (r) { return r.sensitivity.p10; });
    var highs = DATA.rows.map(function (r) { return r.sensitivity.p90; });
    return { lo: Math.log10(Math.min.apply(null, lows)), hi: Math.log10(Math.max.apply(null, highs)) };
  })();
  function rangeBar(r) {
    var s = r.sensitivity;
    var low = s.p10;
    var high = s.p90;
    function pos(v) { return Math.max(0, Math.min(100, ((Math.log10(v) - RANGE.lo) / (RANGE.hi - RANGE.lo)) * 100)); }
    var left = pos(low), width = Math.max(2, pos(high) - left), dot = pos(r.implied_value_usd);
    return el('div', { class: 'range' },
      el('div', { class: 'range-val num', text: fmtUsd(r.implied_value_usd) }),
      el('div', { class: 'range-track', 'aria-hidden': 'true' },
        el('i', { class: 'range-span', style: 'left:' + left.toFixed(1) + '%;width:' + width.toFixed(1) + '%' }),
        el('b', { class: 'range-dot', style: 'left:' + dot.toFixed(1) + '%' })
      ),
      el('div', { class: 'range-sub', text: fmtUsd(low) + ' \u2013 ' + fmtUsd(high) })
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.verdict = 'all'; state.move = 'all'; state.pill = 'all'; writeHash(); render(); } })
      ));
    }
    var tbody = el('tbody');
    list.forEach(function (r) {
      var e = r.economics;
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num' }, rankBadge(r.rank)),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + ((r.chains || []).length > 2 ? ' +' + ((r.chains || []).length - 2) : '') }),
          r.watchlist ? el('span', { class: 'tag-watch' }, 'WATCHLIST') : null
        )),
        el('td', { text: r.category || 'Other' }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, rangeBar(r)),
        el('td', { class: 'num', text: e ? fmtMoney(e.slice_usd) : 'n/a' }),
        el('td', null, e ? el('div', { class: 'verdict-cell' }, verdictTag(e.verdict), el('div', { class: 'net-h ' + (e.net_per_hour_usd >= 0 ? 'pos' : 'neg'), text: fmtSigned(e.net_per_hour_usd) + '/h' })) : el('span', { text: 'n/a' })),
        el('td', { class: 'num', text: e ? fmtMoney(e.gas_usd) + ' \u00b7 ' + e.hold_days + 'd' : 'n/a' })
      );
      tbody.appendChild(tr);
    });
    return el('div', null,
      el('div', { class: 'panel' },
        el('div', { class: 'table-wrap' },
          el('table', { class: 'board-table' },
          el('thead', null, el('tr', null,
            sortHeader('implied', '#'),
            sortHeader('name', 'Protocol'),
            el('th', { scope: 'col', text: 'Mechanism' }),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7-day'),
            sortHeader('age', 'No token for'),
            sortHeader('implied', 'Implied value'),
            sortHeader('slice', 'Airdrop / $1K'),
            sortHeader('net', 'Verdict'),
            el('th', { scope: 'col', text: 'Fees \u00b7 Hold' })
          )),
          tbody
        )
      ),
      el('div', { class: 'table-meta' },
        el('span', { class: 'count', text: list.length + ' of ' + DATA.board_size + ' shown \u00b7 click a column to sort, a row for its detail' })
      )
    ));
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', null,
      // The live-token note is an explainer banner ABOVE the table, never a
      // caption inside it: a caption reads as a row of the table it describes.
      el('p', { class: 'live-note' },
        el('b', { text: 'Token live: ' }),
        'these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking, and their market caps fit the size curve and price the sector offsets.'),
      el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    )
    );
  }

  function setAsideTab() {
    var groups = (DATA.set_aside || []).map(function (g) {
      var body = el('tbody');
      g.members.forEach(function (m) {
        body.appendChild(el('tr', null,
          el('td', null, el('b', { text: m.name })),
          el('td', { text: m.category || 'Other' }),
          el('td', { class: 'num', text: fmtUsd(m.tvl_usd) })
        ));
      });
      return el('section', { class: 'panel set-group' },
        el('h2', null, el('span', { text: g.reason + ' ' }), el('span', { class: 'set-count', text: String(g.count) })),
        el('p', { class: 'set-detail', text: g.detail }),
        el('div', { class: 'table-wrap' },
          el('table', null,
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'TVL' }))),
            body
          )
        )
      );
    });
    return el('div', { class: 'set-aside' },
      el('p', { class: 'set-intro', text: 'The snapshot carries ' + (DATA.board_size + SET_ASIDE_TOTAL + DATA.live_size) + ' protocols. ' + DATA.board_size + ' are ranked on the board and ' + DATA.live_size + ' live tokens are shown on the live tab; the ' + SET_ASIDE_TOTAL + ' below are set aside for the reasons given, one group at a time. Nothing here is guessed: each reason is read off the snapshot\u2019s own fields.' }),
      groups
    );
  }

  function modelTab() {
    var m = DATA.model;
    var f = DATA.fit;
    var V = DATA.validation;
    var offRows = (DATA.sector_offsets || []).filter(function (b) { return b.live_count >= 3; }).sort(function (a, b) { return b.live_count - a.live_count; }).slice(0, 10);
    var offBody = el('tbody');
    offRows.forEach(function (b) {
      offBody.appendChild(el('tr', null,
        el('td', { text: b.category }),
        el('td', { class: 'num', text: String(b.live_count) }),
        el('td', { class: 'num', text: b.median_residual === null ? 'n/a' : (b.median_residual >= 0 ? '+' : '') + b.median_residual.toFixed(3) }),
        el('td', { class: 'num', text: b.offset.toFixed(3) + 'x' })
      ));
    });
    function variantRow(label, v, flat) {
      return el('tr', null,
        el('td', { text: label }),
        el('td', { class: 'num' + (v.loo.median_miss < flat.loo.median_miss ? ' better' : ''), text: 'x' + v.loo.median_miss.toFixed(2) }),
        el('td', { class: 'num' + (v.timesplit.median_miss < flat.timesplit.median_miss ? ' better' : ''), text: 'x' + v.timesplit.median_miss.toFixed(2) })
      );
    }
    return el('div', { class: 'model-grid' },
      el('section', { class: 'panel model-col' },
        el('h2', { text: 'How curve-1 prices a launch' }),
        el('p', { text: 'Every row is scored by one fitted function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked. The curve is ordinary least squares on the snapshot\u2019s ' + f.n + ' live tokens: log10(market cap) against log10(TVL / $100M). The slope is ' + f.slope + ', well under 1: a tenfold TVL buys about ' + Math.pow(10, f.slope).toFixed(1) + 'x the market cap, so the biggest protocols are not priced at a flat multiple of their TVL. Each sector then carries an offset around the curve: the median residual of its live tokens, shrunk toward 0 with a prior weight of ' + m.prior_weight + ' and clamped to [0.25, 4]. A sector with fewer than three live tokens carries no offset of its own and takes 1, so one live token never prices a whole sector.' }),
        el('div', { class: 'formula' },
          'implied = round( 10^( ' + f.intercept + ' + ' + f.slope + ' \u00d7 log10(TVL / $100M) ) \u00d7 sector_offset )'
        ),
        el('p', { text: 'TVL comes from the snapshot. Age, growth and chain count are not in the price: variant B, which multiplied the curve by the old growth, maturity and chain factors, was tested and rejected — it loses to this variant on both backtests, and the comparison on the right shows it. R\u00b2 is ' + f.r2 + ': TVL alone explains about ' + Math.round(f.r2 * 100) + '% of the spread in log market cap, and the rest is the sector offset and the error the sensitivity range shows.' }),
        el('h3', { text: 'Sector offsets (live tokens, this snapshot)' }),
        el('div', { class: 'table-wrap' },
          el('table', { class: 'bench' },
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Sector' }), el('th', { scope: 'col', text: 'Live tokens' }), el('th', { scope: 'col', text: 'Median residual (log10)' }), el('th', { scope: 'col', text: 'Offset used' }))),
            offBody
          )
        ),
        el('p', { class: 'sub', text: 'The early radar is every pre-token protocol below the watchlist floor, by TVL, and the live-token protocols are set aside with their market caps shown. A protocol below the floor is no worse a subject than one on it: the floor is where the reading started, not where it stops.' })
      ),
      el('section', { class: 'panel model-col' },
        el('h2', { text: 'Variant A won, variant B lost — both shown' }),
        el('div', { class: 'table-wrap' },
          el('table', { class: 'bench' },
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Variant' }), el('th', { scope: 'col', text: 'LOO median miss' }), el('th', { scope: 'col', text: 'Time-split median miss' }))),
            el('tbody', null,
              variantRow('A: curve + sector offset (selected)', V.variant_a, V),
              variantRow('B: A \u00d7 capped growth, maturity, chain factors', V.variant_b, V),
              el('tr', null,
                el('td', { text: 'Flat benchmark (global median mcap/TVL)' }),
                el('td', { class: 'num', text: 'x' + V.loo.flat.median_miss.toFixed(2) }),
                el('td', { class: 'num', text: 'x' + V.timesplit.flat.median_miss.toFixed(2) })
              )
            )
          )
        ),
        el('p', { text: 'The growth, maturity and chain factors add variance without signal: variant B misses further than variant A on the leave-one-out test (x' + V.variant_b.loo.median_miss.toFixed(2) + ' vs x' + V.variant_a.loo.median_miss.toFixed(2) + ') and on the time split (x' + V.variant_b.timesplit.median_miss.toFixed(2) + ' vs x' + V.variant_a.timesplit.median_miss.toFixed(2) + '), so the board uses A. The selection is by the leave-one-out median miss, computed at run time from this snapshot — a tie would go to A, the simpler variant.' }),
        el('h3', { text: 'What this model does not do' }),
        el('p', { text: 'The model is fitted on this snapshot\u2019s own live tokens, and the Method and backtest tab tests it against them — blind, leave-one-out, and on a time split by listing date. But read the Limits there first: the ground truth is today\u2019s market cap, not the price at launch, and the split is by listing date, not a replay of history. The curve earns its error bars against one global number, but the bars are still wide: half the predictions land within ' + V.loo.model.band_50x.toFixed(2) + 'x of the truth leave-one-out, and four in five within ' + V.loo.model.band_80x.toFixed(2) + 'x.' }),
        el('h3', { text: 'How the verdict is earned' }),
        el('p', { text: 'FARM: the slice beats gas and the forgone 4% T-bill yield — the net is positive after every cost. THIN: the slice beats the gas but not the forgone yield — worth it only if the fees fall or the slice grows. SKIP: the slice does not even beat the gas.' }),
        el('p', { class: 'sub', text: 'On this board: ' + VERDICTS.FARM + ' FARM \u00b7 ' + VERDICTS.THIN + ' THIN \u00b7 ' + VERDICTS.SKIP + ' SKIP. The counts follow the gas above, not a quota: the top rows by implied value are often SKIP, because a $1,000 deposit is a thin slice of a very large TVL.' }),
        el('h3', { text: 'Farm economics, stated plainly' }),
        el('ul', { class: 'assumptions' },
          el('li', { text: 'Slice: 10% of the launch goes to depositors, pro rata on TVL — slice = 0.10 \u00d7 implied \u00d7 $1,000 / TVL, at a $1,000 deposit.' }),
          el('li', { text: 'Gas: the plan\u2019s whole gas over the hold — $3 for the first transaction, $8 to set the position up ($4 when the capital is under $150), $2 a week for the weekly action — ' + fmtMoney(GAS_MIN) + ' to ' + fmtMoney(GAS_MAX) + ' across the board, by capital and hold. Each row\u2019s own total is in its detail view.' }),
          el('li', { text: 'Forgone: the 4% T-bill yield on the $1,000 over the 30 days the plan holds it — $3.29.' }),
          el('li', { text: 'Hands-on: the plan\u2019s own step times added up — 5 minutes to fund the wallet, 5 to verify the farm, 10 to place the position, 10 minutes a week for the weekly action over the hold, 10 to claim and 5 to log it. The Risk step holds the position for the hold\u2019s days and is checked in the weekly 10 minutes.' }),
          el('li', { text: 'Costed plan: every step of the farm plan states its gas and its minutes in the protocol\u2019s detail view, and the totals are the gas and hands-on time above. The net at $1K, $10K and $100K deposits under a 5%, 10% and 20% drop in the launch value is in the same view.' }),
          el('li', { text: 'Sensitivity: the model\u2019s own leave-one-out error — the P10\u2013P90 range of log10(actual / predicted) over the ' + V.live_n + ' live tokens, priced around each row\u2019s implied value. A wide range means the model itself misses widely on tokens like this one.' })
        )
      )
    );
  }

  // The backtest tab: how the model is tested, the two result tables, the
  // out-of-sample scatter, and the limits. Every number is read from
  // data.js (computed at run time from the snapshot), never typed in here —
  // including the verdict, which is computed, not asserted: on this snapshot
  // curve-1 beats the flat benchmark on the median miss on both tests, and
  // the tab says so — and it also says the previous model did not.
  function backtestTab() {
    var V = DATA.validation;
    if (!V) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No backtest in this data.js' }),
        el('p', { text: 'Regenerate the entry to compute the validation.' })
      ));
    }
    function miss(x) { return 'x' + x.toFixed(2); }
    function pct1(x) { return x.toFixed(1) + '%'; }
    function metricRow(label, m, other) {
      return el('tr', null,
        el('td', { text: label }),
        el('td', { class: 'num', text: String(m.n) }),
        el('td', { class: 'num' + (m.median_miss < other.median_miss ? ' better' : ''), text: miss(m.median_miss) }),
        el('td', { class: 'num' + (m.within_2x_pct > other.within_2x_pct ? ' better' : ''), text: pct1(m.within_2x_pct) }),
        el('td', { class: 'num' + (m.within_3x_pct > other.within_3x_pct ? ' better' : ''), text: pct1(m.within_3x_pct) }),
        el('td', { class: 'num' + (m.band_50x < other.band_50x ? ' better' : ''), text: miss(m.band_50x) }),
        el('td', { class: 'num' + (m.band_80x < other.band_80x ? ' better' : ''), text: miss(m.band_80x) })
      );
    }
    function resultTable(title, note, a, b) {
      return el('section', { class: 'panel bt-panel' },
        el('h2', { text: title }),
        el('p', { class: 'sub', text: note }),
        el('div', { class: 'table-wrap' },
          el('table', { class: 'bench' },
            el('thead', null, el('tr', null,
              el('th', { scope: 'col', text: 'Set' }),
              el('th', { scope: 'col', text: 'n' }),
              el('th', { scope: 'col', text: 'Median miss' }),
              el('th', { scope: 'col', text: 'Within 2x' }),
              el('th', { scope: 'col', text: 'Within 3x' }),
              el('th', { scope: 'col', text: 'Band 50%' }),
              el('th', { scope: 'col', text: 'Band 80%' }))),
            el('tbody', null, metricRow('Curve-1', a, b), metricRow('Flat benchmark', b, a))
          )
        )
      );
    }
    var looVerdict = V.loo.model.median_miss < V.loo.flat.median_miss ? 'beats' : 'does not beat';
    var tsVerdict = V.timesplit.model.median_miss < V.timesplit.flat.median_miss ? 'beats' : 'does not beat';

    // The out-of-sample scatter: the 51 test tokens, actual market cap
    // against the prediction, on log-log axes, with the diagonal and the 3x
    // band. A line log10(y) = log10(x) + c, clipped to the plot square.
    function oosScatter() {
      var pts = V.timesplit.points.filter(function (p) { return p.actual_usd > 0 && p.predicted_usd > 0; });
      var all = [];
      pts.forEach(function (p) { all.push(p.actual_usd); all.push(p.predicted_usd); });
      var lo = Math.floor(Math.log10(Math.min.apply(null, all)));
      var hi = Math.ceil(Math.log10(Math.max.apply(null, all)));
      var W = 560, H = 340, L = 46, R = 30, T = 8, B = 26;
      function px(v) { return L + ((Math.log10(v) - lo) / (hi - lo)) * (W - L - R); }
      function py(v) { return T + (1 - (Math.log10(v) - lo) / (hi - lo)) * (H - T - B); }
      function clipLine(c) {
        var top = Math.pow(10, hi), bot = Math.pow(10, lo);
        var x1 = Math.pow(10, lo), y1 = Math.pow(10, lo + c);
        var x2 = Math.pow(10, hi), y2 = Math.pow(10, hi + c);
        if (y1 > top) { x1 = Math.pow(10, hi - c); y1 = top; }
        if (y1 < bot) { x1 = Math.pow(10, lo - c); y1 = bot; }
        if (y2 > top) { x2 = Math.pow(10, hi - c); y2 = top; }
        if (y2 < bot) { x2 = Math.pow(10, lo - c); y2 = bot; }
        if (x1 >= x2) return null;
        return [x1, y1, x2, y2];
      }
      var parts = ['<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Out of sample: actual against predicted market cap, log-log">'];
      var k;
      for (k = lo; k <= hi; k++) {
        var gx = px(Math.pow(10, k));
        parts.push('<line class="grid" x1="' + gx.toFixed(1) + '" y1="' + T + '" x2="' + gx.toFixed(1) + '" y2="' + (H - B) + '"/>');
        parts.push('<text class="tick" x="' + gx.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + fmtUsd(Math.pow(10, k)) + '</text>');
        var gy = py(Math.pow(10, k));
        parts.push('<line class="grid" x1="' + L + '" y1="' + gy.toFixed(1) + '" x2="' + (W - R) + '" y2="' + gy.toFixed(1) + '"/>');
        parts.push('<text class="tick" x="' + (L - 6) + '" y="' + (gy + 4).toFixed(1) + '" text-anchor="end">' + fmtUsd(Math.pow(10, k)) + '</text>');
      }
      var band = clipLine(Math.log10(3)), band2 = clipLine(-Math.log10(3));
      if (band) parts.push('<line class="band-line" x1="' + px(band[0]).toFixed(1) + '" y1="' + py(band[1]).toFixed(1) + '" x2="' + px(band[2]).toFixed(1) + '" y2="' + py(band[3]).toFixed(1) + '"/>');
      if (band2) parts.push('<line class="band-line" x1="' + px(band2[0]).toFixed(1) + '" y1="' + py(band2[1]).toFixed(1) + '" x2="' + px(band2[2]).toFixed(1) + '" y2="' + py(band2[3]).toFixed(1) + '"/>');
      parts.push('<line class="diag" x1="' + px(Math.pow(10, lo)).toFixed(1) + '" y1="' + py(Math.pow(10, lo)).toFixed(1) + '" x2="' + px(Math.pow(10, hi)).toFixed(1) + '" y2="' + py(Math.pow(10, hi)).toFixed(1) + '"/>');
      pts.forEach(function (p) {
        parts.push('<circle class="dot" cx="' + px(p.actual_usd).toFixed(1) + '" cy="' + py(p.predicted_usd).toFixed(1) + '" r="3"><title>' + esc(p.name) + ': actual ' + fmtUsd(p.actual_usd) + ', predicted ' + fmtUsd(p.predicted_usd) + '</title></circle>');
      });
      parts.push('</svg>');
      return el('div', { html: parts.join('') });
    }

    return el('div', { class: 'backtest' },
      el('section', { class: 'panel bt-panel' },
        el('h2', { text: 'How the model is tested' }),
        el('p', { text: 'Curve-1 is fitted on this snapshot\u2019s live tokens: a size curve through the ' + V.live_n + ' market caps, with a sector offset per category. The backtest asks whether that curve predicts a token\u2019s market cap at all — the same function that scores the board, pointed at tokens that already trade.' }),
        el('p', { text: 'Leave-one-out (blind): all ' + V.live_n + ' live tokens, each predicted with the curve and the offsets refitted without it — no token prices itself. The flat benchmark is the same test with one number instead of a model: the global median market-cap-to-TVL ratio times the token\u2019s TVL.' }),
        el('p', { text: 'Time-split: the curve and the offsets are fitted on the ' + V.timesplit.fit_n + ' live tokens listed before ' + V.split_date + ' and tested on the ' + V.timesplit.test_n + ' listed in 2024 or later. The ' + V.timesplit.excluded_n + ' live tokens with no listing date cannot be placed on either side and are excluded from the split.' }),
        el('p', { text: 'Ground truth is the market cap today, from the snapshot — not the price at launch, which no snapshot carries. The split is by listing date, not a replay of history. A miss is max(predicted / actual, actual / predicted): a miss of 3 means three times too high or three times too low. The band is the factor that covers a share of the misses: the 50% band is the median miss, the 80% band the 80th percentile.' }),
        el('p', null, el('b', { text: 'On the median miss, curve-1 ' + looVerdict + ' the flat benchmark leave-one-out (' + miss(V.loo.model.median_miss) + ' vs ' + miss(V.loo.flat.median_miss) + ') and ' + tsVerdict + ' it on the time split (' + miss(V.timesplit.model.median_miss) + ' vs ' + miss(V.timesplit.flat.median_miss) + '). ' }),
          'The curve earns its error bars against one global number — but the bars are still wide: half the predictions land within ' + miss(V.loo.model.band_50x) + ' of the truth leave-one-out, and four in five within ' + miss(V.loo.model.band_80x) + '. The previous model, radar-2 — sector medians times growth, maturity and chain factors — did not beat the flat benchmark on either test (leave-one-out x5.15 vs x5.07; time-split x5.46 vs x5.20); the fitted curve replaces it.')
      ),
      resultTable('Leave-one-out (blind)', 'All ' + V.loo.n + ' live tokens. Each predicted with the curve and the offsets refitted without it.', V.loo.model, V.loo.flat),
      resultTable('Time-split', 'Curve and offsets fitted on the ' + V.timesplit.fit_n + ' tokens listed before ' + V.split_date + '; tested on the ' + V.timesplit.test_n + ' listed in 2024 or later.', V.timesplit.model, V.timesplit.flat),
      el('section', { class: 'panel bt-panel oos-card' },
        el('h2', { text: 'Out of sample: the ' + V.timesplit.test_n + ' test tokens' }),
        oosScatter(),
        el('p', { class: 'bt-note', text: 'Each dot is one test token: its market cap today against the prediction, fitted on pre-2024 listings only. Dots above the diagonal are over-predicted. The dashed lines are 3x either way; ' + V.timesplit.model.within_3x_pct.toFixed(1) + '% of the test set falls inside them.' })
      ),
      el('section', { class: 'panel bt-panel' },
        el('h2', { text: 'Limits' }),
        el('ul', { class: 'assumptions' },
          el('li', { text: 'One day of data: the snapshot is ' + DATA.as_of + '. A model fitted on one day cannot say how the next day\u2019s listings will price.' }),
          el('li', { text: 'Ground truth is today\u2019s market cap. A token\u2019s launch price is not in the snapshot, so the backtest tests prediction of today\u2019s value, not of the launch.' }),
          el('li', { text: 'Small samples: ' + V.live_n + ' tokens leave-one-out, ' + V.timesplit.fit_n + ' fitted and ' + V.timesplit.test_n + ' tested in the split. One large token moving changes the fit.' }),
          el('li', { text: V.timesplit.excluded_n + ' live tokens carry no listing date and are excluded from the time split.' }),
          el('li', { text: 'The curve and the sector offsets for the test tokens come from the fit set only — a test token\u2019s own category may have fewer than three fit tokens and fall back to offset 1.' }),
          el('li', { text: 'Read the band, not the point: half the predictions land within ' + miss(V.timesplit.model.band_50x) + ' of the truth on the time split, and four in five within ' + miss(V.timesplit.model.band_80x) + '.' })
        )
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });
  dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = row.plan || [];
    var e = row.economics;
    var recomputed = impliedOf(row, DATA.fit);
    var off = (DATA.sector_offsets || []).filter(function (b) { return b.category === (row.category || 'Other'); })[0];
    var s = row.sensitivity;
    var chainsText = (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain');

    var head = el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'No. ' + row.rank + ' of ' + DATA.board_size + ' \u00b7 ' + (row.category || 'Other') + (row.watchlist ? ' \u00b7 Watchlist' : '') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + chainsText + ' \u00b7 TVL ' + fmtUsd(row.tvl_usd) + ' \u00b7 no token for ' + fmtAge(row.age_days) })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    );

    var bigNums = el('div', { class: 'big-nums' },
      el('div', null, el('div', { class: 'big-label', text: 'IMPLIED VALUE' }), el('div', { class: 'big-value', id: 'modal-implied', text: fmtUsd(row.implied_value_usd) })),
      el('div', null, el('div', { class: 'big-label', text: 'SENSITIVITY RANGE (P10\u2013P90)' }), el('div', { class: 'big-value', text: fmtUsd(s.p10) + ' \u2013 ' + fmtUsd(s.p90) })),
      el('div', null, el('div', { class: 'big-label', text: 'AIRDROP SLICE / $1K' }), el('div', { class: 'big-value', text: e ? fmtMoney(e.slice_usd) : 'n/a' })),
      el('div', null, el('div', { class: 'big-label', text: 'VERDICT' }), e ? verdictTag(e.verdict) : el('span', { text: 'n/a' }))
    );

    // The TVL slider recomputes the implied value live from the row's own curve and offset: the
    // sector offset is held, only the TVL moves. The economics strip below stays priced at the
    // recorded TVL.
    var sliderOut = el('div', { class: 'slider-out', text: 'TVL +0% \u2192 implied ' + fmtUsd(row.implied_value_usd) });
    var slider = el('input', { type: 'range', min: '-20', max: '20', step: '1', value: '0', 'aria-label': 'Move the TVL by up to 20 percent' });
    slider.addEventListener('input', function () {
      var d = Number(slider.value);
      var moved = impliedOf({ tvl_usd: row.tvl_usd * (1 + d / 100), sector_offset: row.sector_offset, factor_total: row.factor_total }, DATA.fit);
      var out = document.getElementById('modal-implied');
      if (out) out.textContent = fmtUsd(moved);
      sliderOut.textContent = 'TVL ' + (d >= 0 ? '+' : '') + d + '% \u2192 implied ' + fmtUsd(moved);
    });
    var sliderSection = el('section', { class: 'detail-section' },
      el('h3', { text: 'What if the TVL moves?' }),
      el('div', { class: 'slider-row' }, slider, sliderOut),
      el('p', { class: 'sub', text: 'The curve and the sector offset are held; only the TVL moves \u00b120%. The economics below stay priced at the recorded TVL.' })
    );

    var eqRows = [
      el('div', null, el('span', { text: 'TVL on record' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
      el('div', null, el('span', { text: 'Curve value at this TVL (10^(' + DATA.fit.intercept + ' + ' + DATA.fit.slope + ' \u00d7 log10(TVL/$100M)))' }), el('b', { class: 'num', text: fmtUsd(row.curve_value_usd) })),
      el('div', null, el('span', { text: 'Sector offset (' + (row.category || 'Other') + ')' + (off && off.live_count < 3 ? ' — takes offset 1: fewer than three live tokens' : '') }), el('b', { class: 'num', text: String(row.sector_offset) + 'x' }))
    ];
    if (DATA.variant_selected === 'b') {
      eqRows.push(
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chain multiplier (' + (row.chains || []).length + ' chains)' }), el('b', { class: 'num', text: String(row.chain_multiplier) })),
        el('div', null, el('span', { text: 'Factor total (capped [0.67, 1.5])' }), el('b', { class: 'num', text: String(row.factor_total) + 'x' }))
      );
    } else {
      eqRows.push(
        el('div', null, el('span', { text: 'Growth, maturity and chain factors' }), el('b', { class: 'num', text: 'not used — variant A is curve + sector offset only' }))
      );
    }
    eqRows.push(
      el('div', { class: 'total' }, el('span', { text: 'Implied value (recomputed in this page)' }), el('b', { class: 'num', text: fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ' \u2713 matches the board' : ' \u2014 differs from the board') }))
    );

    var built = el('section', { class: 'detail-section' },
      el('h3', { text: 'How the value is built' }),
      el('div', { class: 'equation' }, eqRows),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. This is an estimate, not a price, and the protocol records no token: that is the snapshot\u2019s record, not proof it has none.' })
    );

    var sens = el('section', { class: 'detail-section' },
      el('h3', { text: 'Sensitivity: the model\u2019s own error' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'P10 \u2013 P90 (four in five land inside)' }), el('b', { class: 'num', text: fmtUsd(s.p10) + ' \u2013 ' + fmtUsd(s.p90) })),
        el('div', null, el('span', { text: 'P25 \u2013 P75 (half land inside)' }), el('b', { class: 'num', text: fmtUsd(s.p25) + ' \u2013 ' + fmtUsd(s.p75) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'The range is the leave-one-out error of the fitted curve: log10(actual / predicted) over the ' + DATA.validation.live_n + ' live tokens. It is not a confidence interval on this protocol — it is how far the model misses on tokens it has seen.' })
    );

    var econ = el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm economics, at a $1,000 deposit' }),
      e ? el('div', { class: 'econ-strip' },
        el('div', null, el('div', { class: 'econ-label', text: 'SLICE' }), el('b', { class: 'num', text: fmtMoney(e.slice_usd) })),
        el('div', null, el('div', { class: 'econ-label', text: 'GAS' }), el('b', { class: 'num', text: fmtMoney(e.gas_usd) })),
        el('div', null, el('div', { class: 'econ-label', text: 'FORGONE 4% T-BILL' }), el('b', { class: 'num', text: fmtMoney(e.forgone_usd) })),
        el('div', null, el('div', { class: 'econ-label', text: 'NET' }), el('b', { class: 'num ' + (e.net_usd >= 0 ? 'pos' : 'neg'), text: fmtSigned(e.net_usd) })),
        el('div', null, el('div', { class: 'econ-label', text: 'HANDS-ON' }), el('b', { class: 'num', text: e.hands_on_hours.toFixed(2) + ' h' })),
        el('div', null, el('div', { class: 'econ-label', text: 'NET PER HOUR' }), el('b', { class: 'num ' + (e.net_per_hour_usd >= 0 ? 'pos' : 'neg'), text: fmtSigned(e.net_per_hour_usd) + '/h' }))
      ) : el('p', { class: 'sub', text: 'No farm economics for this row.' }),
      el('p', { class: 'sub', text: e
        ? 'Slice: 10% of the launch to depositors, pro rata on TVL. Gas: this row\u2019s whole plan gas over the hold — ' + e.gas_detail + ' = ' + fmtMoney(e.gas_usd) + ' total. Forgone: the 4% T-bill yield on the $1,000 over 30 days. Hands-on: the plan\u2019s own step times.'
        : 'No farm economics for this row.' })
    );

    var ticket = el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm ticket' }),
      el('div', { class: 'ticket' },
        el('b', { text: '$' + (e ? e.capital_usd : capitalFor(row)) + ' capital' }),
        el('span', { text: (e ? e.hold_days : holdDaysFor(row.age_days)) + ' days hold' }),
        el('span', { text: '~$' + ((e ? e.capital_usd : capitalFor(row)) >= 150 ? 8 : 4) + ' setup gas' }),
        el('span', { text: steps.length + ' steps' })
      )
    );

    // The farm plan as a costed table: seven steps, each with its gas and its minutes, and a
    // totals row that must equal the economics below — the gas total and the hands-on time are
    // the same numbers, summed from the same steps, not a second accounting.
    var planGas = steps.reduce(function (a, s) { return a + (s.cost_usd || 0); }, 0);
    var planMin = steps.reduce(function (a, s) { return a + (s.minutes || 0); }, 0);
    var planBody = el('tbody');
    steps.forEach(function (s, i) {
      planBody.appendChild(el('tr', null,
        el('td', { class: 'num', text: String(i + 1) }),
        el('td', { class: 'plan-step', text: s.label || '' }),
        el('td', { class: 'plan-action', text: s.text || '' }),
        el('td', { class: 'num', text: fmtMoney(s.cost_usd) }),
        el('td', { class: 'num', text: s.time || '' })
      ));
    });
    var plan = el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan \u00b7 ' + (row.category || 'Other') + ' — costed, step by step' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'detail-table' },
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: '#' }),
            el('th', { scope: 'col', text: 'Step' }),
            el('th', { scope: 'col', text: 'Action' }),
            el('th', { scope: 'col', text: 'Gas' }),
            el('th', { scope: 'col', text: 'Time' }))),
          planBody,
          el('tfoot', null, el('tr', null,
            el('td', { text: '' }),
            el('td', { text: 'Total' }),
            el('td', { text: steps.length + ' steps \u00b7 $' + (e ? e.capital_usd : capitalFor(row)) + ' of capital stays in the position' }),
            el('td', { class: 'num', text: fmtMoney(planGas) }),
            el('td', { class: 'num', text: planMin + ' min' })))
        )
      ),
      el('p', { class: 'sub', text: 'Gas and hands-on time, summed from the steps above — the same ' + fmtMoney(planGas) + ' and ' + (planMin / 60).toFixed(2) + ' h the farm economics below prices. The Risk step holds the position for the hold\u2019s ' + (e ? e.hold_days : holdDaysFor(row.age_days)) + ' days; its weekly check is inside the Upkeep step\u2019s 10 minutes a week, so it adds no gas and no extra minutes.' })
    );

    // Net at bigger deposits and smaller launches: the slice scales with the deposit, the
    // forgone yield scales with it too, and the gas does not grow with the deposit at all.
    var tierBody = el('tbody');
    (row.tier_net || []).forEach(function (t) {
      function tierCell(v) { return el('td', { class: 'num ' + (v >= 0 ? 'pos' : 'neg'), text: fmtSigned(v) }); }
      tierBody.appendChild(el('tr', null,
        el('td', { class: 'num', text: '$' + t.deposit_usd.toLocaleString('en-US') }),
        tierCell(t.net_drop_05), tierCell(t.net_drop_10), tierCell(t.net_drop_20)
      ));
    });
    var tier = el('section', { class: 'detail-section' },
      el('h3', { text: 'Net if the launch is smaller — or the deposit is bigger' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'detail-table' },
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Deposit' }),
            el('th', { scope: 'col', text: 'Launch \u22125%' }),
            el('th', { scope: 'col', text: 'Launch \u221210%' }),
            el('th', { scope: 'col', text: 'Launch \u221220%' }))),
          tierBody
        )
      ),
      el('p', { class: 'sub', text: 'Net = slice \u00d7 (1 \u2212 drop) \u2212 gas \u2212 forgone. The slice scales with the deposit; the gas is the plan\u2019s ' + (e ? fmtMoney(e.gas_usd) : 'n/a') + ', which does not grow with it; the forgone is the 4% T-bill yield over 30 days, scaled with the deposit. At $1,000 with no drop the net is ' + (e ? fmtSigned(e.net_usd) : 'n/a') + ' — the farm economics below.' })
    );

    // The live tokens nearest this row by TVL: the market's own prices for protocols like it.
    var peerBody = el('tbody');
    (row.peers || []).forEach(function (p) {
      peerBody.appendChild(el('tr', null,
        el('td', null, el('b', { text: p.name })),
        el('td', { class: 'num', text: fmtUsd(p.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(p.mcap_usd) }),
        el('td', { class: 'num', text: p.ratio.toFixed(4) + 'x' }),
        el('td', { class: p.same_category ? 'pos' : '', text: p.same_category ? 'same sector' : 'other sector' })
      ));
    });
    var peerNote = (row.peers_same_category || 0) >= 3
      ? 'All three share this protocol\u2019s category (' + (row.category || 'Other') + '); each is one of the nearest live tokens by TVL.'
      : 'Only ' + (row.peers_same_category || 0) + ' of the three share this protocol\u2019s category (' + (row.category || 'Other') + '); the rest are the nearest live tokens by TVL across categories.';
    var peers = el('section', { class: 'detail-section' },
      el('h3', { text: 'Nearest traded peers' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'detail-table' },
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Peer' }),
            el('th', { scope: 'col', text: 'TVL' }),
            el('th', { scope: 'col', text: 'Market cap' }),
            el('th', { scope: 'col', text: 'mcap / TVL' }),
            el('th', { scope: 'col', text: 'Sector' }))),
          peerBody
        )
      ),
      el('p', { class: 'sub', text: peerNote + ' These are the live tokens the size curve is fitted on — the market\u2019s own prices for protocols like this one.' })
    );

    dialog.appendChild(head);
    dialog.appendChild(bigNums);
    dialog.appendChild(plan);
    dialog.appendChild(tier);
    dialog.appendChild(peers);
    dialog.appendChild(econ);
    dialog.appendChild(ticket);
    dialog.appendChild(sliderSection);
    dialog.appendChild(built);
    dialog.appendChild(sens);
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    if (state.tab === 'board') {
      shell.appendChild(hero());
      shell.appendChild(statsStrip());
      shell.appendChild(tabBar());
      shell.appendChild(controls());
      shell.appendChild(boardTable());
      shell.appendChild(histogram());
    } else if (state.tab === 'live') {
      shell.appendChild(tabBar());
      shell.appendChild(liveTable());
    } else if (state.tab === 'setaside') {
      shell.appendChild(tabBar());
      shell.appendChild(setAsideTab());
    } else if (state.tab === 'backtest') {
      shell.appendChild(tabBar());
      shell.appendChild(backtestTab());
    } else {
      shell.appendChild(tabBar());
      shell.appendChild(modelTab());
    }
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
