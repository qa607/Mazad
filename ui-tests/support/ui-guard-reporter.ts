import fs from 'node:fs';
import path from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { resolveUiRun } from './ui-run';

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const GUARDED = new Set(['ui-missing-baseline', 'ui-unexpected-request']);

/**
 * Fails the whole run when a baseline was missing or an unexpected request was blocked, even
 * if a test was marked test.fail(). Prints a short summary at the end.
 */
export default class UiGuardReporter implements Reporter {
  private readonly problems: string[] = [];

  printsToStdio(): boolean {
    return false;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    for (const a of [...test.annotations, ...result.annotations]) {
      if (GUARDED.has(a.type))
        this.problems.push(`${a.type}: ${test.title} — ${a.description ?? ''}`);
    }
  }

  onEnd(result: FullResult): Promise<{ status: FullResult['status'] } | undefined> {
    const run = resolveUiRun(process.env, ROOT_DIR);
    const halted = fs.existsSync(run.haltFile);
    const unique = [...new Set(this.problems)];
    if (!halted && !unique.length) return Promise.resolve(undefined);
    console.error('\n[ui-guard] The run is marked failed:');
    if (halted) console.error(`  halted: see ${path.relative(ROOT_DIR, run.haltFile)}`);
    for (const p of unique) console.error(`  ${p}`);
    return Promise.resolve({ status: result.status === 'interrupted' ? 'interrupted' : 'failed' });
  }
}
