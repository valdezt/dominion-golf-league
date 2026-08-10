// Thin wrapper around the bits of the GitHub REST API this Worker needs:
// read a file, create a branch, write a file to that branch, open a PR.

const API = 'https://api.github.com';

function repoPath(env) {
  return `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;
}

async function gh(env, path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'dominion-golf-submit-worker',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(`GitHub API ${opts.method || 'GET'} ${path} -> ${res.status}: ${detail}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

// base64 helpers that are safe for UTF-8 content (plain atob/btoa aren't)
function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin);
}
function fromBase64(b64) {
  const bin = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export async function getFile(env, path, ref) {
  const data = await gh(env, `${repoPath(env)}/contents/${path}?ref=${encodeURIComponent(ref)}`);
  return { content: fromBase64(data.content), sha: data.sha };
}

export async function getBranchSha(env, branch) {
  const data = await gh(env, `${repoPath(env)}/git/ref/heads/${encodeURIComponent(branch)}`);
  return data.object.sha;
}

export async function createBranch(env, newBranch, fromSha) {
  await gh(env, `${repoPath(env)}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha: fromSha }),
  });
}

export async function putFile(env, path, content, message, branch, sha) {
  return gh(env, `${repoPath(env)}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({
      message, content: toBase64(content), branch,
      ...(sha ? { sha } : {}),
    }),
  });
}

export async function createPullRequest(env, { title, body, head, base }) {
  return gh(env, `${repoPath(env)}/pulls`, {
    method: 'POST',
    body: JSON.stringify({ title, body, head, base }),
  });
}
