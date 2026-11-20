// Scripted browser check for "a player was in another tab when the match started" (bugs.md #1).
// Two pages in one Chrome, each in its own window: A creates a room and starts it, B joins and goes away
// while A presses Start (or later):
//   --mode tab     another tab is opened in front of B in B's window: the real thing, visibilityState
//                  "hidden", no animation frames, timers throttled (default);
//   --mode freeze  CDP lifecycle "frozen": no JavaScript runs at all, like a locked phone;
//   --mode offline as tab, and the network is cut too: the WebSocket drops (a phone switching apps);
//   --mode reload  as tab, then the page reloads when shown (Chrome discarded the background tab);
//   --mode sametab A and B are two tabs of one window (one person testing alone): showing B hides A.
// B comes back after --away seconds; it must be in the game scene, without the HTML lobby, connected,
// and its car must answer the keyboard within a second (and A must see it move).
// Headless Chrome shows every tab as visible, so Chrome runs headful with its windows off-screen and
// Windows' occlusion tracking off (otherwise A would count as hidden too).
//
// Needs the dev servers (npm run dev): client on http://localhost:5174, server on 2568.
//   node client/scripts/hidden-tab.mjs [--mode tab|freeze] [--when start|round|intermission|podium] [--away <s>] [--chrome <path>]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .join(' ')
    .split('--')
    .filter((a) => a.trim())
    .map((a) => a.trim().split(/\s+/)),
);
const CHROME = args.chrome ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const MODE = args.mode ?? 'tab';
const WHEN = args.when ?? 'start';
const AWAY_S = Number(args.away ?? 15);
const BASE = args.base ?? 'http://localhost:5174/';
const PORT = 9240 + Math.floor(Math.random() * 50);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'masinute-hidden-'));
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
  '--window-position=-32000,-32000', '--window-size=1280,800',
  '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows',
  '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { stdio: 'ignore' });

let version;
for (let i = 0; i < 50 && !version; i++) {
  await sleep(200);
  try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch {}
}
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let nextId = 0;
const pending = new Map();
const logs = { A: [], B: [] };
const sessionName = new Map();
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
    return;
  }
  const who = sessionName.get(msg.sessionId);
  if (!who) return;
  if (msg.method === 'Runtime.exceptionThrown') logs[who].push(`EXCEPTION ${msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text}`);
  if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) {
    logs[who].push(`${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
  }
});
const call = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

async function openPage(name, sameWindowAs) {
  // --mode sametab: B is a tab next to A in A's window (a new tab opens in the last active window).
  if (sameWindowAs) await call('Target.activateTarget', { targetId: sameWindowAs.targetId });
  const { targetId } = await call('Target.createTarget', { url: 'about:blank', newWindow: !sameWindowAs });
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
  sessionName.set(sessionId, name);
  for (const m of ['Runtime.enable', 'Page.enable', 'Network.enable']) await call(m, {}, sessionId);
  const page = {
    name, targetId, sessionId,
    eval: async (expression) => {
      const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
      if (r.exceptionDetails) throw new Error(`${name}: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
      return r.result.value;
    },
    goto: async (url) => {
      await page.front();
      return call('Page.navigate', { url }, sessionId);
    },
    /** Two tabs of one window (--mode sametab): only the tab in front runs its frames, so bring it forward first. */
    front: async () => {
      if (MODE === 'sametab') await call('Target.activateTarget', { targetId });
    },
    key: async (type, key, code, keyCode) => call('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode }, sessionId),
  };
  page.click = (label) => page.eval(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(label)} && !x.disabled); if (b) { b.click(); return true; } return false; })()`);
  page.step = async (label) => {
    await page.front();
    for (let i = 0; i < 40; i++) { if (await page.click(label)) return; await sleep(250); }
    throw new Error(`${name}: no button "${label}"`);
  };
  page.waitFor = async (expression, ms = 10000, what = expression) => {
    const end = Date.now() + ms;
    for (;;) {
      const v = await page.eval(expression).catch(() => undefined);
      if (v) return v;
      if (Date.now() > end) throw new Error(`${name}: timed out waiting for ${what}`);
      await sleep(200);
    }
  };
  /** What the page shows: running scenes, HTML screen, phase, own car. */
  page.snapshot = () => page.eval(`(() => {
    const g = window.__game;
    const scenes = g ? g.scene.getScenes(true).map((s) => s.scene.key) : [];
    const s = g && (g.scene.getScene('game')?.sys.isActive() ? g.scene.getScene('game') : g.scene.getScene('lobby'));
    const t = s && s.transport;
    const state = t && t.getState();
    const me = state && state.players[t.playerId];
    return {
      visibility: document.visibilityState,
      scenes,
      htmlScreen: !!document.querySelector('.screen'),
      phase: state && state.phase,
      round: state && state.round,
      roundTick: state && state.roundTick,
      tick: state && state.tick,
      me: me && { x: me.x, y: me.y, alive: me.alive, connected: me.connected },
      status: t && t.connectionStatus(),
    };
  })()`);
  return page;
}

const A = await openPage('A');
const B = await openPage('B', MODE === 'sametab' ? A : undefined);
const report = [];
const ok = (cond, text) => { report.push(`${cond ? 'OK  ' : 'FAIL'} ${text}`); return cond; };

let blocker = null;
async function hide(page) {
  if (MODE === 'freeze') {
    await call('Page.setWebLifecycleState', { state: 'frozen' }, page.sessionId);
    return;
  }
  if (MODE === 'sametab') {
    // Back to A's tab: B goes to the background. (Coming back to B later hides A in turn.)
    await call('Target.activateTarget', { targetId: A.targetId });
    await sleep(300);
    return;
  }
  // A new tab opens in the last active window: B's, once B is activated.
  await call('Target.activateTarget', { targetId: page.targetId });
  blocker = (await call('Target.createTarget', { url: 'about:blank' })).targetId;
  await call('Target.activateTarget', { targetId: blocker });
  // --mode offline: the connection drops too (a phone switching apps or locking its screen).
  if (MODE === 'offline') await call('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, page.sessionId);
  await sleep(300);
}
async function show(page) {
  if (MODE === 'freeze') {
    await call('Page.setWebLifecycleState', { state: 'active' }, page.sessionId);
    // A frozen page comes back hidden; switching tabs away and back makes it visible, as unlocking the phone would.
    await call('Target.activateTarget', { targetId: page.targetId });
    const flip = (await call('Target.createTarget', { url: 'about:blank' })).targetId;
    await call('Target.activateTarget', { targetId: flip });
    await sleep(100);
    await call('Target.activateTarget', { targetId: page.targetId });
    await call('Target.closeTarget', { targetId: flip });
    return;
  }
  if (MODE === 'offline') await call('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, page.sessionId);
  await call('Target.activateTarget', { targetId: page.targetId });
  if (blocker) await call('Target.closeTarget', { targetId: blocker });
  blocker = null;
  // --mode reload: Chrome discarded the background tab and reloads it when it is shown again.
  if (MODE === 'reload') await call('Page.reload', {}, page.sessionId);
}

try {
  // A: host. ?online&debug keeps the menus and exposes window.__game.
  await A.goto(`${BASE}?online&debug`);
  await A.step('Intră la bâlci');
  await A.waitFor(`!!document.querySelector('input')`);
  await A.eval(`(() => { const i = document.querySelector('input'); i.value = 'Gazda'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await A.step('Continuă');
  await A.step('Creează');
  const code = await A.waitFor(`(() => { const c = document.querySelector('.room-code')?.textContent?.trim(); return /^[A-Z0-9]{6}$/.test(c ?? '') ? c : ''; })()`, 10000, 'room code');

  // B: joins with the invite link.
  await B.goto(`${BASE}?room=${code}&online&debug`);
  await B.step('Intră la bâlci');
  // Same browser profile as A: the saved name greets B first ("Salut, Gazda!").
  await B.waitFor(`!!document.querySelector('input') || [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Schimbă numele')`);
  await B.click('Schimbă numele');
  await B.waitFor(`!!document.querySelector('input')`);
  await B.eval(`(() => { const i = document.querySelector('input'); i.value = 'Ascuns'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await B.step('Continuă');
  await B.waitFor(`(window.__game?.scene.getScenes(true) ?? []).some((s) => s.scene.key === 'lobby')`, 10000, 'B in the lobby');

  /** B (visible) reverses off the ring (cars start facing the middle): A is left alone and wins the round. */
  const driveOut = async () => {
    await B.waitFor(`(() => { const s = window.__game.scene.getScene('game'); const st = s?.sys.isActive() && s.transport.getState(); return st && st.phase === 'playing' && st.roundTick > 95; })()`, 20000, 'B playing');
    await B.key('keyDown', 'ArrowDown', 'ArrowDown', 40);
    await B.waitFor(`(() => { const t = window.__game.scene.getScene('game').transport; return !t.getState().players[t.playerId].alive; })()`, 40000, 'B off the ring');
    await B.key('keyUp', 'ArrowDown', 'ArrowDown', 40);
  };
  const phaseOfA = (phase) =>
    A.waitFor(`window.__game.scene.getScene('game')?.sys.isActive() && window.__game.scene.getScene('game').transport.getState().phase === '${phase}'`, 60000, `A in ${phase}`);

  if (WHEN === 'start') await hide(B);
  await A.step('Start');
  if (WHEN === 'round') {
    await sleep(5000);
    await hide(B);
  }
  if (WHEN === 'intermission') {
    await driveOut();
    await phaseOfA('intermission');
    await hide(B);
  }
  if (WHEN === 'podium') {
    // Three rounds (the default), each ended by B leaving the ring.
    for (let r = 0; r < 3; r++) await driveOut();
    await phaseOfA('finished');
    await hide(B);
  }
  // Read B's page from the outside (a frozen page answers nothing until it is thawed).
  const visibility = MODE === 'freeze' ? 'frozen' : await B.eval('document.visibilityState');
  report.push(`B away (${MODE}, from ${WHEN}): visibility ${visibility}`);
  ok(MODE === 'freeze' || visibility === 'hidden', `B's page is hidden while away (${visibility})`);

  await sleep(AWAY_S * 1000);
  const aSnap = await A.snapshot();
  report.push(`A after ${AWAY_S}s: ${JSON.stringify(aSnap)}`);

  // B's car as the server has it (A's newest server state, updated even while A's tab is hidden).
  const serverB = () =>
    A.eval(`(() => { const s = window.__game.scene.getScene('game').transport.latest; const b = Object.values(s.players).find((p) => p.name === 'Ascuns'); return b && { x: b.x, y: b.y, alive: b.alive, connected: b.connected, idle: b.idle, phase: s.phase, roundTick: s.roundTick }; })()`);
  const FP = 256; // sub-units per pixel
  const driving = (s) => s && s.phase === 'playing' && s.alive && s.roundTick > 95; // past the 3-2-1 countdown
  // "zzz": away for more than 2 s of a round, the others see B as idle.
  const away = await serverB();
  if (args.shot) {
    // --shot <file.png>: A's screen while B is away (the "zzz" over B's car).
    await A.front();
    const { data } = await call('Page.captureScreenshot', { format: 'png' }, A.sessionId);
    writeFileSync(args.shot, Buffer.from(data, 'base64'));
  }
  if (away?.phase === 'playing' && away.roundTick > 3 * 30 + 2 * 30 + 15 && AWAY_S >= 3) ok(away.idle === true, `A sees B idle ("zzz") while B is away (idle=${away.idle})`);

  await show(B);
  const back = Date.now();
  let snap;
  // Gas + steer are held from when the game shows (a key already down when the scene starts is not seen
  // by it, and a player presses keys once they see the game anyway).
  let pressed = false;
  const press = async () => {
    pressed = true;
    await B.key('keyDown', 'ArrowUp', 'ArrowUp', 38);
    await B.key('keyDown', 'ArrowLeft', 'ArrowLeft', 37);
  };
  let sceneMs = -1;
  let connectedMs = -1;
  let respondMs = -1;
  let from = null; // where the server had B when the keys went down (or when it could first drive after that)
  let fromAt = back;
  while (Date.now() - back < 7000) { // room for a 3-2-1 countdown before driving can be checked
    snap = await B.snapshot();
    const t = Date.now() - back;
    if (sceneMs < 0 && snap.scenes.includes('game') && !snap.scenes.includes('lobby') && !snap.htmlScreen) sceneMs = t;
    if (connectedMs < 0 && snap.status === 'connected' && snap.me?.connected) connectedMs = t;
    if (sceneMs >= 0 && !pressed) await press();
    const s = await serverB();
    if (pressed && !from && driving(s)) { from = s; fromAt = Date.now(); }
    if (from && respondMs < 0 && driving(s) && Math.hypot(s.x - from.x, s.y - from.y) / FP > 5) respondMs = Date.now() - fromAt;
    // Done once driving answered, or when there is nothing to drive (between rounds, podium, B out); a countdown is waited out.
    if (sceneMs >= 0 && connectedMs >= 0 && (respondMs >= 0 || !(s.phase === 'playing' && s.alive))) break;
    await sleep(50);
  }
  if (pressed) await B.key('keyUp', 'ArrowUp', 'ArrowUp', 38);
  await B.key('keyUp', 'ArrowLeft', 'ArrowLeft', 37);
  report.push(`B after coming back: ${JSON.stringify(snap)}`);
  if (args.verbose) {
    report.push(`  B internals: ${JSON.stringify(await B.eval(`(() => { const s = window.__game.scene.getScene('game'); const t = s.transport; return { canDrive: t.predictor.canDrive(), seq: t.predictor.seq, unconfirmed: t.predictor.unconfirmed, steer: t.steer, throttle: t.throttle, focus: document.hasFocus(), keyUp: s.input.keyboard.addKey('UP').isDown }; })()`))}`);
    report.push(`  server's B: ${JSON.stringify(await A.eval(`(() => { const s = window.__game.scene.getScene('game').transport.latest; const b = Object.values(s.players).find((p) => p.name === 'Ascuns'); return { lastSeq: b.lastSeq, steer: b.steer, throttle: b.throttle, connected: b.connected }; })()`))}`);
  }
  ok(sceneMs >= 0 && sceneMs <= 1000, `B is in the game scene, HTML lobby gone, within 1 s (${sceneMs} ms)`);
  ok(connectedMs >= 0 && connectedMs <= 1000, `B is connected, and the server knows it, within 1 s (${connectedMs} ms)`);
  if (from) {
    ok(respondMs >= 0 && respondMs <= 1000, `the server moves B's car under B's keys within 1 s (${respondMs} ms)`);
    ok((await serverB())?.idle === false, 'B is no longer idle once driving again');
  }
  else report.push(`(no driving check: phase ${snap.phase}, B alive ${snap.me?.alive})`);
} catch (err) {
  report.push(`FAIL ${err.message}`);
} finally {
  for (const line of report) console.log(line);
  for (const who of ['A', 'B']) for (const l of logs[who].slice(0, 10)) console.log(`  ${who} log: ${l}`);
  const failed = report.some((l) => l.startsWith('FAIL'));
  console.log(failed ? 'RESULT: FAIL' : 'RESULT: OK');
  ws.close();
  chrome.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(failed ? 1 : 0);
}
