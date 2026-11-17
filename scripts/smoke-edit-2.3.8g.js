// Smoke EDICIÓN 2.3.8 — séptima parte: discriminar alert() vs debugger.
// La parte 6 dejó dos variables mezcladas: tras el alert() (aceptado vía
// CDP, con el debugger conectado) el tecleo REAL XTEST dejó de llegar,
// aunque CDP seguía funcionando. Aquí se separa:
//  1. XTEST base (sin debugger, sin alert).
//  2. Conectar debugger (sin alert) -> XTEST. ¿El debugger rompe el tecleo?
//  3. alert() + aceptar vía CDP (debugger sigue conectado) -> XTEST.
//  4. Desconectar debugger -> XTEST. ¿Se recupera?
//  5. win.blur() + win.focus() -> XTEST. ¿Se recupera?
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TMP = path.join('/home/hatch/workspace/tmp/smoke238-edit7');
const TMPWWW = path.join(TMP, 'www');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (typeof process.getuid === 'function' && process.getuid() === 0) {
  app.commandLine.appendSwitch('no-sandbox');
}
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.setPath('userData', path.join(TMP, 'userData'));

const results = {};
function log(step, obj) {
  results[step] = obj;
  console.log('[SMOKE-EDIT7-238] ' + step + ' ' + JSON.stringify(obj));
}
async function js(win, fnString) {
  return win.webContents.executeJavaScript('(' + fnString + ')()', true);
}
function typeXtest(text) {
  return new Promise((resolve) => {
    execFile('python3', [path.join(ROOT, 'scripts', 'xtest-type.py'), 'Checklist', text],
      { env: process.env, timeout: 30000 },
      (err, stdout, stderr) => resolve({ err: err ? String(err.message || err).slice(0, 200) : null, out: (stdout || '').trim().slice(0, 400) }));
  });
}
async function mouseClick(win, selector) {
  const r = await js(win, `function(){var el=document.querySelector('${selector}');
    if(!el) return null; var b=el.getBoundingClientRect();
    return {x: Math.round(b.left+b.width/2), y: Math.round(b.top+b.height/2), w: Math.round(b.width), h: Math.round(b.height)};}`);
  if (!r || !r.w || !r.h) return { clicked: false, reason: 'sin rect', rect: r };
  win.webContents.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await sleep(200);
  const after = await js(win, `function(){var a=document.activeElement;
    return {active: a?(a.id||a.tagName):null, hasFocus: document.hasFocus()};}`);
  return { clicked: true, rect: r, after };
}
async function clickTypeXTEST(win, selector, text) {
  await js(win, `function(){document.querySelector('${selector}').value='';return true;}`);
  const c = await mouseClick(win, selector);
  const x = await typeXtest(text);
  await sleep(300);
  const v = await js(win, `function(){var el=document.querySelector('${selector}');
    return {value: el?el.value:null, active: document.activeElement===el, hasFocus: document.hasFocus()};}`);
  return { click: c, xtest: x, typed: text, result: v, ok: v.value === text };
}

async function main() {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'www'), TMPWWW, { recursive: true });
  fs.writeFileSync(path.join(TMPWWW, 'firebase-config.js'),
    "// placeholder SOLO para el smoke test local 2.3.8g\nwindow.FIREBASE_CONFIG = { apiKey: 'TU_API_KEY' };\n");

  const win = new BrowserWindow({
    width: 1200, height: 800, title: 'Checklist de Soporte',
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  });
  ipcMain.handle('desktop-get-machine-id', async () => 'SERIE-DETECTADA-1');
  ipcMain.handle('desktop-open-external', async () => true);
  await win.loadFile(path.join(TMPWWW, 'index.html'));
  win.focus();

  let ready = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    ready = await js(win, `function(){return {authReady: window._authReady, mainHidden: document.getElementById('mainApp').hidden};}`);
    if (ready.authReady && !ready.mainHidden) break;
  }
  if (!ready || !ready.authReady || ready.mainHidden) throw new Error('no llegó al modo local');
  for (let i = 0; i < 30; i++) {
    const s = await js(win, `function(){return !!document.getElementById('splash');}`);
    if (!s) break;
    await sleep(500);
  }
  await sleep(500);
  await mouseClick(win, '#btnShowNew');
  await sleep(300);

  // 1. Base: XTEST sin debugger ni alert.
  const base = await clickTypeXTEST(win, '#fInv', 'base123');
  log('1-XTEST-base', base);

  // 2. Conectar debugger (sin alert) -> XTEST.
  await win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Page.enable');
  const withDbg = await clickTypeXTEST(win, '#fUser', 'dbg123');
  log('2-XTEST-con-debugger', withDbg);

  // 3. alert() + aceptar vía CDP (debugger conectado) -> XTEST.
  let dialogSeen = false;
  win.webContents.debugger.on('message', (e, method) => {
    if (method === 'Page.javascriptDialogOpening') {
      dialogSeen = true;
      win.webContents.debugger.sendCommand('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    }
  });
  await js(win, `function(){alert('Prueba de diálogo 6'); return true;}`);
  await sleep(600);
  const afterAlert = await js(win, `function(){return {dialogSeen: ${dialogSeen}, hasFocus: document.hasFocus()};}`);
  log('3-tras-alert', afterAlert);
  const afterAlertX = await clickTypeXTEST(win, '#fArea', 'alert123');
  log('3-XTEST-tras-alert', afterAlertX);

  // 4. Desconectar debugger -> XTEST.
  try { win.webContents.debugger.detach(); } catch (e) { /* ya estaba */ }
  await sleep(500);
  const noDbg = await clickTypeXTEST(win, '#fCorreo', 'nodb123');
  log('4-XTEST-sin-debugger-tras-alert', noDbg);

  // 5. win.blur() + win.focus() -> XTEST.
  win.blur();
  await sleep(500);
  win.focus();
  await sleep(500);
  const refocus = await clickTypeXTEST(win, '#fInv', 'foco123');
  log('5-XTEST-tras-blur-focus', refocus);
  const hasFocusEnd = await js(win, `function(){return {hasFocus: document.hasFocus()};}`);
  log('5-hasFocus-final', hasFocusEnd);

  console.log('[SMOKE-EDIT7-238] RESULTADO ' + JSON.stringify(results, null, 2));
  app.exit(0);
}

app.whenReady().then(main).catch((e) => {
  console.error('[SMOKE-EDIT7-238] FALLO:', e && e.message ? e.message : e);
  console.log('[SMOKE-EDIT7-238] RESULTADO-PARCIAL ' + JSON.stringify(results, null, 2));
  app.exit(2);
});
