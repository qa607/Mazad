import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { RecoveryJournal } from '../../src/mobile/ios/account/recovery-journal';
import { expect, test } from '../support/fixtures';

/**
 * The QA owner's journal tool (scripts/ios-journal.mjs) and its recovery document: it closes only a pending or
 * applied entry, with a name and a real note, and touches nothing else; nothing in the tests can call it.
 * Offline: a temporary journal folder, no device.
 */
const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'ios-journal.mjs');
const run = promisify(execFile);
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const tool = (dir: string, ...rest: string[]) =>
  run('node', [SCRIPT, ...rest, '--dir', dir]).then(
    (r) => ({ ok: true, out: r.stdout + r.stderr }),
    (e: { stdout?: string; stderr?: string }) => ({
      ok: false,
      out: `${e.stdout ?? ''}${e.stderr ?? ''}`,
    }),
  );

const withDir = async (fn: (dir: string, journal: RecoveryJournal) => Promise<void>) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-journal-tool-'));
  try {
    await fn(dir, new RecoveryJournal(dir));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

test.describe('iOS journal owner tool (selfcheck)', () => {
  test('list shows every entry without a password or a full phone, and counts the open ones', async () => {
    await withDir(async (dir, journal) => {
      expect((await tool(dir, 'list')).out).toContain('No journal entries.');
      journal.begin('run-tool-0001', '0*******67');
      journal.mark('run-tool-0001', 'applied');
      journal.mark('run-tool-0001', 'restored');
      const entry = journal.beginAttempts('run-tool-0002', '0*******67');
      expect(entry.state).toBe('pending');
      const listed = await tool(dir, 'list');
      expect(listed.ok).toBe(true);
      expect(listed.out).toContain('run-tool-0001');
      expect(listed.out).toContain('run-tool-0002-attempts-1');
      expect(listed.out).toContain('0*******67');
      expect(listed.out).toContain('1 open entry;');
    });
  });

  test('close moves a pending or applied entry to closed, naming who and why, owner-only file', async () => {
    await withDir(async (dir, journal) => {
      const close = (id: string) =>
        tool(dir, 'close', id, '--by', 'QA owner', '--note', 'verified the password');
      journal.begin('run-tool-0003', 'masked');
      const first = await close('run-tool-0003');
      expect(first.ok, first.out).toBe(true);
      expect(first.out).toContain('Closed run-tool-0003');
      const attempts = journal.beginAttempts('run-tool-0004', 'masked');
      journal.markAttempts(attempts.runId, 'applied', 'saved?');
      const second = await close(attempts.runId);
      expect(second.ok, second.out).toBe(true);
      expect(second.out).toContain(`Closed ${attempts.runId}`);
      const entries = journal.list().entries;
      expect(entries.every((e) => e.state === 'closed' && e.closedBy === 'QA owner')).toBe(true);
      expect(journal.problem()).toBeUndefined();
      expect(fs.statSync(path.join(dir, 'journal-run-tool-0003.json')).mode & 0o777).toBe(0o600);
      expect(fs.readdirSync(dir).filter((n) => n.endsWith('.tmp'))).toEqual([]);
    });
  });

  test('close refuses everything that is not a checked, named closing of an open entry', async () => {
    await withDir(async (dir, journal) => {
      journal.begin('run-tool-0005', 'masked');
      journal.mark('run-tool-0005', 'applied');
      journal.mark('run-tool-0005', 'restored');
      journal.begin('run-tool-0006', 'masked');
      const before = fs.readFileSync(path.join(dir, 'journal-run-tool-0006.json'), 'utf8');
      const cases: [string[], RegExp][] = [
        [
          ['close', 'run-tool-0005', '--by', 'QA owner', '--note', 'verified the password'],
          /is restored/,
        ],
        [['close', 'run-tool-0006', '--note', 'verified the password'], /--by/],
        [['close', 'run-tool-0006', '--by', 'QA owner'], /--note/],
        [['close', 'run-tool-0006', '--by', 'QA owner', '--note', 'ok'], /at least 10 characters/],
        [['close', 'run-tool-0006', '--by', 'X', '--note', 'verified the password'], /--by/],
        [
          ['close', 'no-such-entry', '--by', 'QA owner', '--note', 'verified the password'],
          /no journal entry/,
        ],
        [['close', '../escape', '--by', 'QA owner', '--note', 'verified the password'], /entry id/],
        [['close'], /entry id/],
        [['wipe'], /usage/],
      ];
      for (const [argv, message] of cases) {
        const result = await tool(dir, ...argv);
        expect(result.ok, argv.join(' ')).toBe(false);
        expect(result.out, argv.join(' ')).toMatch(message);
      }
      expect(fs.readFileSync(path.join(dir, 'journal-run-tool-0006.json'), 'utf8')).toBe(before);
      // An unreadable file stops every closing, and is left exactly as it was.
      fs.writeFileSync(path.join(dir, 'journal-broken.json'), '{ nope');
      const blocked = await tool(
        dir,
        'close',
        'run-tool-0006',
        '--by',
        'QA owner',
        '--note',
        'verified the password',
      );
      expect(blocked.ok).toBe(false);
      expect(blocked.out).toMatch(/unreadable/);
      expect(fs.readFileSync(path.join(dir, 'journal-broken.json'), 'utf8')).toBe('{ nope');
    });
  });

  test('nothing the tests run can close an entry: the tool and closeByOwner have no caller', () => {
    for (const dir of ['src', 'tests-ios', 'config', 'tests']) {
      const walk = (folder: string): string[] =>
        fs.readdirSync(path.join(ROOT, folder), { withFileTypes: true }).flatMap((d) => {
          const rel = path.join(folder, d.name);
          return d.isDirectory() ? walk(rel) : [rel];
        });
      for (const file of walk(dir).filter((f) => /\.(ts|mjs|js)$/.test(f))) {
        const code = stripComments(read(file));
        expect(code, file).not.toMatch(/ios-journal|ios:journal/);
        if (!file.endsWith('recovery-journal.ts'))
          expect(code, file).not.toContain('closeByOwner(');
      }
    }
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['ios:journal']).toBe('node scripts/ios-journal.mjs');
    // The tool never deletes: no unlink or rm in it.
    expect(stripComments(read('scripts/ios-journal.mjs'))).not.toMatch(/unlink|rmSync|rm\(|rmdir/);
  });

  test('the recovery procedure covers every state and every route, and forbids hand edits', () => {
    const doc = read('docs/ios-journal-recovery.md').toLowerCase();
    for (const topic of [
      'pending',
      'applied',
      'restored',
      '-late-signin',
      '-attempts-',
      'npm run ios:journal -- list',
      'npm run ios:journal -- close',
      'forgot password',
      'otp request',
      'one login',
      'never delete',
      'unreadable',
      'currentpasswordverified',
      'evidence of the baseline',
    ]) {
      expect(doc, topic).toContain(topic);
    }
  });
});
