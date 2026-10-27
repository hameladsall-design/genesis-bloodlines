/** One-off diagnostic: identify what is rendered at a given screen point. */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const BRAVE = 'C:\\Users\\Anas\\AppData\\Local\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
const PORT = 9334;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profileDir = join(ROOT, '.toolchain', 'brave-qa-profile');
mkdirSync(profileDir, { recursive: true });

const brave = spawn(BRAVE, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profileDir}`,
  '--no-first-run', '--no-default-browser-check', '--window-size=1600,900', 'about:blank',
], { stdio: 'ignore' });

async function waitForDevTools() {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return await res.json();
    } catch { /* retry */ }
    await sleep(300);
  }
  throw new Error('no devtools');
}

try {
  const version = await waitForDevTools();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    }
  });
  const send = (method, params = {}, sessionId) => {
    const mid = ++id;
    const payload = { id: mid, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify(payload));
    });
  };

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId);
  await send('Page.enable', {}, sessionId);
  await send('Page.navigate', { url: 'http://127.0.0.1:4173/' }, sessionId);
  await sleep(3500);
  await send('Runtime.evaluate', { expression: `window.GENESIS.startNewGame({seed:'diag-1'})`, awaitPromise: true }, sessionId);
  await sleep(3000);

  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      const probe = (x, y) => {
        const el = document.elementFromPoint(x, y);
        if (!el) return { x, y, el: null };
        const r = el.getBoundingClientRect();
        return {
          x, y,
          tag: el.tagName,
          cls: el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className,
          id: el.id,
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          parent: el.parentElement ? el.parentElement.tagName + '.' + (el.parentElement.className || '') : null,
        };
      };
      const canvas = document.querySelector('#stage canvas');
      const cr = canvas ? canvas.getBoundingClientRect() : null;
      return {
        window: { w: innerWidth, h: innerHeight },
        canvas: cr ? { x: Math.round(cr.x), y: Math.round(cr.y), w: Math.round(cr.width), h: Math.round(cr.height) } : null,
        canvasAttr: canvas ? { w: canvas.width, h: canvas.height } : null,
        points: [probe(975, 78), probe(960, 80), probe(990, 76), probe(800, 78), probe(700, 300)],
        uiChildren: Array.from(document.getElementById('ui-root').children).map(c => c.tagName + '.' + c.className),
      };
    })()`,
    returnByValue: true,
  }, sessionId);
  console.log(JSON.stringify(res.result.value, null, 2));
} finally {
  try { brave.kill(); } catch { /* ignore */ }
}
