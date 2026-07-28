#!/usr/bin/env python3
"""
Convert a raw paste of the league spreadsheet into a clean long-format CSV.

The spreadsheet packs TWO weeks into every row (18 score columns):
  - columns 1-9  = the FRONT nine (course holes 1-9)  played one week
  - columns 10-18 = the BACK nine  (course holes 10-18) played the next week
So consecutive league weeks alternate nines.

Layout of each block:
  - The first line of a player's block has the player NAME in column 0.
  - The second line carries a "<date> - <N> HDC" note (still has real scores).
  - Following lines have an empty column 0 (still real scores).
  - 'X' means the player did not play that nine that week.
  - Any columns after the 18 scores (the two 9-hole totals) are ignored.

Output: data/scores_long.csv with columns: player,week,nine,hole,strokes
  week  = sequential 9-hole league week (1,2,3,...)
  nine  = 'F' or 'B'
  hole  = actual course hole (1-18)
"""
import csv
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RAW = os.path.join(ROOT, "data", "raw_paste.txt")
OUT = os.path.join(ROOT, "data", "scores_long.csv")
NOTES = os.path.join(ROOT, "data", "handicap_notes.csv")


def is_score(v):
    v = v.strip()
    return v.isdigit()


def main():
    if not os.path.exists(RAW):
        sys.exit(f"Missing {RAW}")

    with open(RAW, newline="") as f:
        lines = f.read().split("\n")

    rows = []            # (player, week, nine, hole, strokes)
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

        for i in range(9):
            hole = i + 1
            if is_score(scores[i]):
                rows.append((current, front_week, "F", hole, int(scores[i])))
        for i in range(9):
            hole = i + 10
            if is_score(scores[9 + i]):
                rows.append((current, back_week, "B", hole, int(scores[9 + i])))

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

    rows.sort(key=lambda r: (r[1], r[0], r[3]))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["player", "week", "nine", "hole", "strokes"])
        w.writerows(rows)

    with open(NOTES, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["player", "date", "reported_hdc"])
        w.writerows(notes)

    players = sorted({r[0] for r in rows})
    weeks = sorted({r[1] for r in rows})
    print(f"Imported {len(rows)} hole scores")
    print(f"  players: {len(players)} -> {', '.join(players)}")
    print(f"  weeks:   {len(weeks)} -> {weeks}")
    if warnings:
        print("Warnings:")
        for wmsg in warnings:
            print("  ! " + wmsg)


if __name__ == "__main__":
    main()
