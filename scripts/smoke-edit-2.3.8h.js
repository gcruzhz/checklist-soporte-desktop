// Smoke EDICIÓN 2.3.8 — octava parte (corta): ¿queda una ventana de diálogo
// viva tras aceptar el alert() vía CDP? Si el diálogo nativo deja una
// ventana (o un grab de teclado) viva, eso explicaría que el teclado real
// deje de llegar a la ventana principal aunque el foco DOM/X parezca bien.
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TMP = path.join('/home/hatch/workspace/tmp/smoke238-edit8');
const TMPWWW = path.join(TMP, 'www');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (typeof process.getuid === 'function' && process.getuid() === 0) {
  app.commandLine.appendSwitch('no-sandbox');
}
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.setPath('userData', path.join(TMP, 'userData'));

function log(step, obj) {
  console.log('[SMOKE-EDIT8-238] ' + step + ' ' + JSON.stringify(obj));
}
async function js(win, fnString) {
  return win.webContents.executeJavaScript('(' + fnString + ')()', true);
}
function xlist() {
  return new Promise((resolve) => {
    execFile('python3', [path.join(ROOT, 'scripts', 'xtest-type.py'), '--list'],
      { env: process.env, timeout: 15000 },
      (err, stdout) => resolve((stdout || '').trim()));
  });
}

async function main() {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'www'), TMPWWW, { recursive: true });
  fs.writeFileSync(path.join(TMPWWW, 'firebase-config.js'),
    "// placeholder SOLO para el smoke test local 2.3.8h\nwindow.FIREBASE_CONFIG = { apiKey: 'TU_API_KEY' };\n");
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
  log('ventanas-antes-alert', { list: await xlist() });
  let dialogSeen = false;
  await win.webContents.debugger.attach('1.3');
  win.webContents.debugger.on('message', (e, method) => {
    if (method === 'Page.javascriptDialogOpening') {
      dialogSeen = true;
      win.webContents.debugger.sendCommand('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    }
  });
  await win.webContents.debugger.sendCommand('Page.enable');
  await js(win, `function(){alert('Prueba de diálogo 7'); return true;}`);
  await sleep(1000);
  log('ventanas-despues-alert', { dialogSeen, list: await xlist() });
  app.exit(0);
}

app.whenReady().then(main).catch((e) => {
  console.error('[SMOKE-EDIT8-238] FALLO:', e && e.message ? e.message : e);
  app.exit(2);
});
