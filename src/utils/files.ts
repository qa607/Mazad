import fs from 'node:fs';

/**
 * Reads a downloaded text file and deletes it at once. For exports holding personal data
 * (customer names, phones, emails), so the file never stays in test-results/ or a CI artifact.
 */
export function readTextAndDelete(file: string): string {
  try {
    return fs.readFileSync(file, 'utf8');
  } finally {
    fs.rmSync(file, { force: true });
  }
}
