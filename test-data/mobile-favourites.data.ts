import type { ListedCarRules } from '@api/listed-car';
import type { Language } from '@typings';

/**
 * Favourites on the Android and iOS apps (tests/mobile/android/favourites.spec.ts,
 * tests-ios/favourites.spec.ts).
 *
 * App text recorded on stg-154, 2026-11-14, in English and Arabic: identical on the Android app
 * (8.2.2-stage) and the iOS app (8.3 (1491)). The Favorite Auctions tab labels ("Live",
 * "Upcoming") are served by GET /v1/configuration (favorite[].tab_text) and read at run time.
 *
 * Observed 2026-11-14 on both apps: a guest's heart tap opens the welcome sheet ("Welcome to Mazad
 * By Motory": Create a new account / Log In). After signing in from it the app returns to the Home
 * list, and the car is NOT in Favorite Auctions (heart still empty, API count unchanged). Tapping
 * the heart while signed in does add it.
 */
export const favouritesAppText: Record<
  Language,
  {
    /** Home tabs, by the API tab of the car's list. */
    homeTabs: { live: string; upcoming: string };
    /** Home's Auctions / Cars switch: the Cars side. */
    carsView: string;
    /** Heading of Favorite Auctions. */
    favouritesHeading: string;
  }
> = {
  en: {
    homeTabs: { live: 'Live Auctions', upcoming: 'Upcoming Auctions' },
    carsView: 'Cars',
    favouritesHeading: 'Favorite Auctions',
  },
  ar: {
    homeTabs: { live: 'المزادات الحالية', upcoming: 'المزادات القادمة' },
    carsView: 'السيارات',
    favouritesHeading: 'المزادات المفضلة',
  },
};

/**
 * Which listed car a test favourites: any car the app lists (no car is created for it), with no
 * favourites yet, a unique title and enough time left (see pickUnfavouritedCar).
 */
export const favouriteCarRules: ListedCarRules = {
  // Upcoming is often empty on staging.
  tabs: ['live', 'upcoming'],
  minMinutesLeft: 15,
};

/**
 * The test titles, shared by both apps. iOS lets exactly these past its text gate, and only while
 * IOS_ALLOW_FAVOURITES is "true" (src/mobile/ios/ios-preflight.ts).
 */
export const favouritesTestTitles = {
  guest: 'A car a guest adds to favourites is in Favorite Auctions after signing in',
  signedIn: 'A signed-in customer adds a car to Favorite Auctions with its heart',
} as const;
