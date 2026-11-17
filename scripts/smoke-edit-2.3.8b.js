// Smoke EDICIÓN 2.3.8 — segunda parte: (1) retest de #search y #fReA con scroll
// previo (en la primera parte fallaron por estar fuera del viewport, no por
// el tecleo); (2) foco tras el alert(): ¿document.hasFocus() se queda en
// false después de aceptar el diálogo nativo y se recupera con win.focus()?
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const TMP = path.join('/home/hatch/workspace/tmp/smoke238-edit2');
const TMPWWW = path.join(TMP, 'www');
const SHOTDIR = path.join(ROOT, 'docs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (typeof process.getuid === 'function' && process.getuid() === 0) {
  app.commandLine.appendSwitch('no-sandbox');
}
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.setPath('userData', path.join(TMP, 'userData'));

const results = {};
function log(step, obj) {
  results[step] = obj;
  console.log('[SMOKE-EDIT2-238] ' + step + ' ' + JSON.stringify(obj));
}
async function js(win, fnString) {
  return win.webContents.executeJavaScript('(' + fnString + ')()', true);
}
async function typeReal(win, text) {
  for (const ch of text) {
    win.webContents.sendInputEvent({ type: 'keyDown', key: ch, keyCode: ch });
    win.webContents.sendInputEvent({ type: 'char', key: ch, keyCode: ch });
    win.webContents.sendInputEvent({ type: 'keyUp', key: ch, keyCode: ch });
    await sleep(20);
  }
}
async function mouseClick(win, selector) {
  const r = await js(win, `function(){var el=document.querySelector('${selector}');
    if(!el) return null; var b=el.getBoundingClientRect();
    return {x: Math.round(b.left+b.width/2), y: Math.round(b.top+b.height/2)};}`);
  if (!r) return { clicked: false, reason: 'sin elemento' };
  win.webContents.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await sleep(200);
  return js(win, `function(){var a=document.activeElement;
    return {active: a?(a.id||a.tagName):null, hasFocus: document.hasFocus()};}`);
}
async function scrollClickType(win, selector, text) {
  await js(win, `function(){var el=document.querySelector('${selector}');
    if(el) el.scrollIntoView({block:'center'}); return true;}`);
  await sleep(400);
  const c = await mouseClick(win, selector);
  await typeReal(win, text);
  await sleep(150);
  const v = await js(win, `function(){var el=document.querySelector('${selector}');
    return {value: el?el.value:null, active: document.activeElement===el, hasFocus: document.hasFocus()};}`);
  return { click: c, typed: text, result: v, ok: v.value === text };
}

async function main() {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'www'), TMPWWW, { recursive: true });
  fs.writeFileSync(path.join(TMPWWW, 'firebase-config.js'),
    "// placeholder SOLO para el smoke test local 2.3.8b\nwindow.FIREBASE_CONFIG = { apiKey: 'TU_API_KEY' };\n");

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
  await sleep(1200);

  // 1. Retest búsqueda y Reasignar con scroll previo.
  const search = await scrollClickType(win, '#search', 'LENOVO');
  log('retest-search', search);
  await mouseClick(win, '#btnShowRe');
  await sleep(300);
  const reA = await scrollClickType(win, '#fReA', 'Juan Perez');
  log('retest-fReA', reA);
  await js(win, `function(){document.getElementById('reBox').hidden=true;return true;}`);
  // 2. Campo de plantilla.
  await mouseClick(win, '#btnShowTpl');
  await sleep(300);
  const tpl = await scrollClickType(win, '#tplText', 'Punto nuevo');
  log('retest-tplText', tpl);

  // 3. Foco antes/después de un alert() real y tras win.focus().
  const before = await js(win, `function(){return {hasFocus: document.hasFocus()};}`);
  log('foco-antes-alert', before);
  let dialogSeen = false;
  try {
    win.webContents.debugger.attach('1.3');
    win.webContents.debugger.on('message', (e, method) => {
      if (method === 'Page.javascriptDialogOpening') {
        dialogSeen = true;
        win.webContents.debugger.sendCommand('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
      }
    });
    await win.webContents.debugger.sendCommand('Page.enable');
  } catch (e) { log('debugger-no-disponible', { err: String(e) }); }
  await js(win, `function(){alert('Prueba de diálogo'); return true;}`);
  await sleep(600);
  const afterAlert = await js(win, `function(){return {dialogSeen: ${dialogSeen}, hasFocus: document.hasFocus()};}`);
  log('foco-despues-alert', afterAlert);
  // Clic real en un campo y tecleo: ¿el clic recupera el foco del documento?
  const f = await scrollClickType(win, '#fInv', 'INV-777');
  log('foco-tras-clic-en-campo', { clickActive: f.click.active, typedOk: f.ok, value: f.result.value });
  const afterClick = await js(win, `function(){return {hasFocus: document.hasFocus(), active: document.activeElement.id};}`);
  log('foco-despues-clic', afterClick);
  // ¿win.focus() desde el proceso principal lo recupera?
  win.focus();
  await sleep(500);
  const afterWinFocus = await js(win, `function(){return {hasFocus: document.hasFocus(), active: document.activeElement.id};}`);
  log('foco-despues-win-focus', afterWinFocus);
  // Tecleo tras win.focus().
  await js(win, `function(){document.getElementById('fUser').value='';return true;}`);
  const afterWinFocusType = await scrollClickType(win, '#fUser', 'Lucia');
  log('tecleo-tras-win-focus', afterWinFocusType);

  console.log('[SMOKE-EDIT2-238] RESULTADO ' + JSON.stringify(results, null, 2));
  app.exit(0);
}

app.whenReady().then(main).catch((e) => {
  console.error('[SMOKE-EDIT2-238] FALLO:', e && e.message ? e.message : e);
  console.log('[SMOKE-EDIT2-238] RESULTADO-PARCIAL ' + JSON.stringify(results, null, 2));
  app.exit(2);
});
