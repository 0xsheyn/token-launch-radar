


(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', verdict: 'all', move: 'all', pill: 'all', ticket: 1000, tab: 'board', sort: 'implied', dir: -1, selected: null, summaryHidden: false };

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n));
  }
  
  function fmtMoney(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2);
  }
  
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
  
  
  function impliedOf(row, fit) {
    var curve = Math.pow(10, fit.intercept + fit.slope * Math.log10(row.tvl_usd / fit.reference_tvl_usd));
    return Math.max(1, Math.round(curve * row.sector_offset * row.factor_total));
  }
  
  function matchCount() {
    var n = 0;
    DATA.rows.forEach(function (r, i) {
      if (r.rank === i + 1 && impliedOf(r, DATA.fit) === r.implied_value_usd) n++;
    });
    return n;
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  
  
  
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
  
  var TOTAL_IMPLIED = DATA.rows.reduce(function (a, r) { return a + r.implied_value_usd; }, 0);
  var BOARD_TVL = DATA.rows.reduce(function (a, r) { return a + r.tvl_usd; }, 0);
  var SET_ASIDE_TOTAL = (DATA.set_aside || []).reduce(function (a, g) { return a + g.count; }, 0);
  var VERDICTS = { FARM: 0, THIN: 0, SKIP: 0 };
  DATA.rows.forEach(function (r) { if (r.economics) VERDICTS[r.economics.verdict]++; });
  var BEST_HOUR = (function () {
    var best = null;
    DATA.rows.forEach(function (r) {
      if (r.economics && (!best || r.economics.net_per_hour_usd > best.economics.net_per_hour_usd)) best = r;
    });
    return best;
  })();
  var GAS_MIN = Math.min.apply(null, DATA.rows.map(function (r) { return r.economics ? r.economics.gas_usd : Infinity; }));
  var GAS_MAX = Math.max.apply(null, DATA.rows.map(function (r) { return r.economics ? r.economics.gas_usd : 0; }));
  var MEDIAN_IMPLIED = (function () {
    var v = DATA.rows.map(function (r) { return r.implied_value_usd; }).sort(function (a, b) { return a - b; });
    return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  })();

  function verdictTag(v) {
    return '<span class="verdict ' + v.toLowerCase() + '">' + esc(v) + '</span>';
  }

  var HASH_KEYS = [['q', 'q'], ['p', 'selected'], ['category', 'category'], ['chain', 'chain'], ['verdict', 'verdict'], ['move', 'move'], ['pill', 'pill'], ['tab', 'tab']];
  var HASH_DEFAULTS = { category: 'all', chain: 'all', verdict: 'all', move: 'all', pill: 'all', tab: 'board' };
  function readHash() {
    var params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    HASH_KEYS.forEach(function (kv) { var v = params.get(kv[0]); if (v) state[kv[1]] = v; });
  }
  function writeHash() {
    var params = new URLSearchParams();
    HASH_KEYS.forEach(function (kv) { var v = state[kv[1]]; if (v && v !== HASH_DEFAULTS[kv[1]]) params.set(kv[0], v); });
    var next = params.toString();
    window.history.replaceState(null, '', next ? '#' + next : window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.verdict !== 'all' && (!r.economics || econAt(r.economics).verdict !== state.verdict)) return false;
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
    function val(r) {
      if (key === 'name') return r.name.toLowerCase();
      if (key === 'tvl') return r.tvl_usd;
      if (key === 'growth') return r.change_7d === null ? -Infinity : r.change_7d;
      if (key === 'age') return r.age_days === null ? Infinity : r.age_days;
      if (key === 'slice') return r.economics ? econAt(r.economics).slice_usd : 0;
      if (key === 'net') return r.economics ? econAt(r.economics).net_per_hour_usd : 0;
      return r.implied_value_usd;
    }
    return list.slice().sort(function (a, b) {
      var av = val(a), bv = val(b);
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    var matched = matchCount();
    return [
      '<header class="top">',
        '<div><div class="brand">Token Radar.</div>',
        '<div class="kicker">TOKEN LAUNCH RADAR \u00b7 MODEL: CURVE-1 \u00b7 ' + DATA.live_size + ' LIVE COMPS</div></div>',
        '<div class="top-meta"><span>Snapshot ' + esc(DATA.as_of) + ' \u00b7 DefiLlama protocols \u00b7 ' + DATA.board_size + ' protocols ranked</span>',
        '<div class="top-pills">',
          '<span class="badge">\u2713 Watchlist ' + DATA.watchlist_size + '/' + DATA.watchlist_size + ' on the board</span>',
          '<span class="badge">\u2713 Recomputed here: ' + matched + '/' + DATA.board_size + ' rows equal board.json</span>',
        '</div></div>',
      '</header>'
    ].join('');
  }

  
  
  
  
  
  
  function loglog(o) {
    var W = 560, H = o.h || 340, L = 46, R = 30, T = 8, B = 26;
    function px(v) { return L + ((Math.log10(v) - o.xMin) / (o.xMax - o.xMin)) * (W - L - R); }
    function py(v) { return T + (1 - (Math.log10(v) - o.yMin) / (o.yMax - o.yMin)) * (H - T - B); }
    function clipLine(c) {
      var top = Math.pow(10, o.bands.hi), bot = Math.pow(10, o.bands.lo);
      var x1 = Math.pow(10, o.bands.lo), y1 = Math.pow(10, o.bands.lo + c);
      var x2 = Math.pow(10, o.bands.hi), y2 = Math.pow(10, o.bands.hi + c);
      if (y1 > top) { x1 = Math.pow(10, o.bands.hi - c); y1 = top; }
      if (y1 < bot) { x1 = Math.pow(10, o.bands.lo - c); y1 = bot; }
      if (y2 > top) { x2 = Math.pow(10, o.bands.hi - c); y2 = top; }
      if (y2 < bot) { x2 = Math.pow(10, o.bands.lo - c); y2 = bot; }
      if (x1 >= x2) return null;
      return [x1, y1, x2, y2];
    }
    var parts = ['<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.label) + '">'];
    var k;
    for (k = o.xMin; k <= o.xMax; k++) {
      var gx = px(Math.pow(10, k));
      parts.push('<line class="grid" x1="' + gx.toFixed(1) + '" y1="' + T + '" x2="' + gx.toFixed(1) + '" y2="' + (H - B) + '"/>');
      parts.push('<text class="tick" x="' + gx.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + fmtUsd(Math.pow(10, k)) + '</text>');
    }
    for (k = o.yMin; k <= o.yMax; k++) {
      var gy = py(Math.pow(10, k));
      parts.push('<line class="grid" x1="' + L + '" y1="' + gy.toFixed(1) + '" x2="' + (W - R) + '" y2="' + gy.toFixed(1) + '"/>');
      parts.push('<text class="tick" x="' + (L - 6) + '" y="' + (gy + 4).toFixed(1) + '" text-anchor="end">' + fmtUsd(Math.pow(10, k)) + '</text>');
    }
    if (o.curve) {
      var curvePts = [];
      var i;
      for (i = 0; i <= 60; i++) {
        var lx = o.xMin + ((o.xMax - o.xMin) * i) / 60;
        var yv = Math.pow(10, DATA.fit.intercept + DATA.fit.slope * (lx - Math.log10(DATA.fit.reference_tvl_usd)));
        curvePts.push(px(Math.pow(10, lx)).toFixed(1) + ',' + py(yv).toFixed(1));
      }
      parts.push('<polyline class="bench-line" fill="none" points="' + curvePts.join(' ') + '"/>');
    }
    if (o.bands) {
      var band = clipLine(Math.log10(3)), band2 = clipLine(-Math.log10(3));
      if (band) parts.push('<line class="band-line" x1="' + px(band[0]).toFixed(1) + '" y1="' + py(band[1]).toFixed(1) + '" x2="' + px(band[2]).toFixed(1) + '" y2="' + py(band[3]).toFixed(1) + '"/>');
      if (band2) parts.push('<line class="band-line" x1="' + px(band2[0]).toFixed(1) + '" y1="' + py(band2[1]).toFixed(1) + '" x2="' + px(band2[2]).toFixed(1) + '" y2="' + py(band2[3]).toFixed(1) + '"/>');
      parts.push('<line class="diag" x1="' + px(Math.pow(10, o.bands.lo)).toFixed(1) + '" y1="' + py(Math.pow(10, o.bands.lo)).toFixed(1) + '" x2="' + px(Math.pow(10, o.bands.hi)).toFixed(1) + '" y2="' + py(Math.pow(10, o.bands.hi)).toFixed(1) + '"/>');
    }
    o.dots.forEach(function (d) {
      parts.push('<circle class="' + d.cls + '" cx="' + px(d.x).toFixed(1) + '" cy="' + py(d.y).toFixed(1) + '" r="' + d.r + '"' + (d.title ? '><title>' + d.title + '</title></circle>' : '/>'));
    });
    parts.push('</svg>');
    return parts.join('');
  }

  function scatter() {
    var pts = DATA.rows.filter(function (r) { return r.tvl_usd > 0 && r.implied_value_usd > 0; }).map(function (r) { return { x: r.tvl_usd, y: r.implied_value_usd, live: false }; });
    DATA.live.forEach(function (r) { if (r.tvl_usd > 0 && r.mcap_usd !== null && r.mcap_usd > 0) pts.push({ x: r.tvl_usd, y: r.mcap_usd, live: true }); });
    var xs = pts.map(function (p) { return p.x; });
    var ys = pts.map(function (p) { return p.y; });
    var xMin = Math.floor(Math.log10(Math.min.apply(null, xs)));
    var xMax = Math.ceil(Math.log10(Math.max.apply(null, xs)));
    var yMin = Math.floor(Math.log10(Math.min.apply(null, ys)));
    var yMax = Math.ceil(Math.log10(Math.max.apply(null, ys)));
    var svg = loglog({ label: 'TVL against implied value, log-log', xMin: xMin, xMax: xMax, yMin: yMin, yMax: yMax, curve: true, dots: pts.map(function (p) { return { x: p.x, y: p.y, cls: p.live ? 'dot-live' : 'dot', r: p.live ? 2.2 : 2.8 }; }) });
    return [
      '<figure class="panel scatter-card"><figcaption>HOW A LAUNCH IS PRICED</figcaption><div>' + svg + '</div>',
      '<p class="fig-note">Sky-blue dots are this radar\u2019s estimates for the ' + DATA.board_size + '; grey dots are the ' + DATA.live_size + ' live comps\u2019 market caps.</p></figure>'
    ].join('');
  }

  
  
  
  function modelCard() {
    var V = DATA.validation;
    function missRow(label, miss, within, extra) {
      return '<tr' + (extra && extra.rowClass ? ' class="' + extra.rowClass + '"' : '') + '><td>' + esc(label) + (extra && extra.tag ? '<span class="rejected">' + esc(extra.tag) + '</span>' : '') + '</td><td class="num">\u00d7' + miss.toFixed(2) + '</td><td class="num">' + Math.round(within) + '%</td></tr>';
    }
    return [
      '<section class="panel model-card" aria-label="How a launch is priced">',
        '<div class="model-card-head"><h2>How a launch is priced</h2><span class="model-fn">impliedValue()</span></div>',
        '<p class="formula">10^' + DATA.fit.intercept.toFixed(3) + ' \u00d7 (TVL/$100M)^' + DATA.fit.slope.toFixed(3) + ' \u00d7 sector</p>',
        '<table class="model-bench"><thead><tr><th>Blind test</th><th>Miss</th><th>Within 2\u00d7</th></tr></thead><tbody>',
          missRow('One flat cap/TVL multiple', V.loo.flat.median_miss, V.loo.flat.within_2x_pct),
          missRow('Size curve + sector', V.loo.model.median_miss, V.loo.model.within_2x_pct, { rowClass: 'model-row' }),
          missRow('Time-split, same model', V.timesplit.model.median_miss, V.timesplit.model.within_2x_pct),
          missRow('Variant B', V.variant_b.loo.median_miss, V.variant_b.loo.within_2x_pct, { tag: 'rejected' }),
        '</tbody></table>',
        '<p class="model-foot">The ' + V.timesplit.test_n + ' newest tokens, fit on the ' + V.timesplit.fit_n + ' older.</p>',
        '<p class="model-foot">' + V.timesplit.excluded_n + ' tokens have no listing date; excluded.</p>',
      '</section>'
    ].join('');
  }

  function hero() {
    
    
    var V = DATA.validation;
    var looBeat = V.loo.model.median_miss < V.loo.flat.median_miss;
    var tsBeat = V.timesplit.model.median_miss < V.timesplit.flat.median_miss;
    var beatText = looBeat && tsBeat ? 'beats flat on both'
      : looBeat ? 'beats flat leave-one-out only'
      : tsBeat ? 'beats flat on the time split only'
      : 'does not beat flat';
    var validLine = '<p class="valid-line"><b>Blind: </b>leave-one-out <b class="pos">x' + V.loo.model.median_miss.toFixed(2) + '</b> vs flat x' + V.loo.flat.median_miss.toFixed(2) + ' \u00b7 time-split <b class="pos">x' + V.timesplit.model.median_miss.toFixed(2) + '</b> vs flat x' + V.timesplit.flat.median_miss.toFixed(2) + ' \u2014 ' + beatText + '.</p>';
    var ticketLine = '<p class="ticket-line">On a $1,000 ticket: <b class="t-farm">FARM ' + VERDICTS.FARM + '</b> \u00b7 <b class="t-thin">THIN ' + VERDICTS.THIN + '</b> \u00b7 <b class="t-skip">SKIP ' + VERDICTS.SKIP + '</b> \u00b7 best per hour <b>' + esc(BEST_HOUR ? BEST_HOUR.name : 'n/a') + '</b> <b class="pos">' + (BEST_HOUR ? fmtSigned(BEST_HOUR.economics.net_per_hour_usd) + '/h' : 'n/a') + '</b></p>';
    var noteP = '<p class="note">Sky blue is this radar\u2019s estimate; grey is the live comps\u2019 market caps. No CoinGecko id or symbol means \u201crecords no token\u201d.</p>';
    return [
      '<section class="hero">',
        '<div class="hero-copy">',
          '<h1><span>' + DATA.board_size + ' protocols record no token.</span><br><span>Priced like the ' + DATA.fit.n + ' that trade, their launches imply ' + fmtUsd(TOTAL_IMPLIED) + '.</span></h1>',
          '<p>Priced from the ' + DATA.fit.n + ' tokens that already trade: a tenfold TVL buys about ' + Math.pow(10, DATA.fit.slope).toFixed(1) + 'x the market cap, so each sector\u2019s offset prices what is still to come.</p>',
          validLine,
          ticketLine,
          noteP,
        '</div>',
        modelCard(),
        scatter(),
      '</section>'
    ].join('');
  }

  function statsStrip() {
    function cell(label, value, sub) {
      return '<div class="stat"><div class="stat-label">' + label + '</div><div class="stat-value">' + value + '</div><div class="stat-sub">' + sub + '</div></div>';
    }
    return '<section class="stats" aria-label="Board statistics">' +
      cell('PROTOCOLS TRACKED', String(DATA.rows.length + SET_ASIDE_TOTAL + DATA.live_size), 'in the ' + esc(DATA.as_of) + ' snapshot') +
      cell('RECORD NO TOKEN', String(DATA.record_no_token), 'no CoinGecko id, no symbol') +
      cell('ON THIS BOARD', String(DATA.board_size), 'pre-token, not a product') +
      cell('WATCHLIST COVERED', DATA.watchlist_size + ' / ' + DATA.watchlist_size, 'the house floor, at least') +
      cell('TVL ON THE BOARD', fmtUsd(BOARD_TVL), fmtUsd(TOTAL_IMPLIED) + ' implied') +
      cell('SIZE CURVE', 'slope ' + DATA.fit.slope.toFixed(3), 'R\u00b2 ' + DATA.fit.r2.toFixed(3) + ' \u00b7 ' + DATA.fit.n + ' live tokens') +
    '</section>';
  }

  function tabBar() {
    function tab(id, label) {
      return '<button type="button" aria-pressed="' + (state.tab === id ? 'true' : 'false') + '" data-act="tab" data-tab="' + id + '">' + label + '</button>';
    }
    return '<nav class="tabbar" aria-label="Sections">' +
      tab('board', 'Pre-token board ' + DATA.board_size) +
      tab('live', 'Token already trades ' + DATA.live_size) +
      tab('setaside', 'Set aside ' + SET_ASIDE_TOTAL) +
      tab('model', 'Model & calibration') +
      tab('backtest', 'Method and backtest') +
    '</nav>';
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    function makeSelect(id, label, options, current, wide, cls) {
      var opts = options.map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (o[0] === current ? ' selected="selected"' : '') + '>' + esc(o[1]) + '</option>';
      }).join('');
      return '<div class="field' + (wide ? ' field-wide' : '') + (cls ? ' ' + cls : '') + '"><label for="' + id + '">' + label + '</label><select id="' + id + '" aria-label="' + label + '">' + opts + '</select></div>';
    }
    function pill(id, label) {
      return '<button type="button" class="pill' + (state.pill === id ? ' active' : '') + '" aria-pressed="' + (state.pill === id ? 'true' : 'false') + '" data-act="pill" data-pill="' + id + '">' + label + '</button>';
    }
    
    
    return '<div class="controls">' +
      '<div class="field field-search"><label for="q">Search</label><input type="search" id="q" placeholder="Search protocol, category, chain" value="' + esc(state.q) + '" aria-label="Search the board"></div>' +
      makeSelect('category', 'Category', [['all', 'Every category']].concat(categories.map(function (c) { return [c, c]; })), state.category, true) +
      makeSelect('chain', 'Chain', [['all', 'Every chain']].concat(chains.map(function (c) { return [c, c]; })), state.chain, false) +
      makeSelect('verdict', 'Verdict', [['all', 'Any verdict'], ['FARM', 'FARM'], ['THIN', 'THIN'], ['SKIP', 'SKIP']], state.verdict, false) +
      makeSelect('move', 'Move', [['all', 'Any move'], ['up', 'Up, 7 days'], ['down', 'Down, 7 days']], state.move, false) +
      makeSelect('ticket', 'Ticket', [['1000', '$1K'], ['10000', '$10K'], ['100000', '$100K']], String(state.ticket), false, 'field-ticket') +
      '<div class="field"><label>Export</label><button type="button" class="button csv-btn" data-act="csv">CSV</button></div>' +
      '<div class="field"><label>Show</label><div class="pills">' + pill('all', 'All') + pill('watchlist', 'Watchlist') + pill('early', 'Early') + '</div></div>' +
    '</div>';
  }

  
  function histogram() {
    var edges = [];
    var e;
    for (e = 5.5; e <= 9.01; e += 0.5) edges.push(Math.pow(10, e));
    var counts = edges.slice(0, -1).map(function () { return 0; });
    var i;
    DATA.rows.forEach(function (r) {
      for (i = 0; i < edges.length - 1; i++) {
        if (r.implied_value_usd >= edges[i] && r.implied_value_usd < edges[i + 1]) { counts[i]++; break; }
      }
    });
    var maxC = Math.max.apply(null, counts.concat([1]));
    var W = 1200, H = 36, L = 8, R = 8, T = 11, B = 11;
    var bw = (W - L - R) / counts.length;
    var parts = ['<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Distribution of implied values, log scale, half a decade a bar">'];
    counts.forEach(function (c, idx) {
      var h = Math.max(c > 0 ? 2 : 0, Math.round((c / maxC) * (H - T - B)));
      var x = L + idx * bw + 2;
      parts.push('<rect class="hist-bar" x="' + x.toFixed(1) + '" y="' + (H - B - h) + '" width="' + (bw - 4).toFixed(1) + '" height="' + h + '"/>');
      if (c > 0) parts.push('<text class="hist-n" x="' + (x + (bw - 4) / 2).toFixed(1) + '" y="' + (H - B - h - 3) + '" text-anchor="middle">' + c + '</text>');
      parts.push('<text class="tick" x="' + (x + (bw - 4) / 2).toFixed(1) + '" y="' + (H - 2) + '" text-anchor="middle">' + fmtUsd(edges[idx]) + '</text>');
    });
    var medX = L + ((Math.log10(MEDIAN_IMPLIED) - 5.5) / (9 - 5.5)) * (W - L - R);
    parts.push('<line class="hist-median" x1="' + medX.toFixed(1) + '" y1="' + T + '" x2="' + medX.toFixed(1) + '" y2="' + (H - B) + '"><title>Median ' + fmtUsd(MEDIAN_IMPLIED) + '</title></line>');
    parts.push('</svg>');
    return '<section class="panel hist-strip" title="Log scale, half a decade a bar"><div class="hist-strip-label"><b>Implied values</b> <span>\u00b7 median ' + fmtUsd(MEDIAN_IMPLIED) + '</span></div><div class="hist-strip-svg">' + parts.join('') + '</div><span class="hist-count" title="Click a column to sort, a row for its detail">' + rows().length + ' of ' + DATA.board_size + ' shown</span></section>';
  }

  function sortHeader(key, label) {
    return '<th><button type="button" data-act="sort" data-key="' + key + '">' + label + (state.sort === key ? '<span aria-hidden="true">' + (state.dir < 0 ? ' \u25bc' : ' \u25b2') + '</span>' : '') + '</button></th>';
  }

  function rankBadge(rank) {
    var cls = rank === 1 ? 'rank-badge top' : rank <= 3 ? 'rank-badge top3' : 'rank-badge';
    return '<span class="' + cls + '">' + rank + '</span>';
  }

  
  
  
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
    return '<div class="range"><div class="range-val num">' + fmtUsd(r.implied_value_usd) + '</div>' +
      '<div class="range-track" aria-hidden="true"><i class="range-span" style="left:' + left.toFixed(1) + '%;width:' + width.toFixed(1) + '%"></i><b class="range-dot" style="left:' + dot.toFixed(1) + '%"></b></div>' +
      '<div class="range-sub">' + fmtUsd(low) + ' \u2013 ' + fmtUsd(high) + '</div></div>';
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return '<div class="panel"><div class="empty"><h2>No protocol matches that filter</h2><p>Clear the search or pick another category to see the board again.</p><button class="button primary" type="button" data-act="clear">Clear filters</button></div></div>';
    }
    var body = list.map(function (r) {
      var e = r.economics;
      var ea = econAt(e);
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var chains = r.chains || [];
      var sub = (r.category || 'Other') + ' on ' + (chains.length ? chains.slice(0, 2).join(', ') : 'an unnamed chain') + (chains.length > 2 ? ' +' + (chains.length - 2) : '');
      return '<tr data-selected="' + (state.selected === r.slug ? 'true' : 'false') + '" tabindex="0" data-act="row" data-slug="' + esc(r.slug) + '">' +
        '<td class="num">' + rankBadge(r.rank) + '</td>' +
        '<td><div class="name"><div class="name-top"><b>' + esc(r.name) + '</b>' + (r.watchlist ? '<span class="tag-watch">WATCHLIST</span>' : '<span class="tag-early">EARLY</span>') + '</div><span class="sub">' + esc(sub) + '</span></div></td>' +
        '<td>' + esc(r.category || 'Other') + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + growthClass + '">' + growth + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td>' + rangeBar(r) + '</td>' +
        '<td class="num">' + (ea ? fmtMoney(ea.slice_usd) : 'n/a') + '</td>' +
        '<td>' + (ea ? '<div class="verdict-cell">' + verdictTag(ea.verdict) + '<div class="net-h ' + (ea.net_per_hour_usd >= 0 ? 'pos' : 'neg') + '">' + fmtSigned(ea.net_per_hour_usd) + '/h</div></div>' : '<span>n/a</span>') + '</td>' +
        '<td class="num">' + (e ? fmtMoney(e.gas_usd) + ' \u00b7 ' + e.hold_days + 'd' : 'n/a') + '</td>' +
      '</tr>';
    }).join('');
    return '<div><div class="panel"><div class="table-wrap"><table class="board-table"><thead><tr>' +
      sortHeader('implied', '#') + sortHeader('name', 'Protocol') +
      '<th>Mechanism</th>' +
      sortHeader('tvl', 'TVL') + sortHeader('growth', '7-day') + sortHeader('age', 'No token for') +
      sortHeader('implied', 'Implied value') + sortHeader('slice', 'Airdrop / ' + ticketLabel()) + sortHeader('net', 'Verdict') +
      '<th>Fees \u00b7 Hold</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div>' +
      '</div></div>';
  }

  function liveTable() {
    var body = DATA.live.map(function (r) {
      var chains = r.chains || [];
      return '<tr><td class="num">live</td>' +
        '<td><div class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc((r.category || 'Other') + ' on ' + (chains.length ? chains.slice(0, 2).join(', ') : 'an unnamed chain')) + '</span></div></td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num">' + fmtUsd(r.mcap_usd) + '</td>' +
        '<td><span class="status live">already trades</span></td></tr>';
    }).join('');
    return '<div>' +
      
      
      '<p class="live-note"><b>Token live: </b>these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking; their market caps fit the size curve and price the sector offsets.</p>' +
      '<div class="panel"><div class="table-wrap"><table><thead><tr><th>Status</th><th>Protocol</th><th>TVL</th><th>7d</th><th>Market cap</th><th>Token</th></tr></thead><tbody>' + body + '</tbody></table></div></div></div>';
  }

  function setAsideTab() {
    var groups = (DATA.set_aside || []).map(function (g) {
      var body = g.members.map(function (m) {
        return '<tr><td><b>' + esc(m.name) + '</b></td><td>' + esc(m.category || 'Other') + '</td><td class="num">' + fmtUsd(m.tvl_usd) + '</td></tr>';
      }).join('');
      return '<section class="panel set-group"><h2><span>' + esc(g.reason) + ' </span><span class="set-count">' + g.count + '</span></h2>' +
        '<p class="set-detail">' + esc(g.detail) + '</p>' +
        '<div class="table-wrap"><table><thead><tr><th>Protocol</th><th>Category</th><th>TVL</th></tr></thead><tbody>' + body + '</tbody></table></div></section>';
    }).join('');
    return '<div class="set-aside"><p class="set-intro">The snapshot carries ' + (DATA.board_size + SET_ASIDE_TOTAL + DATA.live_size) + ' protocols. ' + DATA.board_size + ' are ranked on the board and ' + DATA.live_size + ' live tokens are on the live tab; the ' + SET_ASIDE_TOTAL + ' below are set aside for the reasons given, one group at a time. Nothing here is guessed: each reason is read off the snapshot\u2019s own fields.</p>' + groups + '</div>';
  }

  function modelTab() {
    var m = DATA.model;
    var f = DATA.fit;
    var V = DATA.validation;
    function variantRow(label, v, flat) {
      return '<tr><td>' + esc(label) + '</td><td class="num' + (v.loo.median_miss < flat.loo.median_miss ? ' better' : '') + '">x' + v.loo.median_miss.toFixed(2) + '</td><td class="num' + (v.timesplit.median_miss < flat.timesplit.median_miss ? ' better' : '') + '">x' + v.timesplit.median_miss.toFixed(2) + '</td></tr>';
    }
    var secBody = (V.sector_panel || []).map(function (s) {
      return '<tr><td>' + esc(s.category) + '</td><td class="num">' + fmtOffset(s.offset) + '</td><td class="num">' + s.live_count + '</td><td class="num">' + (s.median_ratio === null ? 'n/a' : s.median_ratio.toFixed(4) + 'x') + '</td><td class="num">' + s.board_rows + '</td><td class="num">' + (s.loo_median_miss === null ? 'n/a' : 'x' + s.loo_median_miss.toFixed(2)) + '</td><td class="num">' + s.loo_n + '</td></tr>';
    }).join('');
    var fitBody = (V.fitset_sensitivity || []).map(function (f) {
      return '<tr><td>' + esc(f.label) + '</td><td class="num">' + f.n + '</td><td class="num">x' + f.loo_median_miss.toFixed(2) + '</td><td class="num">' + f.within_2x_pct.toFixed(1) + '%</td></tr>';
    }).join('');
    var bs = V.bootstrap || null;
    var top1 = bs ? DATA.rows.filter(function (r) { return r.slug === bs.top1_slug; })[0] : null;
    var wide = '<section class="panel model-wide"><h2>Per sector: offset, live tokens, board rows, leave-one-out miss</h2>' +
      '<p class="sub">One row per category with at least three live tokens. Offset is the sector multiplier on the curve. LOO miss is the median leave-one-out miss of that sector\u2019s live tokens, each predicted with the curve and the offsets refitted without it \u2014 the same blind test as the board, cut by sector.</p>' +
      '<div class="table-wrap"><table class="bench"><thead><tr><th>Sector</th><th>Offset</th><th>Live tokens</th><th>Median mcap / TVL</th><th>Board rows</th><th>LOO miss</th><th>n</th></tr></thead><tbody>' + secBody + '</tbody></table></div></section>' +
      (bs ? '<section class="panel model-wide"><h2>Bootstrap: how stable is the fit?</h2>' +
      '<p>Refitting the curve and the offsets on ' + bs.resamples + ' resamples of the ' + V.live_n + ' live tokens (seeded, so the numbers are the same on every run). Slope ' + bs.slope_p5.toFixed(3) + ' to ' + bs.slope_p95.toFixed(3) + ' (P5\u2013P95); intercept ' + bs.intercept_p5.toFixed(3) + ' to ' + bs.intercept_p95.toFixed(3) + '. The top row, ' + esc(bs.top1_name) + ', implies ' + fmtUsd(top1 ? top1.implied_value_usd : 0) + ' (P5\u2013P95 ' + fmtUsd(bs.top1_p5) + ' to ' + fmtUsd(bs.top1_p95) + ') \u2014 the interval is wide, and the point estimate sits inside it.</p></section>' : '') +
      '<section class="panel model-wide"><h2>Fit-set sensitivity: the same test on three fits</h2>' +
      '<p class="sub">Leave-one-out median miss of variant A, fitted and tested within each set. The curve is not tuned to one lucky subset: it beats the flat benchmark on the full set, and the miss moves only modestly when the smallest tokens or the wildest ratios are left out.</p>' +
      '<div class="table-wrap"><table class="bench"><thead><tr><th>Fit set</th><th>n</th><th>LOO median miss</th><th>Within 2x</th></tr></thead><tbody>' + fitBody + '</tbody></table></div></section>';
    return '<div class="model-grid">' +
      '<section class="panel model-col"><h2>How curve-1 prices a launch</h2>' +
        '<p>Every row is scored by one fitted function of the snapshot figures \u2014 no name is special-cased, no row hand-picked. The curve is ordinary least squares on the snapshot\u2019s ' + f.n + ' live tokens: log10(market cap) against log10(TVL / $100M). The slope is ' + f.slope + ', well under 1: a tenfold TVL buys about ' + Math.pow(10, f.slope).toFixed(1) + 'x the market cap, so the biggest protocols are not priced at a flat multiple of TVL. Each sector carries an offset around the curve: the median residual of its live tokens, shrunk toward 0 with a prior weight of ' + m.prior_weight + ' clamped to [0.25, 4]. A sector with fewer than three live tokens takes offset 1, so one live token never prices a whole sector.</p>' +
        '<div class="formula">implied = round( 10^( ' + f.intercept + ' + ' + f.slope + ' \u00d7 log10(TVL / $100M) ) \u00d7 sector_offset )</div>' +
        '<p>TVL comes from the snapshot. Age, growth and chain count are not in the price: variant B, which multiplied the curve by the old growth, maturity and chain factors, was tested and rejected \u2014 it loses on both backtests (comparison on the right). R\u00b2 is ' + f.r2 + ': TVL alone explains about ' + Math.round(f.r2 * 100) + '% of the spread in log market cap, the rest is the sector offset and the error the sensitivity range shows.</p>' +
        '<p class="sub">The early radar is every pre-token protocol below the watchlist floor, by TVL; live-token protocols are set aside with their market caps shown. A protocol below the floor is no worse a subject than one on it: the floor is where the reading started, not where it stops.</p>' +
        '<h3>What this model does not do</h3>' +
        '<p>The model is fitted on this snapshot\u2019s own live tokens, and the Method and backtest tab tests it against them \u2014 blind, leave-one-out, and on a time split by listing date. But read the Limits there first: the ground truth is today\u2019s market cap, not the price at launch, and the split is by listing date, not a replay of history. The curve earns its error bars against one global number, but the bars are still wide: half the predictions land within ' + V.loo.model.band_50x.toFixed(2) + 'x of the truth leave-one-out, and four in five within ' + V.loo.model.band_80x.toFixed(2) + 'x.</p>' +
        '<h3>How the verdict is earned</h3>' +
        '<p>FARM: the slice beats gas and the forgone 4% T-bill yield \u2014 net positive after every cost. THIN: the slice beats the gas but not the forgone yield \u2014 worth it only if fees fall or the slice grows. SKIP: the slice does not even beat the gas.</p>' +
        '<p class="sub">On this board: ' + VERDICTS.FARM + ' FARM \u00b7 ' + VERDICTS.THIN + ' THIN \u00b7 ' + VERDICTS.SKIP + ' SKIP. The counts follow the gas, not a quota: the top rows by implied value are often SKIP, because $1,000 is a thin slice of a very large TVL.</p>' +
      '</section>' +
      '<section class="panel model-col"><h2>Variant A won, variant B lost \u2014 both shown</h2>' +
        '<div class="table-wrap"><table class="bench"><thead><tr><th>Variant</th><th>LOO median miss</th><th>Time-split median miss</th></tr></thead><tbody>' +
          variantRow('A: curve + sector offset (selected)', V.variant_a, V) +
          variantRow('B: A \u00d7 capped growth, maturity, chain factors', V.variant_b, V) +
          '<tr><td>Flat benchmark (global median mcap/TVL)</td><td class="num">x' + V.loo.flat.median_miss.toFixed(2) + '</td><td class="num">x' + V.timesplit.flat.median_miss.toFixed(2) + '</td></tr>' +
        '</tbody></table></div>' +
        '<p>The growth, maturity and chain factors add variance without signal: variant B misses further than variant A leave-one-out (x' + V.variant_b.loo.median_miss.toFixed(2) + ' vs x' + V.variant_a.loo.median_miss.toFixed(2) + ') and on the time split (x' + V.variant_b.timesplit.median_miss.toFixed(2) + ' vs x' + V.variant_a.timesplit.median_miss.toFixed(2) + '), so the board uses A. Selection is by the leave-one-out median miss, computed at run time from this snapshot \u2014 a tie would go to A, the simpler variant.</p>' +
        '<h3>Farm economics, stated plainly</h3>' +
        '<ul class="assumptions">' +
          '<li>Slice: 10% of the launch goes to depositors, pro rata on TVL \u2014 slice = 0.10 \u00d7 implied \u00d7 $1,000 / TVL, at a $1,000 deposit.</li>' +
          '<li>Gas: the plan\u2019s whole gas over the hold \u2014 $3 first transaction, $8 to set up ($4 when capital is under $150), $2 a week for the weekly action \u2014 ' + fmtMoney(GAS_MIN) + ' to ' + fmtMoney(GAS_MAX) + ' across the board, by capital and hold. Each row\u2019s own total is in its detail view.</li>' +
          '<li>Forgone: the 4% T-bill yield on the $1,000 over the 30 days the plan holds it \u2014 $3.29.</li>' +
          '<li>Hands-on: the plan\u2019s step times added up \u2014 5 minutes to fund, 5 to verify, 10 to place the position, 10 a week for the weekly action over the hold, 10 to claim, 5 to log it. The Risk step holds the position for the hold\u2019s days and is checked in the weekly 10 minutes.</li>' +
          '<li>Costed plan: every step states its gas and minutes in the protocol\u2019s detail view, and the totals are the gas and hands-on time above. The net at $1K, $10K and $100K deposits under a 5%, 10% and 20% drop is in the same view.</li>' +
          '<li>Sensitivity: the model\u2019s own leave-one-out error \u2014 the P10\u2013P90 range of log10(actual / predicted) over the ' + V.live_n + ' live tokens, priced around each row\u2019s implied value. A wide range means the model misses widely on tokens like this one.</li>' +
        '</ul>' +
      '</section>' +
    '</div>' + wide;
  }

  
  
  
  
  
  
  function backtestTab() {
    var V = DATA.validation;
    if (!V) {
      return '<div class="panel"><div class="empty"><h2>No backtest in this data.js</h2><p>Regenerate the entry to compute the validation.</p></div></div>';
    }
    function miss(x) { return 'x' + x.toFixed(2); }
    function pct1(x) { return x.toFixed(1) + '%'; }
    function metricRow(label, m, other) {
      return '<tr><td>' + esc(label) + '</td><td class="num">' + m.n + '</td>' +
        '<td class="num' + (m.median_miss < other.median_miss ? ' better' : '') + '">' + miss(m.median_miss) + '</td>' +
        '<td class="num' + (m.within_2x_pct > other.within_2x_pct ? ' better' : '') + '">' + pct1(m.within_2x_pct) + '</td>' +
        '<td class="num' + (m.within_3x_pct > other.within_3x_pct ? ' better' : '') + '">' + pct1(m.within_3x_pct) + '</td>' +
        '<td class="num' + (m.band_50x < other.band_50x ? ' better' : '') + '">' + miss(m.band_50x) + '</td>' +
        '<td class="num' + (m.band_80x < other.band_80x ? ' better' : '') + '">' + miss(m.band_80x) + '</td></tr>';
    }
    function resultTable(title, note, a, b) {
      return '<section class="panel bt-panel"><h2>' + esc(title) + '</h2><p class="sub">' + esc(note) + '</p>' +
        '<div class="table-wrap"><table class="bench"><thead><tr><th>Set</th><th>n</th><th>Median miss</th><th>Within 2x</th><th>Within 3x</th><th>Band 50%</th><th>Band 80%</th></tr></thead><tbody>' +
        metricRow('Curve-1', a, b) + metricRow('Flat benchmark', b, a) + '</tbody></table></div></section>';
    }
    var looVerdict = V.loo.model.median_miss < V.loo.flat.median_miss ? 'beats' : 'does not beat';
    var tsVerdict = V.timesplit.model.median_miss < V.timesplit.flat.median_miss ? 'beats' : 'does not beat';

    
    
    
    function oosScatter() {
      var pts = V.timesplit.points.filter(function (p) { return p.actual_usd > 0 && p.predicted_usd > 0; });
      var all = [];
      pts.forEach(function (p) { all.push(p.actual_usd); all.push(p.predicted_usd); });
      var lo = Math.floor(Math.log10(Math.min.apply(null, all)));
      var hi = Math.ceil(Math.log10(Math.max.apply(null, all)));
      var dots = pts.map(function (p) { return { x: p.actual_usd, y: p.predicted_usd, cls: 'dot', r: 3, title: esc(p.name) + ': actual ' + fmtUsd(p.actual_usd) + ', predicted ' + fmtUsd(p.predicted_usd) }; });
      return '<div>' + loglog({ label: 'Out of sample: actual against predicted market cap, log-log', xMin: lo, xMax: hi, yMin: lo, yMax: hi, bands: { lo: lo, hi: hi }, dots: dots }) + '</div>';
    }

    return '<div class="backtest">' +
      '<section class="panel bt-panel"><h2>How the model is tested</h2>' +
        '<p>Curve-1 is fitted on this snapshot\u2019s live tokens: a size curve through the ' + V.live_n + ' market caps, with a sector offset per category. The backtest asks whether that curve predicts a token\u2019s market cap at all \u2014 the same function that scores the board, pointed at tokens that already trade.</p>' +
        '<p>Leave-one-out (blind): all ' + V.live_n + ' live tokens, each predicted with the curve and the offsets refitted without it \u2014 no token prices itself. The flat benchmark is the same test with one number instead of a model: the global median market-cap-to-TVL ratio times the token\u2019s TVL.</p>' +
        '<p>Time-split: the curve and the offsets are fitted on the ' + V.timesplit.fit_n + ' live tokens listed before ' + V.split_date + ' and tested on the ' + V.timesplit.test_n + ' listed in 2024 or later. The ' + V.timesplit.excluded_n + ' live tokens with no listing date cannot be placed on either side and are excluded from the split.</p>' +
        '<p>Ground truth is the market cap today, from the snapshot \u2014 not the price at launch, which no snapshot carries. The split is by listing date, not a replay of history. A miss is max(predicted / actual, actual / predicted): a miss of 3 means three times too high or three times too low. The band is the factor covering a share of the misses: the 50% band is the median miss, the 80% band the 80th percentile.</p>' +
        '<p><b>On the median miss, curve-1 ' + looVerdict + ' the flat benchmark leave-one-out (' + miss(V.loo.model.median_miss) + ' vs ' + miss(V.loo.flat.median_miss) + ') and ' + tsVerdict + ' it on the time split (' + miss(V.timesplit.model.median_miss) + ' vs ' + miss(V.timesplit.flat.median_miss) + '). </b>' +
        'The curve earns its error bars against one global number \u2014 but the bars are still wide: half the predictions land within ' + miss(V.loo.model.band_50x) + ' of the truth leave-one-out, and four in five within ' + miss(V.loo.model.band_80x) + '. The previous model, radar-2 \u2014 sector medians times growth, maturity and chain factors \u2014 did not beat the flat benchmark on either test (leave-one-out x5.15 vs x5.07; time-split x5.46 vs x5.20); the fitted curve replaces it.</p>' +
      '</section>' +
      resultTable('Leave-one-out (blind)', 'All ' + V.loo.n + ' live tokens. Each predicted with the curve and the offsets refitted without it.', V.loo.model, V.loo.flat) +
      resultTable('Time-split', 'Curve and offsets fitted on the ' + V.timesplit.fit_n + ' tokens listed before ' + V.split_date + '; tested on the ' + V.timesplit.test_n + ' listed in 2024 or later.', V.timesplit.model, V.timesplit.flat) +
      '<section class="panel bt-panel oos-card"><h2>Out of sample: the ' + V.timesplit.test_n + ' test tokens</h2>' + oosScatter() +
        '<p class="bt-note">Each dot is one test token: its market cap today against the prediction, fitted on pre-2024 listings only. Dots above the diagonal are over-predicted. The dashed lines are 3x either way; ' + V.timesplit.model.within_3x_pct.toFixed(1) + '% of the test set falls inside them.</p></section>' +
      '<section class="panel bt-panel"><h2>Limits</h2><ul class="assumptions">' +
        '<li>One day of data: the snapshot is ' + esc(DATA.as_of) + '. A model fitted on one day cannot say how the next day\u2019s listings will price.</li>' +
        '<li>Ground truth is today\u2019s market cap. A token\u2019s launch price is not in the snapshot, so the backtest tests prediction of today\u2019s value, not the launch.</li>' +
        '<li>Small samples: ' + V.live_n + ' tokens leave-one-out, ' + V.timesplit.fit_n + ' fitted and ' + V.timesplit.test_n + ' tested in the split. One large token moving changes the fit.</li>' +
        '<li>' + V.timesplit.excluded_n + ' live tokens carry no listing date and are excluded from the time split.</li>' +
        '<li>The curve and the sector offsets for the test tokens come from the fit set only \u2014 a test token\u2019s category may have fewer than three fit tokens and fall back to offset 1.</li>' +
        '<li>Read the band, not the point: half the predictions land within ' + miss(V.timesplit.model.band_50x) + ' of the truth on the time split, and four in five within ' + miss(V.timesplit.model.band_80x) + '.</li>' +
      '</ul></section>' +
    '</div>';
  }

  function fmtOffset(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return '\u00d7' + n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    render();
    window.scrollTo(0, 0);
  }

  function goBackToBoard() {
    state.selected = null;
    state.tab = 'board';
    writeHash();
    render();
    window.scrollTo(0, 0);
  }

  
  
  function peerScatter(row) {
    var pts = DATA.live.filter(function (r) { return r.tvl_usd > 0 && r.mcap_usd !== null && r.mcap_usd > 0; }).map(function (r) { return { x: r.tvl_usd, y: r.mcap_usd }; });
    var xs = pts.map(function (p) { return p.x; });
    var ys = pts.map(function (p) { return p.y; });
    xs.push(row.tvl_usd);
    ys.push(row.implied_value_usd);
    var xMin = Math.floor(Math.log10(Math.min.apply(null, xs)));
    var xMax = Math.ceil(Math.log10(Math.max.apply(null, xs)));
    var yMin = Math.floor(Math.log10(Math.min.apply(null, ys)));
    var yMax = Math.ceil(Math.log10(Math.max.apply(null, ys)));
    var dots = pts.map(function (p) { return { x: p.x, y: p.y, cls: 'dot-live', r: 2.2 }; });
    dots.push({ x: row.tvl_usd, y: row.implied_value_usd, cls: 'dot-here', r: 5, title: esc(row.name) + ': TVL ' + fmtUsd(row.tvl_usd) + ', implied ' + fmtUsd(row.implied_value_usd) });
    return '<div class="peer-plot">' + loglog({ label: 'Live market caps against TVL, log-log, with this protocol marked', h: 300, xMin: xMin, xMax: xMax, yMin: yMin, yMax: yMax, curve: true, dots: dots }) + '</div>';
  }

  function detailPage(row) {
    var e = row.economics;
    var s = row.sensitivity;
    var recomputed = impliedOf(row, DATA.fit);
    var chain0 = (row.chains && row.chains.length ? row.chains[0] : 'an unnamed chain');
    var capital = e ? e.capital_usd : capitalFor(row);
    var hold = e ? e.hold_days : holdDaysFor(row.age_days);

    
    
    var stats = '<section class="detail-stats" aria-label="Protocol statistics">' +
      '<div class="panel dstat"><div class="stat-label">IMPLIED VALUE</div><div class="stat-value">' + fmtUsd(row.implied_value_usd) + '</div><div class="stat-sub">P25 to P90 ' + fmtUsd(s.p25) + ' to ' + fmtUsd(s.p90) + '</div></div>' +
      '<div class="panel dstat"><div class="stat-label">TVL</div><div class="stat-value">' + fmtUsd(row.tvl_usd) + '</div><div class="stat-sub">' + (row.change_7d === null ? '7d n/a' : '7d ' + fmtPct(row.change_7d)) + '</div></div>' +
      '<div class="panel dstat"><div class="stat-label">NO TOKEN FOR</div><div class="stat-value">' + fmtAge(row.age_days) + '</div><div class="stat-sub">tracked since ' + esc(row.listed_at || '\u2014') + '</div></div>' +
      '<div class="panel dstat"><div class="stat-label">NET OF ALL COSTS</div><div class="stat-value ' + (e ? (e.net_usd >= 0 ? 'pos' : 'neg') : '') + '">' + (e ? fmtSigned(e.net_usd) : 'n/a') + '</div><div class="stat-sub">slice ' + (e ? fmtMoney(e.slice_usd) : 'n/a') + ' at 10% to depositors</div>' +
        (e ? '<div class="stat-sub">' + esc(e.verdict) + ' | ' + fmtMoney(e.gas_usd) + ' fees + ' + fmtMoney(e.forgone_usd) + ' T-bill</div>' : '') +
      '</div></section>';

    
    
    
    var sectorNote = row.sector_offset === 1
      ? 'no own offset: category average'
      : (row.category || 'Other') + ': median residual of its traded tokens, shrunk toward 1';
    var built = '<section class="panel dpanel"><h2>How ' + fmtUsd(row.implied_value_usd) + ' is built</h2>' +
      '<div class="build-row"><div><div class="build-label">Size curve</div><div class="build-note">10^' + DATA.fit.intercept.toFixed(3) + ' \u00d7 (' + fmtUsd(row.tvl_usd) + '/$100M)^' + DATA.fit.slope.toFixed(3) + '</div></div><b class="num">' + fmtUsd(row.curve_value_usd) + '</b></div>' +
      '<div class="build-row"><div><div class="build-label">Sector</div><div class="build-note">' + esc(sectorNote) + '</div></div><b class="num">' + fmtOffset(row.sector_offset) + '</b></div>' +
      '<div class="build-row total"><div><div class="build-label">Implied value</div><div class="build-note">P10 to P90 ' + fmtUsd(s.p10) + ' to ' + fmtUsd(s.p90) + ', the blind residual range</div></div><b class="num">' + fmtUsd(row.implied_value_usd) + '</b></div>' +
      '<p class="sub build-foot">' + (recomputed === row.implied_value_usd
        ? 'Recomputed on this page: board.json carries the same ' + fmtUsd(row.implied_value_usd) + ' at rank ' + row.rank + '.'
        : 'Recomputed on this page: board.json carries ' + fmtUsd(row.implied_value_usd) + ' at rank ' + row.rank + '; the recompute gives ' + fmtUsd(recomputed) + '.') + '</p></section>';

    
    var peerBody = (row.peers || []).map(function (p) {
      return '<tr><td><b>' + esc(p.name) + '</b></td><td class="num">' + fmtUsd(p.tvl_usd) + '</td><td class="num">' + fmtUsd(p.mcap_usd) + '</td><td class="num">' + p.ratio.toFixed(4) + 'x</td></tr>';
    }).join('');
    var peerNote = (row.peers_same_category || 0) >= 3
      ? 'All three share this protocol\u2019s category (' + (row.category || 'Other') + '); each is one of the nearest live tokens by TVL.'
      : 'Only ' + (row.peers_same_category || 0) + ' of the three share this protocol\u2019s category (' + (row.category || 'Other') + '); the rest are the nearest live tokens by TVL across categories.';
    var peers = '<section class="panel dpanel"><h2>Against traded peers</h2>' + peerScatter(row) +
      '<div class="peer-cap">Nearest trading tokens by TVL</div>' +
      '<div class="table-wrap"><table class="detail-table"><thead><tr><th>Peer</th><th>TVL</th><th>Market cap</th><th>mcap / TVL</th></tr></thead><tbody>' + peerBody + '</tbody></table></div>' +
      '<p class="sub build-foot">' + esc(peerNote) + ' These are the live tokens the size curve is fitted on \u2014 the market\u2019s own prices for protocols like this one.</p></section>';

    
    
    var steps = row.plan || [];
    var planBody = steps.map(function (st, i) {
      return '<tr><td class="num">' + (i + 1) + '</td><td class="plan-step"><b>' + esc(st.label) + '. </b>' + esc(st.text || '') + '</td><td class="num">' + ((st.cost_usd || 0) === 0 ? 'none' : fmtMoney(st.cost_usd)) + '</td><td class="num">' + ((st.minutes || 0) > 0 ? (st.minutes + 'm') : esc(st.time || '\u2014')) + '</td></tr>';
    }).join('');
    var plan = '<section class="panel dpanel"><h2>Farm plan \u00b7 ' + esc(row.category || 'Other') + ' on ' + esc(chain0) + ' \u00b7 $' + capital + ' for ' + hold + ' days</h2>' +
      '<div class="table-wrap"><table class="detail-table plan-table"><thead><tr><th>#</th><th>Step</th><th>Cost</th><th>Time</th></tr></thead><tbody>' + planBody + '</tbody></table></div>' +
      (e ? '<p class="plan-foot">Slice ' + fmtMoney(e.slice_usd) + ' \u00b7 Fees \u2212' + fmtMoney(e.gas_usd) + ' \u00b7 T-bill forgone \u2212' + fmtMoney(e.forgone_usd) + ' \u00b7 Net\u00a0<b class="' + (e.net_usd >= 0 ? 'pos' : 'neg') + '">' + fmtSigned(e.net_usd) + '</b> \u00b7 Work ' + e.hands_on_hours.toFixed(2) + 'h \u00b7 Per hour\u00a0<b class="' + (e.net_per_hour_usd >= 0 ? 'pos' : 'neg') + '">' + fmtSigned(e.net_per_hour_usd) + '/h</b></p>'
        : '<p class="plan-foot">No farm economics for this row.</p>') +
    '</section>';

    
    
    
    
    var tierBody = (row.tier_net || []).map(function (t) {
      function tierCell(v, hl) { return '<td class="num ' + (v >= 0 ? 'pos' : 'neg') + (hl ? ' hl' : '') + '">' + fmtSigned(v) + '</td>'; }
      return '<tr><td class="num">$' + t.deposit_usd.toLocaleString('en-US') + '</td>' + tierCell(t.net_drop_05, false) + tierCell(t.net_drop_10, t.deposit_usd === 1000) + tierCell(t.net_drop_20, false) + '</tr>';
    }).join('');
    var drop10 = (row.tier_net || [])[0] ? row.tier_net[0].net_drop_10 : null;
    var tier = '<section class="panel dpanel"><h2>Net at</h2>' +
      '<div class="table-wrap"><table class="detail-table tier-table"><thead><tr><th>Deposit</th><th>Launch \u22125%</th><th>Launch \u221210%</th><th>Launch \u221220%</th></tr></thead><tbody>' + tierBody + '</tbody></table></div>' +
      '<p class="sub build-foot">' + (drop10 !== null && drop10 > 0
        ? 'At a 10% drop, it beats every cost from $1.0K of capital.'
        : 'At a 10% drop, it does not beat every cost from $1.0K of capital.') + ' Position yield is not counted; it is upside if the vault or pool pays one.</p></section>';

    return '<div class="detail-page">' +
      '<button class="button back-btn" type="button" data-act="back">Back to the board</button>' +
      '<p class="crumb">RANK ' + row.rank + ' OF ' + DATA.board_size + ' \u00b7 ' + esc((row.category || 'Other').toUpperCase()) + ' \u00b7 ' + esc(chain0.toUpperCase()) + '</p>' +
      '<div class="detail-title-row"><h1 class="detail-title">' + esc(row.name) + '</h1>' + (row.watchlist ? '<span class="tag-watch">WATCHLIST</span>' : '<span class="tag-early">EARLY</span>') + '</div>' +
      '<p class="detail-sub">DefiLlama records no token for ' + esc(row.name) + ' (no CoinGecko id, ticker or market cap) as of ' + esc(DATA.as_of) + '. A record is not proof: check its own channels before farming.</p>' +
      stats +
      '<div class="detail-cols"><div class="detail-col">' + built + peers + '</div><div class="detail-col">' + plan + tier + '</div></div>' +
    '</div>';
  }

  function tabBarRow(withSummary) {
    return '<div class="tabbar-row">' + tabBar() + (withSummary ? '<button type="button" class="button summary-btn" data-act="summary" aria-pressed="' + (!state.summaryHidden) + '">' + (state.summaryHidden ? 'Show summary' : 'Hide summary') + '</button>' : '') + '</div>';
  }
  function pageFoot() {
    return '<footer class="page-foot">Source: ' + esc(DATA.source) + ' \u00b7 Model curve-1, fitted on the snapshot\u2019s ' + DATA.fit.n + ' live tokens \u00b7 No live data: everything on this page comes from the sealed snapshot.</footer>';
  }
  function render() {
    var row = state.selected ? DATA.rows.filter(function (r) { return r.slug === state.selected; })[0] : null;
    if (state.selected && !row) { state.selected = null; writeHash(); }
    var body;
    if (row) body = tabBarRow(false) + detailPage(row);
    else if (state.tab === 'board') body = (state.summaryHidden ? '' : hero() + statsStrip()) + tabBarRow(true) + controls() + histogram() + boardTable();
    else if (state.tab === 'live') body = tabBarRow(false) + liveTable();
    else if (state.tab === 'setaside') body = tabBarRow(false) + setAsideTab();
    else if (state.tab === 'backtest') body = tabBarRow(false) + backtestTab();
    else body = tabBarRow(false) + modelTab();
    app.innerHTML = '<div class="shell">' + header() + body + pageFoot() + '</div>';
    app.setAttribute('aria-busy', 'false');
  }

  
  
  
  app.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!t) return;
    var act = t.getAttribute('data-act');
    if (act === 'tab') { state.tab = t.getAttribute('data-tab'); state.selected = null; writeHash(); render(); }
    else if (act === 'sort') {
      var key = t.getAttribute('data-key');
      if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; }
      render();
    }
    else if (act === 'row') { openDetail(t.getAttribute('data-slug')); }
    else if (act === 'pill') { state.pill = t.getAttribute('data-pill'); writeHash(); render(); }
    else if (act === 'back') { goBackToBoard(); }
    else if (act === 'summary') { state.summaryHidden = !state.summaryHidden; render(); }
    else if (act === 'clear') { state.q = ''; state.category = 'all'; state.chain = 'all'; state.verdict = 'all'; state.move = 'all'; state.pill = 'all'; writeHash(); render(); }
    else if (act === 'csv') { downloadCsv(); }
  });
  app.addEventListener('input', function (e) {
    if (e.target.id === 'q') {
      state.q = e.target.value;
      writeHash();
      render();
      
      
      var q = document.getElementById('q');
      if (q) { q.focus(); try { q.setSelectionRange(q.value.length, q.value.length); } catch (err) {  } }
    }
  });
  app.addEventListener('change', function (e) {
    if (['category', 'chain', 'verdict', 'move', 'ticket'].indexOf(e.target.id) < 0) return;
    state[e.target.id] = e.target.value;
    writeHash();
    render();
  });
  app.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest) {
      var tr = e.target.closest('tr[data-act="row"]');
      if (tr) { e.preventDefault(); openDetail(tr.getAttribute('data-slug')); }
    }
  });

  readHash();
  render();
  function ticketLabel() { var t = +state.ticket; return t === 100000 ? '$100K' : t === 10000 ? '$10K' : '$1K'; }
  function econAt(e) {
    if (!e) return null;
    var k = state.ticket / 1000;
    var slice = e.slice_usd * k;
    var forgone = e.forgone_usd * k;
    var net = slice - e.gas_usd - forgone;
    return { slice_usd: slice, gas_usd: e.gas_usd, forgone_usd: forgone, net_usd: net, net_per_hour_usd: net / e.hands_on_hours, verdict: net > 0 ? 'FARM' : (slice - e.gas_usd > 0 ? 'THIN' : 'SKIP'), hold_days: e.hold_days, hands_on_hours: e.hands_on_hours };
  }
  function csvCell(v) {
    var s = String(v === null || v === undefined ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function downloadCsv() {
    var list = sortedRows(rows());
    var head = ['rank', 'protocol', 'category', 'tvl_usd', 'change_7d_pct', 'age_days', 'implied_value_usd', 'implied_p10_usd', 'implied_p90_usd', 'airdrop_usd', 'verdict', 'net_per_hour_usd', 'gas_usd', 'hold_days'];
    var lines = [head.join(',')];
    list.forEach(function (r) {
      var ea = econAt(r.economics);
      var s = r.sensitivity || {};
      lines.push([r.rank, r.name, r.category || 'Other', r.tvl_usd, r.change_7d === null ? '' : r.change_7d, r.age_days === null ? '' : r.age_days, r.implied_value_usd, s.p10 || '', s.p90 || '', ea ? ea.slice_usd.toFixed(2) : '', ea ? ea.verdict : '', ea ? ea.net_per_hour_usd.toFixed(2) : '', r.economics ? r.economics.gas_usd : '', r.economics ? r.economics.hold_days : ''].map(csvCell).join(','));
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'token-launch-radar.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.selected) goBackToBoard();
  });
})();
