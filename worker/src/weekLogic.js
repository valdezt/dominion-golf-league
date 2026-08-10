// Port of build/add_week.py's week-number resolution, used only for the
// "register a new week" path in /submit (normal entry uses a week the
// client already picked from a dropdown, so no guessing needed there).
// Keep this in sync with add_week.py's `main()` week-number block —
// see the comment there pointing back at this file.

export function maxPlayedWeek(scoresRecords) {
  let max = 0;
  for (const r of scoresRecords) {
    const w = parseInt(r.week, 10);
    if (!Number.isNaN(w) && w >= 1) max = Math.max(max, w);
  }
  return max;
}

export function nextWeekNumber(scoresRecords) {
  return maxPlayedWeek(scoresRecords) + 1;
}

export function weeksMetaMap(weeksRecords) {
  const map = new Map();
  for (const r of weeksRecords) {
    const w = parseInt(r.week, 10);
    if (!Number.isNaN(w)) {
      map.set(w, { nine: (r.nine || 'F').trim().toUpperCase().slice(0, 1) || 'F', date: r.date || '', note: r.note || '' });
    }
  }
  return map;
}
