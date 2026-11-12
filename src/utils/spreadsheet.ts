import fs from 'node:fs';
import * as XLSX from '@e965/xlsx';

/** The first sheet of a spreadsheet file, as rows of text. */
export interface SpreadsheetContent {
  sheetNames: string[];
  /** Every row of the first sheet, header row first. Empty cells are empty strings. */
  rows: string[][];
}

/**
 * Reads a legacy Excel (.xls) or Excel 2007+ (.xlsx) file. Parsing lives only here, so the rest
 * of the suite never depends on the spreadsheet library. Dates and numbers are read as the text
 * Excel displays them.
 */
export function readSpreadsheet(file: string): SpreadsheetContent {
  const workbook = XLSX.read(fs.readFileSync(file), { type: 'buffer' });
  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) return { sheetNames, rows: [] };
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetNames[0]], {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  });
  return {
    sheetNames,
    rows: rows.map((row) =>
      row.map((cell) => (typeof cell === 'string' ? cell : String(cell as number)).trim()),
    ),
  };
}

/** First bytes of a file: `PK` for XLSX (a zip), `D0 CF 11 E0` for legacy XLS. */
export function fileSignature(file: string): string {
  const head = Buffer.alloc(4);
  const fd = fs.openSync(file, 'r');
  try {
    fs.readSync(fd, head, 0, 4, 0);
  } finally {
    fs.closeSync(fd);
  }
  return head.toString('hex');
}

export const signature = { xlsx: '504b0304', xls: 'd0cf11e0' } as const;
