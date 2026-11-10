import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '../support/fixtures';
import { installGuestGuard, type NetworkEvent } from '../support/guest-guard';
import { observeBrowserBack } from '../support/history';

/**
 * Two in-page "forgot password" patterns on a local server, behind a prior page:
 * /plain swaps the view without touching history; /pushed adds a history entry and restores the
 * login view on popstate. observeBrowserBack must report what actually happens in each case.
 */
const page = (pushed: boolean) => `<!doctype html><html><body>
  <div id="login">login view <button id="open" type="button">Forgot</button></div>
  <div id="forgot" hidden>forgot view</div>
  <script>
    const show = (forgot) => {
      document.getElementById('login').hidden = forgot;
      document.getElementById('forgot').hidden = !forgot;
    };
    document.getElementById('open').onclick = () => {
      show(true);
      ${pushed ? "history.pushState({ view: 'forgot' }, '', location.href);" : ''}
    };
    window.onpopstate = () => show(false);
  </script>
</body></html>`;

test.describe('Browser Back observation (selfcheck, local server)', () => {
  test('reports leaving the page, or staying and restoring the view', async ({ browser }) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      if (req.url === '/plain') return res.end(page(false));
      if (req.url === '/pushed') return res.end(page(true));
      res.end('<p id="start">start page</p>');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
    const context = await browser.newContext();
    const events: NetworkEvent[] = [];
    await installGuestGuard(context, host, (e) => events.push(e));
    const tab = await context.newPage();

    // No history entry: Back leaves to the previous page.
    await tab.goto(`http://${host}/start`);
    await tab.goto(`http://${host}/plain`);
    const plain = await observeBrowserBack(tab, () => tab.locator('#open').click());
    expect(plain.historyLengthAfterOpen - plain.historyLengthBefore).toBe(0);
    expect(plain.stayedOnSameUrl).toBe(false);
    expect(plain.urlAfterBack).toBe(`${host}/start`);

    // A history entry: Back stays on the URL and the page restores the login view.
    await tab.goto(`http://${host}/start`);
    await tab.goto(`http://${host}/pushed`);
    const pushed = await observeBrowserBack(tab, () => tab.locator('#open').click());
    expect(pushed.historyLengthAfterOpen - pushed.historyLengthBefore).toBe(1);
    expect(pushed.stayedOnSameUrl).toBe(true);
    await expect(tab.locator('#login')).toBeVisible();
    await expect(tab.locator('#forgot')).toBeHidden();

    await context.close();
    server.close();
    expect(events.filter((e) => e.kind === 'unexpected')).toEqual([]);
  });
});
