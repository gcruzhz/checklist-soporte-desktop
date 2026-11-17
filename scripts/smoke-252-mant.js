// Smoke test 2.5.2 — Mantenimientos: botón "Detectar equipo":
//   Inicio (selector de sección) -> Mantenimientos -> #btnMantDetectar
//   (solo escritorio) -> mismo flujo que #btnDetectar de Por preparar
//   (Desktop.detect() -> Cloud.reportDetected con detectadoPor = técnico)
//   -> el panel #mantDetBox se abre SOLO con el equipo detectado ->
//   '🔧 Dar mantenimiento a este equipo' -> formulario de mantenimiento
//   prellenado con serie/hostname/modelo del equipo detectado.
// Corre con el Electron de node_modules:
//   xvfb-run -a ./node_modules/.bin/electron --no-sandbox scripts/smoke-252-mant.js
// El www es el ./www del proyecto (copiado con node scripts/copy-www.js
// desde ../checklist-cloud/www, md5 verificado). firebase-config.js se
// sustituye por placeholder (modo local sin nube, como los smokes
// 2.3.4/2.3.5/2.3.8/2.4.0/2.5.1): el login real con Firebase NO se ejerce
// aquí; Cloud.reportDetected / markDetectadoUsado se simulan (el stub
// aplica la misma lógica que el real: id desde machineId, detectadoEn
// ahora, usado=false, y mete el equipo en el array global `detectados`)
// para que el flujo real corra hasta el formulario prellenado.
// El tecleo XTEST es a nivel SO (como en 2.4.0/2.5.1): xtest-type.py no
// teclea mayúsculas ni @ . - ; los textos son solo minúsculas y dígitos,
// y la comparación es exacta contra lo enviado.
// Logs y capturas en docs/smoke-252-*.
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TMP = '/home/hatch/workspace/tmp/smoke252/run';
const TMPWWW = path.join(TMP, 'www');
const SHOTDIR = path.join(ROOT, 'docs');
const EXPECTED_WWW_MD5 = 'ba3f19a555733e8232e2e78e106ec8f8';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (typeof process.getuid === 'function' && process.getuid() === 0) {
  app.commandLine.appendSwitch('no-sandbox');
}
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.setPath('userData', path.join(TMP, 'userData'));

const results = {};
function log(step, obj) {
  results[step] = obj;
  console.log('[SMOKE-252] ' + step + ' ' + JSON.stringify(obj));
}
async function shot(win, name) {
  const p = path.join(SHOTDIR, name);
  const image = await win.webContents.capturePage();
  fs.writeFileSync(p, image.toPNG());
  console.log('[SMOKE-252] captura ' + p);
  return p;
}
async function js(win, fnString) {
  return win.webContents.executeJavaScript('(' + fnString + ')()', true);
}
function typeXtest(text) {
  return new Promise((resolve) => {
    execFile('python3', [path.join(ROOT, 'scripts', 'xtest-type.py'), 'Checklist', text],
      { env: process.env, timeout: 30000 },
      (err, stdout) => resolve({ err: err ? String(err.message || err).slice(0, 150) : null, out: (stdout || '').trim().slice(0, 300) }));
  });
}
async function scrollIntoView(win, selector) {
  return js(win, `function(){var el=document.querySelector('${selector}');
    if(!el) return null; el.scrollIntoView({block:'center'}); window.scrollTo(0, window.scrollY);
    var b=el.getBoundingClientRect();
    return {x: Math.round(b.left+b.width/2), y: Math.round(b.top+b.height/2), w: Math.round(b.width), h: Math.round(b.height),
      inViewport: b.top>=0 && b.bottom<=window.innerHeight && b.left>=0 && b.right<=window.innerWidth};}`);
}
async function mouseClick(win, selector) {
  const vis = await scrollIntoView(win, selector);
  if (!vis || !vis.w || !vis.h || !vis.inViewport) return { clicked: false, reason: 'sin rect/fuera de viewport', vis };
  win.webContents.sendInputEvent({ type: 'mouseDown', x: vis.x, y: vis.y, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: vis.x, y: vis.y, button: 'left', clickCount: 1 });
  await sleep(250);
  const after = await js(win, `function(){var a=document.activeElement;
    return {active: a?(a.id||a.tagName):null, hasFocus: document.hasFocus()};}`);
  return { clicked: true, rect: vis, after };
}
async function clickTypeXTEST(win, selector, text) {
  await js(win, `function(){var el=document.querySelector('${selector}'); if(el) el.value=''; return true;}`);
  const c = await mouseClick(win, selector);
  const x = await typeXtest(text);
  await sleep(300);
  const v = await js(win, `function(){var el=document.querySelector('${selector}');
    return {value: el?el.value:null, active: document.activeElement===el, hasFocus: document.hasFocus()};}`);
  return { click: c, xtest: x, typed: text, result: v, ok: v.value === text };
}

// Equipo detectado con el formato REAL del detector 2.5.1/2.5.2:
// políticas y usuario sistemas en detalles (no a nivel superior),
// impresora en detalles.impresora.
const DETECTED_MANT = {
  id: 'SERIE-MANT-1', machineId: 'SERIE-MANT-1',
  hostname: 'PC-GERARDO', marca: 'HP', modelo: 'ProBook 440 G9',
  serie: '5CD1234ABC', cpu: 'Intel Core i5-1235U', ramGB: 16, discoGB: 512,
  discoTipo: 'SSD', so: 'Windows 11 Pro 24H2', tipo: 'Laptop',
  mac: 'AA:BB:CC:DD:EE:FF', ip: '192.168.1.45', ipTipo: 'Dinámica',
  redes: [{ nombre: 'Wi-Fi', ip: '192.168.1.45', ipTipo: 'Dinámica' }],
  detectadoEn: Date.now(), detectadoPor: 'Gerardo', usado: false,
  checks: { t3: true, t4: true, t6: true, t18: true, t19: true, t25: true },
  detalles: {
    adobe: 'Acrobat',
    impresora: 'HP LaserJet Pro',
    politicas: { cambioDias: 90, minLongitud: 10, bloqueoIntentos: 5, bloqueoSegundos: 350 },
    politicasFuente: 'net accounts + directiva de grupo (InactivityTimeoutSecs)',
    usuarioSistemas: true,
    usuarioSistemasFuente: 'cuenta local + perfil C:\\Users\\sistemas',
  },
  versiones: { so: 'Windows 11 Pro 24H2', antivirus: 'ESET NOD32 Antivirus 18.0', chrome: '141.0.0.0' },
  anydeskId: '123456789', anydeskAlias: 'pc-gerardo@ad',
};

async function main() {
  // 0. www del ./www del proyecto (copiado con copy-www.js): md5 verificado.
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'www'), TMPWWW, { recursive: true });
  const idxMd5 = crypto.createHash('md5').update(fs.readFileSync(path.join(TMPWWW, 'index.html'))).digest('hex');
  log('0-www-origen', { src: 'proyecto-www', md5: idxMd5, esperado: EXPECTED_WWW_MD5, coincide: idxMd5 === EXPECTED_WWW_MD5 });
  if (idxMd5 !== EXPECTED_WWW_MD5) throw new Error('md5 del www no coincide con 2.5.2: ' + idxMd5);
  fs.writeFileSync(path.join(TMPWWW, 'firebase-config.js'),
    "// placeholder SOLO para el smoke test local 2.5.2\nwindow.FIREBASE_CONFIG = { apiKey: 'TU_API_KEY' };\n");
  const preloadPath = path.join(ROOT, 'preload.js');
  log('0-preload', { preloadPath });

  const win = new BrowserWindow({
    width: 1200, height: 800, title: 'Checklist de Soporte',
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  ipcMain.handle('desktop-get-machine-id', async () => 'SERIE-MANT-1');
  ipcMain.handle('desktop-open-external', async () => true);
  ipcMain.handle('desktop-detect', async () => DETECTED_MANT);
  const consoleErrs = [];
  win.webContents.on('console-message', (e, level, msg) => {
    if (level === 2 || /error/i.test(msg)) consoleErrs.push(msg);
  });
  await win.loadFile(path.join(TMPWWW, 'index.html'));
  win.focus();

  // 1. Arranque en modo local: selector de sección al abrir.
  let ready = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    ready = await js(win, `function(){return {
      authReady: window._authReady, mainHidden: document.getElementById('mainApp').hidden,
      inicioHidden: document.getElementById('viewInicio').hidden,
      inicioText: (document.getElementById('viewInicio').innerText||''),
      // textContent (no innerText): las dos menciones de la versión están
      // en vistas ocultas en modo local (login y Cuenta).
      versionText: (document.body.textContent||'').indexOf('2.5.2')!==-1,
      splashInDom: !!document.getElementById('splash')};}`);
    if (ready.authReady && !ready.mainHidden) break;
  }
  log('1-boot-selector', ready);
  if (!ready || !ready.authReady || ready.mainHidden) throw new Error('no llegó al modo local');
  const selectorOk = !ready.inicioHidden &&
    ready.versionText === true &&
    ready.inicioText.indexOf('Por preparar') !== -1 &&
    ready.inicioText.indexOf('Recibir renta') !== -1 &&
    ready.inicioText.indexOf('Entrega Renta') !== -1 &&
    ready.inicioText.indexOf('Mantenimientos Preventivos') !== -1;
  log('1b-selector-4-secciones', { selectorOk });
  await sleep(2500);
  await js(win, `function(){window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message));});return true;}`);
  await shot(win, 'smoke-252-inicio.png');

  // 2. Ir a Mantenimientos: el botón nuevo #btnMantDetectar debe existir
  // y estar visible en escritorio (window.Desktop presente vía preload).
  const goMant = await mouseClick(win, '#btnGoMant');
  await sleep(400);
  const mantView = await js(win, `function(){var b=document.getElementById('btnMantDetectar'); return {
    viewMantHidden: document.getElementById('viewMant').hidden,
    hasNuevo: !!document.getElementById('btnMantNuevo'),
    hasDet: !!document.getElementById('btnMantDet'),
    hasMantDetectar: !!b,
    mantDetectarHidden: b ? b.hidden : null,
    mantDetectarDisabled: b ? b.disabled : null,
    mantDetectarText: b ? (b.innerText||'').replace(/\\s+/g,' ').trim() : null,
    mantDetBoxHiddenAntes: document.getElementById('mantDetBox').hidden,
    mantListEmpty: (document.getElementById('mantList').innerText||'').slice(0,120)};}`);
  log('2-vista-mant-btnDetectar', { goMant, mantView });
  await shot(win, 'smoke-252-mant.png');

  // 3. Preparar la sesión simulada (el login real NO se ejerce en modo
  // local) y el stub de Cloud.reportDetected con la lógica del real.
  const stub = await js(win, `function(){
    window.CLOUD_ENABLED = true;
    window.cloudUser = { uid: 'smoke-252', email: 'gerardo@smoke.local', nombre: 'Gerardo' };
    window.Cloud = window.Cloud || {};
    window.__reportDetectedCalls = [];
    window.Cloud.reportDetected = async function (data) {
      window.__reportDetectedCalls.push(JSON.parse(JSON.stringify(data || {})));
      var d = Object.assign({}, data || {});
      if (d.machineId) d.id = String(d.machineId);
      else if (!d.id) d.id = d.serie ? String(d.serie) : (d.hostname || '') + '-' + (d.detectadoEn || Date.now());
      d.detectadoEn = Date.now();
      d.usado = false;
      var i = detectados.findIndex(function (x) { return String(x.id) === String(d.id); });
      if (i >= 0) detectados[i] = d; else detectados.push(d);
      return true;
    };
    window.Cloud.markDetectadoUsado = async function () { return true; };
    window.Cloud.upsertMant = async function () { return true; };
    window.Cloud.asignarFolio = async function () { return '00001'; };
    return { cloudUser: window.cloudUser.nombre, hasReportDetected: typeof window.Cloud.reportDetected === 'function',
      hasDesktopDetect: !!(window.Desktop && window.Desktop.detect) };}`);
  log('3-stub-sesion-reportDetected', stub);

  // 4. Pulsar #btnMantDetectar: se reporta la detección y el panel se
  // abre SOLO con el equipo detectado y su botón de mantenimiento.
  const clickDetectar = await mouseClick(win, '#btnMantDetectar');
  await sleep(1000);
  const detResult = await js(win, `function(){var b=document.getElementById('btnMantDetectar'); return {
    calls: window.__reportDetectedCalls || [],
    toastText: (document.getElementById('toast').textContent||''),
    mantDetBoxHidden: document.getElementById('mantDetBox').hidden,
    mantDetListText: (document.getElementById('mantDetList').innerText||'').slice(0,400),
    useBtns: document.querySelectorAll('[data-mant-det-use]').length,
    useBtnId: (document.querySelector('[data-mant-det-use]')||{}).getAttribute ? document.querySelector('[data-mant-det-use]').getAttribute('data-mant-det-use') : null,
    useBtnText: document.querySelector('[data-mant-det-use]') ? (document.querySelector('[data-mant-det-use]').innerText||'').trim() : null,
    detectadosN: detectados.length,
    btnDespuesText: b ? (b.innerText||'').replace(/\\s+/g,' ').trim() : null,
    btnDespuesDisabled: b ? b.disabled : null};}`);
  log('4-detectar-panel-auto', { clickDetectar, detResult });
  await shot(win, 'smoke-252-detPanel.png');
  const reportOk = detResult.calls.length === 1 &&
    detResult.calls[0].detectadoPor === 'Gerardo' &&
    detResult.calls[0].machineId === 'SERIE-MANT-1' &&
    detResult.calls[0].serie === '5CD1234ABC' &&
    detResult.calls[0].hostname === 'PC-GERARDO';
  const panelAutoOk = detResult.mantDetBoxHidden === false &&
    detResult.useBtns === 1 &&
    detResult.useBtnId === 'SERIE-MANT-1' &&
    detResult.useBtnText && detResult.useBtnText.indexOf('Dar mantenimiento a este equipo') !== -1 &&
    detResult.mantDetListText.indexOf('PC-GERARDO') !== -1 &&
    detResult.mantDetListText.indexOf('5CD1234ABC') !== -1 &&
    detResult.mantDetListText.indexOf('Gerardo') !== -1;
  const toastOk = detResult.toastText.indexOf('Equipo detectado, ya aparece en los teléfonos') !== -1;
  log('4b-report-panel-toast', { reportOk, panelAutoOk, toastOk });

  // 5. '🔧 Dar mantenimiento a este equipo' -> formulario prellenado.
  const clickUse = await mouseClick(win, '[data-mant-det-use="SERIE-MANT-1"]');
  await sleep(500);
  const formLleno = await js(win, `function(){return {
    mantFormBoxHidden: document.getElementById('mantFormBox').hidden,
    fMserie: document.getElementById('fM-serie').value,
    fMhostname: document.getElementById('fM-hostname').value,
    fMmodelo: document.getElementById('fM-modelo').value,
    fMtecnico: document.getElementById('fM-tecnico').value,
    obsDet: (document.getElementById('fM-obsDet').value||''),
    hasCrear: !!document.getElementById('btnMantCrear'),
    hasGuardar: !!document.getElementById('btnMantGuardar'),
    hasCancelar: !!document.getElementById('btnMantCancelar')};}`);
  log('5a-usar-equipo-form', { clickUse, formLleno });
  const obsOk = formLleno.obsDet.indexOf('Políticas:') !== -1 &&
    formLleno.obsDet.indexOf('Usuario de sistemas: Sí') !== -1 &&
    formLleno.obsDet.indexOf('Impresora: HP LaserJet Pro') !== -1 &&
    formLleno.obsDet.indexOf('Serie: 5CD1234ABC') !== -1 &&
    formLleno.obsDet.indexOf('Hostname: PC-GERARDO') !== -1;
  log('5b-observaciones-detectadas', { obsOk, obsDet: formLleno.obsDet.slice(0, 400) });
  await shot(win, 'smoke-252-form.png');

  // 6. Tecleo XTEST en el formulario (prueba que el formulario prellenado
  // es editable): solo minúsculas y dígitos.
  const tArea = await clickTypeXTEST(win, '#fM-area', 'soporte252');
  log('6-XTEST-area', tArea);

  // 7. Por preparar NO cambió: #btnDetectar sigue visible con su
  // comportamiento de siempre. OJO: tras la detección, el estado
  // compartido (refreshDetectarBtn, ya en 2.5.1) pone el botón en
  // "Equipo detectado ✓" y deshabilitado porque esta máquina ya tiene
  // una detección pendiente; eso NO es un cambio de 2.5.2.
  // Se navega por la pestaña (el selector de Inicio solo está en
  // viewInicio; desde el formulario de Mantenimientos se usa #tabs).
  const goPrep = await mouseClick(win, '#tabs .tab[data-v="preparar"]');
  await sleep(400);
  const prepView = await js(win, `function(){var b=document.getElementById('btnDetectar'); return {
    viewPrepHidden: document.getElementById('viewPreparar').hidden,
    hasBtnDetectar: !!b,
    btnDetectarHidden: b ? b.hidden : null,
    btnDetectarDisabled: b ? b.disabled : null,
    btnDetectarText: b ? (b.innerText||'').replace(/\\s+/g,' ').trim() : null,
    detBoxHidden: document.getElementById('detBox').hidden};}`);
  log('7-por-preparar-sin-cambio', { goPrep, prepView });
  await shot(win, 'smoke-252-preparar.png');

  // 8. Foco final + errores JS (se ignoran los ya conocidos del 251:
  // 'synapse is not defined' y warnings de CSP/Electron).
  const finalFocus = await js(win, `function(){var d=document.getElementById('focusDiag');
    return {active: document.activeElement ? (document.activeElement.id||document.activeElement.tagName) : null,
      hasFocus: document.hasFocus(),
      focusDiag: d ? d.textContent.slice(0,120) : null,
      errs: window.__errs || []};}`);
  const conocidos = function (m) {
    return m.indexOf('synapse is not defined') !== -1 ||
      m.indexOf('Electron Security Warning') !== -1 ||
      m.indexOf('Insecure Content-Security-Policy') !== -1;
  };
  const consoleNuevos = consoleErrs.filter(function (m) { return !conocidos(m); });
  const errsNuevos = (finalFocus.errs || []).filter(function (m) { return !conocidos(m); });
  log('8-foco-errores', { finalFocus, consoleErrs: consoleErrs.slice(0, 8), consoleNuevos, errsNuevos });

  const ok = selectorOk && !mantView.viewMantHidden &&
    mantView.hasMantDetectar === true && mantView.mantDetectarHidden === false &&
    mantView.mantDetectarText && mantView.mantDetectarText.indexOf('Detectar equipo') !== -1 &&
    mantView.mantDetBoxHiddenAntes === true &&
    stub.cloudUser === 'Gerardo' && stub.hasReportDetected === true && stub.hasDesktopDetect === true &&
    clickDetectar.clicked === true && reportOk && panelAutoOk && toastOk &&
    formLleno.mantFormBoxHidden === false &&
    formLleno.fMserie === '5CD1234ABC' && formLleno.fMhostname === 'PC-GERARDO' &&
    formLleno.fMmodelo === 'ProBook 440 G9' && obsOk &&
    formLleno.hasCrear && formLleno.hasGuardar && formLleno.hasCancelar &&
    tArea.ok === true &&
    prepView.hasBtnDetectar === true && prepView.btnDetectarHidden === false &&
    prepView.btnDetectarText && prepView.btnDetectarText.indexOf('Equipo detectado') !== -1 &&
    prepView.detBoxHidden === true && prepView.viewPrepHidden === false &&
    goPrep.clicked === true &&
    consoleNuevos.length === 0 && errsNuevos.length === 0;
  console.log('[SMOKE-252] RESULTADO ' + JSON.stringify(results, null, 2));
  console.log('[SMOKE-252] VEREDICTO ' + (ok ? 'OK' : 'FALLO'));
  app.exit(ok ? 0 : 1);
}

app.whenReady().then(main).catch((e) => {
  console.error('[SMOKE-252] FALLO:', e && e.message ? e.message : e);
  console.log('[SMOKE-252] RESULTADO-PARCIAL ' + JSON.stringify(results, null, 2));
  app.exit(2);
});
