// Smoke test 2.5.11 — Vista «Responsiva»: formulario que se envía por
// WhatsApp al número configurado.
//   - El selector de Inicio trae el quinto botón «📋 Responsiva» junto a
//     los 4 de siempre; al pulsarlo se abre #viewResp con los 6 campos
//     (Nombre Completo, Número de colaborador, Sucursal, Puesto, Jefe
//     Directo, Área) y el campo «Número de WhatsApp para enviar el
//     formulario» (tel, ejemplo de 10 dígitos).
//   - Llenar el formulario, configurar el número (10 dígitos) y pulsar
//     «📲 Enviar por WhatsApp» -> wa.me/<número con 52>?text= con el
//     título «Responsiva — Checklist de Soporte», la fecha de hoy y los
//     6 datos. Capturado por setWindowOpenHandler, igual que main.js:
//     la app llama window.open(wa.me) y main.js lo manda al navegador
//     del sistema; aquí solo se captura la URL, NO se abre nada real.
//   - El número queda guardado en localStorage
//     (checklist-soporte-resp-wa-v1) y «Limpiar» vacía los 6 campos
//     pero conserva el número.
//   - Sin número configurado, Enviar abre wa.me/?text= para elegir
//     contacto y avisa con toast que no hay número guardado.
//   - El envío NO guarda el formulario en la nube ni en localStorage.
// Corre con el Electron de node_modules:
//   xvfb-run -a ./node_modules/.bin/electron --no-sandbox scripts/smoke-261-pass.js
// El www es el ./www del proyecto (copiado con node scripts/copy-www.js
// desde ../checklist-cloud/www, md5 verificado). firebase-config.js se
// sustituye por placeholder (modo local sin nube): el login real con
// Firebase NO se ejerce aquí; los botones se pulsan con clics reales.
// Logs y capturas en docs/smoke261-*.
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const TMP = '/home/hatch/workspace/tmp/smoke261/run';
const TMPWWW = path.join(TMP, 'www');
const SHOTDIR = path.join(ROOT, 'docs');
const EXPECTED_WWW_MD5 = '9a3cb106b677b35168b33eb634105fa6';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (typeof process.getuid === 'function' && process.getuid() === 0) {
  app.commandLine.appendSwitch('no-sandbox');
}
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.setPath('userData', path.join(TMP, 'userData'));

const results = {};
function log(step, obj) {
  results[step] = obj;
  console.log('[SMOKE-261] ' + step + ' ' + JSON.stringify(obj));
}
async function shot(win, name) {
  const p = path.join(SHOTDIR, name);
  const image = await win.webContents.capturePage();
  fs.writeFileSync(p, image.toPNG());
  console.log('[SMOKE-261] captura ' + p);
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
  if (idxMd5 !== EXPECTED_WWW_MD5) throw new Error('md5 del www no coincide con 2.5.11: ' + idxMd5);
  fs.writeFileSync(path.join(TMPWWW, 'firebase-config.js'),
    "// placeholder SOLO para el smoke test local 2.5.11\nwindow.FIREBASE_CONFIG = { apiKey: 'TU_API_KEY' };\n");
  const preloadPath = path.join(ROOT, 'preload.js');
  log('0-preload', { preloadPath });

  // IPC simulado (proceso main del smoke): la apertura externa solo se
  // captura, NUNCA se comparte nada real.
  const opened261 = [];
  ipcMain.handle('desktop-get-machine-id', async () => 'SERIE-SMOKE-261');
  ipcMain.handle('desktop-open-external', async (event, url) => { opened261.push(String(url)); return true; });

  const win = new BrowserWindow({
    width: 1200, height: 800, title: 'Checklist de Soporte',
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  // Igual que main.js (líneas 38-44): window.open a http(s) se intercepta
  // y va al navegador del sistema; aquí la URL solo se captura en
  // opened261 y la ventana in-app se deniega (no se abre nada real).
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) opened261.push(String(url));
    return { action: 'deny' };
  });
  const consoleErrs = [];
  win.webContents.on('console-message', (e, level, msg) => {
    if (level === 2 || /error/i.test(msg)) consoleErrs.push(msg);
  });
  await win.loadFile(path.join(TMPWWW, 'index.html'));
  win.focus();

  // 1. Arranque en modo local: selector de sección al abrir, versión 2.5.11
  // y el quinto botón «Responsiva».
  let ready = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    ready = await js(win, `function(){return {
      authReady: window._authReady, mainHidden: document.getElementById('mainApp').hidden,
      inicioHidden: document.getElementById('viewInicio').hidden,
      inicioText: (document.getElementById('viewInicio').innerText||''),
      versionText: (document.body.textContent||'').indexOf('2.5.11')!==-1,
      sin2510vieja: (document.body.textContent||'').indexOf('2.5.10')===-1,
      splashInDom: !!document.getElementById('splash')};}`);
    if (ready.authReady && !ready.mainHidden) break;
  }
  log('1-boot-selector', ready);
  if (!ready || !ready.authReady || ready.mainHidden) throw new Error('no llegó al modo local');
  const selectorOk = !ready.inicioHidden &&
    ready.versionText === true && ready.sin2510vieja === true &&
    ready.inicioText.indexOf('Por preparar') !== -1 &&
    ready.inicioText.indexOf('Recibir renta') !== -1 &&
    ready.inicioText.indexOf('Entrega Renta') !== -1 &&
    ready.inicioText.indexOf('Mantenimientos Preventivos') !== -1 &&
    ready.inicioText.indexOf('Responsiva') !== -1;
  log('1b-selector-5-secciones', { selectorOk });
  await sleep(2500);
  await js(win, `function(){window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message));});return true;}`);
  await shot(win, 'smoke261-inicio.png');

  // 2. Ir a Responsiva con el botón del selector y llenar el formulario;
  // el número se escribe con evento input para que se guarde en localStorage.
  const goResp = await mouseClick(win, '#btnGoResp');
  await sleep(400);
  const vista = await js(win, `function(){return {
    respHidden: document.getElementById('viewResp').hidden,
    inicioHidden: document.getElementById('viewInicio').hidden,
    texto: (document.getElementById('viewResp').innerText||'')};}`);
  log('2-vista-resp', { goResp, vista });
  const vistaOk = goResp.clicked === true && vista.respHidden === false &&
    vista.inicioHidden === true &&
    vista.texto.indexOf('Nombre Completo') !== -1 &&
    vista.texto.indexOf('Número de colaborador') !== -1 &&
    vista.texto.indexOf('Sucursal') !== -1 &&
    vista.texto.indexOf('Puesto') !== -1 &&
    vista.texto.indexOf('Jefe Directo') !== -1 &&
    vista.texto.indexOf('Área') !== -1 &&
    vista.texto.indexOf('Número de WhatsApp para enviar el formulario') !== -1;
  const llenado = await js(win, `function(){
    function set(id, v, ev) {
      var el = document.getElementById(id);
      el.value = v;
      if (ev) el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    set('fResp-nombre', 'Juan Pérez López');
    set('fResp-colaborador', '98765');
    set('fResp-sucursal', 'Polanco');
    set('fResp-puesto', 'Técnico');
    set('fResp-jefe', 'María García');
    set('fResp-area', 'Sistemas');
    set('fResp-wa', '5512345678', true);
    var h = new Date();
    return { fecha: h.getDate() + '/' + (h.getMonth() + 1) + '/' + h.getFullYear(),
      guardado: localStorage.getItem('checklist-soporte-resp-wa-v1'),
      valores: ['fResp-nombre', 'fResp-colaborador', 'fResp-sucursal', 'fResp-puesto', 'fResp-jefe', 'fResp-area', 'fResp-wa'].map(function (id) { return document.getElementById(id).value; }) };}`);
  log('2b-llenado', llenado);
  await shot(win, 'smoke261-resp.png');
  const llenadoOk = llenado.guardado === '5512345678' &&
    llenado.valores[0] === 'Juan Pérez López' && llenado.valores[6] === '5512345678';

  // 3. Enviar por WhatsApp: wa.me con el número normalizado (52 + 10
  // dígitos) y el texto con título, fecha y los 6 datos.
  const clickEnviar = await mouseClick(win, '#btnRespEnviar');
  await sleep(600);
  const waUrl = opened261.length ? opened261[opened261.length - 1] : '';
  const waTxt = waUrl.indexOf('https://wa.me/525512345678?text=') === 0 ? decodeURIComponent(waUrl.split('text=')[1]) : '';
  log('3-whatsapp', { clickEnviar, opened261, waTxt: waTxt.slice(0, 400) });
  await shot(win, 'smoke261-whatsapp.png');
  const waOk = clickEnviar.clicked === true &&
    opened261.length === 1 &&
    waUrl.indexOf('https://wa.me/525512345678?text=') === 0 &&
    waTxt.indexOf('Responsiva — Checklist de Soporte') !== -1 &&
    waTxt.indexOf('Fecha: ' + llenado.fecha) !== -1 &&
    waTxt.indexOf('Nombre Completo: Juan Pérez López') !== -1 &&
    waTxt.indexOf('Número de colaborador: 98765') !== -1 &&
    waTxt.indexOf('Sucursal: Polanco') !== -1 &&
    waTxt.indexOf('Puesto: Técnico') !== -1 &&
    waTxt.indexOf('Jefe Directo: María García') !== -1 &&
    waTxt.indexOf('Área: Sistemas') !== -1;

  // 4. Limpiar vacía los 6 campos pero conserva el número de WhatsApp.
  const clickLimpiar = await mouseClick(win, '#btnRespLimpiar');
  await sleep(300);
  const trasLimpiar = await js(win, `function(){return {
    valores: ['fResp-nombre', 'fResp-colaborador', 'fResp-sucursal', 'fResp-puesto', 'fResp-jefe', 'fResp-area'].map(function (id) { return document.getElementById(id).value; }),
    wa: document.getElementById('fResp-wa').value,
    guardado: localStorage.getItem('checklist-soporte-resp-wa-v1')};}`);
  log('4-limpiar', { clickLimpiar, trasLimpiar });
  const limpiarOk = clickLimpiar.clicked === true &&
    trasLimpiar.valores.every(function (v) { return v === ''; }) &&
    trasLimpiar.wa === '5512345678' && trasLimpiar.guardado === '5512345678';

  // 5. Sin número configurado: Enviar abre wa.me/?text= para elegir
  // contacto y avisa con toast que no hay número guardado.
  await js(win, `function(){
    function set(id, v, ev) {
      var el = document.getElementById(id);
      el.value = v;
      if (ev) el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    set('fResp-nombre', 'Juan Pérez López');
    set('fResp-colaborador', '98765');
    set('fResp-sucursal', 'Polanco');
    set('fResp-puesto', 'Técnico');
    set('fResp-jefe', 'María García');
    set('fResp-area', 'Sistemas');
    set('fResp-wa', '', true);
    return true;}`);
  const nOpenedAntes = opened261.length;
  const clickEnviarSin = await mouseClick(win, '#btnRespEnviar');
  await sleep(600);
  const waSinUrl = opened261.length > nOpenedAntes ? opened261[opened261.length - 1] : '';
  const waSinTxt = waSinUrl.indexOf('https://wa.me/?text=') === 0 ? decodeURIComponent(waSinUrl.split('text=')[1]) : '';
  const toastSin = await js(win, `function(){return ${toastOf()};}`);
  log('5-sin-numero', { clickEnviarSin, waSinUrl, waSinTxt: waSinTxt.slice(0, 200), toastSin });
  const sinNumOk = clickEnviarSin.clicked === true &&
    opened261.length === nOpenedAntes + 1 &&
    waSinUrl.indexOf('https://wa.me/?text=') === 0 &&
    waSinTxt.indexOf('Responsiva — Checklist de Soporte') !== -1 &&
    waSinTxt.indexOf('Nombre Completo: Juan Pérez López') !== -1 &&
    toastSin.indexOf('No hay número de WhatsApp guardado') !== -1;

  // 6. Foco final + errores JS (se ignoran los ya conocidos del 251:
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
  log('6-foco-errores', { finalFocus, consoleErrs: consoleErrs.slice(0, 8), consoleNuevos, errsNuevos });

  const ok = selectorOk && vistaOk && llenadoOk && waOk && limpiarOk && sinNumOk &&
    consoleNuevos.length === 0 && errsNuevos.length === 0;
  console.log('[SMOKE-261] RESULTADO ' + JSON.stringify(results, null, 2));
  console.log('[SMOKE-261] VEREDICTO ' + (ok ? 'OK' : 'FALLO'));
  app.exit(ok ? 0 : 1);
}
app.whenReady().then(main).catch((e) => {
  console.error('[SMOKE-261] FALLO:', e && e.message ? e.message : e);
  console.log('[SMOKE-261] RESULTADO-PARCIAL ' + JSON.stringify(results, null, 2));
  app.exit(2);
});
