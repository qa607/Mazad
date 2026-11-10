import dotenv from 'dotenv';
import type { EnvConfig } from '../src/types';
import { selectEnvironment } from './staging-environments';

dotenv.config({ quiet: true });

/**
 * The run's environment: an approved STAGING environment only, chosen explicitly with TEST_ENV
 * (no default). Production is permanently blocked and cannot be enabled by any variable, file
 * or flag. BASE_URL / ERP_URL may only repeat the approved origins. See
 * config/staging-environments.ts.
 */
function loadEnvConfig(): EnvConfig {
  const selected = selectEnvironment(process.env);
  // Local Appium server (not environment specific). Default: Appium's standard port.
  const appiumURL = process.env.APPIUM_URL || 'http://127.0.0.1:4723';
  return { ...selected, appiumURL };
}

export const envConfig: EnvConfig = loadEnvConfig();

export const isCI = Boolean(process.env.CI);

/** Headed by default; HEADLESS=true or CI switches to headless. */
export const headless = isCI || process.env.HEADLESS === 'true';
