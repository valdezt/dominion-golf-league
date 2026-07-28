# ⛳ Golf League Site

A static website for a 9-hole golf league. You paste hole-by-hole scores from
your spreadsheet, a Python script does all the golf math, and a static site is
generated for the whole league to browse on their phones.

## How it works

```
data/raw_paste.txt   ← you paste from Google Sheets each week
        │  build/import_paste.py
        ▼
data/scores_long.csv  (clean: one row per player/week/hole)
        │  build/build.py   +   data/course.csv (par + stroke index)
        ▼
site/data.json  →  site/index.html   (the site)
```

Nothing on the site is edited by hand — it's all computed from scores.

## Update it each week (3 steps)

1. **Paste** the current league grid into `data/raw_paste.txt`, replacing what's
   there. The format is exactly how it copies out of your sheet:
   - one row per player-week-pair (18 score columns = front 9 then back 9),
   - player name on the first row of each block, a `June 12 - 11 HDC` note on
     the second, `X` for a missed nine. Extra total columns are ignored.
2. **Build**:
   ```bash
   python3 build/update.py
   ```
   Optionally preview locally: `cd site && python3 -m http.server` → open
   http://localhost:8000
3. **Publish**:
   ```bash
   git add -A && git commit -m "Week N scores" && git push
   ```
   GitHub Actions rebuilds and redeploys automatically (~1 min).

## The math (all in `build/build.py`)

- **Handicap** = average of the best 5 nine-hole scores (relative to par) over
  the last 8 league weeks. Unrounded, updates weekly. Edit `WINDOW` / `BEST_N`
  at the top of `build.py` to change it.
- **Net** = gross − handicap − par (lower is better).
- **Ringer / Dinger** = best / worst score on each of the 18 holes all season.
- **Skins** = outright-lowest net on a hole, strokes allocated by stroke index.
- Plus hole difficulty, scoring distribution, consistency, per-player profiles.

## The course (`data/course.csv`)

Par + stroke index for all 18 holes. Weeks alternate nines (odd weeks = front,
even weeks = back). Edit this file if the course setup changes.

## Publishing on GitHub Pages (one-time setup)

1. Create a repo on GitHub and push this folder.
   - Repo named `<username>.github.io` → site at `https://<username>.github.io/`
   - Any other name → site at `https://<username>.github.io/<repo>/`
2. In the repo: **Settings → Pages → Build and deployment → Source = GitHub
   Actions**.
3. Push to `main`. The included workflow (`.github/workflows/deploy.yml`) builds
   and deploys. Share the link with the league.

## Customizing

- `site/assets/app.js` top: set `LEAGUE_NAME` and (optionally)
  `HIGHLIGHT_PLAYER` to highlight your own rows.
- Colors and theme live in `site/assets/styles.css`.
