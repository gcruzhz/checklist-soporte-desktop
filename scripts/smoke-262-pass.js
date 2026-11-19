// Smoke test 2.5.12 — Vista «Responsiva»: botón «💾 Guardar y cerrar»
// con borrador local.
//   - Al abrir Responsiva se restaura el borrador guardado en
//     localStorage (checklist-soporte-resp-borrador-v1).
//   - Llenar el formulario A MEDIAS (solo nombre y sucursal) y pulsar
//     «💾 Guardar y cerrar» (#btnRespGuardar) -> guarda los 6 campos
//     (vacíos los que falten), muestra el toast «Responsiva guardada»
//     y vuelve a Inicio; al volver a abrir Responsiva los datos
//     siguen ahí.
//   - Completar los 6 campos y pulsar «📲 Enviar por WhatsApp» ->
//     wa.me/<número con 52>?text= con el título, la fecha y los 6
//     datos (capturado por setWindowOpenHandler, igual que main.js:
//     la app llama window.open(wa.me) y main.js lo manda al navegador
//     del sistema; aquí solo se captura la URL, NO se abre nada real),
//     el formulario queda vacío y el borrador borrado: al reabrir
//     Responsiva abre vacío.
//   - El número de WhatsApp guardado (checklist-soporte-resp-wa-v1)
//     NO se toca al guardar el borrador: sigue guardado y en el campo
//     tras guardar, tras enviar y tras Limpiar.
//   - «Limpiar» también borra el borrador y vacía los 6 campos.
// Corre con el Electron de node_modules:
//   xvfb-run -a ./node_modules/.bin/electron --no-sandbox scripts/smoke-262-pass.js
// El www es el ./www del proyecto (copiado con node scripts/copy-www.js
// desde ../checklist-cloud/www, md5 verificado). firebase-config.js se
// sustituye por placeholder (modo local sin nube): el login real con
// Firebase NO se ejerce aquí; los botones se pulsan con clics reales.
// Logs y capturas en docs/smoke262-*.
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const TMP = '/home/hatch/workspace/tmp/smoke262/run';
const TMPWWW = path.join(TMP, 'www');
const SHOTDIR = path.join(ROOT, 'docs');
const EXPECTED_WWW_MD5 = 'f5693f01e94fa6196435780ef313198d';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (typeof process.getuid === 'function' && process.getuid() === 0) {
  app.commandLine.appendSwitch('no-sandbox');
}
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.setPath('userData', path.join(TMP, 'userData'));

const results = {};
function log(step, obj) {
  results[step] = obj;
  console.log('[SMOKE-262] ' + step + ' ' + JSON.stringify(obj));
}
async function shot(win, name) {
  const p = path.join(SHOTDIR, name);
  const image = await win.webContents.capturePage();
  fs.writeFileSync(p, image.toPNG());
  console.log('[SMOKE-262] captura ' + p);
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
const RESP_IDS = ['fResp-nombre', 'fResp-colaborador', 'fResp-sucursal', 'fResp-puesto', 'fResp-jefe', 'fResp-area'];
function valoresDe() {
  return `function(){return {
    valores: ${JSON.stringify(RESP_IDS)}.map(function (id) { return document.getElementById(id).value; }),
    wa: document.getElementById('fResp-wa').value,
    borrador: localStorage.getItem('checklist-soporte-resp-borrador-v1'),
    waGuardado: localStorage.getItem('checklist-soporte-resp-wa-v1')};}`;
}

async function main() {
  // 0. www del ./www del proyecto (copiado con copy-www.js): md5 verificado.
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'www'), TMPWWW, { recursive: true });
  const idxMd5 = crypto.createHash('md5').update(fs.readFileSync(path.join(TMPWWW, 'index.html'))).digest('hex');
  log('0-www-origen', { src: 'proyecto-www', md5: idxMd5, esperado: EXPECTED_WWW_MD5, coincide: idxMd5 === EXPECTED_WWW_MD5 });
  if (idxMd5 !== EXPECTED_WWW_MD5) throw new Error('md5 del www no coincide con 2.5.12: ' + idxMd5);
  fs.writeFileSync(path.join(TMPWWW, 'firebase-config.js'),
    "// placeholder SOLO para el smoke test local 2.5.12\nwindow.FIREBASE_CONFIG = { apiKey: 'TU_API_KEY' };\n");
  const preloadPath = path.join(ROOT, 'preload.js');
  log('0-preload', { preloadPath });

  // IPC simulado (proceso main del smoke): la apertura externa solo se
  // captura, NUNCA se comparte nada real.
  const opened262 = [];
  ipcMain.handle('desktop-get-machine-id', async () => 'SERIE-SMOKE-262');
  ipcMain.handle('desktop-open-external', async (event, url) => { opened262.push(String(url)); return true; });

  const win = new BrowserWindow({
    width: 1200, height: 800, title: 'Checklist de Soporte',
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  // Igual que main.js (líneas 38-44): window.open a http(s) se intercepta
  // y va al navegador del sistema; aquí la URL solo se captura en
  // opened262 y la ventana in-app se deniega (no se abre nada real).
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) opened262.push(String(url));
    return { action: 'deny' };
  });
  const consoleErrs = [];
  win.webContents.on('console-message', (e, level, msg) => {
    if (level === 2 || /error/i.test(msg)) consoleErrs.push(msg);
  });
  await win.loadFile(path.join(TMPWWW, 'index.html'));
  win.focus();

  // 1. Arranque en modo local: selector de sección al abrir, versión 2.5.12
  // y el quinto botón «Responsiva».
  let ready = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    ready = await js(win, `function(){return {
      authReady: window._authReady, mainHidden: document.getElementById('mainApp').hidden,
      inicioHidden: document.getElementById('viewInicio').hidden,
      inicioText: (document.getElementById('viewInicio').innerText||''),
      versionText: (document.body.textContent||'').indexOf('2.5.12')!==-1,
      sin2511vieja: (document.body.textContent||'').indexOf('2.5.11')===-1,
      splashInDom: !!document.getElementById('splash')};}`);
    if (ready.authReady && !ready.mainHidden) break;
  }
  log('1-boot-selector', ready);
  if (!ready || !ready.authReady || ready.mainHidden) throw new Error('no llegó al modo local');
  const selectorOk = !ready.inicioHidden &&
    ready.versionText === true && ready.sin2511vieja === true &&
    ready.inicioText.indexOf('Por preparar') !== -1 &&
    ready.inicioText.indexOf('Recibir renta') !== -1 &&
    ready.inicioText.indexOf('Entrega Renta') !== -1 &&
    ready.inicioText.indexOf('Mantenimientos Preventivos') !== -1 &&
    ready.inicioText.indexOf('Responsiva') !== -1;
  log('1b-selector-5-secciones', { selectorOk });
  await sleep(2500);
  await js(win, `function(){window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message));});return true;}`);
  await shot(win, 'smoke262-inicio.png');

  // 2. Ir a Responsiva, llenar A MEDIAS (solo nombre y sucursal),
  // configurar el número de WhatsApp y pulsar «Guardar y cerrar»:
  // vuelve a Inicio, guarda el borrador con los 6 campos (vacíos los
  // que falten) y NO toca el número guardado ni abre WhatsApp.
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
    vista.texto.indexOf('Guardar y cerrar') !== -1 &&
    vista.texto.indexOf('Número de WhatsApp para enviar el formulario') !== -1;
  const llenadoParcial = await js(win, `function(){
    function set(id, v, ev) {
      var el = document.getElementById(id);
      el.value = v;
      if (ev) el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    set('fResp-nombre', 'Juan Pérez López');
    set('fResp-sucursal', 'Polanco');
    set('fResp-wa', '5512345678', true);
    return { borradorAntes: localStorage.getItem('checklist-soporte-resp-borrador-v1'),
      waGuardado: localStorage.getItem('checklist-soporte-resp-wa-v1')};}`);
  log('2b-llenado-parcial', llenadoParcial);
  const clickGuardar = await mouseClick(win, '#btnRespGuardar');
  await sleep(400);
  const trasGuardar = await js(win, `function(){return {
    respHidden: document.getElementById('viewResp').hidden,
    inicioHidden: document.getElementById('viewInicio').hidden,
    toast: ${toastOf()},
    borrador: localStorage.getItem('checklist-soporte-resp-borrador-v1'),
    waGuardado: localStorage.getItem('checklist-soporte-resp-wa-v1')};}`);
  log('2c-guardar-cerrar', { clickGuardar, trasGuardar, opened262: opened262.slice() });
  await shot(win, 'smoke262-guardado.png');
  let borradorParcial = null;
  try { borradorParcial = JSON.parse(trasGuardar.borrador || 'null'); } catch (e) { borradorParcial = null; }
  const guardarOk = clickGuardar.clicked === true &&
    trasGuardar.respHidden === true && trasGuardar.inicioHidden === false &&
    trasGuardar.toast.indexOf('Responsiva guardada') !== -1 &&
    opened262.length === 0 &&
    borradorParcial !== null &&
    borradorParcial['fResp-nombre'] === 'Juan Pérez López' &&
    borradorParcial['fResp-sucursal'] === 'Polanco' &&
    borradorParcial['fResp-colaborador'] === '' &&
    borradorParcial['fResp-puesto'] === '' &&
    borradorParcial['fResp-jefe'] === '' &&
    borradorParcial['fResp-area'] === '' &&
    trasGuardar.waGuardado === '5512345678';

  // 3. Volver a abrir Responsiva: el borrador se restaura (nombre y
  // sucursal siguen) y el número de WhatsApp sigue guardado y en el campo.
  const goResp2 = await mouseClick(win, '#btnGoResp');
  await sleep(400);
  const restaurado = await js(win, valoresDe());
  log('3-borrador-restaurado', { goResp2, restaurado });
  await shot(win, 'smoke262-resp-restaurada.png');
  const restauradoOk = goResp2.clicked === true &&
    restaurado.valores[0] === 'Juan Pérez López' &&
    restaurado.valores[2] === 'Polanco' &&
    restaurado.valores[1] === '' && restaurado.valores[3] === '' &&
    restaurado.valores[4] === '' && restaurado.valores[5] === '' &&
    restaurado.wa === '5512345678' && restaurado.waGuardado === '5512345678' &&
    restaurado.borrador !== null;

  // 4. Completar los 6 campos y pulsar Enviar: wa.me con el número
  // normalizado (52 + 10 dígitos) y el texto con título, fecha y los
  // 6 datos; el formulario queda vacío y el borrador borrado, pero el
  // número de WhatsApp sigue guardado y en el campo.
  const completado = await js(win, `function(){
    function set(id, v, ev) {
      var el = document.getElementById(id);
      el.value = v;
      if (ev) el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    set('fResp-colaborador', '98765');
    set('fResp-puesto', 'Técnico');
    set('fResp-jefe', 'María García');
    set('fResp-area', 'Sistemas');
    var h = new Date();
    return { fecha: h.getDate() + '/' + (h.getMonth() + 1) + '/' + h.getFullYear() };}`);
  const clickEnviar = await mouseClick(win, '#btnRespEnviar');
  await sleep(600);
  const waUrl = opened262.length ? opened262[opened262.length - 1] : '';
  const waTxt = waUrl.indexOf('https://wa.me/525512345678?text=') === 0 ? decodeURIComponent(waUrl.split('text=')[1]) : '';
  const trasEnviar = await js(win, valoresDe());
  log('4-enviar', { completado, clickEnviar, opened262, waTxt: waTxt.slice(0, 400), trasEnviar });
  await shot(win, 'smoke262-whatsapp.png');
  const waOk = clickEnviar.clicked === true &&
    opened262.length === 1 &&
    waUrl.indexOf('https://wa.me/525512345678?text=') === 0 &&
    waTxt.indexOf('Responsiva — Checklist de Soporte') !== -1 &&
    waTxt.indexOf('Fecha: ' + completado.fecha) !== -1 &&
    waTxt.indexOf('Nombre Completo: Juan Pérez López') !== -1 &&
    waTxt.indexOf('Número de colaborador: 98765') !== -1 &&
    waTxt.indexOf('Sucursal: Polanco') !== -1 &&
    waTxt.indexOf('Puesto: Técnico') !== -1 &&
    waTxt.indexOf('Jefe Directo: María García') !== -1 &&
    waTxt.indexOf('Área: Sistemas') !== -1;
  const trasEnviarOk = trasEnviar.valores.every(function (v) { return v === ''; }) &&
    trasEnviar.borrador === null &&
    trasEnviar.wa === '5512345678' && trasEnviar.waGuardado === '5512345678';

  // 5. Reabrir Responsiva: abre vacía (borrador borrado al enviar),
  // con el número de WhatsApp todavía ahí. Tras Enviar se sigue en
  // la vista Responsiva, así que primero se vuelve a Inicio con la
  // pestaña 🏠 y luego se entra con el botón del selector.
  const goInicio5 = await mouseClick(win, '#tabs [data-v="inicio"]');
  await sleep(400);
  const goResp3 = await mouseClick(win, '#btnGoResp');
  await sleep(400);
  const reabierto = await js(win, valoresDe());
  log('5-reabrir-vacio', { goInicio5, goResp3, reabierto });
  const reabiertoOk = goInicio5.clicked === true && goResp3.clicked === true &&
    reabierto.valores.every(function (v) { return v === ''; }) &&
    reabierto.borrador === null &&
    reabierto.wa === '5512345678' && reabierto.waGuardado === '5512345678';

  // 6. Limpiar también borra el borrador: llenar a medias, guardar,
  // reabrir (se restaura), pulsar Limpiar -> 6 campos vacíos, borrador
  // borrado y número conservado.
  await js(win, `function(){
    document.getElementById('fResp-nombre').value = 'Ana Ruiz';
    document.getElementById('fResp-area').value = 'Ventas';
    return true;}`);
  const clickGuardar2 = await mouseClick(win, '#btnRespGuardar');
  await sleep(400);
  const goResp4 = await mouseClick(win, '#btnGoResp');
  await sleep(400);
  const antesLimpiar = await js(win, valoresDe());
  const clickLimpiar = await mouseClick(win, '#btnRespLimpiar');
  await sleep(300);
  const trasLimpiar = await js(win, valoresDe());
  log('6-limpiar-borra-borrador', { clickGuardar2, goResp4, antesLimpiar, clickLimpiar, trasLimpiar });
  const limpiarOk = clickGuardar2.clicked === true && goResp4.clicked === true &&
    antesLimpiar.valores[0] === 'Ana Ruiz' && antesLimpiar.valores[5] === 'Ventas' &&
    antesLimpiar.borrador !== null &&
    clickLimpiar.clicked === true &&
    trasLimpiar.valores.every(function (v) { return v === ''; }) &&
    trasLimpiar.borrador === null &&
    trasLimpiar.wa === '5512345678' && trasLimpiar.waGuardado === '5512345678';

  // 7. Foco final + errores JS (se ignoran los ya conocidos del 251:
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
  log('7-foco-errores', { finalFocus, consoleErrs: consoleErrs.slice(0, 8), consoleNuevos, errsNuevos });

  const ok = selectorOk && vistaOk && guardarOk && restauradoOk && waOk && trasEnviarOk && reabiertoOk && limpiarOk &&
    consoleNuevos.length === 0 && errsNuevos.length === 0;
  console.log('[SMOKE-262] RESULTADO ' + JSON.stringify(results, null, 2));
  console.log('[SMOKE-262] VEREDICTO ' + (ok ? 'OK' : 'FALLO'));
  app.exit(ok ? 0 : 1);
}
app.whenReady().then(main).catch((e) => {
  console.error('[SMOKE-262] FALLO:', e && e.message ? e.message : e);
  console.log('[SMOKE-262] RESULTADO-PARCIAL ' + JSON.stringify(results, null, 2));
  app.exit(2);
});
