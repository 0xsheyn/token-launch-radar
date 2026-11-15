// Token Radar's dashboard, radar-2, editorial rebuild. It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, a log-log scatter of TVL against implied
// value, the farm verdicts priced from the model's own implied values, a filterable table, a
// centred detail modal with the model's own inputs and the protocol's farm plan, and the sector
// benchmarks the model was priced from. No network: every byte it shows is in data.js, and it
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
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var chainMult = 1 + model.chain_step * Math.min(Math.max((row.chains || []).length - 1, 0), model.chain_cap);
    return Math.max(1, Math.round(row.tvl_usd * row.sector_multiple * growthMult * maturity * chainMult));
  }
  /** How many of the board's rows the page recomputes exactly as board.json carries them. */
  function matchCount() {
    var n = 0;
    DATA.rows.forEach(function (r, i) {
      if (r.rank === i + 1 && impliedOf(r, DATA.model) === r.implied_value_usd) n++;
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

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the weekly action, the capital, the hold and every cost and time. No name is
  // special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
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
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('liquid staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' on ' + chain + ' and keep the receipt token.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0 || c.indexOf('borrow') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ', then borrow $10 against it and repay the loan the same week.';
    if (c.indexOf('dex') >= 0) return 'Provide $' + capital + " of liquidity to " + name + "'s main pool on " + chain + ' and swap $10 through the pool in the same visit.';
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0) return 'Deposit $' + capital + ' of USDC into a ' + name + ' vault on ' + chain + " and claim the vault's yield once a week.";
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0 || c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' on ' + chain + ' and open one small hedged trade.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app the same day.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' on ' + name + ' and place one market position on an event at least a week out.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + " and hold it in the protocol's own app.";
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of " + name + "'s yield-bearing asset on " + chain + ' and hold it in the wallet you farm with.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active for the full hold.';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + " of " + name + "'s index token on " + chain + ' and hold it in the farming wallet.';
    if (c.indexOf('privacy') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s shielded pool on " + chain + ' and withdraw it only after the hold.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares for the full hold.';
    if (c.indexOf('liquidity manager') >= 0) return 'Deposit $' + capital + " into " + name + "'s managed liquidity position on " + chain + ' and leave the range alone.';
    if (c.indexOf('nft') >= 0) return 'Lend $' + capital + ' of USDC against an NFT on ' + name + ' on ' + chain + ' and keep the loan open for the full hold.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('liquid staking') >= 0 || c.indexOf('restak') >= 0) return "Restake the week's rewards through " + name + ' on ' + chain + ' so the receipt balance grows.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0 || c.indexOf('borrow') >= 0) return 'Borrow $10 against the supply on ' + name + ' and repay it the same week, every week.';
    if (c.indexOf('dex') >= 0) return 'Swap $10 through ' + name + "'s main pool on " + chain + ' once a week.';
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0) return "Claim the vault's yield on " + name + ' once a week and redeposit it.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0 || c.indexOf('basis') >= 0) return 'Open and close one small trade on ' + name + ' each week, never more than $10 of margin.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $10 through ' + name + ' to ' + chain + ' once a week and use it in the app.';
    if (c.indexOf('prediction') >= 0) return 'Place one small position on a new ' + name + ' market each week.';
    if (c.indexOf('stable') >= 0) return "Move $10 in and out of " + name + "'s stable asset on " + chain + ' once a week.';
    if (c.indexOf('rwa') >= 0) return 'Top up the ' + name + ' position by $10 once a week while the hold runs.';
    if (c.indexOf('privacy') >= 0) return 'Make one shielded deposit of $10 on ' + name + ' each week.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Top up the ' + name + ' vault by $10 once a week while the hold runs.';
    if (c.indexOf('index') >= 0) return 'Top up the ' + name + ' index position by $10 once a week.';
    if (c.indexOf('insurance') >= 0) return 'Review the ' + name + ' policy once a week and keep the cover active.';
    if (c.indexOf('liquidity manager') >= 0) return "Check the " + name + " position's range once a week and leave it alone unless it is out of range.";
    return 'Make one qualifying action each week on ' + name + ', such as a deposit, a swap or a vote, and keep the receipts.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the $' + capital + ' you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: weeklyFor(p, capital, chain), cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open " + p.name + "'s own points or rewards page from the protocol's own site and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction hash in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  // Board-wide figures, all computed live from data.js: no number on the page is typed in by hand.
  var TOTAL_IMPLIED = DATA.rows.reduce(function (a, r) { return a + r.implied_value_usd; }, 0);
  var BOARD_TVL = DATA.rows.reduce(function (a, r) { return a + r.tvl_usd; }, 0);
  var SECTORS_PRICED = (DATA.benchmarks || []).filter(function (b) { return b.live_count >= 3; }).length;
  var CATEGORY_COUNT = (DATA.benchmarks || []).length;
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
        el('div', { class: 'kicker', text: 'TOKEN LAUNCH RADAR \u00b7 MODEL: RADAR-2 \u00b7 ' + DATA.live_size + ' LIVE COMPS' })
      ),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of + ' \u00b7 DefiLlama protocols \u00b7 ' + DATA.board_size + ' protocols ranked' }),
        el('span', { class: 'badge', text: 'page = board.json: ' + matched + '/' + DATA.board_size + ' ranks and values match' })
      )
    );
  }

  // The hero scatter: TVL against implied value on log-log axes, drawn by hand as one inline SVG.
  // Lime dots are this radar's estimates for the 200 board rows; grey dots are the live comps'
  // market caps; the line is the global sector benchmark. No library, no network.
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
    var b0x = px(Math.pow(10, xMin)), b0y = py(DATA.global_benchmark * Math.pow(10, xMin));
    var b1x = px(Math.pow(10, xMax)), b1y = py(DATA.global_benchmark * Math.pow(10, xMax));
    parts.push('<line class="bench-line" x1="' + b0x.toFixed(1) + '" y1="' + b0y.toFixed(1) + '" x2="' + b1x.toFixed(1) + '" y2="' + b1y.toFixed(1) + '"/>');
    pts.forEach(function (p) {
      parts.push('<circle class="' + (p.live ? 'dot-live' : 'dot') + '" cx="' + px(p.x).toFixed(1) + '" cy="' + py(p.y).toFixed(1) + '" r="' + (p.live ? 2.2 : 2.8) + '"/>');
    });
    parts.push('</svg>');
    return el('figure', { class: 'panel scatter-card' },
      el('figcaption', { text: 'HOW A LAUNCH IS PRICED' }),
      el('div', { html: parts.join('') }),
      el('p', { class: 'fig-note', text: 'Lime dots are this radar\u2019s estimates for the ' + DATA.board_size + '. Grey dots are the ' + DATA.live_size + ' live comps\u2019 market caps. Line: the global benchmark, ' + DATA.global_benchmark + 'x TVL.' })
    );
  }

  function hero() {
    return el('section', { class: 'hero' },
      el('div', { class: 'hero-copy' },
        el('h1', null,
          el('span', { text: DATA.board_size + ' protocols record no token.' }),
          el('br'),
          el('em', { text: 'The market\u2019s own sector multiples price them at ' + fmtUsd(TOTAL_IMPLIED) + '.' })
        ),
        el('p', { text: 'Every protocol the feed tracks that records no token and is nobody else\u2019s product, priced from the ones that do: a dollar of TVL is worth a different multiple in each sector, so the model takes each sector\u2019s own median FDV/TVL from the snapshot\u2019s trading protocols, then ranks what is still to come.' }),
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
      cell('SECTORS PRICED', String(SECTORS_PRICED), 'of ' + CATEGORY_COUNT + ' categories \u00b7 global ' + DATA.global_benchmark + 'x')
    );
  }

  function topCards() {
    var cards = DATA.rows.slice(0, 5).map(function (r) {
      var e = r.economics;
      return el('article', { class: 'top-card', tabindex: '0', role: 'button', 'aria-label': 'Detail for ' + r.name,
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openDetail(r.slug); } } },
        el('div', { class: 'top-card-rank', text: 'NO. ' + r.rank }),
        el('div', { class: 'top-card-cat', text: (r.category || 'OTHER').toUpperCase() }),
        el('div', { class: 'top-card-name', text: r.name }),
        el('div', { class: 'top-card-sub', text: (r.category || 'Other') + ' \u00b7 ' + (r.chains || []).slice(0, 2).join(', ') + ((r.chains || []).length > 2 ? ' +' + ((r.chains || []).length - 2) : '') }),
        el('div', { class: 'top-card-value', text: fmtUsd(r.implied_value_usd) }),
        el('div', { class: 'top-card-mult', text: fmtMult(r.implied_value_usd / r.tvl_usd) + ' \u00b7 ' + fmtUsd(r.tvl_usd) + ' TVL' }),
        el('div', { class: 'top-card-ticket', text: '$' + (e ? e.capital_usd : capitalFor(r)) + ' ticket \u00b7 ' + (e ? e.hold_days : holdDaysFor(r.age_days)) + '-day hold \u00b7 6 steps' }),
        e ? el('div', { class: 'top-card-verdict' }, verdictTag(e.verdict), el('span', { class: e.net_usd >= 0 ? 'pos' : 'neg', text: ' ' + fmtSigned(e.net_per_hour_usd) + ' net of all costs' })) : null
      );
    });
    return el('section', { class: 'top-cards', 'aria-label': 'Top five protocols' }, cards);
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
    function makeSelect(id, label, options, current, onchange) {
      var s = el('select', { id: id, 'aria-label': label },
        options.map(function (o) { return el('option', { value: o[0], text: o[1], selected: o[0] === current ? 'selected' : null }); })
      );
      s.addEventListener('change', function () { onchange(s.value); writeHash(); render(); });
      return el('div', { class: 'field' }, el('label', { for: id, text: label }), s);
    }
    var catSel = makeSelect('category', 'Category', [['all', 'Every category']].concat(categories.map(function (c) { return [c, c]; })), state.category, function (v) { state.category = v; });
    var chainSel = makeSelect('chain', 'Chain', [['all', 'Every chain']].concat(chains.map(function (c) { return [c, c]; })), state.chain, function (v) { state.chain = v; });
    var verdictSel = makeSelect('verdict', 'Verdict', [['all', 'Any verdict'], ['FARM', 'FARM'], ['THIN', 'THIN'], ['SKIP', 'SKIP']], state.verdict, function (v) { state.verdict = v; });
    var moveSel = makeSelect('move', 'Move', [['all', 'Any move'], ['up', 'Up, 7 days'], ['down', 'Down, 7 days']], state.move, function (v) { state.move = v; });
    function pill(id, label) {
      return el('button', { type: 'button', class: 'pill' + (state.pill === id ? ' active' : ''), 'aria-pressed': state.pill === id ? 'true' : 'false', text: label,
        onclick: function () { state.pill = id; writeHash(); render(); } });
    }
    var list = rows();
    return el('div', null,
      el('div', { class: 'controls' },
        el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
        catSel, chainSel, verdictSel, moveSel
      ),
      el('div', { class: 'pills' }, pill('all', 'All'), pill('watchlist', 'Watchlist'), pill('early', 'Early'),
        el('span', { class: 'count', text: list.length + ' of ' + DATA.board_size + ' shown \u00b7 click a column to sort, a row for its detail' })
      )
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
      el('p', { class: 'hist-note', text: 'Log scale, half a decade a bar; the middle of the board is ' + fmtUsd(MEDIAN_IMPLIED) + '. The long tail is the small early rows. Each row\u2019s table bar shows its own sensitivity range — TVL \u00b120% and growth \u00b10.25 — on a log scale from the smallest low to the largest high. Slice: what $1,000 deposited would get if 10% of the launch goes to depositors pro rata. Net: that slice minus the plan\u2019s gas and the forgone 4% T-bill yield, per plan and per hands-on hour.' })
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

  // The sensitivity range bar: the row's own low-high range on one log scale shared by the
  // whole board, with a dot at the implied value. The scale runs from the smallest low to the
  // largest high across all 200 rows, so bars are comparable down the table.
  var RANGE = (function () {
    var lows = DATA.rows.map(function (r) { return Math.min(r.sensitivity.tvlShockUp, r.sensitivity.tvlShockDown, r.sensitivity.growthShockUp, r.sensitivity.growthShockDown); });
    var highs = DATA.rows.map(function (r) { return Math.max(r.sensitivity.tvlShockUp, r.sensitivity.tvlShockDown, r.sensitivity.growthShockUp, r.sensitivity.growthShockDown); });
    return { lo: Math.log10(Math.min.apply(null, lows)), hi: Math.log10(Math.max.apply(null, highs)) };
  })();
  function rangeBar(r) {
    var s = r.sensitivity;
    var low = Math.min(s.tvlShockUp, s.tvlShockDown, s.growthShockUp, s.growthShockDown);
    var high = Math.max(s.tvlShockUp, s.tvlShockDown, s.growthShockUp, s.growthShockDown);
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
    return el('div', { class: 'panel' },
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
      )
    );
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
        'these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking, and their FDV/TVL ratios price the sector benchmarks below.'),
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
    var benchRows = (DATA.benchmarks || []).filter(function (b) { return b.live_count >= 3; }).sort(function (a, b) { return b.live_count - a.live_count; }).slice(0, 10);
    var benchBody = el('tbody');
    benchRows.forEach(function (b) {
      benchBody.appendChild(el('tr', null,
        el('td', { text: b.category }),
        el('td', { class: 'num', text: String(b.live_count) }),
        el('td', { class: 'num', text: b.median_ratio === null ? 'n/a' : b.median_ratio.toFixed(3) + 'x' }),
        el('td', { class: 'num', text: b.benchmark.toFixed(3) + 'x' })
      ));
    });
    return el('div', { class: 'model-grid' },
      el('section', { class: 'panel model-col' },
        el('h2', { text: 'How radar-2 prices a launch' }),
        el('p', { text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked. The sector multiple is priced from this snapshot: the median FDV/TVL of the live-token protocols in the same sector, shrunk toward the global median with a prior weight of ' + m.prior_weight + '. A sector with fewer than three live tokens carries no signal of its own and takes the global benchmark, so one live token never prices a whole sector.' }),
        el('div', { class: 'formula' },
          'implied = round( tvl_usd \u00d7 sector \u00d7 (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 \u00d7 ' + m.growth_weight + ') \u00d7 (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' \u00d7 ' + m.maturity_range + ') \u00d7 (1 + ' + m.chain_step + ' \u00d7 min(chains - 1, ' + m.chain_cap + ')) )'
        ),
        el('p', { text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. Maturity is in the price, not beside it: the multiplier rises from ' + m.maturity_floor + ' at listing to 1.0 over three years, so a protocol that has run longer with no token earns a fuller multiple. Sector multiples are clamped to [' + m.benchmark_floor + ', ' + m.benchmark_cap + ']; a sector with fewer than three live tokens takes the global benchmark of ' + DATA.global_benchmark + 'x.' }),
        el('h3', { text: 'Sector benchmarks (live tokens, this snapshot)' }),
        el('div', { class: 'table-wrap' },
          el('table', { class: 'bench' },
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Sector' }), el('th', { scope: 'col', text: 'Live tokens' }), el('th', { scope: 'col', text: 'Median FDV/TVL' }), el('th', { scope: 'col', text: 'Benchmark used' }))),
            benchBody
          )
        ),
        el('p', { class: 'sub', text: 'The early radar is every pre-token protocol below the watchlist floor, by TVL, and the live-token protocols are set aside with their market caps shown. A protocol below the floor is no worse a subject than one on it: the floor is where the reading started, not where it stops.' })
      ),
      el('section', { class: 'panel model-col' },
        el('h2', { text: 'What this model does not do' }),
        el('p', { text: 'The model is fitted on this snapshot\u2019s own live tokens, and the Method and backtest tab tests it against them — blind, leave-one-out, and on a time split by listing date. But read the Limits there first: the ground truth is today\u2019s market cap, not the price at launch, and the split is by listing date, not a replay of history. The implied values are the snapshot\u2019s own sector multiples applied to its own TVLs; the backtest says how far those multiples miss when they are asked to predict a token that already trades — and on this snapshot, they miss by about as much as one global number does.' }),
        el('h3', { text: 'How the verdict is earned' }),
        el('p', { text: 'FARM: the slice beats gas and the forgone 4% T-bill yield — the net is positive after every cost. THIN: the slice beats the gas but not the forgone yield — worth it only if the fees fall or the slice grows. SKIP: the slice does not even beat the gas.' }),
        el('p', { class: 'sub', text: 'On this board: ' + VERDICTS.FARM + ' FARM \u00b7 ' + VERDICTS.THIN + ' THIN \u00b7 ' + VERDICTS.SKIP + ' SKIP. The counts follow the gas above, not a quota: the top rows by implied value are often SKIP, because a $1,000 deposit is a thin slice of a very large TVL.' }),
        el('h3', { text: 'Farm economics, stated plainly' }),
        el('ul', { class: 'assumptions' },
          el('li', { text: 'Slice: 10% of the launch goes to depositors, pro rata on TVL — slice = 0.10 \u00d7 implied \u00d7 $1,000 / TVL, at a $1,000 deposit.' }),
          el('li', { text: 'Gas: the plan\u2019s whole gas over the hold — $3 for the first transaction, $8 to set the position up ($4 when the capital is under $150), $2 a week for the weekly action — ' + fmtMoney(GAS_MIN) + ' to ' + fmtMoney(GAS_MAX) + ' across the board, by capital and hold. Each row\u2019s own total is in its detail view.' }),
          el('li', { text: 'Forgone: the 4% T-bill yield on the $1,000 over the 30 days the plan holds it — $3.29.' }),
          el('li', { text: 'Hands-on: the plan\u2019s own step times added up — 5 minutes to set up the wallet, 15 to place the position, 10 minutes a week for the weekly action over the hold, 10 to check the rewards page, 5 to log it.' }),
          el('li', { text: 'Sensitivity: the implied value under a TVL shock of \u00b120% and a growth-multiplier shock of \u00b10.25, sector, maturity and chain held. A wide range means the launch value is fragile.' })
        )
      )
    );
  }

  // The backtest tab: how the model is tested, the two result tables, the
  // out-of-sample scatter, and the limits. Every number is read from
  // data.js (computed at run time from the snapshot), never typed in here —
  // including the verdict, which is computed, not asserted: on this snapshot
  // radar-2 does not beat the flat benchmark on the median miss, and the tab
  // says so.
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
            el('tbody', null, metricRow('Radar-2', a, b), metricRow('Flat benchmark', b, a))
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
        el('p', { text: 'Radar-2 is fitted on this snapshot\u2019s live tokens: the sector benchmarks are the medians of the live tokens\u2019 market-cap-to-TVL ratios. The backtest asks whether those benchmarks predict a token\u2019s market cap at all — the same function that scores the board, pointed at tokens that already trade.' }),
        el('p', { text: 'Leave-one-out (blind): all ' + V.live_n + ' live tokens, each predicted with the sector benchmarks recomputed without it — no token prices itself. The flat benchmark is the same test with one number instead of a model: the global median market-cap-to-TVL ratio times the token\u2019s TVL.' }),
        el('p', { text: 'Time-split: the benchmarks are fitted on the ' + V.timesplit.fit_n + ' live tokens listed before ' + V.split_date + ' and tested on the ' + V.timesplit.test_n + ' listed in 2024 or later. The ' + V.timesplit.excluded_n + ' live tokens with no listing date cannot be placed on either side and are excluded from the split.' }),
        el('p', { text: 'Ground truth is the market cap today, from the snapshot — not the price at launch, which no snapshot carries. The split is by listing date, not a replay of history. A miss is max(predicted / actual, actual / predicted): a miss of 3 means three times too high or three times too low. The band is the factor that covers a share of the misses: the 50% band is the median miss, the 80% band the 80th percentile.' }),
        el('p', null, el('b', { text: 'On the median miss, radar-2 ' + looVerdict + ' the flat benchmark leave-one-out (' + miss(V.loo.model.median_miss) + ' vs ' + miss(V.loo.flat.median_miss) + ') and ' + tsVerdict + ' it on the time split (' + miss(V.timesplit.model.median_miss) + ' vs ' + miss(V.timesplit.flat.median_miss) + '). ' }),
          'The sector multiples and the growth, maturity and chain factors do not add predictive power over one global number on this snapshot — the table shows it, so the board is read as a ranking of the sector multiples, not as a prediction that has earned its error bars.')
      ),
      resultTable('Leave-one-out (blind)', 'All ' + V.loo.n + ' live tokens. Each predicted with the benchmarks recomputed without it.', V.loo.model, V.loo.flat),
      resultTable('Time-split', 'Benchmarks fitted on the ' + V.timesplit.fit_n + ' tokens listed before ' + V.split_date + '; tested on the ' + V.timesplit.test_n + ' listed in 2024 or later.', V.timesplit.model, V.timesplit.flat),
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
          el('li', { text: 'Small samples: ' + V.live_n + ' tokens leave-one-out, ' + V.timesplit.fit_n + ' fitted and ' + V.timesplit.test_n + ' tested in the split. One large token moving changes the medians.' }),
          el('li', { text: V.timesplit.excluded_n + ' live tokens carry no listing date and are excluded from the time split.' }),
          el('li', { text: 'The sector benchmarks for the test tokens come from the fit set only — a test token\u2019s own category may have fewer than three fit tokens and fall back to the global benchmark.' }),
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
    var steps = farmSteps(row);
    var e = row.economics;
    var base = Math.round(row.tvl_usd * row.sector_multiple);
    var recomputed = impliedOf(row, DATA.model);
    var bench = (DATA.benchmarks || []).filter(function (b) { return b.category === (row.category || 'Other'); })[0];
    var s = row.sensitivity;
    var low = Math.min(s.tvlShockUp, s.tvlShockDown, s.growthShockUp, s.growthShockDown);
    var high = Math.max(s.tvlShockUp, s.tvlShockDown, s.growthShockUp, s.growthShockDown);
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
      el('div', null, el('div', { class: 'big-label', text: 'SENSITIVITY RANGE' }), el('div', { class: 'big-value', text: fmtUsd(low) + ' \u2013 ' + fmtUsd(high) })),
      el('div', null, el('div', { class: 'big-label', text: 'AIRDROP SLICE / $1K' }), el('div', { class: 'big-value', text: e ? fmtMoney(e.slice_usd) : 'n/a' })),
      el('div', null, el('div', { class: 'big-label', text: 'VERDICT' }), e ? verdictTag(e.verdict) : el('span', { text: 'n/a' }))
    );

    // The TVL slider recomputes the implied value live from the row's own factors: the sector,
    // growth, maturity and chain multipliers are held, only the TVL moves. The slice per $1K
    // does not move with TVL alone — the launch value and the TVL scale together — so the
    // economics strip below stays put and the note says so.
    var sliderOut = el('div', { class: 'slider-out', text: 'TVL +0% \u2192 implied ' + fmtUsd(row.implied_value_usd) });
    var slider = el('input', { type: 'range', min: '-20', max: '20', step: '1', value: '0', 'aria-label': 'Move the TVL by up to 20 percent' });
    slider.addEventListener('input', function () {
      var d = Number(slider.value);
      var moved = impliedOf({ tvl_usd: row.tvl_usd * (1 + d / 100), sector_multiple: row.sector_multiple, change_7d: row.change_7d, age_days: row.age_days, chains: row.chains }, DATA.model);
      var out = document.getElementById('modal-implied');
      if (out) out.textContent = fmtUsd(moved);
      sliderOut.textContent = 'TVL ' + (d >= 0 ? '+' : '') + d + '% \u2192 implied ' + fmtUsd(moved);
    });
    var sliderSection = el('section', { class: 'detail-section' },
      el('h3', { text: 'What if the TVL moves?' }),
      el('div', { class: 'slider-row' }, slider, sliderOut),
      el('p', { class: 'sub', text: 'The sector, growth, maturity and chain multipliers are held; only the TVL moves \u00b120%. The slice per $1K does not move with TVL alone — the launch value and the TVL scale together.' })
    );

    var built = el('section', { class: 'detail-section' },
      el('h3', { text: 'How the value is built' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL on record' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Sector multiple (' + (row.category || 'Other') + ')' + (bench && bench.live_count < 3 ? ' — takes the global benchmark: fewer than three live tokens' : '') }), el('b', { class: 'num', text: String(row.sector_multiple) + 'x' })),
        el('div', null, el('span', { text: 'Base value (TVL \u00d7 sector)' }), el('b', { class: 'num', text: fmtUsd(base) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chain multiplier (' + (row.chains || []).length + ' chains)' }), el('b', { class: 'num', text: String(row.chain_multiplier) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value (recomputed in this page)' }), el('b', { class: 'num', text: fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ' \u2713 matches the board' : ' \u2014 differs from the board') }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. This is an estimate, not a price, and the protocol records no token: that is the snapshot\u2019s record, not proof it has none.' })
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

    var plan = el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan \u00b7 ' + (row.category || 'Other') }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    );

    dialog.appendChild(head);
    dialog.appendChild(bigNums);
    dialog.appendChild(sliderSection);
    dialog.appendChild(built);
    dialog.appendChild(econ);
    dialog.appendChild(ticket);
    dialog.appendChild(plan);
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
      shell.appendChild(topCards());
      shell.appendChild(tabBar());
      shell.appendChild(controls());
      shell.appendChild(histogram());
      shell.appendChild(boardTable());
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
