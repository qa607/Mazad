import { randomUUID } from 'node:crypto';
import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { Language } from '@typings';
import type {
  ApiEnvelope,
  AppConfiguration,
  AuctionList,
  AuctionListItem,
  AuctionListQuery,
} from '@typings/mazad';

/** App identity sent with every request, as the Android app does. */
const APP_HEADERS = {
  'x-app-name': 'mazad',
  'x-device-type': 'android',
  'x-app-version': '1.0',
} as const;

/**
 * Mazad customer API (/api/v1). Guest (unauthenticated) calls only: it reads public data and
 * never sends anything that changes state. Responses are returned with their HTTP status so
 * tests can assert on both.
 */
export class MazadApiClient {
  /** One device ID per client, like an app install. */
  private readonly deviceId = `qa-automation-${randomUUID()}`;

  constructor(private readonly request: APIRequestContext) {}

  private headers(lang: Language): Record<string, string> {
    return { ...APP_HEADERS, lang, 'device-id': this.deviceId };
  }

  private async get<T>(
    path: string,
    lang: Language,
    params?: Record<string, string | number>,
  ): Promise<{ response: APIResponse; body: ApiEnvelope<T> }> {
    const response = await this.request.get(`/api/v1/${path}`, {
      headers: this.headers(lang),
      params,
    });
    const body = (await response.json()) as ApiEnvelope<T>;
    return { response, body };
  }

  /** GET /v1/configuration: tab names and empty states the apps display. */
  getConfiguration(lang: Language) {
    return this.get<AppConfiguration>('configuration', lang);
  }

  /** GET /v1/auction/list for one section and tab. */
  getAuctionList(query: AuctionListQuery) {
    const params: Record<string, string | number> = { section: query.section, tabs: query.tab };
    if (query.page !== undefined) params.page = query.page;
    if (query.perPage !== undefined) params['per-page'] = query.perPage;
    return this.get<AuctionList>('auction/list', query.lang, params);
  }

  /**
   * Finds an auction in a tab by walking its pages. Returns null when it is not listed.
   * Stops at `maxPages` to bound the number of requests.
   */
  async findAuction(
    query: Omit<AuctionListQuery, 'page'>,
    auctionId: number,
    maxPages = 20,
  ): Promise<AuctionListItem | null> {
    for (let page = 1; page <= maxPages; page++) {
      const { body } = await this.getAuctionList({ ...query, page });
      const match = body.data.auction_list.data.find((item) => item.id === auctionId);
      if (match) return match;
      if (page >= body.data.auction_list.pages_count) break;
    }
    return null;
  }
}
