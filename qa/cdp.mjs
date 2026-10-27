/**
 * A very small Chrome DevTools Protocol client.
 *
 * Used by the QA scripts to drive the Brave browser: navigate, evaluate,
 * capture screenshots and collect console errors.
 */

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..');
export const BRAVE = 'C:\\Users\\Anas\\AppData\\Local\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class CdpClient {
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
        if (msg.error) reject(new Error(`${msg.error.message} ${JSON.stringify(msg.error.data ?? '')}`));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const h of this.handlers.get(msg.method) ?? []) h(msg.params);
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

/**
 * Launches Brave with remote debugging and returns a ready-to-use session.
 */
export async function launchBrave({ port = 9335, width = 1600, height = 900 } = {}) {
  const profileDir = join(ROOT, '.toolchain', 'brave-qa-profile');
  mkdirSync(profileDir, { recursive: true });

  const proc = spawn(BRAVE, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    `--window-size=${width},${height}`,
    'about:blank',
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        version = await res.json();
        break;
      }
    } catch {
      /* retry */
    }
    await sleep(300);
  }
  if (!version) {
    proc.kill();
    throw new Error('Brave DevTools endpoint never came up');
  }

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

  const evaluate = async (expression) => {
    const res = await browser.send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    );
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description ?? 'evaluation failed');
    }
    return res.result?.value;
  };

  const screenshot = async (name, dir) => {
    const res = await browser.send('Page.captureScreenshot', { format: 'png' }, sessionId);
    const file = join(dir, `${name}.png`);
    mkdirSync(dir, { recursive: true });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(file, Buffer.from(res.data, 'base64'));
    return file;
  };

  const close = async () => {
    try { await browser.send('Browser.close'); } catch { /* ignore */ }
    try { proc.kill(); } catch { /* ignore */ }
  };

  return { browser, sessionId, evaluate, screenshot, consoleErrors, pageErrors, close };
}
