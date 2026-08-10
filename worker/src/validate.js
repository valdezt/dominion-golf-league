// Server-side validation. The client already does soft (non-blocking)
// range checks against par; this only enforces things that must always
// hold structurally, plus a generous sanity bound on scores (blocking
// only truly nonsensical input, not "unusual for this hole" — that's
// the client's job, backed by the confirm-anyway interstitial).

const MAX_SANE_SCORE = 30;
const MIN_BOT_FILL_MS = 3000;

function isValidScore(s) {
  const t = (s ?? '').toString().trim();
  if (t === '') return true;
  return /^\d{1,2}$/.test(t) && parseInt(t, 10) >= 1 && parseInt(t, 10) <= MAX_SANE_SCORE;
}

export function isSuspectedBot(body) {
  if (body.hp_field) return true;
  if (typeof body.hp_ts === 'number' && Date.now() - body.hp_ts < MIN_BOT_FILL_MS) return true;
  return false;
}

export function validateSubmitPayload(body) {
  const errs = [];
  if (body.mode !== 'existing' && body.mode !== 'new_week') errs.push('Invalid mode.');
  if (body.mode === 'existing' && !Number.isInteger(body.week)) errs.push('Missing week.');
  if (body.mode === 'new_week') {
    if (body.nine !== 'F' && body.nine !== 'B') errs.push('Missing/invalid nine for new week.');
    if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) errs.push('Missing/invalid date for new week.');
  }
  if (!Array.isArray(body.players) || !body.players.length) errs.push('No players submitted.');
  else {
    const seen = new Set();
    for (const p of body.players) {
      const name = (p.name || '').trim();
      if (!name) { errs.push('Every player needs a name.'); continue; }
      const key = name.toLowerCase();
      if (seen.has(key)) errs.push(`Duplicate player in this submission: ${name}`);
      seen.add(key);
      if (!Array.isArray(p.scores) || p.scores.length !== 9) { errs.push(`${name}: expected 9 hole scores.`); continue; }
      if (!p.scores.some(s => (s ?? '').toString().trim() !== '')) errs.push(`${name}: needs at least one hole score.`);
      p.scores.forEach((s, i) => { if (!isValidScore(s)) errs.push(`${name}: hole ${i + 1} score "${s}" isn't valid.`); });
    }
  }
  return errs;
}

export function validateEditPayload(body) {
  const errs = [];
  if (!Number.isInteger(body.week)) errs.push('Missing week.');
  if (!(body.player || '').trim()) errs.push('Missing player.');
  if (!Array.isArray(body.scores) || body.scores.length !== 9) errs.push('Expected 9 hole scores.');
  else {
    if (!body.scores.some(s => (s ?? '').toString().trim() !== '')) errs.push('Needs at least one hole score.');
    body.scores.forEach((s, i) => { if (!isValidScore(s)) errs.push(`Hole ${i + 1} score "${s}" isn't valid.`); });
  }
  return errs;
}
