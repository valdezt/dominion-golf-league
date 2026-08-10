'use strict';

// Fill this in after `wrangler deploy` (see worker/README.md) — the only
// coupling between this static page and the Cloudflare Worker that opens PRs.
const WORKER_URL = 'https://REPLACE-ME.workers.dev';

const DRAFT_KEY = 'golf:submitDraft';
const NEW_WEEK_VALUE = '__new_week__';
const NEW_PLAYER_VALUE = '__new_player__';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

let DATA = null;
let rowSeq = 0;

// ---- state ----
// state.week: { mode: 'existing', week: 15 } | { mode: 'new', nine: 'F', date: '2026-08-17' } | null
// state.rows: [{ id, player, isNewPlayer, scores: ['','','',...], notes }]
let state = { submittedBy: '', week: null, note: '', rows: [] };
let lastSuccess = null; // { prUrl } — shown as a banner, not part of the persisted draft

function emptyRow() {
  return { id: ++rowSeq, player: '', isNewPlayer: false, scores: Array(9).fill(''), notes: '' };
}

function saveDraftNow() {
  ScorecardForm.saveDraft(DRAFT_KEY, state);
}
const saveDraftSoon = ScorecardForm.debounce(saveDraftNow, 500);

// The 500ms debounce keeps typing smooth, but a phone getting backgrounded
// or refreshed right after a keystroke shouldn't lose that keystroke — flush
// immediately whenever the page might be about to disappear.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveDraftNow(); });
window.addEventListener('pagehide', saveDraftNow);

function currentNine() {
  if (!state.week) return null;
  if (state.week.mode === 'existing') {
    const reg = DATA.meta.registered_weeks.find(w => w.week === state.week.week);
    return reg ? reg.nine : 'F';
  }
  return state.week.nine || 'F';
}

function holesForCurrentWeek() {
  const nine = currentNine();
  return nine ? ScorecardForm.holesForNine(nine) : [];
}

// ---------- rendering ----------
function render() {
  const main = $('#main');
  const holes = holesForCurrentWeek();

  const weekOptions = DATA.meta.registered_weeks.map(w =>
    `<option value="${w.week}" ${state.week && state.week.mode === 'existing' && state.week.week === w.week ? 'selected' : ''}>${ScorecardForm.fmtWeekLabel(w)}</option>`
  ).join('');

  const weekSelectHtml = `
    <div class="card">
      <label class="field-label" for="week-select">Which week is this round for?</label>
      <select id="week-select" class="wk-select form-select">
        <option value="">Choose a week…</option>
        ${weekOptions}
        <option value="${NEW_WEEK_VALUE}" ${state.week && state.week.mode === 'new' ? 'selected' : ''}>+ Register a new week…</option>
      </select>
      ${state.week && state.week.mode === 'new' ? `
        <div class="new-week-fields">
          <label class="field-label" for="new-week-date">Date</label>
          <input type="date" id="new-week-date" value="${state.week.date || ''}" />
          <label class="field-label">Nine</label>
          <label class="radio-label"><input type="radio" name="new-nine" value="F" ${state.week.nine !== 'B' ? 'checked' : ''}/> Front 9</label>
          <label class="radio-label"><input type="radio" name="new-nine" value="B" ${state.week.nine === 'B' ? 'checked' : ''}/> Back 9</label>
        </div>` : ''}
      <label class="field-label" for="submitted-by">Your name (so Travis knows who submitted this — optional)</label>
      <input type="text" id="submitted-by" value="${escapeAttr(state.submittedBy)}" placeholder="e.g. Dylan Bell" />
      <label class="field-label" for="week-note">Note (optional)</label>
      <input type="text" id="week-note" value="${escapeAttr(state.note)}" placeholder="e.g. rained out on 7" />
    </div>`;

  const tableHtml = holes.length ? `
    <div class="card"><div class="table-scroll">
      <table>
        <thead>${ScorecardForm.renderHeadRow(DATA.course, holes)}</thead>
        <tbody>
          ${ScorecardForm.renderParRow(DATA.course, holes)}
          ${state.rows.map((row, i) => renderPlayerRow(row, i, holes)).join('')}
        </tbody>
      </table>
    </div>
    <button type="button" class="add-player-btn" id="add-player">+ Add player</button>
    </div>` : '';

  const submitHtml = holes.length ? `
    <div class="card">
      <button type="button" class="submit-btn" id="do-submit">Submit round for review</button>
      <div class="submit-status" id="submit-status"></div>
    </div>` : '';

  const successBanner = lastSuccess ? `
    <div class="card submit-status success">
      Submitted! ${lastSuccess.prUrl ? `<a href="${lastSuccess.prUrl}" target="_blank" rel="noopener">View the pull request</a>.` : ''}
      <button type="button" class="add-player-btn" id="dismiss-success">Submit another round</button>
    </div>` : '';

  main.innerHTML = `
    <h2 class="view-title">Submit a round</h2>
    <p class="view-intro">Looks like the course scorecard — enter par-relative scores for everyone in your group, then submit for Travis to review.</p>
    ${successBanner}
    ${weekSelectHtml}
    ${tableHtml}
    ${submitHtml}
    <input type="text" class="hp-field" id="hp-field" name="website" tabindex="-1" autocomplete="off" />
  `;

  attachHandlers(holes);
  if (holes.length) ScorecardForm.scanScoreInputs(main);
  const dismissBtn = $('#dismiss-success');
  if (dismissBtn) dismissBtn.onclick = () => { lastSuccess = null; render(); };
}

function renderPlayerRow(row, i, holes) {
  const nameCell = row.isNewPlayer
    ? `<input type="text" class="new-player-input" data-row="${row.id}" value="${escapeAttr(row.player)}" placeholder="Player name" />`
    : `<select class="player-select" data-row="${row.id}">
        <option value="">Choose player…</option>
        ${DATA.meta.players.map(p => `<option value="${escapeAttr(p)}" ${row.player === p ? 'selected' : ''}>${p}</option>`).join('')}
        <option value="${NEW_PLAYER_VALUE}">+ Add a new player…</option>
      </select>`;

  const scoreCells = holes.map((h, hi) => {
    const par = ScorecardForm.parOf(DATA.course, h);
    return `<td><input type="text" inputmode="numeric" class="score-input" data-row="${row.id}" data-hole="${h}" data-par="${par}" data-player="${escapeAttr(row.player)}" value="${escapeAttr(row.scores[hi] || '')}" /></td>`;
  }).join('');

  return `<tr class="player-row">
    <td class="name">${nameCell}</td>
    ${scoreCells}
    <td><input type="text" class="notes-input" data-row="${row.id}" value="${escapeAttr(row.notes)}" placeholder="notes" /></td>
    <td><button type="button" class="remove-row-btn" data-remove="${row.id}" aria-label="Remove player">✕</button></td>
  </tr>`;
}

function escapeAttr(s) {
  return (s || '').toString().replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// ---------- event handling ----------
function attachHandlers(holes) {
  const main = $('#main');

  const weekSelect = $('#week-select');
  if (weekSelect) {
    weekSelect.onchange = (e) => {
      const v = e.target.value;
      if (v === '') state.week = null;
      else if (v === NEW_WEEK_VALUE) state.week = { mode: 'new', nine: 'F', date: new Date().toISOString().slice(0, 10) };
      else state.week = { mode: 'existing', week: parseInt(v, 10) };
      saveDraftNow();
      render();
    };
  }
  const newDate = $('#new-week-date');
  if (newDate) newDate.oninput = (e) => { state.week.date = e.target.value; saveDraftSoon(); };
  $$('input[name="new-nine"]').forEach(r => r.onchange = (e) => { state.week.nine = e.target.value; saveDraftSoon(); render(); });

  const submittedBy = $('#submitted-by');
  if (submittedBy) submittedBy.oninput = (e) => { state.submittedBy = e.target.value; saveDraftSoon(); };
  const noteInput = $('#week-note');
  if (noteInput) noteInput.oninput = (e) => { state.note = e.target.value; saveDraftSoon(); };

  $$('.player-select', main).forEach(sel => {
    sel.onchange = (e) => {
      const row = state.rows.find(r => r.id === parseInt(e.target.dataset.row, 10));
      if (e.target.value === NEW_PLAYER_VALUE) { row.isNewPlayer = true; row.player = ''; }
      else { row.player = e.target.value; }
      saveDraftNow();
      render();
    };
  });
  $$('.new-player-input', main).forEach(inp => {
    inp.oninput = (e) => {
      const row = state.rows.find(r => r.id === parseInt(e.target.dataset.row, 10));
      row.player = e.target.value;
      saveDraftSoon();
    };
  });
  $$('.score-input', main).forEach(inp => {
    inp.oninput = (e) => {
      const row = state.rows.find(r => r.id === parseInt(e.target.dataset.row, 10));
      const hole = parseInt(e.target.dataset.hole, 10);
      const idx = holes.indexOf(hole);
      row.scores[idx] = e.target.value;
      ScorecardForm.scanScoreInputs(main);
      saveDraftSoon();
    };
  });
  $$('.notes-input', main).forEach(inp => {
    inp.oninput = (e) => {
      const row = state.rows.find(r => r.id === parseInt(e.target.dataset.row, 10));
      row.notes = e.target.value;
      saveDraftSoon();
    };
  });
  $$('.remove-row-btn', main).forEach(btn => {
    btn.onclick = () => {
      state.rows = state.rows.filter(r => r.id !== parseInt(btn.dataset.remove, 10));
      saveDraftNow();
      render();
    };
  });
  const addBtn = $('#add-player');
  if (addBtn) addBtn.onclick = () => { state.rows.push(emptyRow()); saveDraftNow(); render(); };

  const submitBtn = $('#do-submit');
  if (submitBtn) submitBtn.onclick = onSubmitClick;
}

// ---------- validation + submit ----------
function activeRows() {
  // ignore fully-blank rows (stray "+ Add player" clicks) — don't error on them
  return state.rows.filter(r => r.player.trim() !== '' || r.scores.some(s => s.trim() !== ''));
}

function structuralErrors() {
  const errs = [];
  if (!state.week) errs.push('Choose a week first.');
  if (state.week && state.week.mode === 'new' && !state.week.date) errs.push('Pick a date for the new week.');
  const rows = activeRows();
  if (!rows.length) errs.push('Add at least one player with a score.');
  for (const r of rows) {
    if (!r.player.trim()) errs.push('Every player row needs a name.');
    if (!r.scores.some(s => s.trim() !== '')) errs.push(`${r.player || 'A player'} needs at least one hole score.`);
  }
  const names = rows.map(r => r.player.trim().toLowerCase()).filter(Boolean);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupes.length) errs.push('The same player is entered twice — remove the duplicate row.');
  return errs;
}

function onSubmitClick() {
  saveDraftNow();
  const status = $('#submit-status');
  const errs = structuralErrors();
  if (errs.length) {
    status.className = 'submit-status error';
    status.textContent = errs[0];
    return;
  }
  const flagged = ScorecardForm.scanScoreInputs($('#main'));
  if (flagged.length) {
    showFlagInterstitial(flagged, () => doSubmit(flagged));
  } else {
    doSubmit([]);
  }
}

function showFlagInterstitial(flagged, onConfirm) {
  const list = flagged.map(f => `<li>${f.player || 'Player'} — hole ${f.hole}: <strong>${f.value}</strong> (par ${f.par})</li>`).join('');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card">
      <h3>Are you sure?</h3>
      <p>These scores look unusual for their hole — double check before submitting:</p>
      <ul>${list}</ul>
      <div class="modal-actions">
        <button type="button" class="modal-btn secondary" id="modal-back">Go back and fix</button>
        <button type="button" class="modal-btn primary" id="modal-confirm">Submit anyway</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  $('#modal-back', overlay).onclick = () => overlay.remove();
  $('#modal-confirm', overlay).onclick = () => { overlay.remove(); onConfirm(); };
}

function doSubmit(flaggedCells) {
  const status = $('#submit-status');
  const submitBtn = $('#do-submit');
  submitBtn.disabled = true;
  status.className = 'submit-status';
  status.textContent = 'Submitting…';

  const holes = holesForCurrentWeek();
  const rows = activeRows();
  const payload = {
    submittedBy: state.submittedBy.trim(),
    mode: state.week.mode === 'new' ? 'new_week' : 'existing',
    week: state.week.mode === 'existing' ? state.week.week : null,
    nine: state.week.mode === 'new' ? state.week.nine : null,
    date: state.week.mode === 'new' ? state.week.date : null,
    note: state.note.trim(),
    players: rows.map(r => ({
      name: r.player.trim(),
      isNewPlayer: r.isNewPlayer,
      scores: holes.map((h, i) => r.scores[i] ? r.scores[i].trim() : ''),
      notes: r.notes.trim(),
    })),
    flaggedCells: flaggedCells.map(f => ({ player: f.player, hole: f.hole, value: f.value, par: f.par })),
    hp_field: $('#hp-field').value,
    hp_ts: bootTime,
  };

  fetch(`${WORKER_URL}/submit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
    .then(r => r.json().then(body => ({ ok: r.ok, body })))
    .then(({ ok, body }) => {
      submitBtn.disabled = false;
      if (ok && body.ok) {
        lastSuccess = { prUrl: body.prUrl };
        ScorecardForm.clearDraft(DRAFT_KEY);
        // Reset week selection rather than trying to "stay" on it: this
        // page's data.json won't know about a freshly-registered week until
        // the PR merges and the site rebuilds, so keeping it selected would
        // leave the dropdown blank while the table quietly defaulted to
        // Front 9. If a second group played the same already-registered
        // week, picking it again from the dropdown works fine right away.
        state = { submittedBy: state.submittedBy, week: null, note: '', rows: [emptyRow(), emptyRow()] };
        render();
      } else {
        status.className = 'submit-status error';
        status.textContent = body.error || 'Something went wrong — please try again or tell Travis.';
      }
    })
    .catch(() => {
      submitBtn.disabled = false;
      status.className = 'submit-status error';
      status.textContent = "Couldn't reach the submission service — check your connection and try again.";
    });
}

// ---------- boot ----------
const bootTime = Date.now();
fetch('data.json?_=' + bootTime)
  .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(data => {
    DATA = data;
    const draft = ScorecardForm.loadDraft(DRAFT_KEY);
    if (draft && draft.rows) {
      state = draft;
      rowSeq = Math.max(0, ...state.rows.map(r => r.id || 0));
    } else {
      const latest = DATA.meta.registered_weeks[DATA.meta.registered_weeks.length - 1];
      state.week = latest ? { mode: 'existing', week: latest.week } : null;
      state.rows = [emptyRow(), emptyRow()];
    }
    render();
  })
  .catch(err => {
    $('#main').innerHTML = `<div class="card"><h3>Couldn't load data</h3>
      <p class="note">Run <code>python3 build/build.py</code> to generate <code>data.json</code>, then serve this folder. (${err})</p></div>`;
  });
