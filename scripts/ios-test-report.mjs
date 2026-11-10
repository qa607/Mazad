#!/usr/bin/env node
/* global process, console */
/**
 * Offline iOS test report by typed category (docs/ios-automation-readiness-review.md, section 7).
 * Runs `playwright test --list` (nothing executes: no device, Appium, staging or account) and
 * counts the declared tests by their `category` annotation (src/utils/test-category.ts).
 *
 *   node scripts/ios-test-report.mjs                  declared tests by category
 *   node scripts/ios-test-report.mjs --results FILE   also counts Passed/Failed from a Playwright
 *                                                     JSON report of a real run (never inferred)
 *
 * "Passed" and "Failed" come ONLY from a results file. Without one they are reported as
 * "not measured here", and the tests that would run are shown as "runnable". The recorded device
 * baseline (20 passed, 0 failed, 48 skipped) is a historical fact in docs/ios-execution-report.md.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const CATEGORIES = [
  'excluded',
  'fixme',
  'pending-implementation',
  'policy-blocked',
  'authorization-blocked',
];
const args = process.argv.slice(2);
const resultsIndex = args.indexOf('--results');
const resultsFile = resultsIndex >= 0 ? args[resultsIndex + 1] : undefined;

function walk(suite, titles, out) {
  // The suite's own title counts too: tests declared directly in a language describe carry it.
  const here = [...titles, suite.title];
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      out.push({
        title: [...here, spec.title].join(' > '),
        language: here.some((t) => t.includes('(ar)')) ? 'ar' : 'en',
        annotations: test.annotations ?? [],
        results: test.results ?? [],
        status: test.status,
      });
    }
  }
  for (const child of suite.suites ?? []) walk(child, here, out);
}

function readTests() {
  const json = resultsFile
    ? fs.readFileSync(resultsFile, 'utf8')
    : execFileSync(
        'npx',
        [
          'playwright',
          'test',
          '-c',
          'playwright.ios.config.ts',
          '--list',
          '--project=ios',
          '--reporter=json',
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 },
      );
  const tests = [];
  for (const suite of JSON.parse(json).suites) walk(suite, [], tests);
  return tests;
}

export function classify(test) {
  const primary = test.annotations.find((a) => a.type === 'category');
  const name = primary?.description.split(':')[0];
  const also = test.annotations
    .filter((a) => a.type === 'also')
    .map((a) => a.description.split(':')[0]);
  if (CATEGORIES.includes(name)) return { category: name, also };
  const outcome = test.results.at(-1)?.status;
  if (resultsFile && outcome === 'passed') return { category: 'passed', also };
  if (resultsFile && (outcome === 'failed' || outcome === 'timedOut')) {
    return { category: 'failed', also };
  }
  return { category: resultsFile ? 'not-run' : 'runnable', also };
}

const tests = readTests();
const rows = { en: {}, ar: {} };
const alsoCounts = {};
for (const test of tests) {
  const { category, also } = classify(test);
  rows[test.language][category] = (rows[test.language][category] ?? 0) + 1;
  for (const tag of also) alsoCounts[tag] = (alsoCounts[tag] ?? 0) + 1;
}

const order = resultsFile
  ? ['passed', 'failed', ...CATEGORIES, 'not-run']
  : ['runnable', ...CATEGORIES];
console.log(
  `iOS tests declared: ${tests.length}${resultsFile ? ' (from results)' : ' (listing only)'}`,
);
console.log('category'.padEnd(26), 'en'.padStart(4), 'ar'.padStart(4), 'total'.padStart(6));
let sum = 0;
for (const category of order) {
  const en = rows.en[category] ?? 0;
  const ar = rows.ar[category] ?? 0;
  sum += en + ar;
  console.log(
    category.padEnd(26),
    String(en).padStart(4),
    String(ar).padStart(4),
    String(en + ar).padStart(6),
  );
}
if (!resultsFile)
  console.log('passed / failed'.padEnd(26), 'not measured here (needs a real run and --results)');
console.log(`sum of categories: ${sum} ${sum === tests.length ? '(= declared)' : '(MISMATCH)'}`);
console.log('secondary blockers (a test can carry several):');
for (const [tag, count] of Object.entries(alsoCounts).sort())
  console.log(' ', tag.padEnd(24), count);
process.exitCode = sum === tests.length ? 0 : 1;
