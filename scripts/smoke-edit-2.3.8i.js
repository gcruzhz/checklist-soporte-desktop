// Smoke EDICIÓN 2.3.8 — novena parte (prueba causal final):
// 1. XTEST base (funciona).
// 2. Conectar debugger, listar ventanas (¿el debugger crea ventana?).
// 3. alert() + aceptar vía CDP.
// 4. Listar ventanas (¿qué ventana NUEVA aparece por el alert?).
// 5. XTEST (debe fallar).
// 6. Destruir la ventana sobrante con XDestroyWindow.
// 7. XTEST de nuevo: ¿se recupera el teclado real?
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TMP = path.join('/home/hatch/workspace/tmp/smoke238-edit9');
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
  console.log('[SMOKE-EDIT9-238] ' + step + ' ' + JSON.stringify(obj));
}
async function js(win, fnString) {
  return win.webContents.executeJavaScript('(' + fnString + ')()', true);
}
function runPy(args) {
  return new Promise((resolve) => {
    execFile('python3', [path.join(ROOT, 'scripts', 'xwin.py')].concat(args),
      { env: process.env, timeout: 15000 },
      (err, stdout, stderr) => resolve({ err: err ? String(err.message || err).slice(0, 150) : null, out: (stdout || '').trim() }));
  });
}
function typeXtest(text) {
  return new Promise((resolve) => {
    execFile('python3', [path.join(ROOT, 'scripts', 'xtest-type.py'), 'Checklist', text],
      { env: process.env, timeout: 30000 },
      (err, stdout) => resolve({ err: err ? String(err.message || err).slice(0, 150) : null, out: (stdout || '').trim().slice(0, 300) }));
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
function parseIds(listOut) {
  const ids = [];
  (listOut || '').split('\n').forEach((line) => {
    const m = line.match(/id=(\d+)/);
    if (m) ids.push(m[1]);
  });
  return ids;
}

async function main() {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'www'), TMPWWW, { recursive: true });
  fs.writeFileSync(path.join(TMPWWW, 'firebase-config.js'),
    "// placeholder SOLO para el smoke test local 2.3.8i\nwindow.FIREBASE_CONFIG = { apiKey: 'TU_API_KEY' };\n");
  const win = new BrowserWindow({
    width: 1200, height: 800, title: 'Checklist de Soporte',
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  ipcMain.handle('desktop-get-machine-id', async () => 'SERIE-DETECTADA-1');
  ipcMain.handle('desktop-open-external', async () => true);
  await win.loadFile(path.join(TMPWWW, 'index.html'));
  win.focus();
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    const ready = await js(win, `function(){return {authReady: window._authReady, mainHidden: document.getElementById('mainApp').hidden};}`);
    if (ready.authReady && !ready.mainHidden) break;
  }
  for (let i = 0; i < 30; i++) {
    const s = await js(win, `function(){return !!document.getElementById('splash');}`);
    if (!s) break;
    await sleep(500);
  }
  await sleep(500);
  await mouseClick(win, '#btnShowNew');
  await sleep(300);

  const base = await clickTypeXTEST(win, '#fInv', 'base123');
  log('1-XTEST-base', base);
  const list0 = await runPy(['--list']);
  log('2-ventanas-iniciales', { ids: parseIds(list0.out) });

  await win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Page.enable');
  const listDbg = await runPy(['--list']);
  log('3-ventanas-con-debugger', { ids: parseIds(listDbg.out), nuevas: parseIds(listDbg.out).filter((x) => parseIds(list0.out).indexOf(x) === -1) });

  let dialogSeen = false;
  win.webContents.debugger.on('message', (e, method) => {
    if (method === 'Page.javascriptDialogOpening') {
      dialogSeen = true;
      win.webContents.debugger.sendCommand('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    }
  });
  await js(win, `function(){alert('Prueba de diálogo 8'); return true;}`);
  await sleep(800);
  const listAlert = await runPy(['--list']);
  const nuevasAlert = parseIds(listAlert.out).filter((x) => parseIds(listDbg.out).indexOf(x) === -1);
  log('4-ventanas-tras-alert', { dialogSeen, ids: parseIds(listAlert.out), nuevas: nuevasAlert, detalle: listAlert.out });

  const afterAlertX = await clickTypeXTEST(win, '#fUser', 'alert123');
  log('5-XTEST-tras-alert', afterAlertX);

  // Destruir la(s) ventana(s) nueva(s) del alert y reintentar.
  for (const id of nuevasAlert) {
    const k = await runPy(['--kill', id]);
    log('6-destruir-ventana-' + id, k);
  }
  await sleep(500);
  const listKill = await runPy(['--list']);
  log('7-ventanas-tras-destruir', { ids: parseIds(listKill.out) });
  const recovered = await clickTypeXTEST(win, '#fArea', 'rec123');
  log('8-XTEST-tras-destruir-ventana', recovered);

  console.log('[SMOKE-EDIT9-238] RESULTADO ' + JSON.stringify(results, null, 2));
  app.exit(0);
}

app.whenReady().then(main).catch((e) => {
  console.error('[SMOKE-EDIT9-238] FALLO:', e && e.message ? e.message : e);
  console.log('[SMOKE-EDIT9-238] RESULTADO-PARCIAL ' + JSON.stringify(results, null, 2));
  app.exit(2);
});
