/** Find any request that 404s during a normal game session. */
import { launchBrave, sleep } from './cdp.mjs';

const session = await launchBrave({ port: 9338 });
const { browser, sessionId, evaluate } = session;

const failures = [];
browser.on('Network.responseReceived', (params) => {
  if (params.response.status >= 400) {
    failures.push({ url: params.response.url, status: params.response.status });
  }
});
browser.on('Network.loadingFailed', (params) => {
  failures.push({ url: params.requestId, status: 'failed', error: params.errorText });
});

try {
  await browser.send('Network.enable', {}, sessionId);
  await browser.send('Page.navigate', { url: 'http://127.0.0.1:4173/' }, sessionId);
  await sleep(3500);
  await evaluate(`window.GENESIS.startNewGame({ seed: 'net-check' })`);
  await sleep(3000);
  await evaluate(`document.querySelector('[data-panel="tavern"]').click()`);
  await sleep(800);

  console.log('failed requests:', JSON.stringify(failures, null, 1));
} finally {
  await session.close();
}
