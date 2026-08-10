// CSV helpers tuned for clean PR diffs against files that already have
// mixed line endings (data/scores.csv has both \r\n and bare \n rows from
// past manual edits). We deliberately avoid "parse the whole file, then
// re-stringify the whole file" for any write — that would normalize every
// line's terminator and turn a one-row change into a file-wide diff.
// Instead: appends are byte-preserving (only new bytes are added, exactly
// like build/add_week.py's append-mode write), and single-row edits touch
// only that row's line, leaving every other byte untouched.

function parseLine(line) {
  // quote-aware split of a single physical line (no embedded newlines —
  // true for every field in this dataset: player names, digits, short notes)
  const fields = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; continue; }
        inQuotes = false; continue;
      }
      field += c; continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { fields.push(field); field = ''; continue; }
    field += c;
  }
  fields.push(field);
  return fields;
}

function quoteField(v) {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function stringifyRow(header, record) {
  return header.map(h => quoteField(record[h])).join(',');
}

export function stringifyCsv(header, records) {
  const lines = [header.map(quoteField).join(',')];
  for (const rec of records) lines.push(stringifyRow(header, rec));
  return lines.join('\r\n') + '\r\n';
}

// Splits raw text into {raw, term} lines, preserving each line's own
// terminator ('\r\n', '\n', or '' for a final line with none).
function splitLines(text) {
  const lines = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      const crlf = text[i - 1] === '\r';
      lines.push({ raw: text.slice(start, crlf ? i - 1 : i), term: crlf ? '\r\n' : '\n' });
      start = i + 1;
    }
  }
  if (start < text.length) lines.push({ raw: text.slice(start), term: '' });
  return lines;
}

// Full read for lookups (duplicate checks, next-week-number, week metadata).
// Fine to lose exact byte layout here — nothing here is written back as-is.
export function parseCsv(text) {
  const lines = splitLines(text).filter(l => l.raw !== '');
  if (!lines.length) return { header: [], records: [] };
  const header = parseLine(lines[0].raw);
  const records = lines.slice(1).map(l => {
    const fields = parseLine(l.raw);
    const rec = {};
    header.forEach((h, i) => { rec[h] = fields[i] !== undefined ? fields[i] : ''; });
    return rec;
  });
  return { header, records };
}

// Byte-preserving append: existing content is untouched except for a
// trailing newline added if missing (matches add_week.py's needs_newline
// check), then new rows are written with a fresh \r\n each — same as a
// Python csv.writer in append mode. Produces a minimal, single-hunk diff.
export function appendRows(existingText, header, newRecords) {
  const needsNewline = existingText.length > 0 && !/\n$/.test(existingText);
  const appended = newRecords.map(r => stringifyRow(header, r)).join('\r\n') + '\r\n';
  return existingText + (needsNewline ? '\n' : '') + appended;
}

// Replaces exactly one data line (the first whose parsed fields satisfy
// matchFn) with a freshly stringified record, preserving every other line's
// original bytes and terminator untouched. Returns { text, found, oldRecord }.
export function replaceRow(existingText, header, matchFn, newRecord) {
  const lines = splitLines(existingText);
  if (!lines.length) return { text: existingText, found: false, oldRecord: null };
  let found = false, oldRecord = null;
  const out = lines.map((line, i) => {
    if (i === 0 || found || line.raw === '') return line.raw + line.term;
    const fields = parseLine(line.raw);
    const rec = {};
    header.forEach((h, idx) => { rec[h] = fields[idx] !== undefined ? fields[idx] : ''; });
    if (!matchFn(rec)) return line.raw + line.term;
    found = true;
    oldRecord = rec;
    const term = line.term || '\r\n';
    return stringifyRow(header, newRecord) + term;
  });
  return { text: out.join(''), found, oldRecord };
}
