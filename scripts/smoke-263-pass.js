// Smoke test 2.5.13 — Vista «Responsiva»: «📤 Enviar formulario en
// blanco» por WhatsApp + lista «Responsivas enviadas» en vivo.
//   - Al abrir Responsiva se ve el botón nuevo «Enviar formulario en
//     blanco» (#btnRespBlanco) y la sección «Responsivas enviadas»
//     con el mensaje de lista vacía.
//   - Con Cloud simulado (crearResponsiva + subscribeResponsivas
//     inyectados en la página; la app corre en modo local sin nube
//     real): pulsar «Enviar formulario en blanco» -> crea la
//     responsiva y abre wa.me/?text= con el enlace
//     responsiva.html?id=RESP-SMOKE-263 para elegir contacto
//     (capturado por setWindowOpenHandler, igual que main.js; NO se
//     abre nada real) y toast «Responsiva creada».
//   - Al llegar una responsiva pendiente por la suscripción, la lista
//     muestra «Pendiente» y el botón «🔗 Copiar enlace»; al pulsarlo,
//     o se copia el enlace (toast «Enlace copiado») o se abre wa.me
//     con el enlace (respaldo sin portapapeles). Se acepta cualquiera
//     de los dos, y se registra cuál ocurrió.
//   - Al llegar la misma responsiva llenada, la tarjeta se actualiza
//     sola: «Llenada» con los 6 datos y los botones «📲 Compartir por
//     WhatsApp», «✉️ Enviar por correo» y «💾 Guardar en Excel».
//   - Clic en WhatsApp -> wa.me/?text= con el título y los 6 datos.
//   - Clic en correo -> mailto: con asunto «Responsiva: <nombre>» y
//     los 6 datos en el cuerpo (capturado por will-navigate).
//   - Clic en Excel -> con URL.createObjectURL y el clic de <a>
//     simulados en la página (para no descargar nada real), toast
//     «Excel descargado: responsiva-juan-p-rez-l-pez.xlsx» y el
//     nombre de descarga correcto.
// Corre con el Electron de node_modules:
//   xvfb-run -a ./node_modules/.bin/electron --no-sandbox scripts/smoke-263-pass.js
// El www es el ./www del proyecto (copiado con node scripts/copy-www.js
// desde ../checklist-cloud/www, md5 verificado). firebase-config.js se
// sustituye por placeholder (modo local sin nube): el login real con
// Firebase NO se ejerce aquí; los botones se pulsan con clics reales.
// Logs y capturas en docs/smoke263-*.
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const TMP = '/home/hatch/workspace/tmp/smoke263/run';
const TMPWWW = path.join(TMP, 'www');
const SHOTDIR = path.join(ROOT, 'docs');
const EXPECTED_WWW_MD5 = 'c5c29bdbf65b89eb2961a6695ce83412';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (typeof process.getuid === 'function' && process.getuid() === 0) {
  app.commandLine.appendSwitch('no-sandbox');
}
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.setPath('userData', path.join(TMP, 'userData'));

const results = {};
function log(step, obj) {
  results[step] = obj;
  console.log('[SMOKE-263] ' + step + ' ' + JSON.stringify(obj));
}
async function shot(win, name) {
  const p = path.join(SHOTDIR, name);
  const image = await win.webContents.capturePage();
  fs.writeFileSync(p, image.toPNG());
  console.log('[SMOKE-263] captura ' + p);
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
  if (idxMd5 !== EXPECTED_WWW_MD5) throw new Error('md5 del www no coincide con 2.5.13: ' + idxMd5);
  fs.writeFileSync(path.join(TMPWWW, 'firebase-config.js'),
    "// placeholder SOLO para el smoke test local 2.5.13\nwindow.FIREBASE_CONFIG = { apiKey: 'TU_API_KEY' };\n");
  const preloadPath = path.join(ROOT, 'preload.js');
  log('0-preload', { preloadPath });

  // IPC simulado (proceso main del smoke): la apertura externa y el
  // mailto solo se capturan, NUNCA se comparte nada real.
  const opened263 = [];
  const mailto263 = [];
  ipcMain.handle('desktop-get-machine-id', async () => 'SERIE-SMOKE-263');
  ipcMain.handle('desktop-open-external', async (event, url) => { opened263.push(String(url)); return true; });

  const win = new BrowserWindow({
    width: 1200, height: 800, title: 'Checklist de Soporte',
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  // Igual que main.js (líneas 38-44): window.open a http(s) se intercepta
  // y va al navegador del sistema; aquí la URL solo se captura en
  // opened263 y la ventana in-app se deniega (no se abre nada real).
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) opened263.push(String(url));
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (String(url).startsWith('mailto:')) { event.preventDefault(); mailto263.push(String(url)); }
  });
  const consoleErrs = [];
  win.webContents.on('console-message', (e, level, msg) => {
    if (level === 2 || /error/i.test(msg)) consoleErrs.push(msg);
  });
  await win.loadFile(path.join(TMPWWW, 'index.html'));
  win.focus();

  // 1. Arranque en modo local: selector de sección al abrir, versión 2.5.13
  // y el quinto botón «Responsiva».
  let ready = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    ready = await js(win, `function(){return {
      authReady: window._authReady, mainHidden: document.getElementById('mainApp').hidden,
      inicioHidden: document.getElementById('viewInicio').hidden,
      inicioText: (document.getElementById('viewInicio').innerText||''),
      versionText: (document.body.textContent||'').indexOf('2.5.13')!==-1,
      sin2512vieja: (document.body.textContent||'').indexOf('2.5.12')===-1,
      splashInDom: !!document.getElementById('splash')};}`);
    if (ready.authReady && !ready.mainHidden) break;
  }
  log('1-boot-selector', ready);
  if (!ready || !ready.authReady || ready.mainHidden) throw new Error('no llegó al modo local');
  const selectorOk = !ready.inicioHidden &&
    ready.versionText === true && ready.sin2512vieja === true &&
    ready.inicioText.indexOf('Por preparar') !== -1 &&
    ready.inicioText.indexOf('Recibir renta') !== -1 &&
    ready.inicioText.indexOf('Entrega Renta') !== -1 &&
    ready.inicioText.indexOf('Mantenimientos Preventivos') !== -1 &&
    ready.inicioText.indexOf('Responsiva') !== -1;
  log('1b-selector-5-secciones', { selectorOk });
  await sleep(2500);
  await js(win, `function(){window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message));});return true;}`);
  await shot(win, 'smoke263-inicio.png');

  // 2. Instalar el Cloud simulado ANTES de entrar a Responsiva (la
  // suscripción se hace al entrar a la vista): crearResponsiva devuelve
  // un id fijo y subscribeResponsivas guarda el callback en la página.
  const stubs = await js(win, `function(){
    window.Cloud.crearResponsiva = async function(nombre){ window.__respCreada = nombre; return 'RESP-SMOKE-263'; };
    window.Cloud.subscribeResponsivas = function(cb, uid){ window.__respCb = cb; window.__respUid = uid; return function(){}; };
    window.CLOUD_ENABLED = true;
    return {cloud: !!window.Cloud, crear: typeof window.Cloud.crearResponsiva, sub: typeof window.Cloud.subscribeResponsivas};}`);
  log('2-cloud-simulado', stubs);
  const goResp = await mouseClick(win, '#btnGoResp');
  await sleep(400);
  const vista = await js(win, `function(){return {
    respHidden: document.getElementById('viewResp').hidden,
    inicioHidden: document.getElementById('viewInicio').hidden,
    texto: (document.getElementById('viewResp').innerText||''),
    suscrito: typeof window.__respCb === 'function',
    btnBlanco: !!document.getElementById('btnRespBlanco')};}`);
  log('2-vista-resp', { goResp, vista });
  const vistaOk = stubs.cloud === true && stubs.crear === 'function' && stubs.sub === 'function' &&
    goResp.clicked === true && vista.respHidden === false &&
    vista.inicioHidden === true && vista.suscrito === true && vista.btnBlanco === true &&
    vista.texto.indexOf('Enviar formulario en blanco') !== -1 &&
    vista.texto.indexOf('Responsivas enviadas') !== -1 &&
    vista.texto.indexOf('Aún no hay responsivas enviadas') !== -1;

  // 3. Pulsar «Enviar formulario en blanco»: crea la responsiva y abre
  // wa.me/?text= con el enlace responsiva.html?id=RESP-SMOKE-263 para
  // elegir contacto (sin número fijo).
  const clickBlanco = await mouseClick(win, '#btnRespBlanco');
  await sleep(600);
  const trasBlanco = await js(win, `function(){return {
    toast: ${toastOf()},
    creada: window.__respCreada,
    lista: (document.getElementById('respList').innerText||'')};}`);
  const waBlanco = opened263.length ? opened263[opened263.length - 1] : '';
  const txtBlanco = waBlanco.indexOf('https://wa.me/?text=') === 0 ? decodeURIComponent(waBlanco.split('text=')[1]) : '';
  log('3-enviar-en-blanco', { clickBlanco, opened263, txtBlanco: txtBlanco.slice(0, 300), trasBlanco });
  await shot(win, 'smoke263-en-blanco.png');
  const blancoOk = clickBlanco.clicked === true &&
    opened263.length === 1 &&
    waBlanco.indexOf('https://wa.me/?text=') === 0 &&
    txtBlanco.indexOf('https://checklist-soporte.web.app/responsiva.html?id=RESP-SMOKE-263') !== -1 &&
    txtBlanco.indexOf('llena tu responsiva') !== -1 &&
    trasBlanco.toast.indexOf('Responsiva creada') !== -1 &&
    trasBlanco.creada !== undefined;

  // 4. Llega la responsiva pendiente por la suscripción: la lista
  // muestra «Pendiente» y el botón «Copiar enlace». Al pulsarlo, o se
  // copia (toast) o se abre wa.me con el enlace (respaldo).
  await js(win, `function(){
    window.__respCb([{id: 'RESP-SMOKE-263', creadoPor: 'u1', creadoPorNombre: 'Técnico Smoke', creadoEn: Date.now(), estado: 'pendiente', datos: null}]);
    return true;}`);
  await sleep(400);
  const listaPend = await js(win, `function(){return {
    texto: (document.getElementById('respList').innerText||''),
    html: document.getElementById('respList').innerHTML};}`);
  log('4-lista-pendiente', listaPend);
  const pendOk = listaPend.texto.indexOf('Pendiente') !== -1 &&
    listaPend.texto.indexOf('Copiar enlace') !== -1 &&
    listaPend.html.indexOf('data-resp-copy="RESP-SMOKE-263"') !== -1;
  const antesCopy = opened263.length;
  const clickCopy = await mouseClick(win, '#respList [data-resp-copy]');
  await sleep(600);
  const trasCopy = await js(win, `function(){return {toast: ${toastOf()}};}`);
  const waCopy = opened263.length > antesCopy ? opened263[opened263.length - 1] : '';
  const txtCopy = waCopy.indexOf('https://wa.me/?text=') === 0 ? decodeURIComponent(waCopy.split('text=')[1]) : '';
  log('4b-copiar-enlace', { clickCopy, trasCopy, waCopy: waCopy.slice(0, 200), txtCopy: txtCopy.slice(0, 200) });
  const copyOk = clickCopy.clicked === true &&
    (trasCopy.toast.indexOf('Enlace copiado') !== -1 ||
      txtCopy.indexOf('https://checklist-soporte.web.app/responsiva.html?id=RESP-SMOKE-263') !== -1);

  // 5. Llega la misma responsiva llenada: la tarjeta se actualiza sola
  // («Llenada» con los 6 datos y los 3 botones).
  await js(win, `function(){
    window.__respCb([{id: 'RESP-SMOKE-263', creadoPor: 'u1', creadoPorNombre: 'Técnico Smoke', creadoEn: Date.now() - 60000, estado: 'llenada', llenadoEn: Date.now(),
      datos: {nombre: 'Juan Pérez López', colaborador: '98765', sucursal: 'Polanco', puesto: 'Técnico', jefe: 'María García', area: 'Sistemas'}}]);
    return true;}`);
  await sleep(400);
  const listaLlen = await js(win, `function(){return {
    texto: (document.getElementById('respList').innerText||''),
    html: document.getElementById('respList').innerHTML};}`);
  log('5-lista-llenada', listaLlen);
  await shot(win, 'smoke263-llenada.png');
  const llenOk = listaLlen.texto.indexOf('Llenada') !== -1 &&
    listaLlen.texto.indexOf('Juan Pérez López') !== -1 &&
    listaLlen.texto.indexOf('98765') !== -1 &&
    listaLlen.texto.indexOf('Polanco') !== -1 &&
    listaLlen.texto.indexOf('Técnico') !== -1 &&
    listaLlen.texto.indexOf('María García') !== -1 &&
    listaLlen.texto.indexOf('Sistemas') !== -1 &&
    listaLlen.texto.indexOf('Compartir por WhatsApp') !== -1 &&
    listaLlen.texto.indexOf('Enviar por correo') !== -1 &&
    listaLlen.texto.indexOf('Guardar en Excel') !== -1 &&
    listaLlen.html.indexOf('data-resp-wa="RESP-SMOKE-263"') !== -1 &&
    listaLlen.html.indexOf('data-resp-mail="RESP-SMOKE-263"') !== -1 &&
    listaLlen.html.indexOf('data-resp-xlsx="RESP-SMOKE-263"') !== -1 &&
    listaLlen.html.indexOf('data-resp-copy=') === -1;

  // 6. Clic en «Compartir por WhatsApp»: wa.me/?text= con el título y
  // los 6 datos.
  const antesWa = opened263.length;
  const clickWa = await mouseClick(win, '#respList [data-resp-wa]');
  await sleep(400);
  const waLlen = opened263.length > antesWa ? opened263[opened263.length - 1] : '';
  const txtWa = waLlen.indexOf('https://wa.me/?text=') === 0 ? decodeURIComponent(waLlen.split('text=')[1]) : '';
  log('6-whatsapp-llenada', { clickWa, waLlen: waLlen.slice(0, 120), txtWa: txtWa.slice(0, 400) });
  const waOk = clickWa.clicked === true &&
    opened263.length === antesWa + 1 &&
    waLlen.indexOf('https://wa.me/?text=') === 0 &&
    txtWa.indexOf('Responsiva — Checklist de Soporte') !== -1 &&
    txtWa.indexOf('Nombre Completo: Juan Pérez López') !== -1 &&
    txtWa.indexOf('Número de colaborador: 98765') !== -1 &&
    txtWa.indexOf('Sucursal: Polanco') !== -1 &&
    txtWa.indexOf('Puesto: Técnico') !== -1 &&
    txtWa.indexOf('Jefe Directo: María García') !== -1 &&
    txtWa.indexOf('Área: Sistemas') !== -1;

  // 7. Clic en «Enviar por correo»: mailto: con asunto «Responsiva:
  // Juan Pérez López» y los 6 datos en el cuerpo.
  const clickMail = await mouseClick(win, '#respList [data-resp-mail]');
  await sleep(400);
  const mailUrl = mailto263.length ? mailto263[mailto263.length - 1] : '';
  const mailAsunto = mailUrl.indexOf('mailto:?subject=') === 0 ? decodeURIComponent(mailUrl.split('subject=')[1].split('&body=')[0]) : '';
  const mailCuerpo = mailUrl.indexOf('&body=') !== -1 ? decodeURIComponent(mailUrl.split('&body=')[1]) : '';
  log('7-correo', { clickMail, mailto263: mailto263.map((u) => u.slice(0, 120)), mailAsunto, mailCuerpo: mailCuerpo.slice(0, 400) });
  const mailOk = clickMail.clicked === true &&
    mailto263.length === 1 &&
    mailUrl.indexOf('mailto:?subject=') === 0 &&
    mailAsunto === 'Responsiva: Juan Pérez López' &&
    mailCuerpo.indexOf('Nombre Completo: Juan Pérez López') !== -1 &&
    mailCuerpo.indexOf('Número de colaborador: 98765') !== -1 &&
    mailCuerpo.indexOf('Sucursal: Polanco') !== -1 &&
    mailCuerpo.indexOf('Puesto: Técnico') !== -1 &&
    mailCuerpo.indexOf('Jefe Directo: María García') !== -1 &&
    mailCuerpo.indexOf('Área: Sistemas') !== -1;

  // 8. Clic en «Guardar en Excel»: con la descarga simulada en la
  // página (createObjectURL + clic de <a>), toast con el nombre del
  // archivo y nombre de descarga correcto.
  await js(win, `function(){
    window.URL.createObjectURL = function(){ return 'blob:stub'; };
    HTMLAnchorElement.prototype.click = function(){ window.__aClick = {href: this.href, download: this.download}; };
    return true;}`);
  const clickXlsx = await mouseClick(win, '#respList [data-resp-xlsx]');
  await sleep(600);
  const trasXlsx = await js(win, `function(){return {toast: ${toastOf()}, aClick: window.__aClick || null};}`);
  log('8-excel', { clickXlsx, trasXlsx });
  await shot(win, 'smoke263-excel.png');
  const xlsxOk = clickXlsx.clicked === true &&
    trasXlsx.toast.indexOf('Excel descargado: responsiva-juan-p-rez-l-pez.xlsx') !== -1 &&
    trasXlsx.aClick !== null && trasXlsx.aClick.download === 'responsiva-juan-p-rez-l-pez.xlsx';

  // 9. Foco final + errores JS (se ignoran los ya conocidos del 251:
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
  log('9-foco-errores', { finalFocus, consoleErrs: consoleErrs.slice(0, 8), consoleNuevos, errsNuevos });

  const ok = selectorOk && vistaOk && blancoOk && pendOk && copyOk && llenOk && waOk && mailOk && xlsxOk &&
    consoleNuevos.length === 0 && errsNuevos.length === 0;
  console.log('[SMOKE-263] RESULTADO ' + JSON.stringify(results, null, 2));
  console.log('[SMOKE-263] VEREDICTO ' + (ok ? 'OK' : 'FALLO'));
  app.exit(ok ? 0 : 1);
}
app.whenReady().then(main).catch((e) => {
  console.error('[SMOKE-263] FALLO:', e && e.message ? e.message : e);
  console.log('[SMOKE-263] RESULTADO-PARCIAL ' + JSON.stringify(results, null, 2));
  app.exit(2);
});
