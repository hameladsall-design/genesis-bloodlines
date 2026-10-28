/**
 * Pinpoints every HTTP 4xx/5xx and browser network-log error raised during a
 * full session (title screen → new game → panels), including the offending URL.
 *
 *   node qa/http-404.mjs
 */
import { launchBrave, sleep } from './cdp.mjs';

const session = await launchBrave({ port: 9341 });
const { browser, sessionId, evaluate } = session;

const http = [];
const logs = [];

browser.on('Network.responseReceived', (p) => {
  if (p.response.status >= 400) http.push(`${p.response.status} ${p.response.url}`);
});
browser.on('Network.loadingFailed', (p) => http.push(`failed ${p.errorText} ${p.requestId}`));
browser.on('Log.entryAdded', (p) => {
  const e = p.entry ?? {};
  if (e.level === 'error' || /404/.test(e.text ?? '')) {
    logs.push(`[${e.level}] ${e.text} :: ${e.url ?? '(no url)'}`);
  }
});

try {
  await browser.send('Network.enable', {}, sessionId);
  await browser.send('Page.navigate', { url: 'http://127.0.0.1:4173/' }, sessionId);
  await sleep(4000);
  await evaluate(`window.GENESIS.startNewGame({ seed: 'http-404' })`);
  await sleep(3500);
  for (const p of ['roster', 'tavern', 'family', 'genetics', 'combat', 'ranked', 'construction', 'resources', 'inventory', 'research', 'religion', 'factions', 'quests', 'worldmap', 'settings', 'visitor', 'character', 'tutorial']) {
    await evaluate(`(() => { const el = document.querySelector('[data-panel="${p}"]'); if (el) el.click(); })()`);
    await sleep(200);
  }
  await sleep(1500);

  console.log('HTTP >=400 :', http.length ? '\n  ' + http.join('\n  ') : 'none');
  console.log('Log errors :', logs.length ? '\n  ' + logs.join('\n  ') : 'none');
} finally {
  await session.close();
}
