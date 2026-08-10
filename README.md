# ⛳ Golf League Site

A static website for a 9-hole golf league. You paste hole-by-hole scores from
your spreadsheet, a Python script does all the golf math, and a static site is
generated for the whole league to browse on their phones.

## How it works

`data/scores.csv` is the single source of truth — one row per player per week
(`week,date,nine,player,h1..h9`). `build/build.py` reads it plus
`data/course.csv` and writes `site/data.json`, which the static site renders.
Nothing on the site is edited by hand.

```
data/scores.csv ──► build/build.py (+ data/course.csv) ──► site/data.json ──► site
      ▲
      ├─ add_week.py       ← the usual weekly step (paste this week, append)
      └─ import_paste.py   ← bulk seed / add several players from a full sheet
```

## Add the current week (the usual step)

1. Open `data/this_week.txt` and paste this week's scores, one line per player:
   ```
   Travis Valdez: 5 4 6 4 3 5 3 4 5
   Brian Holland = 5,5,7,5,5,6,3,5,5
   Dana Kim 6 5 5 4 4 6 4 5 5
   ```
   Use `X` for a hole someone skipped. Week #, front/back, and date are filled
   in automatically (override with `week:` / `nine:` / `date:` lines if needed).
2. Run it (this appends to `scores.csv` **and** rebuilds the site):
   ```bash
   python3 build/add_week.py
   ```
3. Preview locally if you like (`cd site && python3 -m http.server` →
   http://localhost:8000), then publish:
   ```bash
   git add -A && git commit -m "Week N scores" && git push
   ```
   GitHub Actions redeploys automatically (~1 min).

## Add several players at once (or seed the season)

Paste your **whole** Google Sheet — all players, all weeks — into
`data/raw_paste.txt` (the double-week format: 18 score columns = front 9 then
back 9, player name on row 1 of each block, `X` for a missed nine), then:

```bash
python3 build/import_paste.py   # OVERWRITES scores.csv from the paste
python3 build/build.py          # rebuild
```

Use this when the sheet is your master. If instead you build week-by-week with
`add_week.py`, don't re-run the importer afterwards — it rebuilds `scores.csv`
from the paste and would drop weeks you appended. Pick one as your master.
You can also just hand-edit `data/scores.csv` (it's plain wide CSV) and run
`python3 build/update.py` to rebuild.

## Letting friends submit their own scores

`site/submit.html` and `site/edit.html` let anyone with the link — no
GitHub account needed — enter a round for their group, or correct a past
score, without touching `data/this_week.txt` yourself. Every submission
opens a **pull request** for you to review and merge; nothing goes live
until you approve it. This runs on a small Cloudflare Worker (`worker/`)
that needs a one-time setup — see `worker/README.md`.

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
