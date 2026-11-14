import type { MazadApiClient } from '@api/mazad-api.client';
import type { AuctionListItem, AuctionTab } from '@typings/mazad';
import type { Language } from '@typings';

/** Which listed car a test may use (values come from the spec's test-data file). */
export interface ListedCarRules {
  /** Home lists searched, in order. */
  tabs: readonly Extract<AuctionTab, 'live' | 'upcoming'>[];
  /** The car must stay listed at least this long. */
  minMinutesLeft: number;
}

/** A car the app lists on Home, as GET /v1/auction/list serves it in one language. */
export interface ListedCar {
  /** Auction item ID. */
  id: number;
  /** The Home tab that lists it (and the Favorite Auctions tab it appears under). */
  tab: Extract<AuctionTab, 'live' | 'upcoming'>;
  /** The card title in that language. */
  title: string;
  /** How many customers have it in their favourites. */
  favourites: number;
}

function minutesLeft(item: AuctionListItem): number {
  const timer = item.timer_object;
  if (!timer?.end_time) return 0;
  return (timer.end_time - timer.current_time) / 60;
}

/**
 * Any car the app lists on Home (first page of each tab in `rules.tabs`) that no customer has in
 * their favourites yet, so it is not in the test account's list either and the count can be
 * checked; whose title no other listed car contains, since cards are found by title; and that
 * stays listed for `rules.minMinutesLeft`. Null when none fits. Guest API calls only.
 */
export async function pickUnfavouritedCar(
  mazadApi: MazadApiClient,
  lang: Language,
  rules: ListedCarRules,
): Promise<ListedCar | null> {
  for (const tab of rules.tabs) {
    const { body } = await mazadApi.getAuctionList({ section: 'home', tab, lang, perPage: 50 });
    const items = body.data.auction_list.data;
    const car = items.find(
      (item) =>
        (item.count_favourite_users ?? 0) === 0 &&
        minutesLeft(item) >= rules.minMinutesLeft &&
        !items.some(
          (other) =>
            other.id !== item.id && other.auction_title.includes(item.auction_title.trim()),
        ),
    );
    if (car) {
      return {
        id: car.id,
        tab,
        title: car.auction_title.trim(),
        favourites: car.count_favourite_users ?? 0,
      };
    }
  }
  return null;
}

/** The car's favourite count as the app API serves it (to guests too); undefined once unlisted. */
export async function favouriteCount(
  mazadApi: MazadApiClient,
  car: Pick<ListedCar, 'id' | 'tab'>,
  lang: Language,
): Promise<number | undefined> {
  const item = await mazadApi.findAuction({ section: 'home', tab: car.tab, lang }, car.id);
  return item?.count_favourite_users;
}
