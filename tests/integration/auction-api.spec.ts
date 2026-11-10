import { expect, test } from '@fixtures/test.fixture';
import type { Language } from '@typings';

// Guest (unauthenticated) API reads behind the app's Auctions and My Bids tabs.
// One scenario list, run for each API language through the `lang` header.
const languages: Language[] = ['en', 'ar'];

for (const lang of languages) {
  test.describe(`Mazad API (${lang})`, () => {
    test('Configuration defines the My Bids tabs with guest and empty states', async ({
      mazadApi,
    }) => {
      const { response, body } = await mazadApi.getConfiguration(lang);

      expect(response.status()).toBe(200);
      expect(body.status).toBe(200);
      expect(body.data.my_bids.map((t) => t.tab)).toEqual([
        'live',
        'tap_waiting_approval',
        'won',
        'lost',
      ]);
      for (const tab of body.data.my_bids) {
        expect.soft(tab.tab_text, `${tab.tab} label`).not.toBe('');
        expect.soft(tab.empty?.guest?.title, `${tab.tab} guest title`).toBeTruthy();
        expect.soft(tab.empty?.guest?.button_label, `${tab.tab} guest button`).toBeTruthy();
        expect.soft(tab.empty?.logged?.title, `${tab.tab} logged-in empty title`).toBeTruthy();
      }
      expect(body.data.notification[0]?.empty?.guest?.title).toBeTruthy();
    });

    test('Past auctions list sold auctions with vehicle IDs and a masked VIN', async ({
      mazadApi,
    }) => {
      const { response, body } = await mazadApi.getAuctionList({
        section: 'home',
        tab: 'past',
        lang,
        page: 1,
        perPage: 10,
      });

      expect(response.status()).toBe(200);
      const list = body.data.auction_list;
      expect(list.pages_count).toBeGreaterThan(0);
      expect(list.data.length).toBeGreaterThan(0);
      expect(list.data.length).toBeLessThanOrEqual(10);
      for (const item of list.data) {
        const at = `auction ${item.id}`;
        expect.soft(item.status, at).toBe('past');
        expect.soft(item.current_tab, at).toBe('past');
        expect.soft(item.object_id, `${at} vehicle ID`).toBeGreaterThan(0);
        // The API shows only the last 4 VIN characters.
        expect.soft(item.vin_number, `${at} VIN masking`).toMatch(/X{13}[A-Z0-9]{4}$/i);
        expect.soft(item.auction_title, `${at} title`).not.toBe('');
      }
    });

    test('Past auctions pages do not repeat auctions', async ({ mazadApi }) => {
      const page1 = await mazadApi.getAuctionList({
        section: 'home',
        tab: 'past',
        lang,
        page: 1,
        perPage: 5,
      });
      test.skip(
        page1.body.data.auction_list.pages_count < 2,
        'Test data: only one page of past auctions.',
      );
      const page2 = await mazadApi.getAuctionList({
        section: 'home',
        tab: 'past',
        lang,
        page: 2,
        perPage: 5,
      });

      const ids1 = page1.body.data.auction_list.data.map((a) => a.id);
      const ids2 = page2.body.data.auction_list.data.map((a) => a.id);
      expect(ids2.length).toBeGreaterThan(0);
      expect(ids2.filter((id) => ids1.includes(id))).toEqual([]);
    });

    test('Home tabs in the auction list match the configuration', async ({ mazadApi }) => {
      const config = await mazadApi.getConfiguration(lang);
      const list = await mazadApi.getAuctionList({
        section: 'home',
        tab: 'past',
        lang,
        page: 1,
        perPage: 1,
      });

      const tabs = (t: { tab: string; tab_text: string }[]) =>
        t.map(({ tab, tab_text }) => ({ tab, tab_text }));
      expect(tabs(list.body.data.section_tabs)).toEqual(tabs(config.body.data.home));
    });

    test('My Bids tabs in the auction list match the configuration', async ({ mazadApi }) => {
      const config = await mazadApi.getConfiguration(lang);
      const list = await mazadApi.getAuctionList({ section: 'my_bids', tab: 'won', lang });

      expect(list.response.status()).toBe(200);
      // The app shows the configuration tabs (Live, Closed, Won, Lost).
      expect(list.body.data.section_tabs.map((t) => t.tab)).toEqual(
        config.body.data.my_bids.map((t) => t.tab),
      );
    });
  });
}

test('English price labels are in English', async ({ mazadApi }) => {
  test.fail(true, 'Known defect: administrative_expenses_text_en is Arabic ("رسوم إدارية").');
  const { body } = await mazadApi.getAuctionList({
    section: 'home',
    tab: 'past',
    lang: 'en',
    page: 1,
    perPage: 5,
  });
  for (const item of body.data.auction_list.data) {
    expect
      .soft(item.price_object.administrative_expenses_text_en, `auction ${item.id}`)
      .toMatch(/^[\x20-\x7E]+$/);
  }
});
