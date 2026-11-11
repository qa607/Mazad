import path from 'node:path';
import { expect, test } from '../support/fixtures';
import { assertStagingTarget, resolveUiRun, snapshotSettingsProblem } from '../support/ui-run';

const ROOT = path.resolve('/tmp/ui-selfcheck-root');

test.describe('Snapshot guard (selfcheck)', () => {
  test('check mode reads approved/ and never writes', () => {
    const run = resolveUiRun({ VISUAL_MODE: 'check', VISUAL_RUN_ID: 'run-1' }, ROOT);
    expect(run.snapshotDir).toBe(path.join(ROOT, 'visual-baselines', 'approved'));
    expect(run.updateSnapshots).toBe('none');
    const ok = { updateSnapshots: 'none', snapshotDir: run.snapshotDir, ignoreSnapshots: false };
    expect(snapshotSettingsProblem(run, ok)).toBeUndefined();
    for (const mode of ['all', 'changed', 'missing', 'default']) {
      expect(snapshotSettingsProblem(run, { ...ok, updateSnapshots: mode })).toMatch(
        /never writes/,
      );
    }
    expect(snapshotSettingsProblem(run, { ...ok, ignoreSnapshots: true })).toMatch(
      /ignoreSnapshots/,
    );
    expect(snapshotSettingsProblem(run, { ...ok, snapshotDir: '/elsewhere' })).toMatch(
      /snapshotDir/,
    );
  });

  test('capture writes only to its own candidates folder', () => {
    const run = resolveUiRun({ VISUAL_MODE: 'capture', VISUAL_RUN_ID: 'run-2' }, ROOT);
    expect(run.snapshotDir).toBe(path.join(ROOT, 'visual-baselines', 'candidates', 'run-2'));
    const ok = { updateSnapshots: 'all', snapshotDir: run.snapshotDir, ignoreSnapshots: false };
    expect(snapshotSettingsProblem(run, ok)).toBeUndefined();
    expect(snapshotSettingsProblem(run, { ...ok, updateSnapshots: 'missing' })).toMatch(/needs/);
    expect(
      snapshotSettingsProblem(
        { ...run, snapshotDir: run.approvedDir },
        {
          ...ok,
          snapshotDir: run.approvedDir,
        },
      ),
    ).toMatch(/only write inside/);
  });

  test('rejects bad modes, run ids and a noise run without a base', () => {
    expect(() => resolveUiRun({ VISUAL_MODE: 'update' }, ROOT)).toThrow(/VISUAL_MODE/);
    expect(() => resolveUiRun({ VISUAL_RUN_ID: '../approved' }, ROOT)).toThrow(/VISUAL_RUN_ID/);
    expect(() => resolveUiRun({ VISUAL_MODE: 'noise', VISUAL_RUN_ID: 'run-3' }, ROOT)).toThrow(
      /VISUAL_BASE_RUN/,
    );
  });

  test('the running worker passed the guard', () => {
    // This test runs only if the worker-scoped snapshot guard accepted the live settings.
    expect(test.info().config.updateSnapshots).toBe('none');
  });
});

test.describe('Staging target assertion (selfcheck)', () => {
  test('accepts only https://stg-mazad-v3-224.motory.dev', () => {
    expect(assertStagingTarget('https://stg-mazad-v3-224.motory.dev', 'stg-154')).toBe(
      'https://stg-mazad-v3-224.motory.dev',
    );
    expect(assertStagingTarget('https://stg-mazad-v3-224.motory.dev/en/')).toBe(
      'https://stg-mazad-v3-224.motory.dev',
    );
    for (const bad of [
      'https://mazad.motory.com',
      'https://motorymazad.com',
      'http://stg-mazad-v3-224.motory.dev',
      'https://stg-mazad-v3-224.motory.dev:8443',
      'https://stg-mazad-v3-224.motory.dev.evil.invalid',
      'https://www.stg-mazad-v3-224.motory.dev',
      'https://stg-mazad-v3-155.motory.dev',
      '',
      undefined,
    ]) {
      expect(() => assertStagingTarget(bad), String(bad)).toThrow(/Refusing to run/);
    }
  });

  test('refuses any TEST_ENV that is not an approved staging environment', () => {
    for (const env of ['prod', 'dev', 'production', '', 'staging', 'stg-155']) {
      expect(() => assertStagingTarget('https://stg-mazad-v3-224.motory.dev', env)).toThrow(
        /TEST_ENV/,
      );
    }
  });
});
