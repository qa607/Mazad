import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  appendLedgerEntry,
  CLAIM_FILE,
  HEAD_FILE,
  initializeLedger,
  LEDGER_FILE,
  LedgerError,
  type LockOwner,
  LOCK_FILE,
  ownerStatus,
  processStartTime,
  readLedger,
  RECOVERY_DOC,
} from '../../src/mobile/ios/account/otp-ledger';
import { expect, test } from '../support/fixtures';

/**
 * Offline tests for stale-lock recovery and the ledger's integrity anchor. Separate processes load
 * a copy of the ledger SOURCE; locks are forged in temporary folders. No device, Appium, staging,
 * .env, OTP or account action.
 */
const ROOT = path.resolve(__dirname, '..', '..');
const exec = promisify(execFile);
const lockPath = (dir: string) => path.join(dir, LOCK_FILE);
const claimPath = (dir: string) => path.join(dir, CLAIM_FILE);
const ledgerPath = (dir: string) => path.join(dir, LEDGER_FILE);
const headPath = (dir: string) => path.join(dir, HEAD_FILE);

const withDir = async <T>(fn: (dir: string) => T | Promise<T>): Promise<T> => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-lock-'));
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

const entry = (scenario: string) => ({
  runId: 'run-x',
  kind: 'otp-flow-chain',
  scenario,
  target: 'registered' as const,
  at: new Date(),
});

function childModule(dir: string): string {
  const copy = path.join(dir, 'otp-ledger.mts');
  fs.copyFileSync(path.join(ROOT, 'src/mobile/ios/account/otp-ledger.ts'), copy);
  return copy;
}
const runChild = async (script: string): Promise<string> =>
  (
    await exec(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
      timeout: 60_000,
    })
  ).stdout.trim();

/** A pid that no process has right now (a child that has exited). */
async function deadPid(): Promise<number> {
  const child = spawn(process.execPath, ['-e', '0'], { stdio: 'ignore' });
  const pid = child.pid as number;
  await new Promise((resolve) => child.once('exit', resolve));
  return pid;
}

const owner = (over: Partial<LockOwner>): LockOwner => ({
  v: 1,
  pid: process.pid,
  host: os.hostname(),
  token: 'forged-token',
  startedAt: new Date().toISOString(),
  procStart: processStartTime(process.pid),
  ...over,
});
const writeLock = (dir: string, value: LockOwner) =>
  fs.writeFileSync(lockPath(dir), JSON.stringify(value));

test.describe('iOS ledger lock ownership and stale-lock recovery (selfcheck)', () => {
  test.setTimeout(120_000);

  test('ownerStatus: alive for this process, dead only when proven, unknown otherwise', async () => {
    expect(ownerStatus(owner({}))).toBe('alive');
    expect(ownerStatus(owner({ pid: await deadPid(), procStart: 'whenever' }))).toBe('dead');
    expect(ownerStatus(owner({ host: 'some-other-host' }))).toBe('unknown');
    expect(ownerStatus(owner({ host: 'some-other-host', pid: await deadPid() }))).toBe('unknown');
    // The pid exists but the recorded start time is missing: a reused pid cannot be excluded.
    expect(ownerStatus(owner({ procStart: null }))).toBe('unknown');
    // The pid exists with a different start time: it was reused, so the owner is dead.
    expect(ownerStatus(owner({ procStart: 'Thu Jan  1 00:00:00 1970' }))).toBe('dead');
  });

  test('a lock left by a CRASHED worker (killed while holding it) is recovered, and the ledger stays valid', async () => {
    await withDir(async (dir) => {
      const mod = childModule(dir);
      initializeLedger(dir);
      appendLedgerEntry(dir, entry('before-crash'));
      const out = await runChild(`
        const m = await import(${JSON.stringify(mod)});
        m.acquireLedgerLock(${JSON.stringify(dir)}, 1000);
        console.log('LOCKED');
        process.kill(process.pid, 'SIGKILL');
      `).catch((error: { stdout?: string }) => String(error.stdout ?? '').trim());
      expect(out).toBe('LOCKED');
      const left = JSON.parse(fs.readFileSync(lockPath(dir), 'utf8')) as LockOwner;
      expect(ownerStatus(left)).toBe('dead');
      // The next append recovers the lock and goes on; nothing else is left behind.
      appendLedgerEntry(dir, entry('after-crash'));
      expect(readLedger(dir).map((e) => e.scenario)).toEqual(['before-crash', 'after-crash']);
      expect(fs.existsSync(lockPath(dir))).toBe(false);
      expect(fs.existsSync(claimPath(dir))).toBe(false);
    });
  });

  test('a lock held by a LIVE process is never removed, and is released by its owner afterwards', async () => {
    await withDir(async (dir) => {
      const mod = childModule(dir);
      initializeLedger(dir);
      const holder = spawn(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `const m = await import(${JSON.stringify(mod)});
           const release = m.acquireLedgerLock(${JSON.stringify(dir)}, 1000);
           console.log('LOCKED');
           Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3500);
           release(); console.log('RELEASED');`,
        ],
        { stdio: ['ignore', 'pipe', 'ignore'] },
      );
      let output = '';
      holder.stdout.on('data', (chunk: Buffer) => (output += String(chunk)));
      await new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          if (output.includes('LOCKED')) {
            clearInterval(timer);
            resolve();
          }
        }, 20);
      });
      const before = fs.readFileSync(lockPath(dir), 'utf8');
      expect(() => appendLedgerEntry(dir, { ...entry('blocked'), lockWaitMs: 600 })).toThrow(
        /locked by another running process/,
      );
      expect(fs.readFileSync(lockPath(dir), 'utf8')).toBe(before); // untouched
      await new Promise((resolve) => holder.once('exit', resolve));
      expect(output).toContain('RELEASED');
      expect(fs.existsSync(lockPath(dir))).toBe(false);
      appendLedgerEntry(dir, entry('after-release'));
      expect(readLedger(dir)).toHaveLength(1);
    });
  });

  test('PID reuse: a live pid with a different start time is another process, so the old lock is recovered', async () => {
    await withDir((dir) => {
      initializeLedger(dir);
      // This very process stands in for "the process that reused the pid".
      writeLock(dir, owner({ procStart: 'Thu Jan  1 00:00:00 1970', token: 'old-owner' }));
      appendLedgerEntry(dir, entry('after-pid-reuse'));
      expect(fs.existsSync(lockPath(dir))).toBe(false);
      expect(readLedger(dir)).toHaveLength(1);
    });
  });

  test('a live pid with the SAME start time is the owner: its lock is never removed', async () => {
    await withDir((dir) => {
      initializeLedger(dir);
      writeLock(dir, owner({ token: 'live-owner' }));
      const before = fs.readFileSync(lockPath(dir), 'utf8');
      expect(() => appendLedgerEntry(dir, { ...entry('x'), lockWaitMs: 300 })).toThrow(
        /locked by another running process/,
      );
      expect(fs.readFileSync(lockPath(dir), 'utf8')).toBe(before);
      expect(readLedger(dir)).toHaveLength(0);
    });
  });

  test('fail closed when death cannot be proven: another host, or no recorded start time', async () => {
    await withDir(async (dir) => {
      initializeLedger(dir);
      const dead = await deadPid();
      for (const forged of [
        owner({ host: 'another-host', pid: dead, procStart: 'x' }),
        owner({ procStart: null }), // a live pid whose start time was never recorded
      ]) {
        writeLock(dir, forged);
        const before = fs.readFileSync(lockPath(dir), 'utf8');
        let message = '';
        try {
          appendLedgerEntry(dir, { ...entry('x'), lockWaitMs: 300 });
        } catch (error) {
          message = (error as Error).message;
        }
        expect(message).toMatch(/cannot be verified/);
        expect(message).toContain(RECOVERY_DOC);
        expect(fs.readFileSync(lockPath(dir), 'utf8')).toBe(before);
      }
      expect(readLedger(dir)).toHaveLength(0);
    });
  });

  test('a malformed or incomplete lock file is never removed', async () => {
    await withDir((dir) => {
      initializeLedger(dir);
      for (const text of [
        '',
        '{',
        '[]',
        '{"v":2}',
        '{"v":1,"pid":"1","host":"h","token":"t","procStart":null}',
      ]) {
        fs.writeFileSync(lockPath(dir), text);
        expect(() => appendLedgerEntry(dir, { ...entry('x'), lockWaitMs: 200 }), text).toThrow(
          /unreadable or malformed/,
        );
        expect(fs.readFileSync(lockPath(dir), 'utf8'), text).toBe(text);
      }
    });
  });

  test('an interrupted recovery (claim left by a dead process) fails closed and removes nothing', async () => {
    await withDir(async (dir) => {
      initializeLedger(dir);
      const dead = await deadPid();
      writeLock(dir, owner({ pid: dead, procStart: 'x', token: 'dead-lock' }));
      fs.writeFileSync(
        claimPath(dir),
        JSON.stringify(owner({ pid: dead, procStart: 'x', token: 'dead-claim' })),
      );
      let message = '';
      try {
        appendLedgerEntry(dir, { ...entry('x'), lockWaitMs: 300 });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/lock recovery was interrupted/);
      expect(message).toContain(RECOVERY_DOC);
      expect(fs.existsSync(lockPath(dir))).toBe(true);
      expect(fs.existsSync(claimPath(dir))).toBe(true);
      expect(readLedger(dir)).toHaveLength(0);
    });
  });

  test('a recovery already in progress by a live process is waited for, then refused at the deadline', async () => {
    await withDir(async (dir) => {
      initializeLedger(dir);
      writeLock(dir, owner({ pid: await deadPid(), procStart: 'x', token: 'dead-lock' }));
      fs.writeFileSync(claimPath(dir), JSON.stringify(owner({ token: 'live-claim' })));
      expect(() => appendLedgerEntry(dir, { ...entry('x'), lockWaitMs: 300 })).toThrow(
        /could not be recovered in time/,
      );
      expect(fs.existsSync(lockPath(dir))).toBe(true); // the stale lock was not touched by the waiter
      expect(fs.readFileSync(claimPath(dir), 'utf8')).toContain('live-claim');
    });
  });

  test("recovery never removes a lock that is no longer the dead owner's: a fresh live lock survives", async () => {
    await withDir((dir) => {
      initializeLedger(dir);
      // A stale lock is replaced by a live one between the two reads: the live one must survive.
      writeLock(dir, owner({ token: 'live-after-recovery' }));
      expect(() => appendLedgerEntry(dir, { ...entry('x'), lockWaitMs: 250 })).toThrow(
        /running process/,
      );
      expect((JSON.parse(fs.readFileSync(lockPath(dir), 'utf8')) as LockOwner).token).toBe(
        'live-after-recovery',
      );
    });
  });

  test('CONCURRENT recovery: many workers find the same stale lock; exactly the allowed number get through', async () => {
    await withDir(async (dir) => {
      const mod = childModule(dir);
      initializeLedger(dir);
      writeLock(dir, owner({ pid: await deadPid(), procStart: 'x', token: 'crashed-worker' }));
      const startAt = Date.now() + 3_000;
      const WORKERS = 8;
      const ALLOWED = 3;
      const results = await Promise.all(
        Array.from({ length: WORKERS }, (_, i) =>
          runChild(`
            const m = await import(${JSON.stringify(mod)});
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.max(0, ${startAt} - Date.now()));
            try {
              m.appendLedgerEntry(${JSON.stringify(dir)}, {
                runId: 'run-recover', kind: 'otp-flow-chain', scenario: 'worker-${i}',
                target: 'registered', at: new Date(),
                check: (entries) => entries.length >= ${ALLOWED} ? 'limit reached' : undefined,
              });
              console.log('OK');
            } catch (error) { console.log('REFUSED: ' + error.message); }
          `),
        ),
      );
      expect(results.filter((r) => r === 'OK')).toHaveLength(ALLOWED);
      expect(results.filter((r) => r === 'REFUSED: limit reached')).toHaveLength(WORKERS - ALLOWED);
      expect(readLedger(dir).map((e) => e.seq)).toEqual([1, 2, 3]);
      expect(fs.existsSync(lockPath(dir))).toBe(false);
      expect(fs.existsSync(claimPath(dir))).toBe(false);
    });
  });
});

test.describe('iOS ledger integrity anchor and recovery instructions (selfcheck)', () => {
  const seed = (dir: string, count: number) => {
    initializeLedger(dir);
    for (let i = 1; i <= count; i++) appendLedgerEntry(dir, entry(`s-${i}`));
  };
  const lines = (dir: string) => fs.readFileSync(ledgerPath(dir), 'utf8').slice(0, -1).split('\n');

  test('truncation, replacement, restore and anchor damage are all detected', async () => {
    const cases: [string, (dir: string) => void, RegExp][] = [
      [
        'the last entry deleted (a valid, shorter chain)',
        (dir) => fs.writeFileSync(ledgerPath(dir), `${lines(dir).slice(0, -1).join('\n')}\n`),
        /entries were removed or the file was replaced/,
      ],
      [
        'all entries deleted (header only)',
        (dir) => fs.writeFileSync(ledgerPath(dir), `${lines(dir)[0]}\n`),
        /entries were removed or the file was replaced/,
      ],
      [
        'an older ledger and anchor pair restored over a newer anchor',
        (dir) =>
          fs.writeFileSync(headPath(dir), `${JSON.stringify({ seq: 1, hash: 'a'.repeat(64) })}\n`),
        /anchor/,
      ],
      ['the anchor deleted', (dir) => fs.rmSync(headPath(dir)), /integrity anchor file is missing/],
      [
        'the anchor garbled',
        (dir) => fs.writeFileSync(headPath(dir), 'junk'),
        /anchor is unreadable/,
      ],
      [
        'the anchor with an extra field',
        (dir) =>
          fs.writeFileSync(
            headPath(dir),
            `${JSON.stringify({ seq: 3, hash: 'a'.repeat(64), x: 1 })}\n`,
          ),
        /anchor is malformed/,
      ],
      [
        'the anchor with the wrong hash',
        (dir) =>
          fs.writeFileSync(headPath(dir), `${JSON.stringify({ seq: 3, hash: 'b'.repeat(64) })}\n`),
        /anchor does not match/,
      ],
      [
        'a sequence number manipulated in the last line',
        (dir) => {
          const l = lines(dir);
          l[l.length - 1] = l[l.length - 1].replace('"seq":3', '"seq":9');
          fs.writeFileSync(ledgerPath(dir), `${l.join('\n')}\n`);
        },
        /wrong sequence number/,
      ],
    ];
    for (const [name, damage, message] of cases) {
      await withDir((dir) => {
        seed(dir, 3);
        expect(() => readLedger(dir)).not.toThrow();
        damage(dir);
        let caught = '';
        try {
          readLedger(dir);
        } catch (error) {
          caught = (error as Error).message;
        }
        expect(caught, name).toMatch(message);
        expect(caught, name).toContain(RECOVERY_DOC);
        // Appending is refused too, and nothing is written or recreated.
        const before = fs.existsSync(ledgerPath(dir))
          ? fs.readFileSync(ledgerPath(dir), 'utf8')
          : null;
        expect(() => appendLedgerEntry(dir, entry('next')), name).toThrow(LedgerError);
        expect(
          fs.existsSync(ledgerPath(dir)) ? fs.readFileSync(ledgerPath(dir), 'utf8') : null,
          name,
        ).toBe(before);
        expect(fs.existsSync(lockPath(dir)), name).toBe(false);
      });
    }
  });

  test('a crash between the append and the anchor update is harmless and healed by the next append', async () => {
    await withDir((dir) => {
      seed(dir, 2);
      const anchorOfTwo = fs.readFileSync(headPath(dir), 'utf8');
      appendLedgerEntry(dir, entry('s-3'));
      fs.writeFileSync(headPath(dir), anchorOfTwo); // the anchor update never happened
      expect(readLedger(dir)).toHaveLength(3);
      appendLedgerEntry(dir, entry('s-4'));
      expect(readLedger(dir)).toHaveLength(4);
      expect((JSON.parse(fs.readFileSync(headPath(dir), 'utf8')) as { seq: number }).seq).toBe(4);
      // Two entries behind is not a crash gap: it is refused.
      fs.writeFileSync(headPath(dir), anchorOfTwo);
      expect(() => readLedger(dir)).toThrow(/anchor/);
    });
  });

  test('a damaged ledger is never silently recreated or re-initialized', async () => {
    await withDir((dir) => {
      seed(dir, 2);
      // Missing ledger with its anchor left: neither reading, appending nor init recreates it.
      fs.rmSync(ledgerPath(dir));
      expect(() => readLedger(dir)).toThrow(/missing/);
      expect(() => appendLedgerEntry(dir, entry('x'))).toThrow(/missing/);
      expect(() => initializeLedger(dir)).toThrow(/already exists/);
      expect(fs.existsSync(ledgerPath(dir))).toBe(false);
    });
    await withDir((dir) => {
      seed(dir, 1);
      fs.writeFileSync(ledgerPath(dir), 'garbage\n');
      expect(() => initializeLedger(dir)).toThrow(/already exists/);
      expect(fs.readFileSync(ledgerPath(dir), 'utf8')).toBe('garbage\n');
      // Anchor left but the ledger replaced by a fresh one of the same header: detected.
      fs.rmSync(ledgerPath(dir));
      fs.rmSync(headPath(dir));
      initializeLedger(dir);
      const freshAnchor = fs.readFileSync(headPath(dir), 'utf8');
      expect((JSON.parse(freshAnchor) as { seq: number }).seq).toBe(0);
    });
  });

  test('the recovery instructions exist and cover every failure the ledger reports', () => {
    const doc = fs.readFileSync(path.join(ROOT, RECOVERY_DOC), 'utf8');
    for (const topic of [
      'missing',
      'corrupted',
      'integrity anchor',
      'locked by another running process',
      'cannot be verified',
      'lock recovery was interrupted',
      'unreadable or malformed',
      'never recreated automatically',
      'ios:otp-ledger-init',
      'technical',
    ]) {
      expect(doc.toLowerCase(), topic).toContain(topic.toLowerCase());
    }
    // The ledger and the init script create both files, and the script writes the same header.
    const script = fs.readFileSync(path.join(ROOT, 'scripts/ios-otp-ledger-init.mjs'), 'utf8');
    expect(script).toContain(HEAD_FILE);
    expect(script).toContain('"wx"'.replace(/"/g, "'"));
  });
});
