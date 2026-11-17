// Smoke EDICIÓN 2.3.8 — sexta parte: foco tras la transición + XTEST real.
// Hallazgo de la parte 5: tras ocultar #loginView, document.activeElement
// SIGUE siendo #loginPass (oculto). Aquí se mide si se corrige solo con
// el tiempo, si las teclas sin clic van al campo oculto, y si el tecleo
// REAL X11 (teclado físico a nivel de SO) llega al formulario tras la
// transición y tras un alert().
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TMP = path.join('/home/hatch/workspace/tmp/smoke238-edit6');
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
  console.log('[SMOKE-EDIT6-238] ' + step + ' ' + JSON.stringify(obj));
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
function typeXtest(text) {
  return new Promise((resolve) => {
    execFile('python3', [path.join(ROOT, 'scripts', 'xtest-type.py'), 'Checklist', text],
      { env: process.env, timeout: 30000 },
      (err, stdout, stderr) => resolve({ err: err ? String(err.message || err).slice(0, 200) : null, out: (stdout || '').trim().slice(0, 1500), stderr: (stderr || '').trim().slice(0, 300) }));
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
async function clickTypeCDP(win, selector, text) {
  const c = await mouseClick(win, selector);
  await typeReal(win, text);
  await sleep(150);
  const v = await js(win, `function(){var el=document.querySelector('${selector}');
    return {value: el?el.value:null, active: document.activeElement===el, hasFocus: document.hasFocus()};}`);
  return { click: c, typed: text, result: v, ok: v.value && v.value.indexOf(text) !== -1 };
}
async function clickTypeXTEST(win, selector, text) {
  const c = await mouseClick(win, selector);
  const x = await typeXtest(text);
  await sleep(300);
  const v = await js(win, `function(){var el=document.querySelector('${selector}');
    return {value: el?el.value:null, active: document.activeElement===el, hasFocus: document.hasFocus()};}`);
  return { click: c, xtest: x, typed: text, result: v, ok: v.value && v.value.indexOf(text) !== -1 };
}

async function main() {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'www'), TMPWWW, { recursive: true });
  fs.writeFileSync(path.join(TMPWWW, 'firebase-config.js'),
    "// placeholder SOLO para el smoke test local 2.3.8f\nwindow.FIREBASE_CONFIG = { apiKey: 'TU_API_KEY' };\n");

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

  // 1. Login: tecleo CDP en usuario y contraseña.
  await js(win, `function(){document.getElementById('loginView').hidden=false;return true;}`);
  await sleep(300);
  await clickTypeCDP(win, '#loginEmail', 'gerardo');
  const loginPass = await clickTypeCDP(win, '#loginPass', 'secreto123');
  log('1-login-pass', loginPass);

  // 2. Transición con el foco en #loginPass; medir activeElement en el tiempo.
  await js(win, `function(){
    document.getElementById('loginView').hidden = true;
    document.getElementById('mainApp').hidden = false;
    document.getElementById('appHeader').hidden = false;
    applyRoleUI(); prefillTecnico(); render();
    return true;}`);
  const focusPoll = {};
  for (const wait of [0, 100, 500, 1500]) {
    await sleep(wait === 0 ? 0 : wait - (wait === 100 ? 0 : 0));
    if (wait > 0) await sleep(0);
    focusPoll['t+' + wait + 'ms'] = await js(win, `function(){var a=document.activeElement;
      return {active: a?(a.id||a.tagName):null, hasFocus: document.hasFocus()};}`);
    if (wait === 0) await sleep(100);
    else if (wait === 100) await sleep(400);
    else if (wait === 500) await sleep(1000);
  }
  log('2-foco-tras-transicion', focusPoll);

  // 3. Teclear SIN clicar: ¿a dónde van las teclas?
  await typeReal(win, 'XYZ');
  await sleep(200);
  const noClick = await js(win, `function(){return {loginPass: document.getElementById('loginPass').value,
    loginEmail: document.getElementById('loginEmail').value, fUser: document.getElementById('fUser').value,
    active: document.activeElement.id, hasFocus: document.hasFocus()};}`);
  log('3-teclas-sin-clic', noClick);

  // 4. Abrir formulario y tecleo CDP (control).
  await mouseClick(win, '#btnShowNew');
  await sleep(300);
  const invCDP = await clickTypeCDP(win, '#fInv', 'inv111');
  log('4-fInv-CDP', invCDP);

  // 5. Tecleo REAL XTEST tras la transición.
  const userXTEST = await clickTypeXTEST(win, '#fUser', 'maria xtest');
  log('5-fUser-XTEST', userXTEST);

  // 6. alert() real; aceptar vía CDP; XTEST después.
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
  await js(win, `function(){alert('Prueba de diálogo 5'); return true;}`);
  await sleep(600);
  const afterAlert = await js(win, `function(){return {dialogSeen: ${dialogSeen}, hasFocus: document.hasFocus(), active: document.activeElement.id};}`);
  log('6-tras-alert', afterAlert);
  const areaXTEST = await clickTypeXTEST(win, '#fArea', 'soporte xtest');
  log('6-fArea-XTEST-tras-alert', areaXTEST);
  win.focus();
  await sleep(500);
  const correoXTEST = await clickTypeXTEST(win, '#fCorreo', 'a@b.com');
  log('6-fCorreo-XTEST-tras-winfocus', correoXTEST);

  console.log('[SMOKE-EDIT6-238] RESULTADO ' + JSON.stringify(results, null, 2));
  app.exit(0);
}

app.whenReady().then(main).catch((e) => {
  console.error('[SMOKE-EDIT6-238] FALLO:', e && e.message ? e.message : e);
  console.log('[SMOKE-EDIT6-238] RESULTADO-PARCIAL ' + JSON.stringify(results, null, 2));
  app.exit(2);
});
