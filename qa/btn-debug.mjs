/** Diagnostic: dump what the resources/construction panels actually contain. */
import { launchBrave, sleep, ROOT } from './cdp.mjs';

const session = await launchBrave({ port: 9337 });
const { evaluate } = session;

try {
  await session.browser.send('Page.navigate', { url: 'http://127.0.0.1:4173/' }, session.sessionId);
  await sleep(3500);
  await evaluate(`window.GENESIS.startNewGame({ seed: 'btn-debug-001' })`);
  await sleep(2500);

  const info = await evaluate(`(async () => {
    const out = {};
    const ui = window.GENESIS.ui();
    out.uiPresent = !!ui;
    out.tabs = Array.from(document.querySelectorAll('.tab-btn')).map(b => b.getAttribute('data-panel'));

    for (const id of ['resources', 'construction', 'tavern', 'combat']) {
      document.querySelector('[data-panel="' + id + '"]').click();
      await new Promise(r => setTimeout(r, 400));
      const panels = Array.from(document.querySelectorAll('.panel'));
      const body = panels.length ? panels[panels.length - 1].querySelector('.panel-body') : null;
      out[id] = {
        panelCount: panels.length,
        bodyChars: body ? body.textContent.trim().length : 0,
        bodyHead: body ? body.textContent.trim().slice(0, 160) : null,
        buttons: body ? Array.from(body.querySelectorAll('.btn')).map(b => JSON.stringify(b.textContent.trim())).slice(0, 6) : [],
        btnCount: body ? body.querySelectorAll('.btn').length : 0,
        rows: body ? body.querySelectorAll('.combatant-row').length : 0,
        tavernCards: body ? body.querySelectorAll('.tavern-card').length : 0,
      };
    }
    return out;
  })()`);

  console.log(JSON.stringify(info, null, 2));
} finally {
  await session.close();
}
