// Smoke test 2.5.8 — Actualizaciones de Windows.
//   - Botón "Actualizaciones de Windows" visible solo con window.Desktop
//     (el preload real expone buscar/instalarActualizaciones) y el
//     panel #winUpdBox se abre con clic real: estado (última instalada,
//     última búsqueda, resumen, lista) y botones Buscar/Instalar.
//   - Buscar con 2 pendientes (simuladas) -> resumen con 2, lista con
//     KB y títulos, Instalar habilitado; instalar -> toast de instaladas
//     + aviso de reinicio (la app NUNCA reinicia sola).
//   - Buscar con 0 pendientes -> "Sin actualizaciones pendientes ✓" e
//     Instalar deshabilitado; buscar con error -> toast de no respondió.
//   - Instalar sin pendientes -> toast y SIN llamada al IPC; instalar
//     sin permiso (simulado) -> toast de permiso de administrador.
// Los handlers IPC se simulan en ESTE proceso (main del smoke): el
// preload invoca los canales reales pero la respuesta es simulada,
// así que NO se toca Windows Update real en esta máquina (Linux,
// además, ni tiene PowerShell ni WUA).
// Corre con el Electron de node_modules:
//   xvfb-run -a ./node_modules/.bin/electron --no-sandbox scripts/smoke-258-pass.js
// El www es el ./www del proyecto (copiado con node scripts/copy-www.js
// desde ../checklist-cloud/www, md5 verificado). firebase-config.js se
// sustituye por placeholder (modo local sin nube): el login real con
// Firebase NO se ejerce aquí; los botones se pulsan con clics reales.
// Logs y capturas en docs/smoke258-*.
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const TMP = '/home/hatch/workspace/tmp/smoke258/run';
const TMPWWW = path.join(TMP, 'www');
const SHOTDIR = path.join(ROOT, 'docs');
const EXPECTED_WWW_MD5 = '00ac5eb8b8912f6ab00aa4ba4a27def7';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (typeof process.getuid === 'function' && process.getuid() === 0) {
  app.commandLine.appendSwitch('no-sandbox');
}
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.setPath('userData', path.join(TMP, 'userData'));

const results = {};
function log(step, obj) {
  results[step] = obj;
  console.log('[SMOKE-258] ' + step + ' ' + JSON.stringify(obj));
}
async function shot(win, name) {
  const p = path.join(SHOTDIR, name);
  const image = await win.webContents.capturePage();
  fs.writeFileSync(p, image.toPNG());
  console.log('[SMOKE-258] captura ' + p);
  return p;
}
async function js(win, fnString) {
  return win.webContents.executeJavaScript('(' + fnString + ')()', true);
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
function toastOf() {
  return `(document.getElementById('toast').textContent||'')`;
}

async function main() {
  // 0. www del ./www del proyecto (copiado con copy-www.js): md5 verificado.
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'www'), TMPWWW, { recursive: true });
  const idxMd5 = crypto.createHash('md5').update(fs.readFileSync(path.join(TMPWWW, 'index.html'))).digest('hex');
  log('0-www-origen', { src: 'proyecto-www', md5: idxMd5, esperado: EXPECTED_WWW_MD5, coincide: idxMd5 === EXPECTED_WWW_MD5 });
  if (idxMd5 !== EXPECTED_WWW_MD5) throw new Error('md5 del www no coincide con 2.5.8: ' + idxMd5);
  fs.writeFileSync(path.join(TMPWWW, 'firebase-config.js'),
    "// placeholder SOLO para el smoke test local 2.5.8\nwindow.FIREBASE_CONFIG = { apiKey: 'TU_API_KEY' };\n");
  const preloadPath = path.join(ROOT, 'preload.js');
  log('0-preload', { preloadPath });

  // IPC simulado (proceso main del smoke): registra las llamadas y
  // devuelve respuestas simuladas; NUNCA se toca Windows Update real.
  const wuCalls = [];
  let buscarModo = 'con2';
  let instalarModo = 'okReboot';
  ipcMain.handle('desktop-get-machine-id', async () => 'SERIE-SMOKE-258');
  ipcMain.handle('desktop-buscar-actualizaciones', async () => {
    wuCalls.push(['buscar', buscarModo]);
    if (buscarModo === 'con2') return { ok: true, pendientes: [{ kb: 'KB5034123', titulo: 'Actualización acumulada 2026-01' }, { kb: '', titulo: 'Actualización de .NET' }], ultimaInstalada: '2026-11-10', ultimaBusqueda: '2026-11-17' };
    if (buscarModo === 'cero') return { ok: true, pendientes: [], ultimaInstalada: '2026-11-17', ultimaBusqueda: '2026-11-17' };
    return { ok: false, error: 'Windows Update no respondió.' };
  });
  ipcMain.handle('desktop-instalar-actualizaciones', async () => {
    wuCalls.push(['instalar', instalarModo]);
    if (instalarModo === 'okReboot') return { ok: true, instaladas: 2, fallidas: 0, reinicioRequerido: true };
    if (instalarModo === 'okSinReboot') return { ok: true, instaladas: 1, fallidas: 0, reinicioRequerido: false };
    return { ok: false, error: 'Se necesita permiso de administrador para instalar las actualizaciones.' };
  });

  const win = new BrowserWindow({
    width: 1200, height: 800, title: 'Checklist de Soporte',
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  ipcMain.handle('desktop-open-external', async () => true);
  const consoleErrs = [];
  win.webContents.on('console-message', (e, level, msg) => {
    if (level === 2 || /error/i.test(msg)) consoleErrs.push(msg);
  });
  await win.loadFile(path.join(TMPWWW, 'index.html'));
  win.focus();

  // 1. Arranque en modo local: selector de sección al abrir, versión 2.5.8.
  let ready = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    ready = await js(win, `function(){return {
      authReady: window._authReady, mainHidden: document.getElementById('mainApp').hidden,
      inicioHidden: document.getElementById('viewInicio').hidden,
      inicioText: (document.getElementById('viewInicio').innerText||''),
      versionText: (document.body.textContent||'').indexOf('2.5.8')!==-1,
      sin257vieja: (document.body.textContent||'').indexOf('2.5.7')===-1,
      splashInDom: !!document.getElementById('splash')};}`);
    if (ready.authReady && !ready.mainHidden) break;
  }
  log('1-boot-selector', ready);
  if (!ready || !ready.authReady || ready.mainHidden) throw new Error('no llegó al modo local');
  const selectorOk = !ready.inicioHidden &&
    ready.versionText === true && ready.sin257vieja === true &&
    ready.inicioText.indexOf('Por preparar') !== -1 &&
    ready.inicioText.indexOf('Recibir renta') !== -1 &&
    ready.inicioText.indexOf('Entrega Renta') !== -1 &&
    ready.inicioText.indexOf('Mantenimientos Preventivos') !== -1;
  log('1b-selector-4-secciones', { selectorOk });
  await sleep(2500);
  await js(win, `function(){window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message));});return true;}`);
  await shot(win, 'smoke258-inicio.png');

  // 2. Ir a Por preparar: el botón de actualizaciones existe, está visible
  // (hay window.Desktop real del preload) y el panel arranca oculto.
  const goPrep = await mouseClick(win, '#btnGoPreparar');
  await sleep(400);
  const wuBtn = await js(win, `function(){var b=document.getElementById('btnWinUpd');
    var box=document.getElementById('winUpdBox');
    return {existe: !!b, hidden: b ? b.hidden : null,
      texto: b ? b.textContent : '', boxHidden: box ? box.hidden : null,
      desktop: !!window.Desktop,
      buscarFn: typeof (window.Desktop && window.Desktop.buscarActualizaciones),
      instalarFn: typeof (window.Desktop && window.Desktop.instalarActualizaciones)};}`);
  log('2-boton-actualizaciones', { goPrep, wuBtn, wuCalls: wuCalls.length });
  const wuBtnOk = goPrep.clicked === true && wuBtn.existe === true &&
    wuBtn.hidden === false && wuBtn.texto.indexOf('Actualizaciones de Windows') !== -1 &&
    wuBtn.boxHidden === true && wuBtn.desktop === true &&
    wuBtn.buscarFn === 'function' && wuBtn.instalarFn === 'function';

  // 3. Clic real en el botón: se abre el panel con los campos y el aviso.
  const clickWu = await mouseClick(win, '#btnWinUpd');
  await sleep(400);
  const panel = await js(win, `function(){var g=function(id){return document.getElementById(id);};
    return {boxHidden: g('winUpdBox').hidden,
      ultima: g('wuUltima').textContent, ultimaBusqueda: g('wuUltimaBusqueda').textContent,
      resumen: g('wuResumen').textContent, lista: g('wuLista').innerHTML,
      estado: g('wuEstado').textContent, aviso: (document.getElementById('winUpdBox').textContent||'').indexOf('NUNCA reinicia sola')!==-1,
      btnBuscar: !!g('btnWuBuscar'), btnInstalar: !!g('btnWuInstalar'),
      instalarDisabled: g('btnWuInstalar').disabled};}`);
  log('3-panel-campos', { clickWu, panel });
  await shot(win, 'smoke258-panel.png');
  const panelOk = clickWu.clicked === true && panel.boxHidden === false &&
    panel.aviso === true && panel.btnBuscar === true && panel.btnInstalar === true &&
    panel.instalarDisabled === true && panel.resumen.indexOf('Sin buscar') !== -1;

  // 4. Buscar con 2 pendientes -> resumen, lista, Instalar habilitado.
  const clickBuscar = await mouseClick(win, '#btnWuBuscar');
  await sleep(600);
  const buscar = await js(win, `function(){var g=function(id){return document.getElementById(id);};
    return {toast: ${toastOf()}, resumen: g('wuResumen').textContent,
      lista: g('wuLista').innerHTML, ultima: g('wuUltima').textContent,
      ultimaBusqueda: g('wuUltimaBusqueda').textContent,
      instalarDisabled: g('btnWuInstalar').disabled};}`);
  log('4-buscar-con2', { clickBuscar, buscar, wuCalls });
  const buscarOk = clickBuscar.clicked === true &&
    buscar.resumen === 'Actualizaciones pendientes: 2' &&
    buscar.lista.indexOf('KB5034123') !== -1 && buscar.lista.indexOf('Actualización de .NET') !== -1 &&
    buscar.ultima.indexOf('2026-11-10') !== -1 && buscar.ultimaBusqueda.indexOf('2026-11-17') !== -1 &&
    buscar.instalarDisabled === false &&
    buscar.toast.indexOf('Se encontraron 2 actualizaciones pendientes') !== -1 &&
    wuCalls.length === 1 && wuCalls[0][0] === 'buscar';

  // 5. Instalar -> toast de instaladas + aviso de reinicio (sin reiniciar).
  const clickInstalar = await mouseClick(win, '#btnWuInstalar');
  await sleep(600);
  const instalar = await js(win, `function(){var g=function(id){return document.getElementById(id);};
    return {toast: ${toastOf()}, estado: g('wuEstado').textContent,
      resumen: g('wuResumen').textContent};}`);
  log('5-instalar-reboot', { clickInstalar, instalar, wuCalls });
  await shot(win, 'smoke258-instalado.png');
  const instalarOk = clickInstalar.clicked === true &&
    instalar.toast.indexOf('Actualizaciones instaladas: 2') !== -1 &&
    instalar.toast.indexOf('Windows pide reiniciar') !== -1 &&
    instalar.estado.indexOf('Windows pide reiniciar') !== -1 &&
    instalar.resumen.indexOf('Vuelve a buscar') !== -1 &&
    wuCalls.length === 2 && wuCalls[1][0] === 'instalar';

  // 6. Buscar con 0 pendientes -> "Sin actualizaciones pendientes ✓" e
  // Instalar deshabilitado.
  buscarModo = 'cero';
  const clickBuscar0 = await mouseClick(win, '#btnWuBuscar');
  await sleep(600);
  const buscar0 = await js(win, `function(){var g=function(id){return document.getElementById(id);};
    return {toast: ${toastOf()}, resumen: g('wuResumen').textContent,
      instalarDisabled: g('btnWuInstalar').disabled};}`);
  log('6-buscar-cero', { clickBuscar0, buscar0, wuCalls: wuCalls.length });
  const buscar0Ok = clickBuscar0.clicked === true &&
    buscar0.resumen === 'Sin actualizaciones pendientes ✓' &&
    buscar0.instalarDisabled === true &&
    buscar0.toast.indexOf('Windows está actualizado') !== -1;

  // 7. Buscar con error -> toast de no respondió.
  buscarModo = 'error';
  const clickBuscarErr = await mouseClick(win, '#btnWuBuscar');
  await sleep(600);
  const buscarErr = await js(win, `function(){return {toast: ${toastOf()}};}`);
  log('7-buscar-error', { clickBuscarErr, buscarErr, wuCalls: wuCalls.length });
  const buscarErrOk = clickBuscarErr.clicked === true &&
    buscarErr.toast.indexOf('Windows Update no respondió') !== -1;

  // 8. Instalar sin pendientes: el botón está deshabilitado (el clic real
  // no dispara nada en un botón deshabilitado) y NO hay llamada al IPC.
  // (Que el handler avise sin llamar ya lo cubre la prueba 258C del teléfono.)
  const nWuCalls = wuCalls.length;
  const instalarSin = await js(win, `function(){var g=function(id){return document.getElementById(id);};
    return {instalarDisabled: g('btnWuInstalar').disabled, resumen: g('wuResumen').textContent};}`);
  log('8-instalar-sin-pendientes', { instalarSin, wuCalls: wuCalls.length });
  const instalarSinOk = instalarSin.instalarDisabled === true &&
    instalarSin.resumen === 'Sin actualizaciones pendientes ✓' &&
    wuCalls.length === nWuCalls;

  // 9. Instalar sin permiso de administrador (simulado) -> toast de permiso.
  buscarModo = 'con2';
  instalarModo = 'admin';
  await mouseClick(win, '#btnWuBuscar');
  await sleep(600);
  const clickInstalarAdmin = await mouseClick(win, '#btnWuInstalar');
  await sleep(600);
  const instalarAdmin = await js(win, `function(){return {toast: ${toastOf()}};}`);
  log('9-instalar-sin-permiso', { clickInstalarAdmin, instalarAdmin, wuCalls: wuCalls.length });
  const instalarAdminOk = clickInstalarAdmin.clicked === true &&
    instalarAdmin.toast.indexOf('permiso de administrador') !== -1;

  // 10. Foco final + errores JS (se ignoran los ya conocidos del 251:
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
  log('10-foco-errores', { finalFocus, consoleErrs: consoleErrs.slice(0, 8), consoleNuevos, errsNuevos });

  const ok = selectorOk && wuBtnOk && panelOk && buscarOk &&
    instalarOk && buscar0Ok && buscarErrOk && instalarSinOk && instalarAdminOk &&
    consoleNuevos.length === 0 && errsNuevos.length === 0;
  console.log('[SMOKE-258] RESULTADO ' + JSON.stringify(results, null, 2));
  console.log('[SMOKE-258] VEREDICTO ' + (ok ? 'OK' : 'FALLO'));
  app.exit(ok ? 0 : 1);
}
app.whenReady().then(main).catch((e) => {
  console.error('[SMOKE-258] FALLO:', e && e.message ? e.message : e);
  console.log('[SMOKE-258] RESULTADO-PARCIAL ' + JSON.stringify(results, null, 2));
  app.exit(2);
});
