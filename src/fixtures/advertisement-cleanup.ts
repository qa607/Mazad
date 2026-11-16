import type { AppVersionFormPage } from '@pages/backend/app-version/app-version-form.page';
import type { AppVersionListPage } from '@pages/backend/app-version/app-version-list.page';
import type { AdvertisementPage } from '@pages/backend/content/advertisement.page';

/** Records the advertisements a test creates, and what was published before it. */
export interface AdvertisementTracker {
  /** The advertisements published before the test changed anything (at most one). */
  rememberPublished: (ids: string[]) => void;
  track: (id: string) => void;
}

/**
 * Clean-up for the advertisement tests: a tracker for the test, and a run() for the fixture's
 * teardown that unpublishes and deletes every tracked advertisement, then publishes again the one
 * that was published before (publishing the test's own had unpublished it).
 */
export function advertisementCleanup(ads: AdvertisementPage): {
  tracker: AdvertisementTracker;
  run: () => Promise<void>;
} {
  const created = new Set<string>();
  const before: string[] = [];
  return {
    tracker: {
      rememberPublished: (ids) => before.push(...ids),
      track: (id) => created.add(id),
    },
    run: async () => {
      for (const id of created) {
        await ads.setPublished(id, false);
        await ads.deleteAdvertisement(id);
      }
      const previous = before.find((id) => !created.has(id));
      if (previous) await ads.setPublished(previous, true);
    },
  };
}

/** A row to pause: device type and version as the App Versions list shows them. */
export interface AppVersionToPause {
  deviceType: string;
  appVersion: string;
  pausedStatus: string;
}

/** Pauses App Versions rows for a test, and puts their status back. */
export interface AppVersionPause {
  /** Sets every matching row to the paused status, remembering each one's status. */
  pause: (row: AppVersionToPause) => Promise<void>;
  /** Puts every paused row back to its status now (the fixture also does it after the test). */
  restore: () => Promise<void>;
}

/**
 * Pauses App Versions rows for the length of a step, through the Update form, and restores each
 * one's status: when the test calls restore(), and in any case in the fixture's teardown.
 */
export function appVersionPause(pages: {
  appVersionListPage: AppVersionListPage;
  appVersionFormPage: AppVersionFormPage;
}): { tracker: AppVersionPause; run: () => Promise<void> } {
  const { appVersionListPage: list, appVersionFormPage: form } = pages;
  const paused = new Map<string, string>();
  const restore = async () => {
    for (const [id, status] of paused) {
      await form.gotoUpdate(id);
      await form.saveStatus(status);
      paused.delete(id);
    }
  };
  return {
    tracker: {
      pause: async ({ deviceType, appVersion, pausedStatus }) => {
        await list.gotoFiltered(deviceType, appVersion);
        const rows = (await list.readRows()).filter(
          (row) =>
            row.deviceType.toLowerCase() === deviceType.toLowerCase() &&
            row.appVersion === appVersion &&
            row.status !== pausedStatus,
        );
        for (const row of rows) {
          paused.set(row.id, row.status);
          await form.gotoUpdate(row.id);
          await form.saveStatus(pausedStatus);
        }
      },
      restore,
    },
    run: restore,
  };
}
