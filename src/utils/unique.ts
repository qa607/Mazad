let counter = 0;

/**
 * A string of digits that differs between calls, runs and parallel workers: seconds from the
 * clock, then the worker index and a per-process counter. The seconds part repeats only after
 * 10^(length - 2) seconds (over a day for length 7). Minimum length 3.
 */
export function uniqueDigits(length: number): string {
  if (length < 3) throw new Error(`uniqueDigits needs a length of at least 3, got ${length}.`);
  counter = (counter + 1) % 10;
  const worker = Number(process.env.TEST_WORKER_INDEX ?? 0) % 10;
  const seconds = Math.floor(Date.now() / 1000).toString();
  return `${seconds.slice(-(length - 2)).padStart(length - 2, '0')}${worker}${counter}`;
}

/**
 * The same digits written as capital letters (0 → A … 9 → J), for fields that accept letters
 * only, so a unique stamp can still be read back: "4071" → "EAHB".
 */
export function digitsAsLetters(digits: string): string {
  if (!/^\d+$/.test(digits))
    throw new Error(`digitsAsLetters expects digits only, got "${digits}".`);
  return digits.replace(/\d/g, (d) => String.fromCharCode(65 + Number(d)));
}
