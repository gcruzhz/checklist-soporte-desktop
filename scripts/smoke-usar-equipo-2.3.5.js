// Smoke test USAR-EQUIPO 2.3.5 (solo diagnóstico, no toca el www real).
// Reproduce el camino exacto reportado por Gerardo 2026-11-14:
//   Detectar -> panel "Equipos detectados" -> "Usar este equipo"
//   -> formulario con datos detectados -> teclear fInv, fUser, fArea, fCorreo.
// Copia ./www a /tmp/checklist-smoke-usar-2.3.5/www con firebase-config.js
// sustituido por placeholder (modo local sin nube, como smoke-write-2.3.4).
// El equipo detectado se siembra directamente en la variable global
// `detectados` (la que alimenta renderDetectados()/detList) con el mismo
// formato que reportDetected/detect.js; en modo local cloudMarkDetectadoUsado
// es no-op (CLOUD_ENABLED false) y no hay suscripción, así que la llegada
// del onSnapshot de nube se SIMULA a mano: tras "Usar este equipo" se
// marca usado=true y se disparan renderDetectados() y render() EN MITAD
// del tecleo, para verificar si borran lo tecleado, cierran el formulario
// o deshabilitan algo.
// Uso: xvfb-run -a ./node_modules/.bin/electron scripts/smoke-usar-equipo-2.3.5.js
// Logs y capturas en docs/smoke-usar-equipo-2.3.5.* (CHECKLIST_DESKTOP_SMOKE_SHOT_DIR).
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const TMP = '/tmp/checklist-smoke-usar-2.3.5';
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
  console.log('[SMOKE-USAR] ' + step + ' ' + JSON.stringify(obj));
}

async function shot(win, name) {
  const p = path.join(SHOTDIR, name);
  const image = await win.webContents.capturePage();
  fs.writeFileSync(p, image.toPNG());
  console.log('[SMOKE-USAR] captura ' + p);
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
    await sleep(15);
  }
}

async function typeInto(win, id, text) {
  await js(win, `function(){document.getElementById('${id}').focus();return true;}`);
  await sleep(120);
  await typeReal(win, text);
  await sleep(120);
  return js(win, `function(){var el=document.getElementById('${id}');return {value: el.value, active: document.activeElement===el};}`);
}

// ¿Qué elemento está encima del centro del campo? (overlay / tapa)
async function hitTest(win, id) {
  return js(win, `function(){var el=document.getElementById('${id}');
    var r=el.getBoundingClientRect();
    var cx=r.left+r.width/2, cy=r.top+r.height/2;
    var top=document.elementFromPoint(cx,cy);
    var cs=getComputedStyle(el);
    return {id:'${id}', rect:{x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)},
      inViewport: r.top>=0 && r.bottom<=window.innerHeight,
      topEl: top?(top.id||top.tagName+'.'+(top.className&&top.className.baseVal!==undefined?'':String(top.className)).slice(0,40)):'null',
      topIsSelf: top===el, topInsideField: !!(top&&el.contains(top)),
      disabled: el.disabled, readonly: el.readOnly, pointerEvents: cs.pointerEvents,
      scrollY: Math.round(window.scrollY), innerH: window.innerHeight};}`);
}

const DETECTED = {
  id: 'SERIE-DETECTADA-1', machineId: 'SERIE-DETECTADA-1',
  hostname: 'PC-GERARDO', marca: 'HP', modelo: 'ProBook 440 G9',
  serie: '5CD1234ABC', cpu: 'Intel Core i5-1235U', ramGB: 16, discoGB: 512,
  discoTipo: 'SSD', so: 'Windows 11 Pro 24H2', tipo: 'Laptop',
  mac: 'AA:BB:CC:DD:EE:FF', ip: '192.168.1.45', ipTipo: 'Dinámica',
  detectadoEn: Date.now(), detectadoPor: 'Gerardo', usado: false,
  checks: { t3: true, t4: true, t6: true, t18: true, t19: true, t25: true },
  detalles: { adobe: 'Acrobat' },
  versiones: { so: 'Windows 11 Pro 24H2', antivirus: 'ESET NOD32 Antivirus 18.0', chrome: '141.0.0.0' },
  anydeskId: '123456789', anydeskAlias: 'pc-gerardo@ad',
};

async function main() {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'www'), TMPWWW, { recursive: true });
  fs.writeFileSync(path.join(TMPWWW, 'firebase-config.js'),
    "// placeholder SOLO para el smoke test local 2.3.5\nwindow.FIREBASE_CONFIG = { apiKey: 'TU_API_KEY' };\n");
  console.log('[SMOKE-USAR] www temporal en ' + TMPWWW);

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
  const consoleErrs = [];
  win.webContents.on('console-message', (e, level, msg) => {
    if (level === 2 || /error/i.test(msg)) consoleErrs.push(msg);
  });
  await win.loadFile(path.join(TMPWWW, 'index.html'));
  win.focus();

  let ready = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    ready = await js(win, `function(){return {
      authReady: window._authReady, mainHidden: document.getElementById('mainApp').hidden,
      hasDesktop: !!window.Desktop, cloudEnabled: (typeof CLOUD_ENABLED!=='undefined'?CLOUD_ENABLED:null),
      splashInDom: !!document.getElementById('splash')};}`);
    if (ready.authReady && !ready.mainHidden) break;
  }
  log('boot-modo-local', ready);
  if (!ready || !ready.authReady || ready.mainHidden) throw new Error('no llegó al modo local');
  await sleep(2500); // dejar que el splash se quite (hideSplash ~2.4s)
  log('splash-tras-espera', await js(win, `function(){var s=document.getElementById('splash');
    return {inDom: !!s, cls: s?s.className:'', loginHidden: document.getElementById('loginView').hidden};}`));
  // Captura errores JS de la página desde antes de pulsar Usar.
  await js(win, `function(){window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message));});return true;}`);

  // 1. Sembrar el equipo detectado y abrir el panel detBox.
  const seeded = await js(win, `function(){detectados = [${JSON.stringify(DETECTED)}]; renderDetectados(); return {n: detectados.length, detListHtml: document.getElementById('detList').innerText.slice(0,300)};}`);
  log('equipo-detectado-sembrado', seeded);
  await js(win, `function(){document.getElementById('btnShowDet').click();return true;}`);
  await sleep(500);
  const detPanel = await js(win, `function(){return {
    detBoxHidden: document.getElementById('detBox').hidden,
    newBoxHidden: document.getElementById('newBox').hidden,
    useBtns: document.querySelectorAll('[data-det-use]').length,
    detListText: document.getElementById('detList').innerText.slice(0,300)};}`);
  log('panel-detectados-abierto', detPanel);
  await shot(win, 'smoke-usar-equipo-2.3.5-detPanel.png');
  if (!detPanel.useBtns) throw new Error('no aparece el botón Usar este equipo');

  // 2. Pulsar 'Usar este equipo' (click real sobre el botón).
  await js(win, `function(){document.querySelector('[data-det-use]').click();return true;}`);
  await sleep(400);
  const afterUse = await js(win, `function(){var v=function(id){return document.getElementById(id).value;};
    return {detBoxHidden: document.getElementById('detBox').hidden,
      newBoxHidden: document.getElementById('newBox').hidden,
      scrollY: Math.round(window.scrollY), innerH: window.innerHeight,
      activeEl: document.activeElement ? (document.activeElement.id||document.activeElement.tagName) : null,
      hasFocus: document.hasFocus(),
      fTipo: v('fTipo'), fMarca: v('fMarca'), fModelo: v('fModelo'), fSerie: v('fSerie'),
      fHostname: v('fHostname'), fTec: v('fTec'),
      fInv: v('fInv'), fUser: v('fUser'), fArea: v('fArea'), fCorreo: v('fCorreo'),
      btnAddDisabled: document.getElementById('btnAdd').disabled,
      saveHint: document.getElementById('saveHint').textContent,
      detChecks: window._detectedChecks, detHw: window._detectedHardware,
      errs: window.__errs};}`);
  log('tras-usar-este-equipo', afterUse);
  await shot(win, 'smoke-usar-equipo-2.3.5-form.png');

  // 3. Hit-test / overlay sobre los 4 campos problema (+ fMarca como control).
  const hits = {};
  for (const id of ['fMarca', 'fInv', 'fUser', 'fArea', 'fCorreo']) hits[id] = await hitTest(win, id);
  log('hit-test-campos', hits);

  // 4. Tecleo real en los 4 campos problema, con la "llegada de nube"
  // simulada EN MITAD del tecleo de fInv: marcar usado + renderDetectados()
  // + render() (lo que haría el onSnapshot de subscribeDetectados y los
  // otros snapshots), y comprobar que lo tecleado sobrevive y el foco sigue.
  const typed = {};
  // fInv en dos mitades con el snapshot en medio.
  await js(win, `function(){document.getElementById('fInv').focus();return true;}`);
  await sleep(120);
  await typeReal(win, 'INV-');
  const midInv = await js(win, `function(){return {value: document.getElementById('fInv').value, active: document.activeElement.id};}`);
  const snapshot = await js(win, `function(){
    detectados[0].usado = true;           // lo que escribe markDetectadoUsado en Firestore
    renderDetectados();                    // callback de subscribeDetectados (onSnapshot)
    render();                              // callbacks de subscribePreparations/Renta
    return {detBoxHidden: document.getElementById('detBox').hidden,
      newBoxHidden: document.getElementById('newBox').hidden,
      fInvMid: document.getElementById('fInv').value,
      active: document.activeElement ? document.activeElement.id : null,
      detListText: document.getElementById('detList').innerText.slice(0,120)};}`);
  log('snapshot-nube-en-mitad-tecleo', { midInv, snapshot });
  await typeReal(win, '777');
  await sleep(120);
  typed.fInv = await js(win, `function(){var el=document.getElementById('fInv');return {value: el.value, active: document.activeElement===el};}`);
  typed.fUser = await typeInto(win, 'fUser', 'Maria Prueba');
  // Otro render() en mitad del tecleo de fArea.
  await js(win, `function(){document.getElementById('fArea').focus();return true;}`);
  await sleep(120);
  await typeReal(win, 'Sopo');
  await js(win, `function(){render();return true;}`);
  await sleep(100);
  await typeReal(win, 'rte');
  await sleep(120);
  typed.fArea = await js(win, `function(){var el=document.getElementById('fArea');return {value: el.value, active: document.activeElement===el};}`);
  typed.fCorreo = await typeInto(win, 'fCorreo', 'maria@empresa.com');
  typed.fMarcaControl = await js(win, `function(){return {value: document.getElementById('fMarca').value};}`);
  const afterType = await js(win, `function(){return {
    btnAddDisabled: document.getElementById('btnAdd').disabled,
    hint: document.getElementById('saveHint').textContent,
    newBoxHidden: document.getElementById('newBox').hidden,
    errs: window.__errs};}`);
  log('tecleo-real-tras-usar', { typed, afterType });
  await shot(win, 'smoke-usar-equipo-2.3.5-form-tecleado.png');

  // 5. Guardar y verificar persistencia (localStorage + DOM).
  if (afterType.btnAddDisabled) throw new Error('Guardar sigue deshabilitado tras teclear');
  await js(win, `function(){document.getElementById('btnAdd').click();return true;}`);
  await sleep(600);
  const saved = await js(win, `function(){
    var raw=localStorage.getItem('checklist-soporte-v1');
    var st=raw?JSON.parse(raw):null;
    var ps=(st&&st.preparations)||[];
    return {n:ps.length, prep: ps[0]||null, newBoxHidden: document.getElementById('newBox').hidden};}`);
  log('guardado-tras-usar', saved);
  await shot(win, 'smoke-usar-equipo-2.3.5-saved.png');
  if (saved.n !== 1) throw new Error('no se guardó el equipo (n=' + saved.n + ')');
  const p0 = saved.prep;
  const match = p0.equipo.marca === 'HP' && p0.equipo.modelo === 'ProBook 440 G9' &&
    p0.equipo.serie === '5CD1234ABC' && p0.equipo.hostname === 'PC-GERARDO' &&
    p0.equipo.inventario === 'INV-777' &&
    p0.usuario.nombre === 'Maria Prueba' && p0.usuario.area === 'Soporte' &&
    p0.usuario.correo === 'maria@empresa.com' &&
    p0.equipo.cpu === 'Intel Core i5-1235U' && p0.equipo.ramGB === 16 &&
    Array.isArray(p0.autoDetectado) && p0.autoDetectado.indexOf('t18') !== -1;
  log('datos-guardados-coinciden', { match, prep: p0 });
  if (!match) throw new Error('los datos guardados no coinciden con lo tecleado/detectado');
  log('errores-consola-js', { consoleErrs, pageErrs: await js(win, `function(){return window.__errs;}`) });

  console.log('[SMOKE-USAR] RESULTADO ' + JSON.stringify(results, null, 2));
  console.log('[SMOKE-USAR] OK: camino Detectar->Usar->teclear fInv/fUser/fArea/fCorreo funciona en Electron (modo local + snapshot simulado)');
  app.exit(0);
}

app.whenReady().then(main).catch((e) => {
  console.error('[SMOKE-USAR] FALLO:', e && e.message ? e.message : e);
  console.log('[SMOKE-USAR] RESULTADO-PARCIAL ' + JSON.stringify(results, null, 2));
  app.exit(2);
});
