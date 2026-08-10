# Round-submission Worker

A small Cloudflare Worker that lets `site/submit.html` and `site/edit.html`
open pull requests against this repo on behalf of friends who don't have
GitHub accounts. It never commits directly to `main` — every submission
becomes a PR for Travis to review and merge.

## One-time setup

1. **Create a free Cloudflare account** at https://dash.cloudflare.com/sign-up
   if you don't have one, then install Wrangler (Cloudflare's CLI):
   ```
   npm install -g wrangler
   wrangler login
   ```

2. **Create a fine-grained GitHub token** scoped to just this repo:
   - Go to https://github.com/settings/personal-access-tokens/new
   - Resource owner: `valdezt`
   - Repository access: "Only select repositories" → `dominion-golf-league`
   - Permissions: **Contents** → Read and write, **Pull requests** → Read and
     write (Metadata read-only is included automatically)
   - Generate the token and copy it — you won't see it again.

3. From this `worker/` directory, store the token as a Worker secret (it's
   never written to any file in this repo):
   ```
   cd worker
   wrangler secret put GITHUB_TOKEN
   ```
   Paste the token when prompted.

4. Check `wrangler.toml`'s `[vars]` block — `GITHUB_OWNER`/`GITHUB_REPO` are
   already set for this repo. Update `ALLOWED_ORIGIN` if the site ever moves
   off the default `https://valdezt.github.io` GitHub Pages URL (e.g. a
   custom domain).

5. Deploy:
   ```
   wrangler deploy
   ```
   This prints a URL like `https://dominion-golf-submit.<you>.workers.dev`.

6. Paste that URL into the `WORKER_URL` constant at the top of both
   `site/assets/submit.js` and `site/assets/edit.js`, then commit and push.
   This one line is the only thing connecting the static site to the Worker.

## Optional: rate limiting

Since the submission endpoint has no passphrase/login, a lightweight per-IP
throttle (~1 submission per 30s) is built in but only activates if a KV
namespace is bound:
```
wrangler kv namespace create RATE_LIMIT
```
Paste the returned `id` into the commented-out `[[kv_namespaces]]` block in
`wrangler.toml`, uncomment it, and redeploy. Skipping this step is fine —
the honeypot field and submit-timing check still catch naive bots, and
nothing reaches the live site without a reviewed, merged PR either way.

## Local testing

```
wrangler dev
```
Point `WORKER_URL` at the printed local address to test end-to-end before
deploying against the real repo. **Test against a disposable fork first** —
set `GITHUB_OWNER`/`GITHUB_REPO` in `wrangler.toml` to the fork while
testing, then switch back before the real deploy.

## What it does

- `POST /submit` — appends one or more players' scores for a chosen (or
  newly registered) week to `data/scores.csv` (and `data/weeks.csv` if the
  week is new), then opens a PR.
- `POST /edit` — replaces one existing `(week, player)` row in
  `data/scores.csv` with corrected values, then opens a PR showing the
  before/after diff.

Both routes re-fetch the live CSVs from GitHub on every request (never trust
a client-cached copy), reject duplicate `(week, player)` entries, and treat
a filled honeypot field or suspiciously fast submission as a bot — returning
a fake success without touching GitHub so bots get no useful signal back.
