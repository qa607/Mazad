import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '../support/fixtures';
import { installGuestGuard, type NetworkEvent } from '../support/guest-guard';
import { findLayoutIssues } from '../support/layout-rules';
import { stabilize } from '../support/stabilize';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * A visible image, a visible broken image, and two lazy images the browser never starts: one in
 * an offscreen carousel slide (clipped by its container) and one hidden. The old wait ("every
 * image complete") hangs on this page; the new one must not, and only the broken visible image
 * may be reported.
 */
const PAGE = `<!doctype html><html lang="en" dir="ltr"><body style="margin:0;font:16px sans-serif">
  <p>images</p>
  <img id="ok" src="/ok.png" style="width:20px;height:20px">
  <img id="broken" src="/missing.png" alt="" style="width:20px;height:20px">
  <div style="width:200px;overflow:hidden">
    <div style="display:flex;width:9000px">
      <div style="width:200px;flex:none">slide 1</div>
      <img id="lazy-slide" loading="lazy" src="/lazy-slide.png"
        style="margin-left:8000px;width:100px;height:100px;flex:none">
    </div>
  </div>
  <img id="lazy-hidden" loading="lazy" src="/lazy-hidden.png" style="display:none">
</body></html>`;

test.describe('Image stabilization (selfcheck, local server)', () => {
  test('waits only for drawn images and reports a drawn image that failed', async ({ browser }) => {
    const hits: string[] = [];
    const server = http.createServer((req, res) => {
      const url = req.url ?? '/';
      hits.push(url);
      if (url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(PAGE);
      }
      if (url === '/ok.png' || url.startsWith('/lazy-')) {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        return res.end(PNG);
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const host = `127.0.0.1:${(server.address() as AddressInfo).port}`;

    const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
    const events: NetworkEvent[] = [];
    await installGuestGuard(context, host, (e) => events.push(e));
    const page = await context.newPage();
    await page.goto(`http://${host}/`);

    // Negative control: the previous condition is false here, so it would have hung.
    expect(await page.evaluate(() => [...document.images].every((img) => img.complete))).toBe(
      false,
    );

    const started = Date.now();
    await stabilize(page, { declineCookies: false });
    expect(Date.now() - started, 'stabilize must not hang on undrawn lazy images').toBeLessThan(
      20_000,
    );

    const imageIssues = (await findLayoutIssues(page, { language: 'en' })).filter(
      (i) => i.rule === 'image-not-loaded',
    );
    await context.close();
    server.close();

    expect(imageIssues).toHaveLength(1);
    expect(imageIssues[0].actual).toContain('missing.png');
    expect(hits, 'undrawn lazy images are never requested').not.toContain('/lazy-slide.png');
    expect(hits).not.toContain('/lazy-hidden.png');
    expect(events.filter((e) => e.kind === 'unexpected')).toEqual([]);
  });
});
