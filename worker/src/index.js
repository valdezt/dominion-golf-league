import { parseCsv, stringifyCsv, appendRows, replaceRow } from './csv.js';
import { getFile, getBranchSha, createBranch, putFile, createPullRequest } from './github.js';
import { nextWeekNumber, weeksMetaMap } from './weekLogic.js';
import { isSuspectedBot, validateSubmitPayload, validateEditPayload } from './validate.js';

const SCORES_PATH = 'data/scores.csv';
const WEEKS_PATH = 'data/weeks.csv';
const SCORES_FIELDS = ['week', 'player', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'notes'];
const WEEKS_FIELDS = ['week', 'nine', 'date', 'note'];
const RATE_LIMIT_WINDOW_SECONDS = 30;

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function json(env, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env) },
  });
}

async function checkRateLimit(env, request) {
  if (!env.RATE_LIMIT) return true; // KV binding not configured — skip
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const last = await env.RATE_LIMIT.get(ip);
  if (last) return false;
  await env.RATE_LIMIT.put(ip, String(Date.now()), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS });
  return true;
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

function scoreRow(week, player, scores, notes) {
  const row = { week: String(week), player };
  scores.forEach((s, i) => { row[`h${i + 1}`] = s || ''; });
  row.notes = notes || '';
  return row;
}

function grossOf(scores) {
  return scores.reduce((sum, s) => {
    const n = parseInt(s, 10);
    return Number.isNaN(n) ? sum : sum + n;
  }, 0);
}

function flaggedNote(flaggedCells) {
  if (!flaggedCells || !flaggedCells.length) return '';
  const items = flaggedCells.map(f =>
    `- ${f.player ? f.player + ' — ' : ''}hole ${f.hole}: **${f.value}** (par ${f.par})`).join('\n');
  return `\n⚠️ These holes were flagged as unusual but submitted anyway — please double check:\n${items}\n`;
}

async function handleSubmit(env, body) {
  const errs = validateSubmitPayload(body);
  if (errs.length) return json(env, { ok: false, code: 'VALIDATION_ERROR', error: errs[0], detail: { errors: errs } }, 400);

  const [scoresFile, weeksFile] = await Promise.all([
    getFile(env, SCORES_PATH, env.BASE_BRANCH),
    getFile(env, WEEKS_PATH, env.BASE_BRANCH),
  ]);
  const scoresCsv = parseCsv(scoresFile.content);
  const weeksCsv = parseCsv(weeksFile.content);
  const weeksMeta = weeksMetaMap(weeksCsv.records);

  let week, nine, date;
  let weeksChanged = false;
  let newWeeksRecords = weeksCsv.records;

  if (body.mode === 'existing') {
    week = body.week;
    const meta = weeksMeta.get(week);
    if (!meta) {
      return json(env, { ok: false, code: 'UNKNOWN_WEEK', error: 'That week is no longer registered — refresh the page and try again.' }, 409);
    }
    nine = meta.nine;
    date = meta.date;
  } else {
    week = nextWeekNumber(scoresCsv.records);
    if (weeksMeta.has(week)) {
      return json(env, { ok: false, code: 'RACE', error: 'A new week was just registered by someone else — refresh the page and try again.' }, 409);
    }
    nine = body.nine;
    date = body.date;
    newWeeksRecords = [...weeksCsv.records, { week: String(week), nine, date, note: (body.note || '').trim() }]
      .sort((a, b) => parseInt(a.week, 10) - parseInt(b.week, 10));
    weeksChanged = true;
  }

  const dupes = body.players.filter(p =>
    scoresCsv.records.some(r => parseInt(r.week, 10) === week && r.player.trim().toLowerCase() === p.name.trim().toLowerCase()));
  if (dupes.length) {
    return json(env, {
      ok: false, code: 'DUPLICATE_PLAYER_WEEK',
      error: `Already have a week ${week} score for: ${dupes.map(p => p.name).join(', ')}.`,
    }, 409);
  }

  const newRows = body.players.map(p => scoreRow(week, p.name.trim(), p.scores, p.notes));
  // append-only: preserves every existing byte (the file has mixed \r\n/\n
  // line endings from past manual edits — a full rewrite would normalize
  // them all and bury the real diff), matching build/add_week.py's write.
  const newScoresContent = appendRows(scoresFile.content, SCORES_FIELDS, newRows);

  const nineName = nine === 'B' ? 'Back 9' : 'Front 9';
  const branch = `submit/wk${week}-${date || 'nodate'}-${randomSuffix()}`;

  try {
    const baseSha = await getBranchSha(env, env.BASE_BRANCH);
    await createBranch(env, branch, baseSha);
    await putFile(env, SCORES_PATH, newScoresContent,
      `Add week ${week} scores for ${body.players.length} player(s) (${nineName})`, branch, scoresFile.sha);
    if (weeksChanged) {
      await putFile(env, WEEKS_PATH, stringifyCsv(WEEKS_FIELDS, newWeeksRecords),
        `Register week ${week} (${nineName}, ${date})`, branch, weeksFile.sha);
    }

    const table = [
      `| Player | ${Array.from({ length: 9 }, (_, i) => i + 1).join(' | ')} | Gross |`,
      `|---|${'---|'.repeat(9)}---|`,
      ...body.players.map(p => `| ${p.name} | ${p.scores.map(s => s || '—').join(' | ')} | ${grossOf(p.scores)} |`),
    ].join('\n');

    const prBody = [
      `Submitted via the round submission form${body.submittedBy ? ` by **${body.submittedBy}**` : ''}.`,
      '',
      `**Week:** ${week} (${nineName})   **Date:** ${date}   **Players:** ${body.players.length}`,
      '',
      table,
      body.note ? `\n**Note:** ${body.note}` : '',
      flaggedNote(body.flaggedCells),
      '',
      '---',
      '_Opened automatically by the round-submission Worker. Merging to `main` triggers the normal site rebuild/deploy._',
    ].join('\n');

    const pr = await createPullRequest(env, {
      title: `Round submission: Week ${week} (${nineName}) — ${date}`,
      body: prBody,
      head: branch,
      base: env.BASE_BRANCH,
    });
    return json(env, { ok: true, prUrl: pr.html_url, week, nine }, 201);
  } catch (e) {
    console.error(e);
    return json(env, {
      ok: false, code: 'GITHUB_ERROR',
      error: `Your scores were saved to branch "${branch}" but opening the pull request failed. Tell Travis to check that branch. (${e.message})`,
    }, 502);
  }
}

async function handleEdit(env, body) {
  const errs = validateEditPayload(body);
  if (errs.length) return json(env, { ok: false, code: 'VALIDATION_ERROR', error: errs[0], detail: { errors: errs } }, 400);

  const scoresFile = await getFile(env, SCORES_PATH, env.BASE_BRANCH);

  const updated = scoreRow(body.week, body.player.trim(), body.scores, body.notes);
  // line-level replace: only the matched row's bytes change, every other
  // line (and its original terminator) is left exactly as-is.
  const { text: newScoresContent, found, oldRecord: old } = replaceRow(
    scoresFile.content, SCORES_FIELDS,
    r => parseInt(r.week, 10) === body.week && r.player.trim().toLowerCase() === body.player.trim().toLowerCase(),
    updated,
  );
  if (!found) {
    return json(env, { ok: false, code: 'NOT_FOUND', error: `No week ${body.week} score found for ${body.player}.` }, 404);
  }
  const oldScores = Array.from({ length: 9 }, (_, i) => old[`h${i + 1}`] || '');

  const branch = `edit/wk${body.week}-${body.player.replace(/\s+/g, '').toLowerCase()}-${randomSuffix()}`;

  try {
    const baseSha = await getBranchSha(env, env.BASE_BRANCH);
    await createBranch(env, branch, baseSha);
    await putFile(env, SCORES_PATH, newScoresContent,
      `Correct week ${body.week} score for ${old.player}`, branch, scoresFile.sha);

    const changedHoles = body.scores
      .map((s, i) => ({ hole: i + 1, old: oldScores[i] || '—', next: s || '—' }))
      .filter(h => h.old !== h.next);
    const table = [
      '| Hole | Old | New |',
      '|---|---|---|',
      ...changedHoles.map(h => `| ${h.hole} | ${h.old} | ${h.next} |`),
    ].join('\n');

    const prBody = [
      `Score correction for **${old.player}**, week ${body.week}.`,
      body.reason ? `\n**Reason given:** ${body.reason}` : '',
      '',
      changedHoles.length ? table : '_No hole values changed — notes only._',
      flaggedNote(body.flaggedCells),
      '',
      '---',
      '_Opened automatically by the round-submission Worker. Merging to `main` triggers the normal site rebuild/deploy._',
    ].join('\n');

    const pr = await createPullRequest(env, {
      title: `Score correction: Week ${body.week} · ${old.player}`,
      body: prBody,
      head: branch,
      base: env.BASE_BRANCH,
    });
    return json(env, { ok: true, prUrl: pr.html_url }, 201);
  } catch (e) {
    console.error(e);
    return json(env, {
      ok: false, code: 'GITHUB_ERROR',
      error: `Your correction was saved to branch "${branch}" but opening the pull request failed. Tell Travis to check that branch. (${e.message})`,
    }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }
    if (request.method !== 'POST' || (url.pathname !== '/submit' && url.pathname !== '/edit')) {
      return json(env, { ok: false, code: 'NOT_FOUND', error: 'Unknown endpoint.' }, 404);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json(env, { ok: false, code: 'VALIDATION_ERROR', error: 'Malformed request body.' }, 400);
    }

    // Suspected bot: pretend it worked, touch nothing. Indistinguishable
    // from a real success on purpose, so bots get no signal to adapt to.
    if (isSuspectedBot(body)) {
      return json(env, { ok: true, prUrl: null }, 201);
    }

    if (!(await checkRateLimit(env, request))) {
      return json(env, { ok: false, code: 'RATE_LIMITED', error: 'Please wait a bit before submitting again.' }, 429);
    }

    try {
      return url.pathname === '/submit' ? await handleSubmit(env, body) : await handleEdit(env, body);
    } catch (e) {
      console.error(e);
      return json(env, { ok: false, code: 'GITHUB_ERROR', error: 'Something went wrong talking to GitHub. Please try again shortly.' }, 502);
    }
  },
};
