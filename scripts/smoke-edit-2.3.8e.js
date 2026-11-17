// Smoke EDICIÓN 2.3.8 — quinta parte: LA TRANSICIÓN login -> principal.
// Gerardo escribió su contraseña con el teclado físico y funcionó; al
// aparecer la pantalla principal el teclado muere en TODOS los campos.
// Aquí se reproduce la transición completa (login real visible -> entrar
// -> teclear en el formulario) y se compara tecleo CDP (sendInputEvent,
// que no pasa por el foco de ventana del SO) con tecleo REAL X11/XTEST
// (scripts/xtest-type.py, como un teclado físico).
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TMP = path.join('/home/hatch/workspace/tmp/smoke238-edit5');
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
  console.log('[SMOKE-EDIT5-238] ' + step + ' ' + JSON.stringify(obj));
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
    execFile('python3', [path.join(ROOT, 'scripts', 'xtest-type.py'), 'Checklist de Soporte', text],
      { env: process.env, timeout: 30000 },
      (err, stdout, stderr) => resolve({ err: err ? String(err.message || err) : null, out: (stdout || '').trim(), stderr: (stderr || '').trim() }));
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
  return { click: c, typed: text, result: v, ok: v.value === text };
}
async function clickTypeXTEST(win, selector, text) {
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
    "// placeholder SOLO para el smoke test local 2.3.8e\nwindow.FIREBASE_CONFIG = { apiKey: 'TU_API_KEY' };\n");

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
  let splashGoneAt = -1;
  for (let i = 0; i < 30; i++) {
    const s = await js(win, `function(){return !!document.getElementById('splash');}`);
    if (!s) { splashGoneAt = i * 500; break; }
    await sleep(500);
  }
  log('splash-retirado', { splashGoneAtMs: splashGoneAt });
  await sleep(500);

  // 1. Pantalla de LOGIN real: tecleo CDP en usuario y contraseña.
  await js(win, `function(){document.getElementById('loginView').hidden=false;return true;}`);
  await sleep(300);
  const loginUser = await clickTypeCDP(win, '#loginEmail', 'gerardo');
  log('1-login-email-CDP', loginUser);
  const loginPass = await clickTypeCDP(win, '#loginPass', 'secreto123');
  log('1-login-pass-CDP', loginPass);

  // 2. LA TRANSICIÓN (igual que onAuthChanged con éxito, con el foco en
  // #loginPass): ocultar login, mostrar principal, prefill, render.
  const trans = await js(win, `function(){
    var before = {active: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null, hasFocus: document.hasFocus()};
    document.getElementById('loginView').hidden = true;
    document.getElementById('mainApp').hidden = false;
    document.getElementById('appHeader').hidden = false;
    applyRoleUI();
    prefillTecnico();
    render();
    var after = {active: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null, hasFocus: document.hasFocus()};
    return {before, after};}`);
  log('2-transicion-login-a-principal', trans);

  // 3. Formulario en blanco tras la transición: tecleo CDP.
  await mouseClick(win, '#btnShowNew');
  await sleep(300);
  const invCDP = await clickTypeCDP(win, '#fInv', 'inv111');
  log('3-form-fInv-CDP-tras-transicion', invCDP);

  // 4. Tecleo REAL XTEST tras la transición (ventana con foco X).
  const userXTEST = await clickTypeXTEST(win, '#fUser', 'maria xtest');
  log('4-form-fUser-XTEST-tras-transicion', userXTEST);

  // 5. alert() real tras la transición; aceptar vía CDP; luego XTEST.
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
  await js(win, `function(){alert('Prueba de diálogo 4'); return true;}`);
  await sleep(600);
  const afterAlert = await js(win, `function(){return {dialogSeen: ${dialogSeen}, hasFocus: document.hasFocus(), active: document.activeElement.id};}`);
  log('5-tras-alert', afterAlert);
  const areaXTEST = await clickTypeXTEST(win, '#fArea', 'soporte xtest');
  log('5-form-fArea-XTEST-tras-alert', areaXTEST);
  const areaCDP = await clickTypeCDP(win, '#fArea', ' cd');
  log('5-form-fArea-CDP-tras-alert', areaCDP);
  // win.focus() del proceso principal y reintento XTEST.
  win.focus();
  await sleep(500);
  const afterWinFocus = await js(win, `function(){return {hasFocus: document.hasFocus()};}`);
  log('5-tras-win-focus', afterWinFocus);
  const correoXTEST = await clickTypeXTEST(win, '#fCorreo', 'a@b.com');
  log('5-form-fCorreo-XTEST-tras-winfocus', correoXTEST);

  console.log('[SMOKE-EDIT5-238] RESULTADO ' + JSON.stringify(results, null, 2));
  app.exit(0);
}

app.whenReady().then(main).catch((e) => {
  console.error('[SMOKE-EDIT5-238] FALLO:', e && e.message ? e.message : e);
  console.log('[SMOKE-EDIT5-238] RESULTADO-PARCIAL ' + JSON.stringify(results, null, 2));
  app.exit(2);
});
