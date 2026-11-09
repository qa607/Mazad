import { remote } from 'webdriverio';
import {
  type IosConfig,
  iosCapabilities,
  iosLaunchArguments,
  launchArgumentsProblem,
} from '@mobile/ios/ios.config';

export type IosDriver = WebdriverIO.Browser;

/** All restartIosApp needs: the real driver and the restricted spec driver both fit. */
export interface AppRestarter {
  execute(script: string, ...args: unknown[]): Promise<unknown>;
}

/**
 * Starts an XCUITest session on the installed app; the session start launches the app with
 * iosLaunchArguments (capabilities). noReset: nothing is reinstalled or wiped.
 */
export async function startIosSession(appiumURL: string, config: IosConfig): Promise<IosDriver> {
  const problem = launchArgumentsProblem(config);
  if (problem) throw new Error(problem);
  const url = new URL(appiumURL);
  return remote({
    protocol: url.protocol.replace(':', ''),
    hostname: url.hostname,
    port: Number(url.port || 4723),
    path: url.pathname === '/' ? '/' : url.pathname,
    logLevel: 'error',
    capabilities: iosCapabilities(config),
  });
}

/**
 * Terminates and relaunches the app so each test starts from the same screen.
 * Uses `mobile: launchApp` with the launch arguments, never `mobile: activateApp`: activating a
 * terminated app starts it WITHOUT launch arguments, so a simulator UI-test build would lose
 * -MazadUITestProxy and its requests would bypass the request guard.
 */
export async function restartIosApp(driver: AppRestarter, config: IosConfig): Promise<void> {
  const problem = launchArgumentsProblem(config);
  if (problem) throw new Error(problem);
  await driver.execute('mobile: terminateApp', { bundleId: config.bundleId });
  await driver.execute('mobile: launchApp', {
    bundleId: config.bundleId,
    arguments: iosLaunchArguments(config),
  });
}
