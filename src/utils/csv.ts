/**
 * Parses CSV text into records of fields. Handles double-quoted fields holding commas, escaped
 * quotes ("") and line breaks, so a record is not cut where a message has a new line. A leading
 * byte order mark (U+FEFF, added for Excel) is dropped. Empty lines are skipped.
 */
export function parseCsv(text: string): string[][] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      record.push(field);
      if (record.some((value) => value !== '')) records.push(record);
      record = [];
      field = '';
    } else {
      field += char;
    }
  }
  record.push(field);
  if (record.some((value) => value !== '')) records.push(record);
  return records;
}
