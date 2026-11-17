// Smoke EDICIÓN 2.3.8: ¿los campos del formulario aceptan tecleo REAL en Electron?
// Gerardo (2026-11-15): en el escritorio NO se puede escribir en NINGÚN campo
// editable del formulario Nuevo equipo, ni en blanco ni tras "Usar este equipo".
// El login SÍ acepta tecleo. Fases:
//  A: login (comparación) — teclear en #loginEmail.
//  B: formulario EN BLANCO sin haber mostrado ningún alert — tecleo real con
//     clic de ratón en fModelo/fSerie/fMarca/fInv/fHostname/fTec/fUser/fArea/fCorreo.
//  C: comparación — #search, #fReA (Reasignar), #chatInput.
//  D: camino con alert() real — Detectar (stub reportDetected) -> alert nativo
//     "Equipo detectado..." (aceptado vía CDP) -> "Usar este equipo" -> tecleo.
//  E: tormenta de render() (como onSnapshot de la nube) mientras se teclea.
// Todo con sendInputEvent (teclado y ratón reales), sin el.focus().
// Base: scripts/smoke-usar-equipo-2.3.5b.js (www temporal, modo local).
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const TMP = path.join('/home/hatch/workspace/tmp/smoke238-edit');
const TMPWWW = path.join(TMP, 'www');
const SHOTDIR = process.env.CHECKLIST_DESKTOP_SMOKE_SHOT_DIR || path.join(ROOT, 'docs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (typeof process.getuid === 'function' && process.getuid() === 0) {
  app.commandLine.appendSwitch('no-sandbox');
}
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.setPath('userData', path.join(TMP, 'userData'));

const results = {};
function log(step, obj) {
  results[step] = obj;
  console.log('[SMOKE-EDIT-238] ' + step + ' ' + JSON.stringify(obj));
}
async function shot(win, name) {
  const p = path.join(SHOTDIR, name);
  const image = await win.webContents.capturePage();
  fs.writeFileSync(p, image.toPNG());
  console.log('[SMOKE-EDIT-238] captura ' + p);
  return p;
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
    return {x: Math.round(b.left+b.width/2), y: Math.round(b.top+b.height/2),
      top: Math.round(b.top), inViewport: b.top>=0 && b.bottom<=window.innerHeight};}`);
  if (!r) return { clicked: false, reason: 'sin elemento' };
  win.webContents.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await sleep(200);
  const after = await js(win, `function(){var a=document.activeElement;
    return {active: a?(a.id||a.tagName):null, hasFocus: document.hasFocus()};}`);
  return { clicked: true, rect: r, after };
}
async function clickAndType(win, selector, text) {
  const c = await mouseClick(win, selector);
  await typeReal(win, text);
  await sleep(150);
  const v = await js(win, `function(){var el=document.querySelector('${selector}');
    return {value: el?el.value:null, active: document.activeElement===el, activeId: document.activeElement?(document.activeElement.id||document.activeElement.tagName):null, hasFocus: document.hasFocus()};}`);
  return { click: c, typed: text, result: v, ok: v.value === text };
}

const DETECTED = {
  id: 'SERIE-DETECTADA-1', machineId: 'SERIE-DETECTADA-1',
  hostname: 'ROBIT5', marca: 'Dell Inc.', modelo: 'Dell Pro 14 PC14250',
  serie: '8TKKQJ4', cpu: 'Intel Core Ultra 5 235U', ramGB: 16, discoGB: 512,
  discoTipo: 'NVMe', so: 'Windows 11 Pro 26H2', tipo: 'Laptop',
  mac: 'AA:BB:CC:DD:EE:FF', ip: '192.168.16.54', ipTipo: 'Dinámica',
  detectadoEn: Date.now(), detectadoPor: 'Gerardo Cruz Hernandez', usado: false,
  checks: { t3: true, t4: true, t18: true },
  detalles: {}, versiones: { so: 'Windows 11 Pro 26H2' },
  anydeskId: '1259174377', anydeskAlias: '',
};

async function main() {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'www'), TMPWWW, { recursive: true });
  fs.writeFileSync(path.join(TMPWWW, 'firebase-config.js'),
    "// placeholder SOLO para el smoke test local 2.3.8\nwindow.FIREBASE_CONFIG = { apiKey: 'TU_API_KEY' };\n");

  const win = new BrowserWindow({
    width: 1200, height: 800, title: 'Checklist de Soporte',
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  });
  ipcMain.handle('desktop-get-machine-id', async () => 'SERIE-DETECTADA-1');
  ipcMain.handle('desktop-open-external', async () => true);
  ipcMain.handle('desktop-detect', async () => DETECTED);
  await win.loadFile(path.join(TMPWWW, 'index.html'));
  win.focus();

  let ready = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    ready = await js(win, `function(){return {authReady: window._authReady, mainHidden: document.getElementById('mainApp').hidden, hasFocus: document.hasFocus()};}`);
    if (ready.authReady && !ready.mainHidden) break;
  }
  if (!ready || !ready.authReady || ready.mainHidden) throw new Error('no llegó al modo local');
  await sleep(1500);
  log('modo-local', ready);

  // Fase A: login (comparación) — la pantalla que SÍ acepta tecleo según Gerardo.
  await js(win, `function(){document.getElementById('loginView').hidden=false;return true;}`);
  await sleep(300);
  const loginType = await clickAndType(win, '#loginEmail', 'gerardo');
  log('A-login-email', loginType);
  await js(win, `function(){document.getElementById('loginView').hidden=true;return true;}`);
  await sleep(300);

  // Fase B: formulario EN BLANCO, sin ningún alert previo. Clic real + tecleo real.
  const openNew = await mouseClick(win, '#btnShowNew');
  log('B-abrir-nuevo-equipo', openNew);
  const blank = {};
  for (const [sel, text] of [['#fModelo', 'Modelo X'], ['#fSerie', 'SERIE999'], ['#fMarca', 'HP'], ['#fInv', 'INV-111'], ['#fHostname', 'PC-TEST'], ['#fTec', 'Ana'], ['#fUser', 'Maria Prueba'], ['#fArea', 'Soporte'], ['#fCorreo', 'maria@empresa.com']]) {
    blank[sel] = await clickAndType(win, sel, text);
  }
  log('B-formulario-en-blanco', blank);
  await shot(win, 'smoke-edit-2.3.8-form-blanco.png');
  // Limpiar para la fase D (el formulario en blanco se deja abierto a propósito:
  // en la fase D se usa "Usar este equipo", que rellena encima).

  // Fase C: comparación — búsqueda, Reasignar, chat.
  const searchType = await clickAndType(win, '#search', 'LENOVO');
  log('C-search', searchType);
  await mouseClick(win, '#btnShowRe');
  await sleep(300);
  const reType = await clickAndType(win, '#fReA', 'Juan');
  log('C-reasignar-fReA', reType);
  await js(win, `function(){document.getElementById('reBox').hidden=true;return true;}`);
  await js(win, `function(){document.getElementById('viewEquipo').hidden=false;document.getElementById('viewPreparar').hidden=true;return true;}`);
  await sleep(300);
  const chatType = await clickAndType(win, '#chatInput', 'hola equipo');
  log('C-chat-input', chatType);
  await js(win, `function(){document.getElementById('viewEquipo').hidden=true;document.getElementById('viewPreparar').hidden=false;return true;}`);

  // Fase D: alert() REAL del flujo Detectar -> "Usar este equipo" -> tecleo.
  // El diálogo nativo se acepta vía CDP (Page.javascriptDialogOpening).
  let dialogSeen = null;
  try {
    win.webContents.debugger.attach('1.3');
    win.webContents.debugger.on('message', (e, method, params) => {
      if (method === 'Page.javascriptDialogOpening') {
        dialogSeen = { type: params.type, message: params.message };
        console.log('[SMOKE-EDIT-238] D-dialogo-abierto ' + JSON.stringify(dialogSeen));
        win.webContents.debugger.sendCommand('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
      }
    });
    await win.webContents.debugger.sendCommand('Page.enable');
  } catch (e) { log('D-debugger-no-disponible', { err: String(e && e.message || e) }); }
  // Simular sesión (el botón Detectar exige cloudUser) y stub de reportDetected.
  await js(win, `function(){
    cloudUser = {uid:'u1', nombre:'Gerardo Cruz Hernandez', email:'gerardo@x.com'};
    cloudRole = 'usuario';
    if (window.Cloud) window.Cloud.reportDetected = function(){ return Promise.resolve(); };
    if (window.Cloud) window.Cloud.markDetectadoUsado = function(){ return Promise.resolve(); };
    return {cloudUser: !!cloudUser, hasReport: !!(window.Cloud && window.Cloud.reportDetected)};}`);
  const clickDetect = await mouseClick(win, '#btnDetectar');
  log('D-clic-detectar', clickDetect);
  // Esperar a que aparezca (y se acepte) el diálogo, máx 90 s.
  let waited = 0;
  while (!dialogSeen && waited < 90000) { await sleep(500); waited += 500; }
  log('D-dialogo-detectar', { dialogSeen, waitedMs: waited });
  await sleep(800);
  // Sembrar el detectado y pulsar "Usar este equipo" con clic de ratón real.
  await js(win, `function(){detectados = [${JSON.stringify(DETECTED)}]; renderDetectados(); return true;}`);
  await mouseClick(win, '#btnShowDet');
  await sleep(300);
  const clickUse = await mouseClick(win, '[data-det-use]');
  log('D-clic-usar-este-equipo', clickUse);
  await sleep(600);
  const afterUse = await js(win, `function(){return {fModelo: document.getElementById('fModelo').value,
    fSerie: document.getElementById('fSerie').value, fHostname: document.getElementById('fHostname').value,
    newBoxHidden: document.getElementById('newBox').hidden, hasFocus: document.hasFocus()};}`);
  log('D-tras-usar', afterUse);
  const invAfterAlert = await clickAndType(win, '#fInv', 'INV-999');
  log('D-tecleo-fInv-tras-alert', invAfterAlert);
  const userAfterAlert = await clickAndType(win, '#fUser', 'Pedro');
  log('D-tecleo-fUser-tras-alert', userAfterAlert);
  const areaAfterAlert = await clickAndType(win, '#fArea', 'Ventas');
  log('D-tecleo-fArea-tras-alert', areaAfterAlert);
  await shot(win, 'smoke-edit-2.3.8-tras-alert.png');

  // Fase E: tormenta de render() (imita onSnapshot de la nube) mientras se teclea.
  await js(win, `function(){document.getElementById('fUser').value='';window._storm=setInterval(function(){render();},400);return true;}`);
  await sleep(100);
  const stormType = await clickAndType(win, '#fUser', 'Ana');
  log('E-tecleo-con-tormenta-render', stormType);
  const stormMid = await js(win, `function(){var el=document.getElementById('fUser');
    return {value: el.value, active: document.activeElement===el};}`);
  log('E-valor-tras-tormenta', stormMid);
  await js(win, `function(){clearInterval(window._storm);return true;}`);

  console.log('[SMOKE-EDIT-238] RESULTADO ' + JSON.stringify(results, null, 2));
  const allOk = loginType.ok && Object.values(blank).every((x) => x.ok) &&
    searchType.ok && reType.ok && chatType.ok &&
    invAfterAlert.ok && userAfterAlert.ok && areaAfterAlert.ok && stormType.ok;
  console.log('[SMOKE-EDIT-238] TODO-OK=' + allOk);
  app.exit(allOk ? 0 : 2);
}

app.whenReady().then(main).catch((e) => {
  console.error('[SMOKE-EDIT-238] FALLO:', e && e.message ? e.message : e);
  console.log('[SMOKE-EDIT-238] RESULTADO-PARCIAL ' + JSON.stringify(results, null, 2));
  app.exit(2);
});
