'use strict';

// Shared helpers for the two friend-facing forms (submit.js, edit.js):
// scorecard-shaped table rendering, soft (non-blocking) score validation,
// and small localStorage draft-persistence utilities. Loaded before those
// scripts as a plain global, same convention as app.js.
const ScorecardForm = (() => {

  // ---- hole/par helpers (mirror app.js's parOf/holesForNine logic) ----
  function holesForNine(nine) {
    const base = nine === 'B' ? 9 : 0;
    return Array.from({ length: 9 }, (_, i) => base + i + 1);
  }
  function parOf(course, hole) {
    return course[String(hole)].par;
  }

  // ---- scorecard head/par-row markup (matches viewWeek()'s table shape) ----
  function renderHeadRow(course, holes, opts = {}) {
    const nameLabel = opts.nameLabel || 'Player';
    return `<tr><th class="name">${nameLabel}</th>` +
      holes.map(h => `<th>${h}<div class="note" style="font-weight:400">p${parOf(course, h)}</div></th>`).join('') +
      `</tr>`;
  }
  function renderParRow(course, holes) {
    return `<tr class="par-row"><td class="name">Par</td>` +
      holes.map(h => `<td>${parOf(course, h)}</td>`).join('') + `</tr>`;
  }

  // ---- soft score validation: 1..(par+3) or blank. Never blocking. ----
  function scoreStatus(raw, par) {
    const t = (raw ?? '').toString().trim();
    if (t === '') return 'ok';
    if (!/^\d+$/.test(t)) return 'warn';
    const n = parseInt(t, 10);
    if (n < 1 || n > par + 3) return 'warn';
    return 'ok';
  }

  // Scan a container for `.score-input[data-par]` cells, apply/remove the
  // warning style live, and return the list of still-flagged cells
  // ({el, player, hole, value, par}) for the submit-time interstitial.
  function scanScoreInputs(container) {
    const flagged = [];
    container.querySelectorAll('.score-input').forEach((el) => {
      const par = parseInt(el.dataset.par, 10);
      const status = scoreStatus(el.value, par);
      el.classList.toggle('score-warn', status === 'warn');
      if (status === 'warn') {
        flagged.push({
          el, player: el.dataset.player || '', hole: el.dataset.hole,
          value: el.value.trim(), par,
        });
      }
    });
    return flagged;
  }

  // ---- fuzzy name matching (soft "did you mean?" warning only) ----
  function levenshtein(a, b) {
    a = a.toLowerCase(); b = b.toLowerCase();
    const m = a.length, n = b.length;
    const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        d[i][j] = a[i - 1] === b[j - 1]
          ? d[i - 1][j - 1]
          : 1 + Math.min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1]);
      }
    }
    return d[m][n];
  }
  function closestName(name, knownNames) {
    const n = name.trim();
    if (!n) return null;
    let best = null, bestDist = Infinity;
    for (const known of knownNames) {
      if (known.trim().toLowerCase() === n.toLowerCase()) return null; // exact match, no warning
      const dist = levenshtein(n, known);
      if (dist < bestDist) { bestDist = dist; best = known; }
    }
    return (best && bestDist <= 2 && bestDist > 0) ? best : null;
  }

  // ---- draft persistence (auto-save/restore, no user prompt) ----
  function saveDraft(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) { /* private mode etc — draft just won't persist */ }
  }
  function loadDraft(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function clearDraft(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }
  function debounce(fn, wait) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function fmtWeekLabel(w) {
    const nineName = w.nine === 'B' ? 'Back' : 'Front';
    const datePart = w.date ? ' · ' + w.date : '';
    return `Week ${w.week} · ${nineName} 9${datePart}`;
  }

  return {
    holesForNine, parOf, renderHeadRow, renderParRow,
    scoreStatus, scanScoreInputs,
    closestName, saveDraft, loadDraft, clearDraft, debounce,
    fmtWeekLabel,
  };
})();
