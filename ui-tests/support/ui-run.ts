import fs from 'node:fs';
import path from 'node:path';
import { approvedOrigin, environmentFileNames } from '../../config/staging-environments';

export type VisualMode = 'check' | 'capture' | 'noise';
export type UiSuite = 'web' | 'selfcheck';
export type UpdateMode = 'none' | 'all';

export interface UiRun {
  mode: VisualMode;
  suite: UiSuite;
  runId: string;
  /** Where screenshots are read from (check, noise) or written to (capture). */
  snapshotDir: string;
  updateSnapshots: UpdateMode;
  /** Every report, trace and result of this run: reports/ui/<mode>-<runId>/ */
  reportDir: string;
  /** Written when an unexpected request is detected; every later test then fails. */
  haltFile: string;
  approvedDir: string;
  candidatesDir: string;
}

const RUN_ID = /^[a-z0-9][a-z0-9-]{2,63}$/;
const MODES: readonly VisualMode[] = ['check', 'capture', 'noise'];

export function approvedDirOf(rootDir: string): string {
  return path.join(rootDir, 'visual-baselines', 'approved');
}

export function candidatesDirOf(rootDir: string): string {
  return path.join(rootDir, 'visual-baselines', 'candidates');
}

/** Placeholder host of the selfcheck project (reserved TLD; never resolves). */
export const SELFCHECK_HOST = 'selfcheck.invalid';

/**
 * Refuses to run unless the target is exactly the origin of an approved staging environment
 * (config/environments/<id>.json: no other host, subdomain, port or scheme) and, when given,
 * TEST_ENV names that approved environment. Returns the origin.
 */
export function assertStagingTarget(url: string | undefined, envName?: string): string {
  let allowed: string[];
  if (envName !== undefined) {
    try {
      allowed = [approvedOrigin(envName)];
    } catch (error) {
      throw new Error(`Refusing to run: TEST_ENV "${envName}": ${(error as Error).message}`, {
        cause: error,
      });
    }
  } else {
    allowed = environmentFileNames().map((name) => approvedOrigin(name));
  }
  let parsed: URL;
  try {
    parsed = new URL(url ?? '');
  } catch {
    throw new Error('Refusing to run: the target baseURL is missing or invalid.');
  }
  if (parsed.protocol !== 'https:' || !allowed.includes(parsed.origin)) {
    throw new Error(
      `Refusing to run: target is ${parsed.protocol}//${parsed.host}, ` +
        `but the UI layer may only target ${allowed.join(', ')}.`,
    );
  }
  return parsed.origin;
}

/**
 * Resolves the run from environment variables only. On the first call (the runner) it stores a
 * generated run id in env, so the worker processes, which inherit env, resolve the same paths.
 */
export function resolveUiRun(env: NodeJS.ProcessEnv, rootDir: string): UiRun {
  const mode = (env.VISUAL_MODE || 'check') as VisualMode;
  if (!MODES.includes(mode)) {
    throw new Error(`VISUAL_MODE must be one of ${MODES.join(', ')}; got "${env.VISUAL_MODE}".`);
  }
  const suite = (env.UI_SUITE || 'web') as UiSuite;
  if (suite !== 'web' && suite !== 'selfcheck') {
    throw new Error(`UI_SUITE must be web or selfcheck; got "${env.UI_SUITE}".`);
  }

  if (!env.VISUAL_RUN_ID) {
    env.VISUAL_RUN_ID = new Date().toISOString().toLowerCase().replace(/[:.]/g, '-');
  }
  const runId = env.VISUAL_RUN_ID;
  if (!RUN_ID.test(runId)) {
    throw new Error(`VISUAL_RUN_ID "${runId}" must match ${RUN_ID}.`);
  }

  const approvedDir = approvedDirOf(rootDir);
  const candidatesDir = candidatesDirOf(rootDir);
  let snapshotDir: string;
  let updateSnapshots: UpdateMode;

  if (mode === 'check') {
    snapshotDir = approvedDir;
    updateSnapshots = 'none';
  } else if (mode === 'capture') {
    snapshotDir = path.join(candidatesDir, runId);
    updateSnapshots = 'all';
  } else {
    const base = env.VISUAL_BASE_RUN;
    if (!base || !RUN_ID.test(base)) {
      throw new Error('VISUAL_MODE=noise needs VISUAL_BASE_RUN, the id of an earlier capture run.');
    }
    snapshotDir = path.join(candidatesDir, base);
    if (!fs.existsSync(snapshotDir)) {
      throw new Error(`VISUAL_BASE_RUN folder not found: ${snapshotDir}`);
    }
    updateSnapshots = 'none';
  }

  const reportDir = path.join(rootDir, 'reports', 'ui', `${mode}-${runId}`);
  return {
    mode,
    suite,
    runId,
    snapshotDir,
    updateSnapshots,
    reportDir,
    haltFile: path.join(reportDir, 'HALT.json'),
    approvedDir,
    candidatesDir,
  };
}

/**
 * Returns a reason why snapshot settings are unsafe for this mode, or undefined when safe.
 * Catches -u / --update-snapshots, UI mode and editor runs, which change the update mode.
 */
export function snapshotSettingsProblem(
  run: Pick<UiRun, 'mode' | 'snapshotDir' | 'approvedDir' | 'candidatesDir'>,
  actual: { updateSnapshots: string; snapshotDir: string; ignoreSnapshots: boolean },
): string | undefined {
  if (actual.ignoreSnapshots) return 'ignoreSnapshots is on; comparisons would be skipped.';
  const dir = path.resolve(actual.snapshotDir);
  if (dir !== path.resolve(run.snapshotDir)) {
    return `snapshotDir is "${dir}", expected "${path.resolve(run.snapshotDir)}".`;
  }
  if (run.mode === 'capture') {
    if (actual.updateSnapshots !== 'all') {
      return `capture needs updateSnapshots "all"; got "${actual.updateSnapshots}".`;
    }
    const inside = path.relative(path.resolve(run.candidatesDir), dir);
    if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) {
      return `capture may only write inside ${run.candidatesDir}.`;
    }
    return undefined;
  }
  if (actual.updateSnapshots !== 'none') {
    return (
      `VISUAL_MODE=${run.mode} never writes snapshots, but updateSnapshots is ` +
      `"${actual.updateSnapshots}" (from -u/--update-snapshots, UI mode or an editor). ` +
      'Approved baselines are copied only with npm run ui:approve.'
    );
  }
  return undefined;
}
