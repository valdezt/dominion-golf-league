#!/usr/bin/env python3
"""
Stat engine for the golf league site.

Reads:  data/course.csv, data/scores_long.csv
Writes: site/data.json   (everything the front-end needs, pre-computed)

Handicap rule (per Travis):
  A "round" is a 9-hole week. Handicap = average of the best 5 (lowest)
  nine-hole scores relative to par, among the last 8 league weeks
  (whether the player showed up or not). Not rounded.
  Net = gross - handicap - par.
All handicap logic lives in `handicap()` so it's a one-stop edit.
"""
import csv
import json
import os
import statistics
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
COURSE_CSV = os.path.join(ROOT, "data", "course.csv")
SCORES_CSV = os.path.join(ROOT, "data", "scores.csv")
WEEKS_CSV = os.path.join(ROOT, "data", "weeks.csv")
OUT = os.path.join(ROOT, "site", "data.json")

WINDOW = 8       # look back this many league weeks
BEST_N = 5       # average the best N rounds within the window


def load_course():
    holes = {}
    with open(COURSE_CSV, newline="") as f:
        for r in csv.DictReader(f):
            holes[int(r["hole"])] = {
                "par": int(r["par"]),
                "si": int(r["stroke_index"]),
            }
    return holes


def load_week_meta():
    """week -> {nine, date, note} map (data/weeks.csv). Authoritative for nine & date."""
    meta = {}
    if os.path.exists(WEEKS_CSV):
        with open(WEEKS_CSV, newline="") as f:
            for r in csv.DictReader(f):
                if r.get("week", "").strip():
                    meta[int(r["week"])] = {
                        "nine": (r.get("nine") or "F").strip().upper()[:1] or "F",
                        "date": (r.get("date") or "").strip(),
                        "note": (r.get("note") or "").strip(),
                    }
    return meta


def load_rounds(course, week_nine):
    """Read scores.csv (week,player,h1..h9,notes) -> rounds by (player, week).

    The nine (F/B) comes from weeks.csv per week; holes map to real course holes
    (F -> 1-9, B -> 10-18). Rounds with week < 1 are "banked" play-ahead rounds
    not yet assigned to a league week (-1 = front, -2 = back) and are excluded.
    """
    rounds = {}
    with open(SCORES_CSV, newline="") as f:
        for r in csv.DictReader(f):
            player = r["player"].strip()
            if not player or not r.get("week", "").strip():
                continue
            week = int(r["week"])
            if week < 1:
                continue  # banked / not-yet-used round
            nine = week_nine.get(week, "F")
            base = 0 if nine == "F" else 9
            key = (player, week)
            rd = rounds.setdefault(key, {
                "player": player, "week": week, "nine": nine,
                "notes": (r.get("notes") or "").strip(), "holes": {},
            })
            if (r.get("notes") or "").strip():
                rd["notes"] = (r.get("notes") or "").strip()
            for i in range(1, 10):
                v = (r.get(f"h{i}") or "").strip()
                if v != "":
                    rd["holes"][base + i] = int(v)
    rounds = {k: rd for k, rd in rounds.items() if rd["holes"]}
    for rd in rounds.values():  # totals from the final hole set (dup-safe)
        rd["gross"] = sum(rd["holes"].values())
        rd["par"] = sum(course[h]["par"] for h in rd["holes"])
        rd["to_par"] = rd["gross"] - rd["par"]
    return rounds


def rnd(x, n=2):
    return None if x is None else round(x, n)


def sgn(x):
    if x is None:
        return "–"
    return f"+{x}" if x > 0 else f"{x}"


def build():
    course = load_course()
    week_meta = load_week_meta()
    week_nine = {w: m["nine"] for w, m in week_meta.items()}
    rounds = load_rounds(course, week_nine)

    players = sorted({p for (p, _) in rounds})
    league_weeks = sorted({w for (_, w) in rounds})
    nine_par = sum(course[h]["par"] for h in range(1, 10))  # both nines = 35 here

    # every week registered in weeks.csv, played or not (front-end submission
    # form needs this to offer a pre-registered-but-not-yet-played week)
    registered_weeks = [
        {"week": w, "nine": m["nine"], "date": m["date"], "note": m["note"]}
        for w, m in sorted(week_meta.items())
    ]

    def handicap(player, upto_week, inclusive=True):
        """Best-5-of-last-8 handicap as of a given week."""
        window = [w for w in league_weeks if (w <= upto_week if inclusive else w < upto_week)][-WINDOW:]
        tps = [rounds[(player, w)]["to_par"] for w in window if (player, w) in rounds]
        if not tps:
            return None
        best = sorted(tps)[:BEST_N]
        return sum(best) / len(best)

    # ---- weekly results (gross / net, handicap entering the week) ----
    weeks = []
    for w in league_weeks:
        nine = next((rd["nine"] for (p, ww), rd in rounds.items() if ww == w), "F")
        wmeta = week_meta.get(w, {})
        wdate = wmeta.get("date") or next(
            (rd["date"] for (p, ww), rd in rounds.items() if ww == w and rd["date"]), "")
        wnote = wmeta.get("note", "")
        holes_played = sorted(
            {h for (p, ww), rd in rounds.items() if ww == w for h in rd["holes"]}
        )
        results = []
        for p in players:
            rd = rounds.get((p, w))
            if not rd:
                continue
            hdc = handicap(p, w, inclusive=False)
            if hdc is None:
                hdc = handicap(p, w, inclusive=True)
            net = rd["gross"] - (hdc or 0) - rd["par"]
            results.append({
                "player": p, "gross": rd["gross"], "to_par": rd["to_par"],
                "par": rd["par"], "handicap": rnd(hdc), "net": rnd(net),
                "notes": rd.get("notes", ""),
                "holes": {str(h): rd["holes"].get(h) for h in holes_played},
            })
        results.sort(key=lambda r: (r["net"] if r["net"] is not None else 1e9))
        weeks.append({
            "week": w, "nine": nine, "date": wdate, "note": wnote, "holes": holes_played,
            "par": sum(course[h]["par"] for h in holes_played),
            "results": results,
            "winner": results[0]["player"] if results else None,
        })

    # ---- handicap trend + current/starting per player ----
    handicaps = {}
    for p in players:
        pweeks = [w for w in league_weeks if (p, w) in rounds]
        trend = [{"week": w, "handicap": rnd(handicap(p, w))} for w in pweeks]
        current = trend[-1]["handicap"] if trend else None
        starting = trend[0]["handicap"] if trend else None
        handicaps[p] = {
            "current": current, "starting": starting,
            "delta": rnd((current - starting) if (current is not None and starting is not None) else None),
            "trend": trend,
        }

    # ---- ringer (best) & dinger (worst) boards ----
    ringer, dinger = {}, {}
    for p in players:
        best, worst = {}, {}
        for (pp, w), rd in rounds.items():
            if pp != p:
                continue
            for h, s in rd["holes"].items():
                best[h] = min(best.get(h, 99), s)
                worst[h] = max(worst.get(h, 0), s)
        ringer[p] = {
            "holes": {str(h): best[h] for h in best},
            "total": sum(best.values()),
            "par": sum(course[h]["par"] for h in best),
            "holes_played": len(best),
        }
        dinger[p] = {
            "holes": {str(h): worst[h] for h in worst},
            "total": sum(worst.values()),
            "par": sum(course[h]["par"] for h in worst),
            "holes_played": len(worst),
        }
    # league dream / nightmare card (best & worst anyone made on each hole)
    league_ringer, league_dinger = {}, {}
    for h in range(1, 19):
        vals = [rd["holes"][h] for rd in rounds.values() if h in rd["holes"]]
        if vals:
            league_ringer[str(h)] = min(vals)
            league_dinger[str(h)] = max(vals)

    # ---- scoring distribution (per hole vs par) ----
    def bucket(diff):
        if diff <= -2: return "eagle"
        if diff == -1: return "birdie"
        if diff == 0: return "par"
        if diff == 1: return "bogey"
        if diff == 2: return "double"
        return "triple_plus"

    order = ["eagle", "birdie", "par", "bogey", "double", "triple_plus"]
    distribution = {}
    for p in players:
        counts = {k: 0 for k in order}
        total = 0
        for (pp, w), rd in rounds.items():
            if pp != p:
                continue
            for h, s in rd["holes"].items():
                counts[bucket(s - course[h]["par"])] += 1
                total += 1
        distribution[p] = {"counts": counts, "holes": total,
                           "birdies_or_better": counts["eagle"] + counts["birdie"]}

    # ---- hole difficulty (league-wide avg over par) ----
    hole_difficulty = []
    for h in range(1, 19):
        vals = [rd["holes"][h] for rd in rounds.values() if h in rd["holes"]]
        if vals:
            hole_difficulty.append({
                "hole": h, "par": course[h]["par"], "si": course[h]["si"],
                "avg": rnd(statistics.mean(vals)),
                "over_par": rnd(statistics.mean(vals) - course[h]["par"]),
                "plays": len(vals),
            })
    hole_difficulty.sort(key=lambda x: x["over_par"], reverse=True)

    # ---- consistency (stdev of weekly to-par) ----
    consistency = []
    for p in players:
        tps = [rd["to_par"] for (pp, w), rd in rounds.items() if pp == p]
        if len(tps) >= 2:
            consistency.append({"player": p, "std": rnd(statistics.pstdev(tps)),
                                "rounds": len(tps)})
    consistency.sort(key=lambda x: x["std"])

    # ---- skins (net-per-hole, allocated by stroke index) ----
    def strokes_received(hole_sis, hdc):
        """Allocate a nine-hole handicap across the week's holes by SI."""
        h = max(0, round(hdc or 0))
        full, rem = divmod(h, 9)
        by_hard = sorted(hole_sis, key=lambda hs: hs[1])  # SI asc = hardest first
        recv = {hole: full for hole, si in hole_sis}
        for i in range(rem):
            recv[by_hard[i][0]] += 1
        return recv

    skins = {p: 0 for p in players}
    skins_log = []
    for wk in weeks:
        present = [r for r in wk["results"]]
        if len(present) < 2:
            continue
        holes = wk["holes"]
        hole_sis = [(h, course[h]["si"]) for h in holes]
        recv_by_player = {
            r["player"]: strokes_received(hole_sis, r["handicap"]) for r in present
        }
        for h in holes:
            nets = []
            for r in present:
                gross_h = rounds[(r["player"], wk["week"])]["holes"].get(h)
                if gross_h is None:
                    continue
                nets.append((r["player"], gross_h - recv_by_player[r["player"]][h]))
            if not nets:
                continue
            low = min(n for _, n in nets)
            winners = [p for p, n in nets if n == low]
            if len(winners) == 1:
                skins[winners[0]] += 1
                skins_log.append({"week": wk["week"], "hole": h, "player": winners[0]})

    # ---- streaks, splits, nemesis (chronological hole-by-hole) ----
    def player_sequence(p):
        seq = []
        for w in league_weeks:
            rd = rounds.get((p, w))
            if not rd:
                continue
            for h in sorted(rd["holes"]):
                seq.append((w, h, rd["holes"][h], course[h]["par"]))
        return seq

    streaks, splits, favorites = {}, {}, {}
    for p in players:
        seq = player_sequence(p)
        diffs = [s - par for (_, _, s, par) in seq]
        # longest par-or-better (a.k.a. bogey-free) run
        best = cur = 0
        for d in diffs:
            cur = cur + 1 if d <= 0 else 0
            best = max(best, cur)
        # current trailing streak
        curstreak = 0
        for d in reversed(diffs):
            if d <= 0:
                curstreak += 1
            else:
                break
        # bounce-back: after a double+ (>=2 over), is the next hole par-or-better?
        bb_tot = bb_good = 0
        for i in range(len(diffs) - 1):
            if diffs[i] >= 2:
                bb_tot += 1
                if diffs[i + 1] <= 0:
                    bb_good += 1
        streaks[p] = {
            "par_or_better": best, "current": curstreak,
            "bounce_back_pct": round(bb_good / bb_tot * 100) if bb_tot else None,
            "bounce_back_n": bb_tot,
            "clean_holes": sum(1 for d in diffs if d <= 0), "total_holes": len(diffs),
        }

        def avg_over(pred):
            vals = [s - par for (w, h, s, par) in seq if pred(w, h, par)]
            return rnd(sum(vals) / len(vals)) if vals else None
        splits[p] = {
            "par3": avg_over(lambda w, h, par: par == 3),
            "par4": avg_over(lambda w, h, par: par == 4),
            "par5": avg_over(lambda w, h, par: par == 5),
            "front": avg_over(lambda w, h, par: h <= 9),
            "back": avg_over(lambda w, h, par: h >= 10),
        }

        per_hole = {}
        for (w, h, s, par) in seq:
            per_hole.setdefault(h, []).append(s - par)
        hole_over = {h: sum(v) / len(v) for h, v in per_hole.items()}
        if hole_over:
            nem = max(hole_over.items(), key=lambda kv: kv[1])
            fav = min(hole_over.items(), key=lambda kv: kv[1])
            favorites[p] = {
                "nemesis": {"hole": nem[0], "over": rnd(nem[1]), "par": course[nem[0]]["par"]},
                "favorite": {"hole": fav[0], "over": rnd(fav[1]), "par": course[fav[0]]["par"]},
            }

    # ---- league heatmap (avg strokes over par per player/hole) ----
    heatmap = {"players": players, "holes": list(range(1, 19)), "values": {}}
    for p in players:
        per_hole = {}
        for (pp, w), rd in rounds.items():
            if pp != p:
                continue
            for h, s in rd["holes"].items():
                per_hole.setdefault(h, []).append(s - course[h]["par"])
        heatmap["values"][p] = {str(h): rnd(sum(v) / len(v)) for h, v in per_hole.items()}

    # ---- auto weekly awards ----
    awards = []
    for wk in weeks:
        res = wk["results"]
        if not res:
            continue
        a = {"week": wk["week"]}
        a["round"] = {"player": res[0]["player"], "net": res[0]["net"], "gross": res[0]["gross"]}
        worst = None
        for r in res:
            for h in wk["holes"]:
                s = r["holes"].get(str(h))
                if s is None:
                    continue
                over = s - course[h]["par"]
                if worst is None or over > worst["over"]:
                    worst = {"player": r["player"], "hole": h, "strokes": s, "over": over}
        a["blowup"] = worst
        best_imp = None
        for r in res:
            p = r["player"]
            prevw = [x for x in league_weeks if x < wk["week"] and (p, x) in rounds]
            if not prevw:
                continue
            curh, prevh = handicap(p, wk["week"]), handicap(p, prevw[-1])
            if curh is None or prevh is None:
                continue
            d = curh - prevh
            if best_imp is None or d < best_imp["delta"]:
                best_imp = {"player": p, "delta": rnd(d)}
        a["improved"] = best_imp
        awards.append(a)

    # ---- standings: average of each player's best N net rounds ----
    STANDINGS_BEST = 5     # count this many of a player's lowest net rounds
    MIN_QUALIFY = 5        # rounds needed to appear in the ranked table
    standings = []
    for p in players:
        pnets = sorted(r["net"] for wk in weeks for r in wk["results"]
                       if r["player"] == p and r["net"] is not None)
        best = pnets[:STANDINGS_BEST]
        wins = sum(1 for wk in weeks if wk["winner"] == p)
        standings.append({
            "player": p, "rounds": len(pnets),
            "best5_net": rnd(statistics.mean(best)) if best else None,
            "best5_count": len(best),
            "qualified": len(pnets) >= MIN_QUALIFY,
            "weekly_wins": wins,
            "avg_net": rnd(statistics.mean(pnets)) if pnets else None,
            "total_net": rnd(sum(pnets)) if pnets else None,
            "skins": skins[p],
            "handicap": handicaps[p]["current"],
        })
    # qualified players first, then by best-5 net average (lower is better)
    standings.sort(key=lambda s: (
        0 if s["qualified"] else 1,
        s["best5_net"] if s["best5_net"] is not None else 1e9,
    ))

    # ---- per-player profiles ----
    profiles = {}
    for p in players:
        series = []
        for wk in weeks:
            r = next((x for x in wk["results"] if x["player"] == p), None)
            if r:
                series.append({"week": wk["week"], "nine": wk["nine"],
                               "gross": r["gross"], "to_par": r["to_par"],
                               "net": r["net"], "handicap": r["handicap"]})
        best = min(series, key=lambda s: s["to_par"]) if series else None
        worst = max(series, key=lambda s: s["to_par"]) if series else None
        # per-hole scoring average for this player
        hole_avg = {}
        for h in range(1, 19):
            vals = [rd["holes"][h] for (pp, w), rd in rounds.items()
                    if pp == p and h in rd["holes"]]
            if vals:
                hole_avg[str(h)] = rnd(statistics.mean(vals))
        profiles[p] = {
            "rounds": len(series),
            "handicap": handicaps[p],
            "best_round": best, "worst_round": worst,
            "series": series,
            "distribution": distribution[p],
            "ringer": ringer[p], "dinger": dinger[p],
            "skins": skins[p],
            "hole_avg": hole_avg,
            "avg_gross": rnd(statistics.mean([s["gross"] for s in series])) if series else None,
            "birdies_or_better": distribution[p]["birdies_or_better"],
        }

    # ---- player DNA (radar fingerprint), normalized 0-100 vs the field ----
    MIN_DNA_ROUNDS = 4
    cons_std = {c["player"]: c["std"] for c in consistency}
    dna_defs = [("Par 3s", lambda p: splits[p]["par3"]),
                ("Par 4s", lambda p: splits[p]["par4"]),
                ("Par 5s", lambda p: splits[p]["par5"]),
                ("Front 9", lambda p: splits[p]["front"]),
                ("Back 9", lambda p: splits[p]["back"]),
                ("Consistency", lambda p: cons_std.get(p))]
    qualified = [p for p in players if profiles[p]["rounds"] >= MIN_DNA_ROUNDS]
    ranges = []
    for _, fn in dna_defs:
        vals = [fn(p) for p in qualified if fn(p) is not None]
        ranges.append((min(vals), max(vals)) if vals else (None, None))

    def dna_score(raw, rng):  # all metrics: lower (over par / stdev) is better
        if raw is None or rng[0] is None:
            return None
        mn, mx = rng
        if mx == mn:
            return 50.0
        return round(max(0.0, min(100.0, (mx - raw) / (mx - mn) * 100)), 1)

    dna = {}
    for p in players:
        axes = []
        for (label, fn), rng in zip(dna_defs, ranges):
            raw = fn(p)
            axes.append({"label": label, "raw": rnd(raw), "score": dna_score(raw, rng)})
        dna[p] = {"axes": axes, "qualified": profiles[p]["rounds"] >= MIN_DNA_ROUNDS}
    dna_league = []
    for i, (label, _) in enumerate(dna_defs):
        sc = [dna[p]["axes"][i]["score"] for p in qualified if dna[p]["axes"][i]["score"] is not None]
        dna_league.append({"label": label, "score": rnd(statistics.mean(sc)) if sc else None})

    # ---- trophy case (achievements) ----
    aces, eagles, snowmen = {}, {}, {}
    for (p, w), rd in rounds.items():
        for h, s in rd["holes"].items():
            par = course[h]["par"]
            if s == 1 and par == 3:
                aces.setdefault(p, f"hole {h}, wk {w}")
            if s - par <= -2:
                eagles.setdefault(p, f"{s} on hole {h} (wk {w})")
            if s >= 8:
                snowmen[p] = f"{s} on hole {h} (wk {w})"
    best_net_round = {}
    for wk in weeks:
        for r in wk["results"]:
            if r["net"] is None:
                continue
            cur = best_net_round.get(r["player"])
            if cur is None or r["net"] < cur[0]:
                best_net_round[r["player"]] = (r["net"], wk["week"])

    badge_defs = []

    def add_badge(bid, emoji, name, desc, holders):
        badge_defs.append({
            "id": bid, "emoji": emoji, "name": name, "desc": desc,
            "holders": [{"player": p, "detail": d} for p, d in sorted(holders.items())],
        })

    add_badge("ace", "🕳️", "Hole-in-One", "Aced a par 3", aces)
    add_badge("eagle", "🦅", "Eagle", "2+ under par on a hole", eagles)
    add_badge("sub40", "🎯", "Sub-40", "Broke 40 for nine holes",
              {p: f"{pr['best_round']['gross']} (wk {pr['best_round']['week']})"
               for p, pr in profiles.items()
               if pr["best_round"] and pr["best_round"]["gross"] < 40})
    add_badge("birdie_hunter", "🐦", "Birdie Hunter", "5+ birdies or better",
              {p: f"{distribution[p]['birdies_or_better']} birdies+" for p in players
               if distribution[p]["birdies_or_better"] >= 5})
    add_badge("winner", "🏆", "Weekly Winner", "Won a week on net",
              {s["player"]: f"{s['weekly_wins']} win(s)" for s in standings if s["weekly_wins"] >= 1})
    add_badge("skins", "💰", "Skins Baron", "Won 5+ skins",
              {p: f"{skins[p]} skins" for p in players if skins[p] >= 5})
    add_badge("sandbagger", "🎣", "Sandbagger", "Beat handicap by 5+ in a round",
              {p: f"net {sgn(v[0])} (wk {v[1]})" for p, v in best_net_round.items() if v[0] <= -5})
    add_badge("comeback", "📉", "Comeback", "Cut handicap by 3+ strokes",
              {p: sgn(handicaps[p]["delta"]) for p in players
               if handicaps[p]["delta"] is not None and handicaps[p]["delta"] <= -3})
    add_badge("reliable", "🧊", "Mr. Reliable", "Std dev ≤ 2.5 (4+ rounds)",
              {c["player"]: f"±{c['std']}" for c in consistency
               if c["std"] <= 2.5 and c["rounds"] >= 4})
    add_badge("onfire", "🔥", "On Fire", "Par-or-better streak of 4+",
              {p: f"{streaks[p]['par_or_better']} holes" for p in players
               if streaks[p]["par_or_better"] >= 4})
    add_badge("bounceback", "🪃", "Bounce-Back King", "40%+ bounce-back (5+ chances)",
              {p: f"{streaks[p]['bounce_back_pct']}%" for p in players
               if streaks[p]["bounce_back_pct"] is not None
               and streaks[p]["bounce_back_pct"] >= 40 and streaks[p]["bounce_back_n"] >= 5})
    add_badge("par5", "🦏", "Par-5 Slayer", "At or under par on par 5s (4+ rounds)",
              {p: sgn(splits[p]["par5"]) for p in players
               if splits[p]["par5"] is not None and splits[p]["par5"] <= 0
               and profiles[p]["rounds"] >= 4})
    add_badge("dreamcard", "💎", "Dream Card", "Ringer round 5+ under par",
              {p: sgn(ringer[p]["total"] - ringer[p]["par"]) for p in players
               if ringer[p]["par"] and ringer[p]["total"] - ringer[p]["par"] <= -5})
    add_badge("veteran", "🎖️", "Veteran", "Played 10+ rounds",
              {p: f"{profiles[p]['rounds']} rounds" for p in players if profiles[p]["rounds"] >= 10})
    add_badge("ironman", "🧱", "Iron Man", "Perfect attendance",
              {p: f"{profiles[p]['rounds']}/{len(league_weeks)}" for p in players
               if profiles[p]["rounds"] == len(league_weeks)})
    add_badge("snowman", "💀", "Snowman", "Carded an 8 or worse on a hole", snowmen)

    trophy_by_player = {}
    for b in badge_defs:
        for hd in b["holders"]:
            trophy_by_player.setdefault(hd["player"], []).append(b["id"])
    trophies = {
        "badges": badge_defs,
        "by_player": trophy_by_player,
        "counts": {p: len(v) for p, v in trophy_by_player.items()},
    }

    # ---- fun records ----
    all_results = [(wk["week"], r) for wk in weeks for r in wk["results"]]
    records = {}
    if all_results:
        lr = min(all_results, key=lambda x: x[1]["to_par"])
        records["low_gross"] = {"player": lr[1]["player"], "week": lr[0],
                                "gross": lr[1]["gross"], "to_par": lr[1]["to_par"]}
        ln = min(all_results, key=lambda x: (x[1]["net"] if x[1]["net"] is not None else 1e9))
        records["low_net"] = {"player": ln[1]["player"], "week": ln[0], "net": ln[1]["net"]}
    if distribution:
        top_bird = max(distribution.items(), key=lambda kv: kv[1]["birdies_or_better"])
        records["most_birdies"] = {"player": top_bird[0],
                                   "count": top_bird[1]["birdies_or_better"]}
    if consistency:
        records["most_consistent"] = consistency[0]
    if standings and standings[0]["skins"] is not None:
        sk = max(standings, key=lambda s: s["skins"])
        records["skins_leader"] = {"player": sk["player"], "skins": sk["skins"]}
    sb_cands = [s for s in standings if s["avg_net"] is not None]
    if sb_cands:
        sb = min(sb_cands, key=lambda s: s["avg_net"])
        if sb["avg_net"] < -0.5:  # consistently beats their own handicap
            records["sandbagger"] = {"player": sb["player"], "avg_net": sb["avg_net"]}
    long_streak = max(players, key=lambda p: streaks[p]["par_or_better"]) if players else None
    if long_streak:
        records["longest_streak"] = {"player": long_streak,
                                     "holes": streaks[long_streak]["par_or_better"]}

    data = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
            "players": players, "num_weeks": len(league_weeks),
            "league_weeks": league_weeks, "nine_par": nine_par,
            "window": WINDOW, "best_n": BEST_N,
            "registered_weeks": registered_weeks,
        },
        "course": {str(h): course[h] for h in course},
        "weeks": weeks,
        "handicaps": handicaps,
        "ringer": ringer, "dinger": dinger,
        "league_ringer": league_ringer, "league_dinger": league_dinger,
        "distribution": distribution, "distribution_order": order,
        "hole_difficulty": hole_difficulty,
        "consistency": consistency,
        "skins": skins, "skins_log": skins_log,
        "standings": standings,
        "profiles": profiles,
        "records": records,
        "streaks": streaks, "splits": splits, "favorites": favorites,
        "heatmap": heatmap, "awards": awards,
        "dna": dna, "dna_league": dna_league,
        "trophies": trophies,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(data, f, indent=2)

    print(f"Wrote {OUT}")
    print(f"  {len(players)} players, {len(league_weeks)} weeks")
    for p in players:
        print(f"  {p}: hdc {handicaps[p]['current']}, "
              f"skins {skins[p]}, ringer {ringer[p]['total']}")


if __name__ == "__main__":
    build()
