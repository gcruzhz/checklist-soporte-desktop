// Smoke EDICIÓN 2.3.8 — décima parte: ¿también se rompe el teclado real
// cuando el diálogo nativo lo cierra el USUARIO con un clic real en
// "Aceptar" (no con CDP Page.handleJavaScriptDialog)?
// Si también se rompe, el caso está cerrado: el alert() nativo es la causa.
// Si con clic real NO se rompe, el hallazgo de las partes 6-9 sería un
// artefacto del cierre por CDP y habría que reevaluar.
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TMP = path.join('/home/hatch/workspace/tmp/smoke238-edit10');
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
  console.log('[SMOKE-EDIT10-238] ' + step + ' ' + JSON.stringify(obj));
}
async function js(win, fnString) {
  return win.webContents.executeJavaScript('(' + fnString + ')()', true);
}
function runPy(script, args) {
  return new Promise((resolve) => {
    execFile('python3', [path.join(ROOT, 'scripts', script)].concat(args),
      { env: process.env, timeout: 15000 },
      (err, stdout) => resolve({ err: err ? String(err.message || err).slice(0, 150) : null, out: (stdout || '').trim() }));
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
    "// placeholder SOLO para el smoke test local 2.3.8j\nwindow.FIREBASE_CONFIG = { apiKey: 'TU_API_KEY' };\n");
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
  const list0 = await runPy('xwin.py', ['--list']);
  const ids0 = parseIds(list0.out);
  log('2-ventanas-iniciales', { ids: ids0 });

  // Disparar el alert sin bloquear el proceso: setTimeout en la página.
  await js(win, `function(){window._alertDone=false; setTimeout(function(){ alert('Prueba de diálogo 9'); window._alertDone=true; }, 400); return true;}`);
  await sleep(1500);
  const listDlg = await runPy('xwin.py', ['--list']);
  const idsDlg = parseIds(listDlg.out);
  const nuevas = idsDlg.filter((x) => ids0.indexOf(x) === -1);
  log('3-ventanas-con-dialogo-abierto', { ids: idsDlg, nuevas, detalle: listDlg.out });
  // Geometría de la ventana nueva (la del diálogo).
  let geom = null;
  for (const id of nuevas) {
    const g = await runPy('xwin.py', ['--geom', id]);
    log('3-geom-' + id, { out: g.out });
    if (g.out && g.out.indexOf('geom') === 0 && !geom) geom = { id, out: g.out };
  }
  // Intentar cerrar el diálogo con un clic REAL en el botón (abajo, ~75% ancho).
  let dismissed = false;
  if (geom) {
    const m = geom.out.match(/x=(-?\d+) y=(-?\d+) w=(\d+) h=(\d+)/);
    if (m) {
      const dx = parseInt(m[1], 10), dy = parseInt(m[2], 10), dw = parseInt(m[3], 10), dh = parseInt(m[4], 10);
      const tries = [
        [dx + Math.round(dw * 0.75), dy + dh - 22],
        [dx + Math.round(dw * 0.5), dy + dh - 22],
        [dx + Math.round(dw * 0.85), dy + dh - 22],
      ];
      for (const [cx, cy] of tries) {
        const c = await runPy('xclick.py', [String(cx), String(cy)]);
        log('4-clic-real-en-dialogo', { x: cx, y: cy, out: c.out });
        await sleep(700);
        const done = await js(win, `function(){return {alertDone: window._alertDone};}`);
        if (done.alertDone) { dismissed = true; break; }
        const stillThere = await runPy('xwin.py', ['--list']);
        if (parseIds(stillThere.out).indexOf(geom.id) === -1) { dismissed = true; break; }
      }
    }
  }
  log('5-dialogo-cerrado-por-clic-real', { dismissed });
  if (!dismissed) {
    log('5-AVISO', { msg: 'No se pudo cerrar el diálogo con clic real; no se puede discriminar CDP vs clic. Abortando.' });
    app.exit(3);
  }
  await sleep(500);
  const listAfter = await runPy('xwin.py', ['--list']);
  log('6-ventanas-tras-clic-real', { ids: parseIds(listAfter.out), detalle: listAfter.out });

  const afterRealClick = await clickTypeXTEST(win, '#fUser', 'clic123');
  log('7-XTEST-tras-cerrar-dialogo-con-clic-real', afterRealClick);

  console.log('[SMOKE-EDIT10-238] RESULTADO ' + JSON.stringify(results, null, 2));
  app.exit(0);
}

app.whenReady().then(main).catch((e) => {
  console.error('[SMOKE-EDIT10-238] FALLO:', e && e.message ? e.message : e);
  console.log('[SMOKE-EDIT10-238] RESULTADO-PARCIAL ' + JSON.stringify(results, null, 2));
  app.exit(2);
});
