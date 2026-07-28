#!/usr/bin/env python3
"""
WEEKLY ADD: append the current week's 9-hole scores to data/scores.csv.

Paste the week into data/this_week.txt (one line per player), then run:
    python3 build/add_week.py

It auto-fills the week number (next after the latest), the nine (alternating
F/B from last week), and the date (today) unless you override them in the file.
On success it rebuilds the site and resets this_week.txt for next time
(archiving what you entered under data/weeks_log/).
"""
import csv
import os
import re
import subprocess
import sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SCORES = os.path.join(ROOT, "data", "scores.csv")
INPUT = os.path.join(ROOT, "data", "this_week.txt")
LOGDIR = os.path.join(ROOT, "data", "weeks_log")
FIELDS = ["week", "date", "nine", "player"] + [f"h{i}" for i in range(1, 10)]

TEMPLATE = """# Paste this week's 9-hole scores below — one line per player — then run:
#     python3 build/add_week.py
#
# Any of these line formats work:
#     Travis Valdez: 5 4 6 4 3 5 3 4 5
#     Brian Holland = 5,5,7,5,5,6,3,5,5
#     Dana Kim 6 5 5 4 4 6 4 5 5
# Use X for a hole a player skipped. Lines starting with # are ignored.
#
# Optional overrides (otherwise: next week #, alternating nine, today's date):
#     week: 11
#     nine: F
#     date: 2026-07-22
#
# --- scores below this line ---
"""


def die(msg):
    sys.exit("add_week: " + msg)


def norm_score(tok):
    t = tok.strip().upper()
    if t in ("", "X", "-"):
        return ""
    if t.isdigit():
        return t
    die(f"'{tok}' is not a valid score (use a number, or X for a skipped hole).")


def parse_player_line(line):
    if ":" in line:
        name, rest = line.split(":", 1)
    elif "=" in line:
        name, rest = line.split("=", 1)
    elif "\t" in line:
        parts = line.split("\t")
        name, rest = parts[0], " ".join(parts[1:])
    else:
        toks = line.split()
        idx = next((i for i, t in enumerate(toks)
                    if re.fullmatch(r"[0-9]+|[xX]|-", t)), len(toks))
        name, rest = " ".join(toks[:idx]), " ".join(toks[idx:])
    scores = [norm_score(t) for t in re.split(r"[\s,]+", rest.strip()) if t != ""]
    return name.strip(), scores


def load_existing():
    if not os.path.exists(SCORES):
        return [], set(), {}
    with open(SCORES, newline="") as f:
        rows = list(csv.DictReader(f))
    have = {(int(r["week"]), r["player"].strip()) for r in rows if r.get("week", "").strip()}
    last_nine = {}
    for r in rows:
        if r.get("week", "").strip():
            last_nine[int(r["week"])] = (r.get("nine") or "F").strip().upper()[:1]
    return rows, have, last_nine


def main():
    if not os.path.exists(INPUT):
        die(f"missing {INPUT}")
    with open(INPUT) as f:
        raw = f.read()

    override, players = {}, []
    for line in raw.splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        m = re.match(r"(?i)^(week|nine|date)\s*[:=]\s*(.+)$", s)
        if m:
            override[m.group(1).lower()] = m.group(2).strip()
            continue
        name, scores = parse_player_line(s)
        if not name:
            die(f"couldn't read a player name from: {line!r}")
        if len(scores) > 9:
            die(f"{name}: got {len(scores)} scores, expected 9.")
        if len(scores) < 9:
            print(f"  ! {name}: only {len(scores)} scores — padding the rest blank.")
            scores += [""] * (9 - len(scores))
        players.append((name, scores))

    if not players:
        die("no player score lines found in this_week.txt.")

    rows, have, last_nine = load_existing()

    # week
    if "week" in override:
        week = int(override["week"])
    else:
        week = (max((w for (w, _) in have), default=0) + 1)
    # nine
    if "nine" in override:
        nine = "F" if override["nine"].strip().upper().startswith("F") else "B"
    else:
        prev = last_nine.get(week - 1)
        nine = "B" if prev == "F" else "F" if prev == "B" else "F"
    # date
    wdate = override.get("date", date.today().isoformat())

    new_rows, skipped = [], []
    for name, scores in players:
        if (week, name) in have:
            skipped.append(name)
            continue
        new_rows.append([week, wdate, nine, name] + scores)

    if not new_rows:
        die(f"every player already has week {week} in scores.csv — nothing to add. "
            f"(Set a different 'week:' to correct an existing week.)")

    write_header = not os.path.exists(SCORES)
    with open(SCORES, "a", newline="") as f:
        w = csv.writer(f)
        if write_header:
            w.writerow(FIELDS)
        w.writerows(new_rows)

    # archive what was entered, then reset the input file
    os.makedirs(LOGDIR, exist_ok=True)
    with open(os.path.join(LOGDIR, f"week{week:02d}_{nine}.txt"), "w") as f:
        f.write(raw)
    with open(INPUT, "w") as f:
        f.write(TEMPLATE)

    print(f"Added week {week} ({'Front' if nine == 'F' else 'Back'} 9, {wdate}): "
          f"{len(new_rows)} players -> data/scores.csv")
    for r in new_rows:
        print(f"    {r[3]}: {' '.join(str(x) for x in r[4:])}")
    if skipped:
        print(f"  ! already had week {week}, skipped: {', '.join(skipped)}")

    print("\nRebuilding site…", flush=True)
    r = subprocess.run([sys.executable, os.path.join(HERE, "build.py")])
    if r.returncode == 0:
        print("Done. Review site/ locally, then commit & push to publish.")
    sys.exit(r.returncode)


if __name__ == "__main__":
    main()
