'use strict';

// ---- config you can tweak ----
const LEAGUE_NAME = 'Dominion Golf League 2026';   // shown in the header
const HIGHLIGHT_PLAYER = 'Travis Valdez';          // your rows get highlighted

const PLAYER_COLORS = ['#1a7a4c', '#0b6b8a', '#d4a017', '#c0392b', '#7b4bc9',
  '#e2703a', '#2e8b57', '#3a6ea5', '#b5651d', '#9d3d63'];

let DATA = null;
let colorOf = {};

const $ = (sel, root = document) => root.querySelector(sel);

// ---------- scoring helpers ----------
function scoreClass(strokes, par) {
  if (strokes == null) return '';
  const d = strokes - par;
  if (d <= -2) return 's-eagle';
  if (d === -1) return 's-birdie';
  if (d === 0) return 's-par';
  if (d === 1) return 's-bogey';
  if (d === 2) return 's-double';
  return 's-triple';
}
const parOf = (h) => DATA.course[String(h)].par;
const siOf = (h) => DATA.course[String(h)].si;
const fmt = (x, d = 1) => (x == null ? '–' : Number(x).toFixed(d));
const signed = (x) => (x == null ? '–' : (x > 0 ? '+' + fmt(x) : fmt(x)));

// ---------- tabs ----------
const TABS = [
  ['week', 'This Week'],
  ['standings', 'Standings'],
  ['handicaps', 'Handicaps'],
  ['ringer', 'Ringer'],
  ['dinger', 'Dinger'],
  ['fun', 'Fun Stats'],
  ['streaks', 'Streaks'],
  ['trophies', 'Trophies'],
  ['players', 'Players'],
];

function renderTabs(active) {
  $('#tabs').innerHTML = TABS.map(([id, label]) =>
    `<button class="tab ${id === active ? 'active' : ''}" data-tab="${id}">${label}</button>`
  ).join('');
  $('#tabs').querySelectorAll('.tab').forEach(b =>
    b.addEventListener('click', () => show(b.dataset.tab)));
}

function show(tab) {
  renderTabs(tab);
  const main = $('#main');
  main.scrollIntoView({ block: 'start' });
  window.scrollTo({ top: 0 });
  ({ week: viewWeek, standings: viewStandings, handicaps: viewHandicaps,
     ringer: () => viewBoard('ringer'), dinger: () => viewBoard('dinger'),
     fun: viewFun, streaks: viewStreaks, trophies: viewTrophies,
     players: viewPlayers }[tab])(main);
  location.hash = tab;
}

// ---------- This Week ----------
let weekIdx = null;   // index into DATA.weeks; null -> latest
function viewWeek(main) {
  const weeks = DATA.weeks;
  if (weekIdx === null || weekIdx < 0 || weekIdx >= weeks.length) weekIdx = weeks.length - 1;
  const wk = weeks[weekIdx];
  const holes = wk.holes;
  const rows = wk.results;
  const isLatest = weekIdx === weeks.length - 1;
  const nineName = wk.nine === 'F' ? 'Front 9' : 'Back 9';

  const nav = `
    <div class="week-nav">
      <button class="wk-btn" id="wk-prev" ${weekIdx === 0 ? 'disabled' : ''} aria-label="Previous week">‹</button>
      <select class="wk-select" id="wk-select">
        ${weeks.map((w, i) => `<option value="${i}" ${i === weekIdx ? 'selected' : ''}>Week ${w.week} · ${w.nine === 'F' ? 'Front' : 'Back'}${w.date ? ' · ' + fmtDate(w.date) : ''}</option>`).join('')}
      </select>
      <button class="wk-btn" id="wk-next" ${isLatest ? 'disabled' : ''} aria-label="Next week">›</button>
      ${isLatest ? '<span class="pill">Current</span>' : `<button class="wk-latest" id="wk-latest">Jump to current ⟶</button>`}
    </div>
    ${wk.note ? `<p class="wk-note">📅 ${wk.note}</p>` : ''}`;

  const tiles = `
    <div class="tiles">
      <div class="tile"><div class="label">Winner (net)</div><div class="value">🏆 ${first(rows) ? shortName(first(rows).player) : '–'}</div><div class="who">net ${first(rows) ? signed(first(rows).net) : '–'}</div></div>
      <div class="tile"><div class="label">Low gross</div><div class="value">${Math.min(...rows.map(r => r.gross))}</div><div class="who">${shortName(rows.reduce((a, b) => a.gross <= b.gross ? a : b).player)}</div></div>
      <div class="tile"><div class="label">${wk.date ? 'Played' : 'Turnout'}</div><div class="value">${wk.date ? fmtDate(wk.date) : rows.length}</div><div class="who">${wk.date ? nineName + ' · ' + rows.length + ' played' : nineName + ' · par ' + wk.par}</div></div>
    </div>`;

  const head = `<tr><th class="name">Player</th>` +
    holes.map(h => `<th>${h}<div class="note" style="font-weight:400">p${parOf(h)}</div></th>`).join('') +
    `<th class="total-col">Gross</th><th>Hdc</th><th class="total-col">Net</th></tr>`;

  const parRow = `<tr class="par-row"><td class="name">Par</td>` +
    holes.map(h => `<td>${parOf(h)}</td>`).join('') +
    `<td>${wk.par}</td><td></td><td></td></tr>`;

  const body = rows.map((r, i) => {
    const cells = holes.map(h => {
      const s = r.holes[String(h)];
      return `<td class="${scoreClass(s, parOf(h))}">${s ?? ''}</td>`;
    }).join('');
    const noteTag = r.notes ? ` <span class="rnote" title="${r.notes}">↩︎</span>` : '';
    return `<tr class="${isMe(r.player) ? 'me' : ''}">
      <td class="name">${i === 0 ? '🏆 ' : ''}${r.player}${noteTag}</td>${cells}
      <td class="total-col">${r.gross}</td><td>${fmt(r.handicap)}</td>
      <td class="total-col">${signed(r.net)}</td></tr>`;
  }).join('');

  main.innerHTML = `
    <h2 class="view-title">${isLatest ? 'This Week' : 'Week ' + wk.week}</h2>
    <p class="view-intro">${isLatest ? 'Latest scorecard' : 'Scorecard'}${wk.date ? ' · ' + fmtDate(wk.date, true) : ''}, ranked by net — use ‹ › to browse the season. Colors: <span class="s-birdie">birdie+</span>, <span class="s-bogey">bogey</span>, <span class="s-double">double</span>, <span class="s-triple">worse</span>.</p>
    ${nav}
    ${tiles}
    ${awardsCard(DATA.awards.find(a => a.week === wk.week))}
    <div class="card"><div class="table-scroll"><table>
      <thead>${head}</thead><tbody>${parRow}${body}</tbody>
    </table></div></div>
    ${isLatest ? recordsCard(DATA.records) : ''}`;

  const go = (i) => { weekIdx = Math.max(0, Math.min(weeks.length - 1, i)); viewWeek(main); };
  const prev = main.querySelector('#wk-prev');
  const next = main.querySelector('#wk-next');
  const latest = main.querySelector('#wk-latest');
  const select = main.querySelector('#wk-select');
  if (prev) prev.onclick = () => go(weekIdx - 1);
  if (next) next.onclick = () => go(weekIdx + 1);
  if (latest) latest.onclick = () => go(weeks.length - 1);
  if (select) select.onchange = (e) => go(parseInt(e.target.value, 10));
}

function awardsCard(a) {
  if (!a) return '';
  const items = [];
  if (a.round) items.push(['🔥', 'Round of the Week', shortName(a.round.player), `${a.round.gross} · net ${signed(a.round.net)}`]);
  if (a.blowup) items.push(['💥', 'Blow-up of the Week', shortName(a.blowup.player), `${a.blowup.strokes} on hole ${a.blowup.hole} (${signed(a.blowup.over)})`]);
  if (a.improved) items.push(['📉', 'Most Improved', shortName(a.improved.player), `handicap ${signed(a.improved.delta)}`]);
  if (!items.length) return '';
  return `<div class="card"><h3 class="section-title">🏅 Week ${a.week} awards</h3>
    <div class="awards">${items.map(([e, t, who, sub]) =>
      `<div class="award"><div class="award-emoji">${e}</div><div><div class="award-title">${t}</div>
        <div class="award-who">${who}</div><div class="award-sub">${sub}</div></div></div>`).join('')}</div></div>`;
}

function recordsCard(rec) {
  if (!rec) return '';
  const items = [];
  if (rec.low_gross) items.push(['Low round (gross)', `${rec.low_gross.gross} (${signed(rec.low_gross.to_par)})`, `${shortName(rec.low_gross.player)} · wk ${rec.low_gross.week}`]);
  if (rec.low_net) items.push(['Low round (net)', signed(rec.low_net.net), `${shortName(rec.low_net.player)} · wk ${rec.low_net.week}`]);
  if (rec.most_birdies) items.push(['Most birdies+', rec.most_birdies.count, shortName(rec.most_birdies.player)]);
  if (rec.most_consistent) items.push(['Steadiest', '±' + fmt(rec.most_consistent.std), shortName(rec.most_consistent.player)]);
  if (rec.longest_streak) items.push(['Longest par+ streak', rec.longest_streak.holes + ' holes', shortName(rec.longest_streak.player)]);
  if (rec.skins_leader) items.push(['Skins leader', rec.skins_leader.skins, shortName(rec.skins_leader.player)]);
  if (rec.sandbagger) items.push(['🎣 Sandbagger', 'net ' + signed(rec.sandbagger.avg_net) + '/wk', shortName(rec.sandbagger.player)]);
  return `<div class="card"><h3 class="section-title">Season records</h3>
    <div class="tiles" style="margin:0">${items.map(([l, v, w]) =>
      `<div class="tile"><div class="label">${l}</div><div class="value">${v}</div><div class="who">${w}</div></div>`).join('')}</div></div>`;
}

// ---------- Standings ----------
function viewStandings(main) {
  const s = DATA.standings;
  const ranked = s.filter(p => p.qualified);
  const provisional = s.filter(p => !p.qualified);

  const head = `<tr><th class="rank">#</th><th class="name">Player</th>
    <th>Best 5 net</th><th>Rounds</th><th>Wins</th><th>Skins</th><th>Hdc</th></tr>`;
  const rowFor = (p, rank) => `<tr class="${isMe(p.player) ? 'me' : ''}">
    <td class="rank">${rank}</td>
    <td class="name">${p.player}${p.qualified ? '' : ' <span class="pill prov">' + p.rounds + '/5</span>'}</td>
    <td class="total-col">${p.best5_net == null ? '–' : signed(p.best5_net)}</td>
    <td>${p.rounds}</td><td>${p.weekly_wins}</td><td>${p.skins}</td><td>${fmt(p.handicap)}</td></tr>`;
  const body = ranked.map((p, i) => rowFor(p, i + 1)).join('')
    + (provisional.length
        ? `<tr class="subhead"><td colspan="7">Not yet qualified — need 5 rounds</td></tr>`
          + provisional.map(p => rowFor(p, '·')).join('')
        : '');

  // clean single-colour bar ranking (readable for a big field)
  const bars = rankBars(ranked);

  main.innerHTML = `
    <h2 class="view-title">Standings</h2>
    <p class="view-intro">Ranked by the average of each player's <strong>best 5 net rounds</strong> — lower is better, and dropping your worst weeks keeps a blow-up from sinking your season. Takes 5 rounds to qualify.</p>
    <div class="card"><h3 class="section-title">🥇 Best 5 net average</h3>
      <p class="sub">Shorter bar = fewer strokes = better. Lengths are relative to the field.</p>${bars}</div>
    <div class="card"><div class="table-scroll"><table><thead>${head}</thead><tbody>${body}</tbody></table></div></div>`;
}

function rankBars(ranked) {
  const vals = ranked.map(p => p.best5_net).filter(v => v != null);
  if (!vals.length) return '<p class="note">No qualified players yet.</p>';
  const best = Math.min(...vals), worst = Math.max(...vals);
  const span = (worst - best) || 1;
  return ranked.map((p, i) => {
    const frac = p.best5_net == null ? 0 : (worst - p.best5_net) / span;   // best -> longest
    const w = 12 + frac * 88;                                              // 12%..100%
    return `<div class="bar-row">
      <div>${i === 0 ? '🥇 ' : ''}${shortName(p.player)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${w.toFixed(0)}%"></div></div>
      <div class="bar-label">${signed(p.best5_net)}</div></div>`;
  }).join('');
}

// ---------- Handicaps ----------
function viewHandicaps(main) {
  const players = DATA.meta.players;
  const series = players.map((p, i) => ({
    name: p, color: colorOf[p],
    points: DATA.handicaps[p].trend.map(t => ({ x: t.week, y: t.handicap })),
  }));
  const tiles = players.map(p => {
    const h = DATA.handicaps[p];
    const d = h.delta;
    const cls = d == null ? '' : (d < 0 ? 'delta-down' : d > 0 ? 'delta-up' : '');
    const arrow = d == null ? '' : (d < 0 ? '▼' : d > 0 ? '▲' : '');
    return `<div class="tile"><div class="label">${p}</div>
      <div class="value">${fmt(h.current)}</div>
      <div class="who">start ${fmt(h.starting)} · <span class="${cls}">${arrow} ${signed(d)}</span></div></div>`;
  }).join('');

  const improved = [...players].filter(p => DATA.handicaps[p].delta != null)
    .sort((a, b) => DATA.handicaps[a].delta - DATA.handicaps[b].delta)[0];

  main.innerHTML = `
    <h2 class="view-title">Handicaps</h2>
    <p class="view-intro">Average of your best 5 nine-hole scores (to par) over the last 8 weeks. Updates every week. Lower is better.</p>
    <div class="tiles">${tiles}</div>
    ${improved ? `<div class="card"><h3 class="section-title">📉 Most improved</h3>
      <p><strong>${improved}</strong> is down ${signed(DATA.handicaps[improved].delta)} strokes since their first tracked week.</p></div>` : ''}
    <div class="card" id="hc-card"><h3 class="section-title">Handicap trend</h3>
      <p class="sub">Hover or tap a name to isolate that player's line.</p>
      ${lineChart(series, { yLabel: 'Handicap', invertBetter: true, interactive: true })}
      ${chartLegend(series, true)}</div>`;

  // hover / tap a legend chip (or line) to spotlight one player
  const card = main.querySelector('#hc-card');
  const sers = [...card.querySelectorAll('.ser')];
  const legItems = [...card.querySelectorAll('.leg-item')];
  let locked = null;
  const apply = (k) => {
    sers.forEach(g => {
      const on = k == null || +g.dataset.i === k;
      g.style.opacity = on ? 1 : 0.07;
      const path = g.querySelector('path');
      if (path) path.style.strokeWidth = (k != null && on) ? '3.5' : '';
    });
    legItems.forEach(l => { l.style.opacity = (k == null || +l.dataset.i === k) ? 1 : 0.3; });
  };
  const bind = (el, k) => {
    el.addEventListener('mouseenter', () => { if (locked == null) apply(k); });
    el.addEventListener('mouseleave', () => { if (locked == null) apply(null); });
    el.addEventListener('click', (e) => { e.stopPropagation(); locked = locked === k ? null : k; apply(locked); });
  };
  legItems.forEach(l => bind(l, +l.dataset.i));
  sers.forEach(g => bind(g, +g.dataset.i));
  card.addEventListener('click', () => { locked = null; apply(null); });
}

// ---------- Ringer / Dinger boards ----------
function viewBoard(kind) {
  const main = $('#main');
  const isRinger = kind === 'ringer';
  const board = DATA[kind];
  const leagueCard = DATA[isRinger ? 'league_ringer' : 'league_dinger'];
  const players = DATA.meta.players;
  const holes = Array.from({ length: 18 }, (_, i) => i + 1);

  const head = `<tr><th class="name">Player</th>` +
    holes.map(h => `<th>${h}<div class="note" style="font-weight:400">p${parOf(h)}</div></th>`).join('') +
    `<th class="total-col">Tot</th><th>+/-</th></tr>`;

  const body = players.map(p => {
    const b = board[p].holes;
    const cells = holes.map(h => {
      const v = b[String(h)];
      return `<td class="${scoreClass(v, parOf(h))}">${v ?? '·'}</td>`;
    }).join('');
    return `<tr class="${isMe(p) ? 'me' : ''}"><td class="name">${p}</td>${cells}
      <td class="total-col">${board[p].total}</td>
      <td>${signed(board[p].total - board[p].par)}</td></tr>`;
  }).join('');

  const leagueTotal = Object.values(leagueCard).reduce((a, b) => a + b, 0);
  const leaguePar = holes.reduce((a, h) => a + (leagueCard[String(h)] != null ? parOf(h) : 0), 0);
  const leagueRow = `<tr style="border-top:2px solid var(--line)"><td class="name">${isRinger ? '🌟 League best' : '💀 League worst'}</td>` +
    holes.map(h => `<td class="${scoreClass(leagueCard[String(h)], parOf(h))}">${leagueCard[String(h)] ?? '·'}</td>`).join('') +
    `<td class="total-col">${leagueTotal}</td><td>${signed(leagueTotal - leaguePar)}</td></tr>`;

  main.innerHTML = `
    <h2 class="view-title">${isRinger ? '🌟 Ringer Board' : '💀 Dinger Board'}</h2>
    <p class="view-intro">${isRinger
      ? 'Everyone\'s <strong>best</strong> score on each hole all season — your dream 18. The bottom row is the league\'s best-ball card.'
      : 'Everyone\'s <strong>worst</strong> score on each hole all season — the hall of shame. The bottom row is the ugliest the course has ever played.'}</p>
    <div class="card"><div class="table-scroll"><table><thead>${head}</thead>
      <tbody>${body}${leagueRow}</tbody></table></div></div>
    <p class="note">"·" = hole not yet played this season.</p>`;
}

// ---------- Fun Stats ----------
function viewFun(main) {
  const diff = DATA.hole_difficulty;
  const maxOver = Math.max(...diff.map(d => Math.abs(d.over_par)), 0.1);
  const diffBars = diff.map(d => `
    <div class="bar-row">
      <div>Hole ${d.hole} <span class="note">(p${d.par}, SI${d.si})</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(4, Math.abs(d.over_par) / maxOver * 100)}%;background:${d.over_par >= 1.2 ? 'var(--triple)' : d.over_par >= 0.6 ? 'var(--double)' : 'var(--fairway)'}"></div></div>
      <div class="bar-label">${signed(d.over_par)}</div>
    </div>`).join('');

  const distOrder = DATA.distribution_order;
  const distColors = { eagle: 'var(--eagle)', birdie: 'var(--birdie)', par: '#9fb0a6', bogey: 'var(--bogey)', double: 'var(--double)', triple_plus: 'var(--triple)' };
  const distLabels = { eagle: 'Eagle', birdie: 'Birdie', par: 'Par', bogey: 'Bogey', double: 'Double', triple_plus: 'Triple+' };
  const distRows = DATA.meta.players.map(p => {
    const c = DATA.distribution[p].counts, tot = DATA.distribution[p].holes || 1;
    const segs = distOrder.map(k => c[k] ? `<div class="dist-seg" style="width:${c[k] / tot * 100}%;background:${distColors[k]}" title="${distLabels[k]}: ${c[k]}"></div>` : '').join('');
    return `<div style="margin:12px 0"><div style="display:flex;justify-content:space-between;font-size:.88rem;margin-bottom:4px"><strong>${p}</strong><span class="note">${DATA.distribution[p].birdies_or_better} birdies+ · ${tot} holes</span></div><div class="dist-bar">${segs}</div></div>`;
  }).join('');
  const distLegend = `<div class="legend">${distOrder.map(k => `<span><span class="swatch" style="background:${distColors[k]}"></span>${distLabels[k]}</span>`).join('')}</div>`;

  const cons = DATA.consistency;
  const consBars = cons.length ? cons.map((c, i) => `
    <div class="bar-row"><div>${i === 0 ? '🎯 ' : ''}${shortName(c.player)}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, c.std / (cons[cons.length - 1].std || 1) * 100)}%"></div></div>
    <div class="bar-label">±${fmt(c.std)}</div></div>`).join('') : '<p class="note">Need a couple more weeks.</p>';

  const skinsSorted = DATA.meta.players.map(p => [p, DATA.skins[p]]).sort((a, b) => b[1] - a[1]);
  const maxSkins = Math.max(...skinsSorted.map(s => s[1]), 1);
  const skinsBars = skinsSorted.map(([p, n], i) => `
    <div class="bar-row"><div>${i === 0 ? '💰 ' : ''}${shortName(p)}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${n / maxSkins * 100}%;background:var(--gold)"></div></div>
    <div class="bar-label">${n}</div></div>`).join('');

  main.innerHTML = `
    <h2 class="view-title">Fun Stats</h2>
    <p class="view-intro">Everything below is computed straight from hole-by-hole scores.</p>
    <div class="grid-2">
      <div class="card"><h3 class="section-title">🔥 Hardest holes</h3>
        <p class="sub">League scoring average vs par. Toughest at the top.</p>${diffBars}</div>
      <div class="card"><h3 class="section-title">💰 Skins won</h3>
        <p class="sub">Outright-lowest net on a hole (allocated by stroke index).</p>${skinsBars}
        <h3 class="section-title" style="margin-top:18px">🎯 Most consistent</h3>
        <p class="sub">Smallest week-to-week swing in score. Lower = steadier.</p>${consBars}</div>
    </div>
    <div class="card"><h3 class="section-title">Scoring breakdown</h3>
      <p class="sub">Share of holes at each score, per player.</p>${distRows}${distLegend}</div>
    ${heatmapCard()}`;
}

// color for a cell: green under par → red over par
function heatColor(over) {
  if (over == null) return 'transparent';
  if (over <= 0) { const a = Math.min(1, -over / 1.5) * 0.6 + 0.06; return `rgba(26,122,76,${a.toFixed(2)})`; }
  const a = Math.min(1, over / 2.5) * 0.6 + 0.06; return `rgba(200,60,40,${a.toFixed(2)})`;
}

function heatmapCard() {
  const hm = DATA.heatmap;
  const holes = hm.holes;
  const head = `<tr><th class="name">Player</th>${holes.map(h => `<th>${h}<div class="note" style="font-weight:400">p${parOf(h)}</div></th>`).join('')}</tr>`;
  const rows = hm.players.map(p => {
    const v = hm.values[p];
    const cells = holes.map(h => {
      const o = v[String(h)];
      return `<td style="background:${heatColor(o)}" title="Hole ${h}: ${o == null ? '–' : signed(o) + ' vs par'}">${o == null ? '·' : (o > 0 ? '+' : '') + o}</td>`;
    }).join('');
    return `<tr><td class="name">${p}</td>${cells}</tr>`;
  }).join('');
  return `<div class="card"><h3 class="section-title">🗺️ Course heatmap</h3>
    <p class="sub">Average strokes vs par on every hole. <span style="color:var(--birdie)">Green</span> = you own it, <span style="color:var(--triple)">red</span> = it owns you.</p>
    <div class="table-scroll"><table><thead>${head}</thead><tbody>${rows}</tbody></table></div></div>`;
}

// ---------- Streaks ----------
function viewStreaks(main) {
  const players = DATA.meta.players;

  const streakHead = `<tr><th class="name">Player</th><th>Best par+ streak</th><th>Current</th>
    <th>Clean holes</th><th>Bounce-back</th></tr>`;
  const streakBody = players.map(p => {
    const s = DATA.streaks[p];
    return `<tr class="${isMe(p) ? 'me' : ''}"><td class="name">${p}</td>
      <td><strong>${s.par_or_better}</strong> holes</td><td>${s.current}</td>
      <td>${s.clean_holes}/${s.total_holes}</td>
      <td>${s.bounce_back_pct == null ? '–' : s.bounce_back_pct + '%'} <span class="note">(${s.bounce_back_n})</span></td></tr>`;
  }).join('');

  const splitHead = `<tr><th class="name">Player</th><th>Par 3s</th><th>Par 4s</th><th>Par 5s</th><th>Front 9</th><th>Back 9</th></tr>`;
  const splitCell = (v) => `<td style="background:${heatColor(v)}">${v == null ? '–' : signed(v)}</td>`;
  const splitBody = players.map(p => {
    const s = DATA.splits[p];
    return `<tr class="${isMe(p) ? 'me' : ''}"><td class="name">${p}</td>
      ${splitCell(s.par3)}${splitCell(s.par4)}${splitCell(s.par5)}${splitCell(s.front)}${splitCell(s.back)}</tr>`;
  }).join('');

  const favCards = players.map(p => {
    const f = DATA.favorites[p];
    if (!f) return '';
    return `<div class="tile"><div class="label">${p}</div>
      <div style="margin-top:6px">💚 <strong>Favorite:</strong> Hole ${f.favorite.hole} <span class="note">(${signed(f.favorite.over)}/hole)</span></div>
      <div>😤 <strong>Nemesis:</strong> Hole ${f.nemesis.hole} <span class="note">(${signed(f.nemesis.over)}/hole)</span></div></div>`;
  }).join('');

  main.innerHTML = `
    <h2 class="view-title">Streaks & Splits</h2>
    <p class="view-intro">Grit, patterns, and where each player wins or bleeds strokes.</p>
    <div class="card"><h3 class="section-title">🔥 Streaks & grit</h3>
      <p class="sub">Par-or-better = bogey-free run. Bounce-back = % of doubles+ answered with par-or-better next hole.</p>
      <div class="table-scroll"><table><thead>${streakHead}</thead><tbody>${streakBody}</tbody></table></div></div>
    <div class="card"><h3 class="section-title">⛳ Splits — strokes over par</h3>
      <p class="sub">By hole type and by nine. Green = strong, red = leaky.</p>
      <div class="table-scroll"><table><thead>${splitHead}</thead><tbody>${splitBody}</tbody></table></div></div>
    <div class="card"><h3 class="section-title">💚 Favorite & 😤 Nemesis holes</h3>
      <div class="tiles" style="margin:0">${favCards}</div></div>`;
}

// ---------- Trophies ----------
function viewTrophies(main) {
  const t = DATA.trophies;
  const leaders = Object.entries(t.counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const medals = ['🥇', '🥈', '🥉'];
  const leaderTiles = leaders.map(([p, n], i) =>
    `<div class="tile"><div class="label">${medals[i]} ${i === 0 ? 'Most trophies' : 'Runner-up'}</div>
      <div class="value">${n}</div><div class="who">${shortName(p)}</div></div>`).join('');

  const cards = t.badges.map(b => {
    const locked = b.holders.length === 0;
    const holders = locked
      ? `<div class="badge-locked">🔒 Not yet unlocked</div>`
      : `<div class="badge-holders">${b.holders.map(h =>
          `<span class="badge-chip">${shortName(h.player)}<span class="note"> ${h.detail}</span></span>`).join('')}</div>`;
    return `<div class="badge-card${locked ? ' is-locked' : ''}">
      <div class="badge-top"><span class="badge-emoji">${b.emoji}</span>
        <span class="badge-count">${locked ? '—' : b.holders.length}</span></div>
      <div class="badge-name">${b.name}</div>
      <div class="badge-desc">${b.desc}</div>
      ${holders}</div>`;
  }).join('');

  main.innerHTML = `
    <h2 class="view-title">🏆 Trophy Case</h2>
    <p class="view-intro">Season-long achievements, all earned from hole-by-hole play. Rarest are hardest — some are still up for grabs.</p>
    <div class="tiles">${leaderTiles}</div>
    <div class="badge-grid">${cards}</div>`;
}

// ---------- Players ----------
let currentPlayer = null;
function viewPlayers(main) {
  const players = DATA.meta.players;
  if (!currentPlayer || !players.includes(currentPlayer)) {
    currentPlayer = (HIGHLIGHT_PLAYER && players.includes(HIGHLIGHT_PLAYER)) ? HIGHLIGHT_PLAYER : players[0];
  }
  main.innerHTML = `
    <h2 class="view-title">Player Profiles</h2>
    <div class="player-picker">
      <label for="player-select">Player</label>
      <select class="wk-select" id="player-select">
        ${players.map(p => `<option value="${p}" ${p === currentPlayer ? 'selected' : ''}>${p}</option>`).join('')}
      </select>
    </div>
    <div id="profile"></div>`;
  const sel = main.querySelector('#player-select');
  sel.onchange = (e) => { currentPlayer = e.target.value; viewPlayers(main); };
  renderProfile($('#profile'), currentPlayer);
}

function renderProfile(root, p) {
  const pr = DATA.profiles[p];
  const h = pr.handicap;
  const tiles = `<div class="tiles">
    <div class="tile"><div class="label">Handicap</div><div class="value">${fmt(h.current)}</div><div class="who">start ${fmt(h.starting)} (${signed(h.delta)})</div></div>
    <div class="tile"><div class="label">Rounds</div><div class="value">${pr.rounds}</div><div class="who">avg gross ${fmt(pr.avg_gross)}</div></div>
    <div class="tile"><div class="label">Best round</div><div class="value">${pr.best_round ? signed(pr.best_round.to_par) : '–'}</div><div class="who">${pr.best_round ? 'wk ' + pr.best_round.week + ' · ' + pr.best_round.gross : ''}</div></div>
    <div class="tile"><div class="label">Birdies+</div><div class="value">${pr.birdies_or_better}</div><div class="who">${pr.skins} skins</div></div>
  </div>`;

  const gSeries = [{ name: p + ' gross-to-par', color: colorOf[p], points: pr.series.map(s => ({ x: s.week, y: s.to_par })) }];
  const hSeries = [{ name: p + ' handicap', color: '#0b6b8a', points: h.trend.map(t => ({ x: t.week, y: t.handicap })) }];

  // per-hole avg heatmap
  const holes = Array.from({ length: 18 }, (_, i) => i + 1);
  const heat = holes.map(hh => {
    const v = pr.hole_avg[String(hh)];
    const cls = v == null ? '' : scoreClass(Math.round(v), parOf(hh));
    return `<td class="${cls}" title="Hole ${hh}">${v == null ? '·' : fmt(v)}</td>`;
  }).join('');
  const heatHead = holes.map(hh => `<th>${hh}</th>`).join('');

  const myBadges = DATA.trophies.badges
    .map(b => ({ b, hd: b.holders.find(h => h.player === p) }))
    .filter(x => x.hd);
  const badgeStrip = myBadges.length ? `<div class="card"><h3 class="section-title">🏅 Trophies (${myBadges.length})</h3>
    <div class="badge-strip">${myBadges.map(({ b, hd }) =>
      `<span class="badge-mini" title="${b.name} — ${b.desc} (${hd.detail})">${b.emoji} ${b.name}</span>`).join('')}</div></div>` : '';

  root.innerHTML = `${tiles}
    ${badgeStrip}
    ${radarCard(p)}
    <div class="grid-2">
      <div class="card"><h3 class="section-title">Score vs par</h3>${lineChart(gSeries, { yLabel: 'To par', invertBetter: true })}</div>
      <div class="card"><h3 class="section-title">Handicap trend</h3>${lineChart(hSeries, { yLabel: 'Hdc', invertBetter: true })}</div>
    </div>
    ${playerWeeksCard(p)}
    <div class="card"><h3 class="section-title">Scoring average by hole</h3>
      <div class="table-scroll"><table><thead><tr><th class="name">Hole</th>${heatHead}</tr></thead>
      <tbody><tr><td class="name">Avg</td>${heat}</tr>
      <tr class="par-row"><td class="name">Par</td>${holes.map(hh => `<td>${parOf(hh)}</td>`).join('')}</tr></tbody></table></div></div>`;
}

// ---------- Player DNA radar ----------
function radarCard(p) {
  const dna = DATA.dna[p];
  return `<div class="card"><h3 class="section-title">🧬 Player DNA</h3>
    <p class="sub">Each spoke scored 0–100 vs the field (100 = league-best at that skill). Dashed = league average.${dna.qualified ? '' : ' <em>Limited data — under 4 rounds.</em>'}</p>
    ${radarChart(dna.axes, DATA.dna_league, colorOf[p])}
    <div class="chart-legend"><span><span class="dot" style="background:${colorOf[p]}"></span>${shortName(p)}</span><span><span class="dot" style="background:var(--muted)"></span>league avg</span></div>
  </div>`;
}

function radarChart(axes, league, color) {
  const N = axes.length, W = 440, H = 340, cx = 220, cy = 165, R = 118;
  const ang = i => -Math.PI / 2 + i * 2 * Math.PI / N;
  const pt = (i, sc) => {
    const r = R * (Math.max(0, Math.min(100, sc == null ? 0 : sc)) / 100);
    return [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
  };
  const poly = pts => pts.map(q => q.map(n => n.toFixed(1)).join(',')).join(' ');

  let rings = '';
  [25, 50, 75, 100].forEach(lvl => {
    rings += `<polygon points="${poly(axes.map((_, i) => { const r = R * lvl / 100; return [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))]; }))}" fill="none" stroke="var(--line)" stroke-width="1"/>`;
  });
  let spokes = '', labels = '';
  axes.forEach((a, i) => {
    const ex = cx + R * Math.cos(ang(i)), ey = cy + R * Math.sin(ang(i));
    spokes += `<line x1="${cx}" y1="${cy}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="var(--line)"/>`;
    const lx = cx + (R + 16) * Math.cos(ang(i)), ly = cy + (R + 16) * Math.sin(ang(i));
    const co = Math.cos(ang(i));
    const anchor = Math.abs(co) < 0.3 ? 'middle' : (co > 0 ? 'start' : 'end');
    labels += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="11" fill="var(--muted)">${a.label}</text>`;
  });
  const dots = axes.map((a, i) => {
    const [x, y] = pt(i, a.score);
    const unit = a.raw == null ? 'n/a' : (a.label === 'Consistency' ? '±' + fmt(a.raw) : signed(a.raw) + '/hole');
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${color}"><title>${a.label}: ${a.score == null ? 'n/a' : a.score}/100 (${unit})</title></circle>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" style="max-width:440px;margin:0 auto">
    ${rings}${spokes}${labels}
    <polygon points="${poly(league.map((a, i) => pt(i, a.score)))}" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 3"/>
    <polygon points="${poly(axes.map((a, i) => pt(i, a.score)))}" fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-width="2"/>
    ${dots}
  </svg>`;
}

// ---------- Week-by-week (incl. missed) ----------
function playerWeeksCard(p) {
  const rows = DATA.weeks.map(wk => {
    const r = wk.results.find(x => x.player === p);
    const dateStr = wk.date ? fmtDate(wk.date) : '';
    const nine = wk.nine === 'F' ? 'Front' : 'Back';
    if (!r) {
      return `<tr class="missed"><td class="name">Wk ${wk.week}</td><td>${dateStr}</td><td>${nine}</td><td colspan="3">— did not play —</td></tr>`;
    }
    const noteTag = r.notes ? ` <span class="rnote" title="${r.notes}">↩︎</span>` : '';
    return `<tr class="${isMe(p) ? 'me' : ''}"><td class="name">Wk ${wk.week}${noteTag}</td><td>${dateStr}</td><td>${nine}</td>
      <td class="total-col">${r.gross}</td><td>${signed(r.to_par)}</td><td class="total-col">${signed(r.net)}</td></tr>`;
  }).join('');
  const played = DATA.weeks.filter(wk => wk.results.some(x => x.player === p)).length;
  return `<div class="card"><h3 class="section-title">📅 Week by week</h3>
    <p class="sub">Played ${played} of ${DATA.weeks.length} weeks.</p>
    <div class="table-scroll"><table>
      <thead><tr><th class="name">Week</th><th>Date</th><th>9</th><th>Gross</th><th>To Par</th><th>Net</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`;
}

// ---------- SVG line chart ----------
function lineChart(series, opts = {}) {
  const W = 640, H = 260, pad = { t: 16, r: 16, b: 30, l: 34 };
  const all = series.flatMap(s => s.points);
  if (!all.length) return '<p class="note">No data yet.</p>';
  const xs = all.map(p => p.x), ys = all.map(p => p.y);
  let xmin = Math.min(...xs), xmax = Math.max(...xs);
  let ymin = Math.min(...ys), ymax = Math.max(...ys);
  if (xmin === xmax) { xmin -= 1; xmax += 1; }
  const ypad = (ymax - ymin) * 0.15 || 1;
  ymin -= ypad; ymax += ypad;
  const sx = x => pad.l + (x - xmin) / (xmax - xmin) * (W - pad.l - pad.r);
  const sy = y => pad.t + (ymax - y) / (ymax - ymin) * (H - pad.t - pad.b);

  // gridlines (y)
  const ticks = 4; let grid = '';
  for (let i = 0; i <= ticks; i++) {
    const yv = ymin + (ymax - ymin) * i / ticks;
    const y = sy(yv);
    grid += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-width="1"/>
      <text x="${pad.l - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="var(--muted)">${yv.toFixed(0)}</text>`;
  }
  // x labels
  let xlab = '';
  const weeks = [...new Set(xs)].sort((a, b) => a - b);
  weeks.forEach(w => { xlab += `<text x="${sx(w)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--muted)">${w}</text>`; });

  const sw = opts.interactive ? 1.8 : 2.5;
  const paths = series.map((s, si) => {
    const pts = [...s.points].sort((a, b) => a.x - b.x);
    if (!pts.length) return '';
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
    const dots = opts.interactive ? '' : pts.map(p => `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="3.2" fill="${s.color}"/>`).join('');
    const g = `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${sw}" stroke-linejoin="round"/>${dots}`;
    return opts.interactive ? `<g class="ser" data-i="${si}">${g}</g>` : g;
  }).join('');

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">
    ${grid}${xlab}${paths}
    <text x="${W / 2}" y="${H - 22}" text-anchor="middle" font-size="10" fill="var(--muted)">Week →</text>
  </svg>`;
}

function chartLegend(series, interactive) {
  return `<div class="chart-legend">${series.map((s, i) =>
    `<span class="${interactive ? 'leg-item' : ''}"${interactive ? ` data-i="${i}"` : ''}><span class="dot" style="background:${s.color}"></span>${s.name}</span>`).join('')}</div>`;
}

// ---------- utils ----------
function first(arr) { return arr && arr.length ? arr[0] : null; }
function shortName(full) { const parts = full.split(' '); return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : full; }
function fmtDate(iso, long) {
  const m = iso && /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso || '';
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.toLocaleDateString('en-US', long
    ? { weekday: 'short', month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric' });
}
function isMe(p) { return HIGHLIGHT_PLAYER && p === HIGHLIGHT_PLAYER; }

// ---------- boot ----------
fetch('data.json?_=' + Date.now())
  .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(data => {
    DATA = data;
    // distinct colour per player via golden-angle hue spacing (readable on light & dark)
    data.meta.players.forEach((p, i) => { colorOf[p] = `hsl(${((i * 137.508) % 360).toFixed(0)}, 65%, 52%)`; });
    $('#league-name').textContent = LEAGUE_NAME;
    $('#meta-line').textContent = `${data.meta.players.length} players · ${data.meta.num_weeks} weeks played`;
    $('#footer-meta').textContent = `Data updated ${data.meta.generated_at}. Handicap = best ${data.meta.best_n} of last ${data.meta.window} weeks.`;
    const start = (location.hash || '#week').slice(1);
    show(TABS.some(t => t[0] === start) ? start : 'week');
  })
  .catch(err => {
    $('#main').innerHTML = `<div class="card"><h3>Couldn't load data</h3>
      <p class="note">Run <code>python3 build/build.py</code> to generate <code>data.json</code>, then serve this folder. (${err})</p></div>`;
  });
