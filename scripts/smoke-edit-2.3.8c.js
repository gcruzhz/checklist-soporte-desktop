// Smoke EDICIÓN 2.3.8 — tercera parte:
// (1) ¿por qué falló #search dos veces? elementFromPoint + rect + estilo.
// (2) Foco tras alert() CON el formulario abierto: alert real -> clic en
//     fInv (¿enfoca?) -> tecleo. Antes y después de win.focus().
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const TMP = path.join('/home/hatch/workspace/tmp/smoke238-edit3');
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
  console.log('[SMOKE-EDIT3-238] ' + step + ' ' + JSON.stringify(obj));
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
    return {x: Math.round(b.left+b.width/2), y: Math.round(b.top+b.height/2), top: Math.round(b.top), left: Math.round(b.left), w: Math.round(b.width), h: Math.round(b.height)};}`);
  if (!r) return { clicked: false, reason: 'sin elemento' };
  win.webContents.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await sleep(200);
  const after = await js(win, `function(){var a=document.activeElement;
    return {active: a?(a.id||a.tagName):null, hasFocus: document.hasFocus()};}`);
  return { clicked: true, rect: r, after };
}

async function main() {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'www'), TMPWWW, { recursive: true });
  fs.writeFileSync(path.join(TMPWWW, 'firebase-config.js'),
    "// placeholder SOLO para el smoke test local 2.3.8c\nwindow.FIREBASE_CONFIG = { apiKey: 'TU_API_KEY' };\n");

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

  // 1. Diagnóstico de #search: rect, qué hay encima, estilo, clic.
  const searchDiag = await js(win, `function(){
    var el=document.getElementById('search'); var b=el.getBoundingClientRect();
    var cx=b.left+b.width/2, cy=b.top+b.height/2;
    var top=document.elementFromPoint(cx,cy);
    var cs=getComputedStyle(el);
    return {rect:{x:Math.round(b.left),y:Math.round(b.top),w:Math.round(b.width),h:Math.round(b.height)},
      center:{x:Math.round(cx),y:Math.round(cy)}, onTop: top?(top.id||top.tagName)+'.'+(top.className||''):null,
      display: cs.display, visibility: cs.visibility, pointerEvents: cs.pointerEvents,
      scrollY: Math.round(window.scrollY), innerH: window.innerHeight};}`);
  log('search-diagnostico', searchDiag);
  const searchClick = await mouseClick(win, '#search');
  log('search-clic', searchClick);
  await typeReal(win, 'LENOVO');
  await sleep(150);
  const searchVal = await js(win, `function(){return {value: document.getElementById('search').value, active: document.activeElement.id, hasFocus: document.hasFocus()};}`);
  log('search-valor', searchVal);

  // 2. Abrir el formulario y tecleo base SIN alert.
  await mouseClick(win, '#btnShowNew');
  await sleep(300);
  const baseClick = await mouseClick(win, '#fInv');
  log('base-clic-fInv', baseClick);
  await typeReal(win, 'AAA');
  await sleep(150);
  const baseVal = await js(win, `function(){return {value: document.getElementById('fInv').value, hasFocus: document.hasFocus()};}`);
  log('base-tecleo-fInv', baseVal);

  // 3. alert() real con el formulario abierto; aceptar vía CDP.
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
  await js(win, `function(){alert('Prueba de diálogo 2'); return true;}`);
  await sleep(600);
  const afterAlert = await js(win, `function(){return {dialogSeen: ${dialogSeen}, hasFocus: document.hasFocus(), active: document.activeElement.id, fInvValue: document.getElementById('fInv').value};}`);
  log('tras-alert', afterAlert);
  // Clic real en fInv (que ya tiene 'AAA') y tecleo.
  const clickAfterAlert = await mouseClick(win, '#fInv');
  log('clic-fInv-tras-alert', clickAfterAlert);
  await typeReal(win, 'BBB');
  await sleep(150);
  const valAfterAlert = await js(win, `function(){return {value: document.getElementById('fInv').value, active: document.activeElement.id, hasFocus: document.hasFocus()};}`);
  log('tecleo-fInv-tras-alert', valAfterAlert);
  // win.focus() y reintento en fUser.
  win.focus();
  await sleep(500);
  const afterWinFocus = await js(win, `function(){return {hasFocus: document.hasFocus()};}`);
  log('tras-win-focus', afterWinFocus);
  const clickUser = await mouseClick(win, '#fUser');
  log('clic-fUser-tras-winfocus', clickUser);
  await typeReal(win, 'Lucia');
  await sleep(150);
  const valUser = await js(win, `function(){return {value: document.getElementById('fUser').value, active: document.activeElement.id, hasFocus: document.hasFocus()};}`);
  log('tecleo-fUser-tras-winfocus', valUser);

  console.log('[SMOKE-EDIT3-238] RESULTADO ' + JSON.stringify(results, null, 2));
  app.exit(0);
}

app.whenReady().then(main).catch((e) => {
  console.error('[SMOKE-EDIT3-238] FALLO:', e && e.message ? e.message : e);
  console.log('[SMOKE-EDIT3-238] RESULTADO-PARCIAL ' + JSON.stringify(results, null, 2));
  app.exit(2);
});
