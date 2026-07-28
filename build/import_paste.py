#!/usr/bin/env python3
"""
BULK IMPORT: convert a full paste of the league spreadsheet into data/scores.csv.

Use this to seed the season or to add several players at once. It OVERWRITES
data/scores.csv, so the paste in data/raw_paste.txt must contain everyone you
want in the site. For adding just the current week, use add_week.py instead.

The spreadsheet packs TWO weeks into every row (18 score columns):
  - columns 1-9  = the FRONT nine (course holes 1-9)  played one week
  - columns 10-18 = the BACK nine  (course holes 10-18) played the next week
So consecutive league weeks alternate nines.

Layout of each player block:
  - The first line has the player NAME in column 0.
  - The second line carries a "<date> - <N> HDC" note (still has real scores).
  - Following lines have an empty column 0 (still real scores).
  - 'X' means the player did not play that nine that week.
  - Any columns after the 18 scores (the two 9-hole totals) are ignored.
  - Every player's block must start on the same week grid (row 1 = weeks 1&2).

Output: data/scores.csv  (wide: week,date,nine,player,h1..h9)
"""
import csv
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RAW = os.path.join(ROOT, "data", "raw_paste.txt")
OUT = os.path.join(ROOT, "data", "scores.csv")
NOTES = os.path.join(ROOT, "data", "handicap_notes.csv")


def is_score(v):
    v = v.strip()
    return v.isdigit()


def main():
    if not os.path.exists(RAW):
        sys.exit(f"Missing {RAW}")

    with open(RAW, newline="") as f:
        lines = f.read().split("\n")

    wide = {}            # (player, week) -> {"nine": F/B, "scores": [9 values]}
    notes = []           # (player, date, reported_hdc)
    warnings = []

    current = None
    row_index = 0

    for raw_line in lines:
        # Don't strip the whole line: leading tab (empty col0) is meaningful.
        if raw_line.strip() == "":
            # a truly blank line still advances the physical week grid
            if current is not None:
                row_index += 1
            continue

        fields = raw_line.split("\t")
        col0 = fields[0].strip()

        is_name = bool(col0) and "HDC" not in col0.upper()

        if is_name:
            current = col0
            row_index = 0
        else:
            if current is None:
                continue  # data before any player name; skip
            row_index += 1

        # Capture the handicap snapshot note for reference (not used in math).
        if "HDC" in col0.upper():
            m = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*HDC", col0, re.IGNORECASE)
            date = re.sub(r"[-–]\s*[0-9.]+\s*HDC.*$", "", col0, flags=re.IGNORECASE).strip()
            if m:
                notes.append((current, date, m.group(1)))

        # Pad the 18 score columns.
        scores = fields[1:19]
        scores += [""] * (18 - len(scores))

        front_week = 2 * row_index + 1
        back_week = 2 * row_index + 2

        def clean(vals, week, label):
            out = []
            for j, v in enumerate(vals):
                vs = v.strip()
                if vs == "" or vs.upper() in ("X", "-"):
                    out.append("")
                elif vs.isdigit():
                    out.append(vs)
                else:
                    warnings.append(
                        f"{current}, week {week} ({label} hole {j + 1}): "
                        f"'{v}' isn't a whole number — dropped, please fix in the sheet"
                    )
                    out.append("")
            return out

        front = clean(scores[0:9], front_week, "front")
        back = clean(scores[9:18], back_week, "back")
        if any(front):
            wide[(current, front_week)] = {"nine": "F", "scores": front}
        if any(back):
            wide[(current, back_week)] = {"nine": "B", "scores": back}

        # Optional sanity check against the two total columns, if present.
        for nine_slice, total_idx, label in ((scores[0:9], 19, "front"), (scores[9:18], 20, "back")):
            if total_idx < len(fields) and fields[total_idx].strip().isdigit():
                reported = int(fields[total_idx].strip())
                calc = sum(int(v) for v in nine_slice if is_score(v))
                if reported not in (0, calc):
                    warnings.append(
                        f"{current} week grid row {row_index}: {label} total {reported} "
                        f"!= sum of holes {calc}"
                    )

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["week", "date", "nine", "player"] + [f"h{i}" for i in range(1, 10)])
        for (player, week) in sorted(wide, key=lambda k: (k[1], k[0])):
            rec = wide[(player, week)]
            w.writerow([week, "", rec["nine"], player] + rec["scores"])

    with open(NOTES, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["player", "date", "reported_hdc"])
        w.writerows(notes)

    players = sorted({p for (p, _) in wide})
    weeks = sorted({w for (_, w) in wide})
    print(f"Imported {len(wide)} player-weeks -> data/scores.csv")
    print(f"  players: {len(players)} -> {', '.join(players)}")
    print(f"  weeks:   {len(weeks)} -> {weeks}")
    if warnings:
        print("Warnings:")
        for wmsg in warnings:
            print("  ! " + wmsg)


if __name__ == "__main__":
    main()
