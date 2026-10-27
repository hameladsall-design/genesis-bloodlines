/**
 * Browser QA harness for GENESIS: BLOODLINES.
 *
 * Launches the Brave browser with the Chrome DevTools Protocol enabled, opens
 * the built game, drives the real interface and reports console errors,
 * runtime exceptions and a set of behavioural checks.
 *
 * Run:  node qa/brave-qa.mjs [url]
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SHOTS = join(ROOT, 'qa', 'screenshots');
const BRAVE = 'C:\\Users\\Anas\\AppData\\Local\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
const PORT = 9333;
const URL = process.argv[2] ?? 'http://127.0.0.1:4173/';

mkdirSync(SHOTS, { recursive: true });

const log = (...args) => console.log('[qa]', ...args);

/* ------------------------------------------------------------------ */
/* Minimal Chrome DevTools Protocol client                            */
/* ------------------------------------------------------------------ */

class CdpClient {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? '')})`));
        else resolve(msg.result);
      } else if (msg.method) {
        const list = this.handlers.get(msg.method) ?? [];
        for (const h of list) h(msg.params);
      }
    });
  }

  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error(`cannot connect to ${url}`)), { once: true });
    });
    return new CdpClient(ws);
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`timeout: ${method}`));
        }
      }, 30000);
    });
  }

  on(method, handler) {
    const list = this.handlers.get(method) ?? [];
    list.push(handler);
    this.handlers.set(method, list);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevTools(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return await res.json();
    } catch {
      /* not up yet */
    }
    await sleep(300);
  }
  throw new Error('Brave DevTools endpoint never came up');
}

/* ------------------------------------------------------------------ */
/* Browser launch                                                     */
/* ------------------------------------------------------------------ */

const profileDir = join(ROOT, '.toolchain', 'brave-qa-profile');
mkdirSync(profileDir, { recursive: true });

log('launching Brave with remote debugging on', PORT);
const brave = spawn(BRAVE, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profileDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-features=Translate',
  '--window-size=1600,900',
  'about:blank',
], { stdio: 'ignore', detached: false });

let braveProcess = brave;
try {
  const version = await waitForDevTools();
  log('Brave ready:', version['Browser']);

  const browser = await CdpClient.connect(version.webSocketDebuggerUrl);

  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });

  const consoleErrors = [];
  const pageErrors = [];

  browser.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error' || params.type === 'warning') {
      const text = (params.args ?? [])
        .map((a) => a.value ?? a.description ?? a.unserializableValue ?? '')
        .join(' ');
      consoleErrors.push(`[${params.type}] ${text}`);
    }
  });
  browser.on('Runtime.exceptionThrown', (params) => {
    const d = params.exceptionDetails ?? {};
    pageErrors.push(d.exception?.description ?? d.text ?? 'unknown exception');
  });

  await browser.send('Runtime.enable', {}, sessionId);
  await browser.send('Page.enable', {}, sessionId);
  await browser.send('Log.enable', {}, sessionId).catch(() => {});
  browser.on('Log.entryAdded', (params) => {
    if (params.entry?.level === 'error') consoleErrors.push(`[log] ${params.entry.text}`);
  });

  const evaluate = async (expression, awaitPromise = true) => {
    const res = await browser.send(
      'Runtime.evaluate',
      { expression, awaitPromise, returnByValue: true },
      sessionId,
    );
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description ?? 'evaluation failed');
    }
    return res.result?.value;
  };

  const screenshot = async (name) => {
    const res = await browser.send('Page.captureScreenshot', { format: 'png' }, sessionId);
    const file = join(SHOTS, `${name}.png`);
    writeFileSync(file, Buffer.from(res.data, 'base64'));
    log('screenshot ->', file);
    return file;
  };

  /* ---------------- run the game ---------------- */

  log('navigating to', URL);
  await browser.send('Page.navigate', { url: URL }, sessionId);
  await sleep(3500);

  const titleOk = await evaluate(`!!document.querySelector('.title-screen')`);
  log('title screen present:', titleOk);
  await screenshot('01-title');

  // Start a new game through the real debug handle.
  log('starting a new game');
  const started = await evaluate(`(() => {
    if (!window.GENESIS) return 'no-handle';
    window.GENESIS.startNewGame({ seed: 'qa-seed-001', founderName: 'باسم', familyName: 'صقر', dynastyName: 'القرون' });
    return 'ok';
  })()`);
  log('startNewGame ->', started);
  await sleep(3000);

  const hudOk = await evaluate(`!!document.querySelector('.hud')`);
  const tabs = await evaluate(`Array.from(document.querySelectorAll('.tab-btn')).map(b => b.textContent.trim())`);
  log('HUD present:', hudOk);
  log('panel tabs:', tabs.length, tabs.slice(0, 6).join(' | '));
  await screenshot('02-game');

  // Open every registered panel and record failures.
  log('opening every panel');
  const panelResults = await evaluate(`(async () => {
    const out = [];
    const ui = window.GENESIS.ui();
    for (const tab of Array.from(document.querySelectorAll('.tab-btn'))) {
      const id = tab.getAttribute('data-panel');
      try {
        tab.click();
        await new Promise(r => setTimeout(r, 120));
        const body = document.querySelector('.panel .panel-body');
        out.push({ id, ok: !!body, chars: body ? body.textContent.trim().length : 0, error: body && body.textContent.includes('failed to render') });
      } catch (e) {
        out.push({ id, ok: false, error: String(e) });
      }
    }
    return out;
  })()`);
  log('panel results:', JSON.stringify(panelResults, null, 1));

  await screenshot('03-panels');

  // Exercise simulation behaviour through the real systems.
  log('running simulation checks');
  const sim = await evaluate(`(() => {
    const engine = window.GENESIS.engine();
    const store = engine.store;
    const state = engine.state;
    const founder = store.allCharacters()[0];
    return {
      founder: founder ? founder.firstName + ' ' + founder.familyName : null,
      founderRace: founder?.race,
      founderSex: founder?.sex,
      founderLevel: founder?.level,
      capacity: state.base.capacity,
      baseLevel: state.base.level,
      resources: Object.fromEntries(Object.entries(state.resources).filter(([,v]) => v > 0)),
      food: store.getResource('food'),
      living: store.livingCount(),
      tabs: document.querySelectorAll('.tab-btn').length,
      dir: document.documentElement.dir,
      lang: document.documentElement.lang,
    };
  })()`);
  log('simulation state:', JSON.stringify(sim, null, 1));

  // Advance time and confirm the world ticks without throwing.
  log('advancing 40 in-game days');
  const advance = await evaluate(`(() => {
    const engine = window.GENESIS.engine();
    try {
      engine.advanceHours(24 * 40);
      const s = engine.state;
      return { ok: true, day: s.calendar.totalDays, year: s.calendar.year, food: s.resources.food ?? 0, living: engine.store.livingCount(), visitors: s.visitors.length, tavern: s.tavern.length, notifications: s.notifications.length };
    } catch (e) { return { ok: false, error: String(e) }; }
  })()`);
  log('advance ->', JSON.stringify(advance));
  await sleep(1200);
  await screenshot('04-after-time');

  // Save / reload round trip.
  log('save/load round trip');
  const persist = await evaluate(`(() => {
    const engine = window.GENESIS.engine();
    const before = { living: engine.store.livingCount(), food: engine.store.getResource('food'), day: engine.state.calendar.totalDays };
    const ok = engine.save(1);
    const loaded = window.GENESIS.loadSlot(1);
    return { ok, loaded, before };
  })()`);
  log('persist ->', JSON.stringify(persist));
  await sleep(2500);
  await screenshot('05-reloaded');

  const after = await evaluate(`(() => {
    const engine = window.GENESIS.engine();
    return { living: engine.store.livingCount(), food: engine.store.getResource('food'), day: engine.state.calendar.totalDays, chars: engine.store.allCharacters().length };
  })()`);
  log('after reload ->', JSON.stringify(after));

  await sleep(500);

  console.log('\n===== QA REPORT =====');
  console.log('console errors/warnings:', consoleErrors.length);
  for (const e of consoleErrors.slice(0, 25)) console.log('  ', e);
  console.log('uncaught exceptions:', pageErrors.length);
  for (const e of pageErrors.slice(0, 25)) console.log('  ', e);

  writeFileSync(
    join(ROOT, 'qa', 'report.json'),
    JSON.stringify({ url: URL, consoleErrors, pageErrors, panelResults, sim, advance, persist, after }, null, 2),
  );
  log('report ->', join(ROOT, 'qa', 'report.json'));
} finally {
  try {
    braveProcess.kill();
  } catch {
    /* ignore */
  }
}
