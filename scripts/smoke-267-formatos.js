// Smoke test 2.5.17 — PDF del Acuse Sistemas corregido para verse IGUAL
// que el formato real, y Carta Responsiva re-verificada.
//   - Inicio trae los 2 botones (#btnGoAcuse, #btnGoCarta) y la
//     versión 2.5.17 (sin 2.5.16).
//   - Acuse: fecha en español largo «1 de Septiembre de 2026», PDF con
//     logo Lapi (/ImLapi), título «ACUSE DE RECIBO», línea naranja,
//     PARA/DE en negrita cursiva, ANEXO subrayado y tabla RECIBE gris.
//   - Carta: campo nuevo Área (fCa-area, se guarda, se reabre y se
//     limpia), PDF FO-SI-10 de 2 páginas con logo, Código con bordes,
//     encabezado verde y «Área» en DATOS DEL SOLICITANTE.
// Corre con el Electron de node_modules:
//   xvfb-run -a ./node_modules/.bin/electron --no-sandbox scripts/smoke-267-formatos.js
// El www es el ./www del proyecto (copiado con node scripts/copy-www.js
// desde ../checklist-cloud/www, md5 verificado). firebase-config.js se
// sustituye por placeholder (modo local sin nube): el login real con
// Firebase NO se ejerce aquí; los botones se pulsan con clics reales y
// las descargas de PDF se capturan con URL.createObjectURL + clic de
// <a> simulados (no se descarga nada real).
// Logs y capturas en docs/smoke267-*.
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = process.env.SMOKE267_ROOT || path.join(__dirname, '..');
const TMP = process.env.SMOKE267_TMP || '/home/hatch/workspace/tmp/smoke267/run';
const TMPWWW = path.join(TMP, 'www');
const SHOTDIR = process.env.SMOKE267_SHOTS || path.join(ROOT, 'docs');
const EXPECTED_WWW_MD5 = '79156c45171429fdc346788d75465282';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (typeof process.getuid === 'function' && process.getuid() === 0) {
  app.commandLine.appendSwitch('no-sandbox');
}
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.setPath('userData', path.join(TMP, 'userData'));

const results = {};
function log(step, obj) {
  results[step] = obj;
  console.log('[SMOKE-267] ' + step + ' ' + JSON.stringify(obj));
}
async function shot(win, name) {
  const p = path.join(SHOTDIR, name);
  const image = await win.webContents.capturePage();
  fs.writeFileSync(p, image.toPNG());
  console.log('[SMOKE-267] captura ' + p);
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
function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  // 0. www del ./www del proyecto (copiado con copy-www.js): md5 verificado.
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'www'), TMPWWW, { recursive: true });
  const idxMd5 = crypto.createHash('md5').update(fs.readFileSync(path.join(TMPWWW, 'index.html'))).digest('hex');
  log('0-www-origen', { src: 'proyecto-www', md5: idxMd5, esperado: EXPECTED_WWW_MD5, coincide: idxMd5 === EXPECTED_WWW_MD5 });
  if (idxMd5 !== EXPECTED_WWW_MD5) throw new Error('md5 del www no coincide con 2.5.17: ' + idxMd5);
  fs.writeFileSync(path.join(TMPWWW, 'firebase-config.js'),
    "// placeholder SOLO para el smoke test local 2.5.17\nwindow.FIREBASE_CONFIG = { apiKey: 'TU_API_KEY' };\n");
  const preloadPath = path.join(ROOT, 'preload.js');
  log('0-preload', { preloadPath });

  // IPC simulado (proceso main del smoke): la apertura externa y el
  // mailto solo se capturan, NUNCA se comparte nada real.
  const opened267 = [];
  const mailto267 = [];
  ipcMain.handle('desktop-get-machine-id', async () => 'SERIE-SMOKE-267');
  ipcMain.handle('desktop-open-external', async (event, url) => { opened267.push(String(url)); return true; });

  const win = new BrowserWindow({
    width: 1200, height: 800, title: 'Checklist de Soporte',
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) opened267.push(String(url));
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (String(url).startsWith('mailto:')) { event.preventDefault(); mailto267.push(String(url)); }
  });
  const consoleErrs = [];
  win.webContents.on('console-message', (e, level, msg) => {
    if (level === 2 || /error/i.test(msg)) consoleErrs.push(msg);
  });
  await win.loadFile(path.join(TMPWWW, 'index.html'));
  win.focus();

  // 1. Arranque en modo local: selector de sección al abrir, versión 2.5.17
  // y los 2 botones nuevos.
  let ready = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    ready = await js(win, `function(){return {
      authReady: window._authReady, mainHidden: document.getElementById('mainApp').hidden,
      inicioHidden: document.getElementById('viewInicio').hidden,
      inicioText: (document.getElementById('viewInicio').innerText||''),
      versionText: (document.body.textContent||'').indexOf('2.5.17')!==-1,
      sin2516vieja: (document.body.textContent||'').indexOf('2.5.16')===-1,
      splashInDom: !!document.getElementById('splash')};}`);
    if (ready.authReady && !ready.mainHidden) break;
  }
  log('1-boot-selector', ready);
  if (!ready || !ready.authReady || ready.mainHidden) throw new Error('no llegó al modo local');
  const selectorOk = !ready.inicioHidden &&
    ready.versionText === true && ready.sin2516vieja === true &&
    ready.inicioText.indexOf('Por preparar') !== -1 &&
    ready.inicioText.indexOf('Recibir renta') !== -1 &&
    ready.inicioText.indexOf('Entrega Renta') !== -1 &&
    ready.inicioText.indexOf('Mantenimientos Preventivos') !== -1 &&
    ready.inicioText.indexOf('Responsiva') !== -1 &&
    ready.inicioText.indexOf('Acuse Sistemas') !== -1 &&
    ready.inicioText.indexOf('Carta Responsiva') !== -1;
  log('1b-selector-7-botones', { selectorOk });
  await sleep(2500);
  await js(win, `function(){window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message));});return true;}`);
  // Descargas de PDF capturadas (nunca se descarga nada real).
  await js(win, `function(){
    window.URL.createObjectURL = function(){ return 'blob:stub'; };
    HTMLAnchorElement.prototype.click = function(){ window.__aClick = {href: this.href, download: this.download}; };
    return true;}`);
  await shot(win, 'smoke267-inicio.png');

  // 2. Entrar a Acuse Sistemas: formulario vacío por defecto (fecha =
  // hoy; Para/De/Anexo vacíos), lista vacía.
  const goAcuse = await mouseClick(win, '#btnGoAcuse');
  await sleep(400);
  const vistaAcuse = await js(win, `function(){return {
    acuseHidden: document.getElementById('viewAcuse').hidden,
    inicioHidden: document.getElementById('viewInicio').hidden,
    texto: (document.getElementById('viewAcuse').innerText||''),
    fecha: document.getElementById('fAc-fecha').value,
    hoy: (function(){var d=new Date();function p2(n){return (n<10?'0':'')+n;} return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate());})(),
    para: document.getElementById('fAc-para').value,
    de: document.getElementById('fAc-de').value,
    anexo: document.getElementById('fAc-anexo').value,
    lista: (document.getElementById('acuseList').innerText||'')};}`);
  log('2-vista-acuse', { goAcuse, vistaAcuse });
  const vistaAcuseOk = goAcuse.clicked === true && vistaAcuse.acuseHidden === false &&
    vistaAcuse.inicioHidden === true &&
    vistaAcuse.fecha === vistaAcuse.hoy &&
    vistaAcuse.para === '' && vistaAcuse.de === '' && vistaAcuse.anexo === '' &&
    vistaAcuse.lista.indexOf('Aún no hay acuses guardados.') !== -1 &&
    vistaAcuse.texto.indexOf('Guardar acuse') !== -1 &&
    vistaAcuse.texto.indexOf('Generar PDF') !== -1;

  // 3. Validación: Guardar con Para/De vacíos -> toast de obligatorios
  // y la lista sigue vacía.
  const clickGuardarVacio = await mouseClick(win, '#btnAcuseGuardar');
  await sleep(400);
  const trasVacio = await js(win, `function(){return {toast: ${toastOf()},
    lista: (document.getElementById('acuseList').innerText||''),
    faltaPara: document.getElementById('fAc-para').classList.contains('campo-falta'),
    faltaDe: document.getElementById('fAc-de').classList.contains('campo-falta')};}`);
  log('3-validacion-vacio', { clickGuardarVacio, trasVacio });
  const validOk = clickGuardarVacio.clicked === true &&
    trasVacio.toast.indexOf('Faltan datos obligatorios: Para y De.') !== -1 &&
    trasVacio.lista.indexOf('Aún no hay acuses guardados.') !== -1 &&
    trasVacio.faltaPara === true && trasVacio.faltaDe === true;

  // 4. Llenar el acuse (fecha 2026-09-01, los datos del ejemplo del
  // documento) y guardar: toast «Acuse guardado.» y la tarjeta en la
  // lista con Para/De/Anexo y los 5 botones.
  await js(win, `function(){
    document.getElementById('fAc-fecha').value='2026-09-01';
    document.getElementById('fAc-para').value='Beatriz Garduño Dominguez RH - Revolución';
    document.getElementById('fAc-de').value='SISTEMAS';
    document.getElementById('fAc-anexo').value='Documentación';
    return true;}`);
  const clickGuardar = await mouseClick(win, '#btnAcuseGuardar');
  await sleep(500);
  const trasGuardar = await js(win, `function(){return {toast: ${toastOf()},
    lista: (document.getElementById('acuseList').innerText||''),
    html: document.getElementById('acuseList').innerHTML,
    guardados: (function(){try{return JSON.parse(localStorage.getItem('checklist-soporte-acuses-v1')||'[]').length;}catch(e){return -1;}})()};}`);
  log('4-guardar-acuse', { clickGuardar, trasGuardar });
  await shot(win, 'smoke267-acuse-guardado.png');
  const guardarOk = clickGuardar.clicked === true &&
    trasGuardar.toast.indexOf('Acuse guardado.') !== -1 &&
    trasGuardar.lista.indexOf('Beatriz Garduño Dominguez') !== -1 &&
    trasGuardar.lista.indexOf('SISTEMAS') !== -1 &&
    trasGuardar.lista.indexOf('Documentación') !== -1 &&
    trasGuardar.lista.indexOf('1 de Septiembre de 2026') !== -1 &&
    trasGuardar.html.indexOf('data-acuse-open=') !== -1 &&
    trasGuardar.html.indexOf('data-acuse-pdf=') !== -1 &&
    trasGuardar.html.indexOf('data-acuse-wa=') !== -1 &&
    trasGuardar.html.indexOf('data-acuse-mail=') !== -1 &&
    trasGuardar.html.indexOf('data-acuse-del=') !== -1;
  const acuseId = await js(win, `function(){var m=document.getElementById('acuseList').innerHTML.match(/data-acuse-open="([^"]+)"/); return m?m[1]:null;}`);

  // 5. Contenido del PDF del acuse (blob directo): fecha larga,
  // PARA/DE/ANEXO/RECIBE y los datos. Y «Generar PDF» desde el
  // formulario -> descarga capturada con el nombre correcto.
  const pdfAcuse = await js(win, `async function(){
    var a = (window.acuses||[])[0]; if(!a) return {sinAcuse:true};
    var blob = buildPdfAcuse(a);
    // El PDF se emite en latin-1 (pdfBytes: charCodeAt & 0xFF): blob.text()
    // (UTF-8) corrompe las vocales acentuadas; se decodifica latin1.
    var txt = new TextDecoder('latin1').decode(await blob.arrayBuffer());
    return {size: blob.size, type: blob.type, txt: txt};}`);
  log('5-pdf-acuse-blob', { size: pdfAcuse.size, type: pdfAcuse.type, tiene: {
    fechaLarga: (pdfAcuse.txt || '').indexOf('1 de Septiembre de 2026') !== -1,
    para: (pdfAcuse.txt || '').indexOf('Beatriz Gardu') !== -1,
    de: (pdfAcuse.txt || '').indexOf('SISTEMAS') !== -1,
    anexo: (pdfAcuse.txt || '').indexOf('Documentaci') !== -1,
    recibe: (pdfAcuse.txt || '').indexOf('RECIBE') !== -1,
    titulo: (pdfAcuse.txt || '').indexOf('ACUSE DE RECIBO') !== -1,
    logo: (pdfAcuse.txt || '').indexOf('/ImLapi') !== -1 } });
  const pdfAcuseOk = pdfAcuse.size > 1000 && pdfAcuse.type === 'application/pdf' &&
    pdfAcuse.txt.indexOf('1 de Septiembre de 2026') !== -1 &&
    pdfAcuse.txt.indexOf('Beatriz Gardu') !== -1 &&
    pdfAcuse.txt.indexOf('SISTEMAS') !== -1 &&
    pdfAcuse.txt.indexOf('RECIBE') !== -1 &&
    pdfAcuse.txt.indexOf('ACUSE DE RECIBO') !== -1 &&
    pdfAcuse.txt.indexOf('/ImLapi') !== -1;
  await js(win, `function(){window.__aClick=null; return true;}`);
  const clickPdfForm = await mouseClick(win, '#btnAcusePdf');
  await sleep(600);
  const trasPdfForm = await js(win, `function(){return {toast: ${toastOf()}, aClick: window.__aClick || null};}`);
  log('5b-pdf-desde-form', { clickPdfForm, trasPdfForm, acuseId });
  const pdfFormOk = clickPdfForm.clicked === true &&
    trasPdfForm.aClick !== null &&
    trasPdfForm.aClick.download === 'acuse-sistemas-' + acuseId + '.pdf' &&
    trasPdfForm.toast.indexOf('PDF descargado: acuse-sistemas-' + acuseId + '.pdf') !== -1;

  // 6. Lista: «PDF por WhatsApp» -> descarga capturada + toast de
  // WhatsApp; «PDF por correo» -> descarga + mailto con el asunto.
  await js(win, `function(){window.__aClick=null; return true;}`);
  const clickWa = await mouseClick(win, '#acuseList [data-acuse-wa]');
  await sleep(600);
  const trasWa = await js(win, `function(){return {toast: ${toastOf()}, aClick: window.__aClick || null};}`);
  log('6-whatsapp-acuse', { clickWa, trasWa });
  const waOk = clickWa.clicked === true &&
    trasWa.aClick !== null && trasWa.aClick.download === 'acuse-sistemas-' + acuseId + '.pdf' &&
    trasWa.toast.indexOf('PDF descargado: acuse-sistemas-' + acuseId + '.pdf') !== -1 &&
    trasWa.toast.indexOf('WhatsApp') !== -1;
  await js(win, `function(){window.__aClick=null; return true;}`);
  const clickMail = await mouseClick(win, '#acuseList [data-acuse-mail]');
  await sleep(600);
  const mailUrl = mailto267.length ? mailto267[mailto267.length - 1] : '';
  const mailAsunto = mailUrl.indexOf('mailto:?subject=') === 0 ? decodeURIComponent(mailUrl.split('subject=')[1].split('&body=')[0]) : '';
  const mailCuerpo = mailUrl.indexOf('&body=') !== -1 ? decodeURIComponent(mailUrl.split('&body=')[1]) : '';
  const trasMail = await js(win, `function(){return {toast: ${toastOf()}, aClick: window.__aClick || null};}`);
  log('6b-correo-acuse', { clickMail, mailto267: mailto267.map((u) => u.slice(0, 120)), mailAsunto, mailCuerpo: mailCuerpo.slice(0, 300), trasMail });
  const mailOk = clickMail.clicked === true &&
    mailto267.length === 1 && mailUrl.indexOf('mailto:?subject=') === 0 &&
    mailAsunto === 'Acuse Sistemas — Checklist de Soporte' &&
    mailCuerpo.indexOf('Beatriz Gardu') !== -1 &&
    mailCuerpo.indexOf('SISTEMAS') !== -1;

  // 7. Reabrir el acuse (📝 Abrir) carga sus datos en el formulario;
  // Limpiar vacía Para/De/Anexo pero NO resetea la fecha (el prefill
  // solo llena si está vacía); Volver regresa a Inicio. Luego se vuelve
  // a entrar, se reabre y se elimina con confirmación.
  const clickAbrir = await mouseClick(win, '#acuseList [data-acuse-open]');
  await sleep(400);
  const trasAbrir = await js(win, `function(){return {
    fecha: document.getElementById('fAc-fecha').value,
    para: document.getElementById('fAc-para').value,
    de: document.getElementById('fAc-de').value,
    anexo: document.getElementById('fAc-anexo').value};}`);
  log('7-reabrir-acuse', { clickAbrir, trasAbrir });
  const abrirOk = clickAbrir.clicked === true &&
    trasAbrir.fecha === '2026-09-01' &&
    trasAbrir.para === 'Beatriz Garduño Dominguez RH - Revolución' &&
    trasAbrir.de === 'SISTEMAS' && trasAbrir.anexo === 'Documentación';
  const clickLimpiar = await mouseClick(win, '#btnAcuseLimpiar');
  await sleep(300);
  const trasLimpiar = await js(win, `function(){return {
    para: document.getElementById('fAc-para').value,
    de: document.getElementById('fAc-de').value,
    anexo: document.getElementById('fAc-anexo').value,
    fecha: document.getElementById('fAc-fecha').value};}`);
  log('7b-limpiar-acuse', { clickLimpiar, trasLimpiar });
  const limpiarOk = clickLimpiar.clicked === true &&
    trasLimpiar.para === '' && trasLimpiar.de === '' && trasLimpiar.anexo === '' &&
    trasLimpiar.fecha === '2026-09-01';
  const clickVolver = await mouseClick(win, '#btnAcuseVolver');
  await sleep(400);
  const trasVolver = await js(win, `function(){return {
    inicioHidden: document.getElementById('viewInicio').hidden,
    acuseHidden: document.getElementById('viewAcuse').hidden};}`);
  log('7c-volver-inicio', { clickVolver, trasVolver });
  const volverOk = clickVolver.clicked === true && trasVolver.inicioHidden === false && trasVolver.acuseHidden === true;
  const goAcuse2 = await mouseClick(win, '#btnGoAcuse');
  await sleep(400);
  const listaSigue = await js(win, `function(){return {lista: (document.getElementById('acuseList').innerText||'')};}`);
  const sigueOk = goAcuse2.clicked === true && listaSigue.lista.indexOf('Beatriz Garduño Dominguez') !== -1;
  const clickDel = await mouseClick(win, '#acuseList [data-acuse-del]');
  await sleep(400);
  const confirmAc = await js(win, `function(){var m=document.getElementById('confirmModal');
    return {visible: m ? !m.hidden : null, msg: (document.getElementById('confirmMsg').textContent||'')};}`);
  log('7d-eliminar-confirm', { clickDel, confirmAc });
  const clickSi = await mouseClick(win, '#confirmYes');
  await sleep(500);
  const trasDel = await js(win, `function(){return {toast: ${toastOf()},
    lista: (document.getElementById('acuseList').innerText||'')};}`);
  log('7e-eliminado', { clickSi, trasDel });
  const delOk = clickDel.clicked === true &&
    confirmAc.visible === true && confirmAc.msg.indexOf('¿Eliminar este acuse?') !== -1 &&
    clickSi.clicked === true &&
    trasDel.toast.indexOf('Acuse eliminado.') !== -1 &&
    trasDel.lista.indexOf('Aún no hay acuses guardados.') !== -1;
  await shot(win, 'smoke267-acuse-eliminado.png');

  // 8. Entrar a Carta Responsiva: folio de solo lectura («Se asigna
  // al guardar»), fecha = hoy, 1 fila de equipo por defecto, lista vacía.
  const clickVolver2 = await mouseClick(win, '#btnAcuseVolver');
  await sleep(300);
  const goCarta = await mouseClick(win, '#btnGoCarta');
  await sleep(400);
  const vistaCarta = await js(win, `function(){return {
    cartaHidden: document.getElementById('viewCarta').hidden,
    inicioHidden: document.getElementById('viewInicio').hidden,
    texto: (document.getElementById('viewCarta').innerText||''),
    fecha: document.getElementById('fCa-fecha').value,
    hoy: (function(){var d=new Date();function p2(n){return (n<10?'0':'')+n;} return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate());})(),
    folioReadonly: document.getElementById('fCa-folio').readOnly,
    folioPh: document.getElementById('fCa-folio').placeholder,
    folioVal: document.getElementById('fCa-folio').value,
    nombre: document.getElementById('fCa-nombre').value,
    area: document.getElementById('fCa-area').value,
    filas: document.querySelectorAll('#cartaEqRows [data-eq-field="modelo"]').length,
    lista: (document.getElementById('cartaList').innerText||'')};}`);
  log('8-vista-carta', { clickVolver2, goCarta, vistaCarta });
  const vistaCartaOk = goCarta.clicked === true && vistaCarta.cartaHidden === false &&
    vistaCarta.inicioHidden === true &&
    vistaCarta.fecha === vistaCarta.hoy &&
    vistaCarta.folioReadonly === true &&
    vistaCarta.folioPh === 'Se asigna al guardar' &&
    vistaCarta.folioVal === '' && vistaCarta.nombre === '' &&
    vistaCarta.area === '' &&
    vistaCarta.filas === 1 &&
    vistaCarta.lista.indexOf('Aún no hay cartas guardadas.') !== -1 &&
    vistaCarta.texto.indexOf('FO-SI-10') !== -1 &&
    vistaCarta.texto.indexOf('Agregar equipo') !== -1;

  // 9. Validación: Guardar sin nombre ni equipo -> toast de obligatorios.
  const clickGuardarCartaVacio = await mouseClick(win, '#btnCartaGuardar');
  await sleep(400);
  const trasCartaVacio = await js(win, `function(){return {toast: ${toastOf()},
    lista: (document.getElementById('cartaList').innerText||''),
    faltaNombre: document.getElementById('fCa-nombre').classList.contains('campo-falta')};}`);
  log('9-validacion-carta-vacia', { clickGuardarCartaVacio, trasCartaVacio });
  const validCartaOk = clickGuardarCartaVacio.clicked === true &&
    trasCartaVacio.toast.indexOf('Faltan datos obligatorios: nombre del colaborador y al menos un equipo con modelo o número de serie.') !== -1 &&
    trasCartaVacio.lista.indexOf('Aún no hay cartas guardadas.') !== -1 &&
    trasCartaVacio.faltaNombre === true;

  // 10. Llenar la carta (2 equipos: agregar 2ª fila) y guardar: folio
  // local 00001, toast con el folio, tarjeta en la lista.
  await js(win, `function(){
    function set(id, v){ var el=document.getElementById(id); el.value=v; }
    set('fCa-fecha', '2026-11-25');
    set('fCa-nombre', 'Juan Pérez López');
    set('fCa-colaborador', '98765');
    set('fCa-sucursal', 'Polanco');
    set('fCa-puesto', 'Técnico');
    set('fCa-area', 'Sistemas');
    set('fCa-jefe', 'María García');
    set('fCa-ip', '10.0.0.15');
    set('fCa-observaciones', 'Equipo de reposición');
    function setEq(row, campo, v){
      var el=document.querySelector('#cartaEqRows [data-eq-row="'+row+'"][data-eq-field="'+campo+'"]');
      el.value=v; el.dispatchEvent(new Event('input', {bubbles:true}));
    }
    setEq(0, 'modelo', 'ThinkPad T14');
    setEq(0, 'marca', 'Lenovo');
    setEq(0, 'serie', 'PF-123456');
    setEq(0, 'concepto', 'Laptop');
    return true;}`);
  const clickAddEq = await mouseClick(win, '#btnCartaEqAdd');
  await sleep(400);
  const filas2 = await js(win, `function(){return {
    filas: document.querySelectorAll('#cartaEqRows [data-eq-field="modelo"]').length,
    modelo0: document.querySelector('#cartaEqRows [data-eq-row="0"][data-eq-field="modelo"]').value};}`);
  log('10-agregar-fila-equipo', { clickAddEq, filas2 });
  await js(win, `function(){
    function setEq(row, campo, v){
      var el=document.querySelector('#cartaEqRows [data-eq-row="'+row+'"][data-eq-field="'+campo+'"]');
      el.value=v; el.dispatchEvent(new Event('input', {bubbles:true}));
    }
    setEq(1, 'modelo', 'Monitor 24"');
    setEq(1, 'marca', 'Dell');
    setEq(1, 'serie', 'DL-987654');
    setEq(1, 'concepto', 'Monitor');
    return true;}`);
  const clickGuardarCarta = await mouseClick(win, '#btnCartaGuardar');
  await sleep(500);
  const trasGuardarCarta = await js(win, `function(){return {toast: ${toastOf()},
    folio: document.getElementById('fCa-folio').value,
    lista: (document.getElementById('cartaList').innerText||''),
    html: document.getElementById('cartaList').innerHTML};}`);
  log('10-guardar-carta', { clickGuardarCarta, trasGuardarCarta });
  await shot(win, 'smoke267-carta-guardada.png');
  const addEqOk = clickAddEq.clicked === true && filas2.filas === 2 && filas2.modelo0 === 'ThinkPad T14';
  const guardarCartaOk = clickGuardarCarta.clicked === true &&
    trasGuardarCarta.toast.indexOf('Carta guardada con folio 00001.') !== -1 &&
    trasGuardarCarta.folio === '00001' &&
    trasGuardarCarta.lista.indexOf('Folio 00001') !== -1 &&
    trasGuardarCarta.lista.indexOf('Juan Pérez López') !== -1 &&
    trasGuardarCarta.lista.indexOf('Polanco') !== -1 &&
    trasGuardarCarta.lista.indexOf('2 equipos') !== -1 &&
    trasGuardarCarta.html.indexOf('data-carta-open=') !== -1 &&
    trasGuardarCarta.html.indexOf('data-carta-pdf=') !== -1 &&
    trasGuardarCarta.html.indexOf('data-carta-wa=') !== -1 &&
    trasGuardarCarta.html.indexOf('data-carta-mail=') !== -1 &&
    trasGuardarCarta.html.indexOf('data-carta-del=') !== -1;
  const cartaId = await js(win, `function(){var m=document.getElementById('cartaList').innerHTML.match(/data-carta-open="([^"]+)"/); return m?m[1]:null;}`);

  // 11. Contenido del PDF de la carta (blob directo): FO-SI-10, folio
  // 00001, 2 páginas, tabla de equipos y responsabilidades VERBATIM.
  // Y «Generar PDF» desde el formulario -> descarga capturada.
  const pdfCarta = await js(win, `async function(){
    var c = (window.cartas||[])[0]; if(!c) return {sinCarta:true};
    var blob = buildPdfCarta(c);
    // Latin-1 como en el paso 5 (pdfBytes: charCodeAt & 0xFF).
    var txt = new TextDecoder('latin1').decode(await blob.arrayBuffer());
    return {size: blob.size, type: blob.type, txt: txt,
      paginas: (txt.match(/\\/Type \\/Page /g)||[]).length};}`);
  const verbatim = 'RESPONSABILIDADES DEL USUARIO RESGUARDATARIO';
  log('11-pdf-carta-blob', { size: pdfCarta.size, type: pdfCarta.type, tiene: {
    foSi10: (pdfCarta.txt || '').indexOf('FO-SI-10') !== -1,
    folio: (pdfCarta.txt || '').indexOf('00001') !== -1,
    nombre: (pdfCarta.txt || '').indexOf('Juan P') !== -1,
    modelo: (pdfCarta.txt || '').indexOf('ThinkPad T14') !== -1,
    serie: (pdfCarta.txt || '').indexOf('PF-123456') !== -1,
    monitor: (pdfCarta.txt || '').indexOf('Monitor 24') !== -1,
    resp: (pdfCarta.txt || '').indexOf(verbatim) !== -1,
    pag2: (pdfCarta.txt || '').indexOf('Página: 2 de 2') !== -1,
    pag1: (pdfCarta.txt || '').indexOf('Página:') !== -1 && (pdfCarta.txt || '').indexOf('1 de 2') !== -1,
    area: (pdfCarta.txt || '').indexOf('Área') !== -1,
    count2: (pdfCarta.txt || '').indexOf('/Count 2') !== -1,
    paginas: pdfCarta.paginas } });
  const pdfCartaOk = pdfCarta.size > 3000 && pdfCarta.type === 'application/pdf' &&
    pdfCarta.paginas === 2 && pdfCarta.txt.indexOf('/Count 2') !== -1 &&
    pdfCarta.txt.indexOf('FO-SI-10') !== -1 &&
    pdfCarta.txt.indexOf('00001') !== -1 &&
    pdfCarta.txt.indexOf('ThinkPad T14') !== -1 &&
    pdfCarta.txt.indexOf('PF-123456') !== -1 &&
    pdfCarta.txt.indexOf(verbatim) !== -1 &&
    pdfCarta.txt.indexOf('Página: 2 de 2') !== -1 &&
    // En la tabla Código la etiqueta «Página:» y el valor «1 de 2» son
    // dos runs de texto separados (celdas distintas), así que el texto
    // contiguo no aparece en el stream crudo del PDF; se comprueban
    // por separado. La p2 sí es un solo run («Página: 2 de 2»).
    pdfCarta.txt.indexOf('Página:') !== -1 && pdfCarta.txt.indexOf('1 de 2') !== -1 &&
    pdfCarta.txt.indexOf('Área') !== -1;
  await js(win, `function(){window.__aClick=null; return true;}`);
  const clickPdfCarta = await mouseClick(win, '#btnCartaPdf');
  await sleep(600);
  const trasPdfCarta = await js(win, `function(){return {toast: ${toastOf()}, aClick: window.__aClick || null};}`);
  log('11b-pdf-carta-desde-form', { clickPdfCarta, trasPdfCarta });
  const pdfCartaFormOk = clickPdfCarta.clicked === true &&
    trasPdfCarta.aClick !== null &&
    trasPdfCarta.aClick.download === 'carta-responsiva-00001.pdf' &&
    trasPdfCarta.toast.indexOf('PDF descargado: carta-responsiva-00001.pdf') !== -1;

  // 12. Lista: «PDF por WhatsApp» y «PDF por correo» de la carta.
  await js(win, `function(){window.__aClick=null; return true;}`);
  const clickWaCarta = await mouseClick(win, '#cartaList [data-carta-wa]');
  await sleep(600);
  const trasWaCarta = await js(win, `function(){return {toast: ${toastOf()}, aClick: window.__aClick || null};}`);
  log('12-whatsapp-carta', { clickWaCarta, trasWaCarta });
  const waCartaOk = clickWaCarta.clicked === true &&
    trasWaCarta.aClick !== null && trasWaCarta.aClick.download === 'carta-responsiva-00001.pdf' &&
    trasWaCarta.toast.indexOf('PDF descargado: carta-responsiva-00001.pdf') !== -1 &&
    trasWaCarta.toast.indexOf('WhatsApp') !== -1;
  await js(win, `function(){window.__aClick=null; return true;}`);
  const antesMail = mailto267.length;
  const clickMailCarta = await mouseClick(win, '#cartaList [data-carta-mail]');
  await sleep(600);
  const mailUrlC = mailto267.length > antesMail ? mailto267[mailto267.length - 1] : '';
  const mailAsuntoC = mailUrlC.indexOf('mailto:?subject=') === 0 ? decodeURIComponent(mailUrlC.split('subject=')[1].split('&body=')[0]) : '';
  const mailCuerpoC = mailUrlC.indexOf('&body=') !== -1 ? decodeURIComponent(mailUrlC.split('&body=')[1]) : '';
  const trasMailCarta = await js(win, `function(){return {toast: ${toastOf()}, aClick: window.__aClick || null};}`);
  log('12b-correo-carta', { clickMailCarta, mailAsuntoC, mailCuerpoC: mailCuerpoC.slice(0, 300), trasMailCarta });
  const mailCartaOk = clickMailCarta.clicked === true &&
    mailto267.length === antesMail + 1 && mailUrlC.indexOf('mailto:?subject=') === 0 &&
    mailAsuntoC === 'Carta Responsiva folio 00001 — Checklist de Soporte' &&
    mailCuerpoC.indexOf('Juan Pérez López') !== -1;

  // 13. Reabrir la carta carga sus datos (incluidas las 2 filas de
  // equipo); quitar la 2ª fila deja 1; Limpiar vacía; Volver a Inicio.
  const clickAbrirCarta = await mouseClick(win, '#cartaList [data-carta-open]');
  await sleep(400);
  const trasAbrirCarta = await js(win, `function(){return {
    nombre: document.getElementById('fCa-nombre').value,
    folio: document.getElementById('fCa-folio').value,
    area: document.getElementById('fCa-area').value,
    filas: document.querySelectorAll('#cartaEqRows [data-eq-field="modelo"]').length,
    modelo0: document.querySelector('#cartaEqRows [data-eq-row="0"][data-eq-field="modelo"]').value,
    modelo1: document.querySelector('#cartaEqRows [data-eq-row="1"][data-eq-field="modelo"]').value};}`);
  log('13-reabrir-carta', { clickAbrirCarta, trasAbrirCarta });
  const abrirCartaOk = clickAbrirCarta.clicked === true &&
    trasAbrirCarta.nombre === 'Juan Pérez López' &&
    trasAbrirCarta.folio === '00001' &&
    trasAbrirCarta.area === 'Sistemas' &&
    trasAbrirCarta.filas === 2 &&
    trasAbrirCarta.modelo0 === 'ThinkPad T14' &&
    trasAbrirCarta.modelo1 === 'Monitor 24"';
  const clickQuitarEq = await mouseClick(win, '#cartaEqRows [data-eq-del="1"]');
  await sleep(400);
  const trasQuitar = await js(win, `function(){return {
    filas: document.querySelectorAll('#cartaEqRows [data-eq-field="modelo"]').length};}`);
  log('13b-quitar-fila-equipo', { clickQuitarEq, trasQuitar });
  const quitarOk = clickQuitarEq.clicked === true && trasQuitar.filas === 1;
  const clickLimpiarCarta = await mouseClick(win, '#btnCartaLimpiar');
  await sleep(300);
  const trasLimpiarCarta = await js(win, `function(){return {
    nombre: document.getElementById('fCa-nombre').value,
    folio: document.getElementById('fCa-folio').value,
    area: document.getElementById('fCa-area').value,
    filas: document.querySelectorAll('#cartaEqRows [data-eq-field="modelo"]').length,
    fecha: document.getElementById('fCa-fecha').value};}`);
  log('13c-limpiar-carta', { clickLimpiarCarta, trasLimpiarCarta });
  const limpiarCartaOk = clickLimpiarCarta.clicked === true &&
    trasLimpiarCarta.nombre === '' && trasLimpiarCarta.folio === '' &&
    trasLimpiarCarta.area === '' &&
    trasLimpiarCarta.filas === 1 && trasLimpiarCarta.fecha === hoyISO();
  const clickVolverCarta = await mouseClick(win, '#btnCartaVolver');
  await sleep(400);
  const trasVolverCarta = await js(win, `function(){return {
    inicioHidden: document.getElementById('viewInicio').hidden,
    cartaHidden: document.getElementById('viewCarta').hidden,
    lista: (document.getElementById('cartaList').innerText||'')};}`);
  log('13d-volver-inicio', { clickVolverCarta, trasVolverCarta });
  const volverCartaOk = clickVolverCarta.clicked === true &&
    trasVolverCarta.inicioHidden === false && trasVolverCarta.cartaHidden === true &&
    trasVolverCarta.lista.indexOf('Juan Pérez López') !== -1;

  // 14. Eliminar la carta con confirmación: la lista queda vacía.
  const goCarta2 = await mouseClick(win, '#btnGoCarta');
  await sleep(400);
  const clickDelCarta = await mouseClick(win, '#cartaList [data-carta-del]');
  await sleep(400);
  const confirmCarta = await js(win, `function(){var m=document.getElementById('confirmModal');
    return {visible: m ? !m.hidden : null, msg: (document.getElementById('confirmMsg').textContent||'')};}`);
  log('14-eliminar-carta-confirm', { goCarta2, clickDelCarta, confirmCarta });
  const clickSiCarta = await mouseClick(win, '#confirmYes');
  await sleep(500);
  const trasDelCarta = await js(win, `function(){return {toast: ${toastOf()},
    lista: (document.getElementById('cartaList').innerText||'')};}`);
  log('14b-carta-eliminada', { clickSiCarta, trasDelCarta });
  await shot(win, 'smoke267-carta-eliminada.png');
  const delCartaOk = clickDelCarta.clicked === true &&
    confirmCarta.visible === true && confirmCarta.msg.indexOf('¿Eliminar esta carta?') !== -1 &&
    clickSiCarta.clicked === true &&
    trasDelCarta.toast.indexOf('eliminada') !== -1 &&
    trasDelCarta.lista.indexOf('Aún no hay cartas guardadas.') !== -1;

  // 15. Foco final + errores JS (se ignoran los ya conocidos del 251:
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
  log('15-foco-errores', { finalFocus, consoleErrs: consoleErrs.slice(0, 8), consoleNuevos, errsNuevos });

  const ok = selectorOk && vistaAcuseOk && validOk && guardarOk && pdfAcuseOk && pdfFormOk &&
    waOk && mailOk && abrirOk && limpiarOk && volverOk && sigueOk && delOk &&
    vistaCartaOk && validCartaOk && addEqOk && guardarCartaOk && pdfCartaOk && pdfCartaFormOk &&
    waCartaOk && mailCartaOk && abrirCartaOk && quitarOk && limpiarCartaOk && volverCartaOk && delCartaOk &&
    consoleNuevos.length === 0 && errsNuevos.length === 0;
  console.log('[SMOKE-267] RESULTADO ' + JSON.stringify(results, null, 2));
  console.log('[SMOKE-267] VEREDICTO ' + (ok ? 'OK' : 'FALLO'));
  app.exit(ok ? 0 : 1);
}
app.whenReady().then(main).catch((e) => {
  console.error('[SMOKE-267] FALLO:', e && e.message ? e.message : e);
  console.log('[SMOKE-267] RESULTADO-PARCIAL ' + JSON.stringify(results, null, 2));
  app.exit(2);
});
