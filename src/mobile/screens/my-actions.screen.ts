import { MobileScreen } from '@mobile/screens/mobile.screen';

/** My Actions (Action Needed / Pending): post-auction steps for won auctions. */
export class MyActionsScreen extends MobileScreen {
  get tabBar() {
    return this.byId('tab_layout_my_actions');
  }

  get guestPanel() {
    return this.byId('linear_guest_user');
  }

  get loginButton() {
    return this.byId('button_login_user');
  }

  subTab(label: string) {
    return this.byDescription(label);
  }

  message(text: string) {
    return this.byText(text);
  }
}
