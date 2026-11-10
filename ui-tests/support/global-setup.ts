import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { FullConfig } from '@playwright/test';
import {
  assertStagingTarget,
  resolveUiRun,
  SELFCHECK_HOST,
  snapshotSettingsProblem,
} from './ui-run';

const ROOT_DIR = path.resolve(__dirname, '..', '..');

/** Validates the run before any test starts and records non-secret run metadata. */
export default function globalSetup(config: FullConfig): void {
  const run = resolveUiRun(process.env, ROOT_DIR);

  // Target check, printed before any browser starts. Web projects: exactly the staging host.
  // Selfcheck projects: only the reserved placeholder host.
  for (const project of config.projects) {
    const baseURL = project.use.baseURL;
    if (project.name.startsWith('web-')) {
      assertStagingTarget(baseURL);
    } else if (project.name.startsWith('ios-')) {
      // Native app: no browser target; the iOS staging and network gates apply instead.
      continue;
    } else if (!baseURL || new URL(baseURL).host !== SELFCHECK_HOST) {
      throw new Error(`Refusing to run: project ${project.name} targets ${baseURL ?? 'nothing'}.`);
    }
  }
  const targets =
    [...new Set(config.projects.map((p) => p.use.baseURL).filter(Boolean))].join(', ') ||
    'native app (no browser target)';
  console.log(
    `[ui] TEST_ENV=${process.env.TEST_ENV ?? '(unset)'} | target: ${targets} | ` +
      `${config.projects.length} project(s) | mode=${run.mode} | run=${run.runId}`,
  );

  for (const project of config.projects) {
    const problem = snapshotSettingsProblem(run, {
      updateSnapshots: config.updateSnapshots,
      snapshotDir: project.snapshotDir,
      ignoreSnapshots: project.ignoreSnapshots,
    });
    if (problem) throw new Error(`Snapshot guard (${project.name}): ${problem}`);
  }

  if (run.mode === 'capture') {
    fs.mkdirSync(run.candidatesDir, { recursive: true });
    // Not recursive: fails if this run folder already exists, so a capture never reuses one.
    fs.mkdirSync(run.snapshotDir);
  }

  let gitHead = 'unknown';
  try {
    gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT_DIR }).toString().trim();
  } catch {
    // Not a git checkout; leave unknown.
  }
  const baseURL = config.projects[0]?.use.baseURL;
  fs.mkdirSync(run.reportDir, { recursive: true });
  fs.writeFileSync(
    path.join(run.reportDir, 'run-meta.json'),
    JSON.stringify(
      {
        mode: run.mode,
        suite: run.suite,
        runId: run.runId,
        baseRun: run.mode === 'noise' ? process.env.VISUAL_BASE_RUN : undefined,
        snapshotDir: path.relative(ROOT_DIR, run.snapshotDir),
        host: baseURL ? new URL(baseURL).host : undefined,
        projects: config.projects.map((p) => p.name),
        playwright: config.version,
        gitHead,
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}
