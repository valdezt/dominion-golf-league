'use strict';

// See worker/README.md — must match the value set in submit.js.
const WORKER_URL = 'https://dominion-golf-submit.valdezt.workers.dev';
const NEW_PLAYER_VALUE_UNUSED = null; // edit form never adds new players

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

let DATA = null;
let selectedWeek = null;   // week number (int) or null
let selectedPlayer = null; // player name or null
let scores = [];           // 9 strings, aligned to holesForCurrentWeek()
let notes = '';
let reason = '';

function weekResult() {
  const wk = DATA.weeks.find(w => w.week === selectedWeek);
  if (!wk) return null;
  const r = wk.results.find(x => x.player === selectedPlayer);
  return wk && r ? { wk, r } : null;
}

function holesForCurrentWeek() {
  const wk = DATA.weeks.find(w => w.week === selectedWeek);
  return wk ? wk.holes : [];
}

function render() {
  const main = $('#main');
  const weekOptions = DATA.weeks.map(w =>
    `<option value="${w.week}" ${selectedWeek === w.week ? 'selected' : ''}>${ScorecardForm.fmtWeekLabel(w)}</option>`
  ).join('');

  const wk = DATA.weeks.find(w => w.week === selectedWeek);
  const playerOptions = wk ? wk.results.map(r =>
    `<option value="${escapeAttr(r.player)}" ${selectedPlayer === r.player ? 'selected' : ''}>${r.player}</option>`
  ).join('') : '';

  const holes = holesForCurrentWeek();
  const canEdit = selectedWeek !== null && selectedPlayer !== null && holes.length;

  const tableHtml = canEdit ? `
    <div class="card"><div class="table-scroll">
      <table>
        <thead>${ScorecardForm.renderHeadRow(DATA.course, holes, { nameLabel: selectedPlayer })}</thead>
        <tbody>
          ${ScorecardForm.renderParRow(DATA.course, holes)}
          <tr class="player-row">
            <td class="name">Score</td>
            ${holes.map((h, i) => {
              const par = ScorecardForm.parOf(DATA.course, h);
              return `<td><input type="text" inputmode="numeric" class="score-input" data-hole="${h}" data-par="${par}" data-player="${escapeAttr(selectedPlayer)}" value="${escapeAttr(scores[i] || '')}" /></td>`;
            }).join('')}
          </tr>
        </tbody>
      </table>
    </div>
    <label class="field-label" for="edit-notes">Notes</label>
    <input type="text" id="edit-notes" value="${escapeAttr(notes)}" />
    <label class="field-label" for="edit-reason">Why is this being corrected? (optional, helps Travis review)</label>
    <input type="text" id="edit-reason" value="${escapeAttr(reason)}" placeholder="e.g. hole 6 was recorded as 7, should be 5" />
    <button type="button" class="submit-btn" id="do-submit">Submit correction for review</button>
    <div class="submit-status" id="submit-status"></div>
    </div>` : '';

  main.innerHTML = `
    <h2 class="view-title">Fix a score</h2>
    <p class="view-intro">Pick the week and player, then correct the scorecard.</p>
    <div class="card">
      <label class="field-label" for="week-select">Week</label>
      <select id="week-select" class="wk-select form-select">
        <option value="">Choose a week…</option>
        ${weekOptions}
      </select>
      ${wk ? `
        <label class="field-label" for="player-select">Player</label>
        <select id="player-select" class="wk-select form-select">
          <option value="">Choose a player…</option>
          ${playerOptions}
        </select>` : ''}
    </div>
    ${tableHtml}
    <input type="text" class="hp-field" id="hp-field" name="website" tabindex="-1" autocomplete="off" />
  `;

  attachHandlers(holes);
  if (canEdit) ScorecardForm.scanScoreInputs(main);
}

function escapeAttr(s) {
  return (s || '').toString().replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function attachHandlers(holes) {
  const main = $('#main');
  const weekSelect = $('#week-select');
  if (weekSelect) weekSelect.onchange = (e) => {
    selectedWeek = e.target.value ? parseInt(e.target.value, 10) : null;
    selectedPlayer = null; scores = []; notes = '';
    render();
  };
  const playerSelect = $('#player-select');
  if (playerSelect) playerSelect.onchange = (e) => {
    selectedPlayer = e.target.value || null;
    const found = weekResult();
    if (found) {
      const wkHoles = found.wk.holes;
      scores = wkHoles.map(h => {
        const v = found.r.holes[String(h)];
        return v == null ? '' : String(v);
      });
      notes = found.r.notes || '';
    } else {
      scores = []; notes = '';
    }
    render();
  };
  $$('.score-input', main).forEach(inp => {
    inp.oninput = (e) => {
      const hole = parseInt(e.target.dataset.hole, 10);
      const idx = holes.indexOf(hole);
      scores[idx] = e.target.value;
      ScorecardForm.scanScoreInputs(main);
    };
  });
  const notesInput = $('#edit-notes');
  if (notesInput) notesInput.oninput = (e) => { notes = e.target.value; };
  const reasonInput = $('#edit-reason');
  if (reasonInput) reasonInput.oninput = (e) => { reason = e.target.value; };
  const submitBtn = $('#do-submit');
  if (submitBtn) submitBtn.onclick = onSubmitClick;
}

function onSubmitClick() {
  const status = $('#submit-status');
  if (!scores.some(s => s.trim() !== '')) {
    status.className = 'submit-status error';
    status.textContent = 'Enter at least one hole score.';
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
  const list = flagged.map(f => `<li>Hole ${f.hole}: <strong>${f.value}</strong> (par ${f.par})</li>`).join('');
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
  const payload = {
    week: selectedWeek,
    player: selectedPlayer,
    scores: holes.map((h, i) => scores[i] ? scores[i].trim() : ''),
    notes: notes.trim(),
    reason: reason.trim(),
    flaggedCells: flaggedCells.map(f => ({ hole: f.hole, value: f.value, par: f.par })),
    hp_field: $('#hp-field').value,
    hp_ts: bootTime,
  };

  fetch(`${WORKER_URL}/edit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
    .then(r => r.json().then(body => ({ ok: r.ok, body })))
    .then(({ ok, body }) => {
      submitBtn.disabled = false;
      if (ok && body.ok) {
        status.className = 'submit-status success';
        status.innerHTML = body.prUrl
          ? `Submitted! <a href="${body.prUrl}" target="_blank" rel="noopener">View the pull request</a>.`
          : 'Submitted!';
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
  .then(data => { DATA = data; render(); })
  .catch(err => {
    $('#main').innerHTML = `<div class="card"><h3>Couldn't load data</h3>
      <p class="note">Run <code>python3 build/build.py</code> to generate <code>data.json</code>, then serve this folder. (${err})</p></div>`;
  });
