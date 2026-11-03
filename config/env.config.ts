import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import type { EnvConfig } from '../src/types';

// Read before dotenv so production can only be unlocked per run, never from a .env file.
const allowProduction = process.env.ALLOW_PRODUCTION === 'true';

dotenv.config({ quiet: true });

const ENVIRONMENTS_DIR = path.resolve(__dirname, 'environments');
const DEFAULT_ENV = 'dev';
const PRODUCTION_ENV = 'prod';

function availableEnvironments(): string[] {
  return fs
    .readdirSync(ENVIRONMENTS_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => path.basename(file, '.json'));
}

function readEnvFile(name: string): Partial<EnvConfig> {
  const file = path.join(ENVIRONMENTS_DIR, `${name}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(
      `Unknown TEST_ENV "${name}". Available environments: ${availableEnvironments().join(', ')}.`,
    );
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<EnvConfig>;
}

function productionBlockedError(reason: string): Error {
  return new Error(
    `Refusing to run against production: ${reason}. ` +
      'To run intentionally, pass ALLOW_PRODUCTION=true on the command line ' +
      '(it is ignored in .env files).',
  );
}

/** Blocks production by environment name, and by hostname so a BASE_URL override cannot bypass it. */
function assertNotProduction(name: string, baseURL: string): void {
  if (allowProduction) return;

  if (name === PRODUCTION_ENV) {
    throw productionBlockedError(`TEST_ENV is "${PRODUCTION_ENV}"`);
  }

  const productionURL = readEnvFile(PRODUCTION_ENV).baseURL;
  if (
    productionURL &&
    URL.canParse(productionURL) &&
    new URL(productionURL).hostname === new URL(baseURL).hostname
  ) {
    throw productionBlockedError(`baseURL "${baseURL}" points to the production host`);
  }
}

function loadEnvConfig(): EnvConfig {
  const name = process.env.TEST_ENV || DEFAULT_ENV;
  const fileConfig = readEnvFile(name);
  // BASE_URL lets CI (e.g. a Jenkins parameter) override the file value.
  const baseURL = process.env.BASE_URL || fileConfig.baseURL;

  if (!baseURL) {
    throw new Error(
      `baseURL is not configured for environment "${name}". ` +
        `Set it in config/environments/${name}.json or via the BASE_URL environment variable.`,
    );
  }
  if (!URL.canParse(baseURL)) {
    throw new Error(`baseURL "${baseURL}" for environment "${name}" is not a valid URL.`);
  }

  assertNotProduction(name, baseURL);

  return { name, baseURL };
}

export const envConfig: EnvConfig = loadEnvConfig();

export const isCI = Boolean(process.env.CI);

/** Headed by default; HEADLESS=true or CI switches to headless. */
export const headless = isCI || process.env.HEADLESS === 'true';
