// Smoke EDICIÓN 2.3.8 — cuarta parte (limpia):
// La parte 3 falló por un artefacto: el splash (#splash, con sus .spin)
// aún no se había retirado (hideSplash corre a los 2400 ms + 500 ms) y su
// .spin.s1 cubría el centro de la pantalla, así que los clics no llegaban
// a #search ni a #btnShowNew. Aquí se espera a que #splash DESAPAREZCA del
// DOM antes de probar nada, y luego: #search, formulario en blanco, alert()
// real con el formulario abierto, clic+tecleo tras el alert, win.focus().
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const TMP = path.join('/home/hatch/workspace/tmp/smoke238-edit4');
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
  console.log('[SMOKE-EDIT4-238] ' + step + ' ' + JSON.stringify(obj));
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
    return {x: Math.round(b.left+b.width/2), y: Math.round(b.top+b.height/2), w: Math.round(b.width), h: Math.round(b.height)};}`);
  if (!r || !r.w || !r.h) return { clicked: false, reason: 'sin rect', rect: r };
  win.webContents.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await sleep(200);
  const after = await js(win, `function(){var a=document.activeElement;
    return {active: a?(a.id||a.tagName):null, hasFocus: document.hasFocus()};}`);
  return { clicked: true, rect: r, after };
}
async function clickType(win, selector, text) {
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
    "// placeholder SOLO para el smoke test local 2.3.8d\nwindow.FIREBASE_CONFIG = { apiKey: 'TU_API_KEY' };\n");

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
    ready = await js(win, `function(){return {authReady: window._authReady, mainHidden: document.getElementById('mainApp').hidden, splash: !!document.getElementById('splash')};}`);
    if (ready.authReady && !ready.mainHidden) break;
  }
  if (!ready || !ready.authReady || ready.mainHidden) throw new Error('no llegó al modo local');
  // Esperar a que el splash DESAPAREZCA del DOM (hideSplash + remove 500 ms).
  let splashGoneAt = -1;
  for (let i = 0; i < 30; i++) {
    const s = await js(win, `function(){return !!document.getElementById('splash');}`);
    if (!s) { splashGoneAt = i * 500; break; }
    await sleep(500);
  }
  log('splash-retirado', { splashGoneAtMs: splashGoneAt });
  await sleep(500);

  // 1. #search con el splash ya fuera.
  const searchTop = await js(win, `function(){var el=document.getElementById('search'); var b=el.getBoundingClientRect();
    var top=document.elementFromPoint(b.left+b.width/2, b.top+b.height/2);
    return {onTop: top?(top.id||top.tagName):null};}`);
  log('search-elemento-encima', searchTop);
  const search = await clickType(win, '#search', 'LENOVO');
  log('search-tecleo', search);

  // 2. Formulario en blanco.
  await mouseClick(win, '#btnShowNew');
  await sleep(300);
  const inv = await clickType(win, '#fInv', 'INV-111');
  log('form-blanco-fInv', inv);
  const user = await clickType(win, '#fUser', 'Maria');
  log('form-blanco-fUser', user);

  // 3. alert() real con el formulario abierto.
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
  const beforeAlert = await js(win, `function(){return {hasFocus: document.hasFocus(), active: document.activeElement.id};}`);
  log('antes-alert', beforeAlert);
  await js(win, `function(){alert('Prueba de diálogo 3'); return true;}`);
  await sleep(600);
  const afterAlert = await js(win, `function(){return {dialogSeen: ${dialogSeen}, hasFocus: document.hasFocus(), active: document.activeElement.id};}`);
  log('tras-alert', afterAlert);
  const invAfter = await clickType(win, '#fInv', '999');
  log('tecleo-fInv-tras-alert', invAfter);
  const userAfter = await clickType(win, '#fUser', ' Pedro');
  log('tecleo-fUser-tras-alert', userAfter);
  win.focus();
  await sleep(500);
  const afterWinFocus = await js(win, `function(){return {hasFocus: document.hasFocus()};}`);
  log('tras-win-focus', afterWinFocus);
  const areaAfter = await clickType(win, '#fArea', 'Ventas');
  log('tecleo-fArea-tras-winfocus', areaAfter);

  console.log('[SMOKE-EDIT4-238] RESULTADO ' + JSON.stringify(results, null, 2));
  app.exit(0);
}

app.whenReady().then(main).catch((e) => {
  console.error('[SMOKE-EDIT4-238] FALLO:', e && e.message ? e.message : e);
  console.log('[SMOKE-EDIT4-238] RESULTADO-PARCIAL ' + JSON.stringify(results, null, 2));
  app.exit(2);
});
