import { MobileScreen } from '@mobile/screens/mobile.screen';

/** My Bids (Live / Closed / Won / Lost). Sub-tabs have no IDs, so they are found by label. */
export class MyBidsScreen extends MobileScreen {
  subTab(label: string) {
    return this.byText(label);
  }

  /** Shown to guests and in empty lists; the text comes from GET /v1/configuration. */
  message(text: string) {
    return this.byText(text);
  }

  button(label: string) {
    return this.byText(label);
  }

  async openSubTab(label: string): Promise<void> {
    await this.subTab(label).click();
  }
}
