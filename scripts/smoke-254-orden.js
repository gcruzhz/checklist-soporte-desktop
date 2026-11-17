// Smoke test 2.5.4 — Mantenimientos: botón Actualizar y PDF real.
//   - Orden sin firma del usuario: la vista dice "pendiente".
//   - Cloud.getMantenimiento (simulado) devuelve la orden firmada;
//     pulsar "Actualizar" (clic real) re-renderiza con "sí ✓ (Ana López)"
//     y el toast "El usuario ya firmó ✓".
//   - Con Capacitor (stubs en la página) pulsar "Generar PDF" escribe de
//     verdad con Filesystem.writeFile en DOCUMENTS, abre con FileOpener y
//     avisa "PDF guardado: orden-servicio-00001.pdf (en Documentos).";
//     el PDF resultante es válido (%PDF) y trae el formato de papel
//     F0.S1.01 Rev0 (ORDEN DE SERVICIO, folio, secciones, firmas).
//   - Sin Capacitor (el real, plataforma web) pulsar "Generar PDF" de nuevo
//     descarga el PDF por <a> (will-download) y también es válido.
// Corre con el Electron de node_modules:
//   xvfb-run -a ./node_modules/.bin/electron --no-sandbox scripts/smoke-254-orden.js
// El www es el ./www del proyecto (copiado con node scripts/copy-www.js
// desde ../checklist-cloud/www, md5 verificado). firebase-config.js se
// sustituye por placeholder (modo local sin nube): el login real con
// Firebase NO se ejerce aquí; la sesión y la orden se siembran por
// executeJavaScript y los botones se pulsan con clics reales de ratón.
// Logs y capturas en docs/smoke-254-*.
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const TMP = '/home/hatch/workspace/tmp/smoke254/run';
const TMPWWW = path.join(TMP, 'www');
const SHOTDIR = path.join(ROOT, 'docs');
const EXPECTED_WWW_MD5 = '59c59866029bac73971aa7821c07bb01';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (typeof process.getuid === 'function' && process.getuid() === 0) {
  app.commandLine.appendSwitch('no-sandbox');
}
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.setPath('userData', path.join(TMP, 'userData'));

const results = {};
function log(step, obj) {
  results[step] = obj;
  console.log('[SMOKE-254] ' + step + ' ' + JSON.stringify(obj));
}
async function shot(win, name) {
  const p = path.join(SHOTDIR, name);
  const image = await win.webContents.capturePage();
  fs.writeFileSync(p, image.toPNG());
  console.log('[SMOKE-254] captura ' + p);
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

// Cadenas del formato de papel que el PDF debe traer.
function pdfFormatoOk(pdfStr) {
  const need = ['%PDF', 'ORDEN DE SERVICIO', 'FOLIO', '00001', 'F0.S1.01', 'Rev0.',
    'Rosa Blanca 63', 'SOFTWARE', 'IDENTIFICACIÓN DEL EQUIPO', 'DESCRIPCIÓN DEL EQUIPO',
    'MANTENIMIENTO PREVENTIVO', 'SOPLETEO, LIMPIEZA Y REVISIÓN DE:', 'DESCRIPCIÓN DE CAMBIOS',
    'FECHA DE LIBERACIÓN', 'ÁREA SOLICITANTE', 'FECHA, HORA, NOMBRE Y FIRMA DE CONFORMIDAD',
    'Ana López', 'Escala de satisfacción', 'INACEPTABLE', 'EXCELENTE'];
  const faltan = need.filter(function (s) { return pdfStr.indexOf(s) === -1; });
  const nImg = (pdfStr.match(/\/Subtype \/Image/g) || []).length;
  return { faltan, nImg, imgsOk: nImg === 2 && pdfStr.indexOf('/Imtecnico Do') !== -1 && pdfStr.indexOf('/Imusuario Do') !== -1,
    ok: faltan.length === 0 && nImg === 2 };
}

async function main() {
  // 0. www del ./www del proyecto (copiado con copy-www.js): md5 verificado.
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'www'), TMPWWW, { recursive: true });
  const idxMd5 = crypto.createHash('md5').update(fs.readFileSync(path.join(TMPWWW, 'index.html'))).digest('hex');
  log('0-www-origen', { src: 'proyecto-www', md5: idxMd5, esperado: EXPECTED_WWW_MD5, coincide: idxMd5 === EXPECTED_WWW_MD5 });
  if (idxMd5 !== EXPECTED_WWW_MD5) throw new Error('md5 del www no coincide con 2.5.4: ' + idxMd5);
  fs.writeFileSync(path.join(TMPWWW, 'firebase-config.js'),
    "// placeholder SOLO para el smoke test local 2.5.4\nwindow.FIREBASE_CONFIG = { apiKey: 'TU_API_KEY' };\n");
  const preloadPath = path.join(ROOT, 'preload.js');
  log('0-preload', { preloadPath });

  const win = new BrowserWindow({
    width: 1200, height: 800, title: 'Checklist de Soporte',
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  ipcMain.handle('desktop-get-machine-id', async () => 'SERIE-SMOKE-254');
  ipcMain.handle('desktop-open-external', async () => true);
  const consoleErrs = [];
  win.webContents.on('console-message', (e, level, msg) => {
    if (level === 2 || /error/i.test(msg)) consoleErrs.push(msg);
  });
  await win.loadFile(path.join(TMPWWW, 'index.html'));
  win.focus();

  // 1. Arranque en modo local: selector de sección al abrir, versión 2.5.4.
  let ready = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    ready = await js(win, `function(){return {
      authReady: window._authReady, mainHidden: document.getElementById('mainApp').hidden,
      inicioHidden: document.getElementById('viewInicio').hidden,
      inicioText: (document.getElementById('viewInicio').innerText||''),
      versionText: (document.body.textContent||'').indexOf('2.5.4')!==-1,
      sin254vieja: (document.body.textContent||'').indexOf('2.5.3')===-1,
      splashInDom: !!document.getElementById('splash')};}`);
    if (ready.authReady && !ready.mainHidden) break;
  }
  log('1-boot-selector', ready);
  if (!ready || !ready.authReady || ready.mainHidden) throw new Error('no llegó al modo local');
  const selectorOk = !ready.inicioHidden &&
    ready.versionText === true && ready.sin254vieja === true &&
    ready.inicioText.indexOf('Por preparar') !== -1 &&
    ready.inicioText.indexOf('Recibir renta') !== -1 &&
    ready.inicioText.indexOf('Entrega Renta') !== -1 &&
    ready.inicioText.indexOf('Mantenimientos Preventivos') !== -1;
  log('1b-selector-4-secciones', { selectorOk });
  await sleep(2500);
  await js(win, `function(){window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message));});return true;}`);
  await shot(win, 'smoke-254-inicio.png');

  // 2. Ir a Mantenimientos y sembrar la sesión + una orden SIN firma del
  // usuario (folio 00001, firma del técnico sí). La vista de orden debe
  // decir "Firma del usuario: pendiente" y mostrar el botón Actualizar.
  const goMant = await mouseClick(win, '#btnGoMant');
  await sleep(400);
  const seed = await js(win, `function(){
    window.CLOUD_ENABLED = true;
    window.cloudUser = { uid: 'u1', email: 'gerardo@smoke.local', nombre: 'Gerardo' };
    window.cloudRole = 'usuario';
    var m = newMantBlank();
    m.id = 'smoke254'; m.folio = '00001'; m.estado = 'creada';
    m.tecnicoUid = 'u1'; m.tecnico = 'Gerardo'; m.empresa = 'Lapi'; m.anio = 2026;
    m.tipo = 'SOFTWARE'; m.area = 'Sistemas'; m.responsable = 'Ana';
    m.tiempoReparacion = '2 horas'; m.tiempoViaje = '30 min'; m.tiempoSistemaCaido = '1 hora';
    m.fechaServicio = '2026-11-15'; m.fechaTermino = '2026-11-15';
    m.tituloCaso = 'Laptop lenta'; m.tipoFalla = 'Software';
    m.descripcionEquipo = 'Laptop Dell Inspiron'; m.descripcionCambios = 'Se reinstaló el SO';
    m.conclusion = 'Equipo listo'; m.observaciones = 'Sin observaciones';
    m.observacionesDetectadas = 'Procesador: Intel i5';
    m.fechaPlaneacion = '/'; m.fechaCompromiso = '/'; m.periodoPrueba = '/'; m.fechaLiberacion = '2026-11-20';
    m.equipo.serie = 'S1'; m.equipo.hostname = 'PC-01'; m.equipo.modelo = 'Inspiron 3501';
    m.equipo.marca = 'Dell'; m.equipo.tipo = 'Laptop';
    m.identificacion = { impresora: true, cpu: true, monitor: true, teclado: true, mouse: true, noBreak: false };
    m.condiciones = { impresora: true, cpu: true, monitor: true, teclado: true, mouse: true, noBreak: false, notas: '' };
    m.preventivo = { impresora: true, cpu: true, monitor: false, teclado: false, mouse: false, noBreak: false };
    m.firmaTecnico = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=';
    m.firma = null;
    mantenimientos = [m];
    renderMant();
    mantShowOrder('smoke254');
    // La nube simulada: la orden ya firmada por el usuario (firma.html).
    window.__signed254 = JSON.parse(JSON.stringify(m));
    window.__signed254.estado = 'firmada';
    window.__signed254.firma = { nombre: 'Ana López', area: 'Ventas', comentarios: 'Todo bien', satisfaccion: 9, firma: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=', firmadoEn: Date.now() };
    window.Cloud.getMantenimiento = async function (id) { return window.__signed254; };
    window.__capReal = window.Capacitor;
    return { n: mantenimientos.length, orderId: mantOrderId,
      body: document.getElementById('mantOrderBody').innerHTML,
      btnAct: !!document.getElementById('btnMantActualizar') };}`);
  log('2-ir-mant-siembra', { goMant, n: seed.n, orderId: seed.orderId, btnAct: seed.btnAct,
    pendiente: seed.body.indexOf('Firma del usuario: pendiente') !== -1 });
  await shot(win, 'smoke-254-orden-pendiente.png');
  const seedOk = goMant.clicked === true && seed.n === 1 && seed.orderId === 'smoke254' &&
    seed.btnAct === true && seed.body.indexOf('Firma del usuario: pendiente') !== -1;

  // 3. Pulsar "Actualizar" (clic real): re-lee la orden y re-renderiza
  // con la firma del usuario.
  const clickAct = await mouseClick(win, '#btnMantActualizar');
  await sleep(600);
  const act = await js(win, `function(){return {
    body: document.getElementById('mantOrderBody').innerHTML,
    toast: (document.getElementById('toast').textContent||''),
    firmaLocal: !!(mantenimientos[0] && mantenimientos[0].firma && mantenimientos[0].firma.nombre) };}`);
  log('3-actualizar', { clickAct, firmada: act.body.indexOf('sí ✓ (Ana López)') !== -1,
    toast: act.toast, firmaLocal: act.firmaLocal });
  await shot(win, 'smoke-254-orden-firmada.png');
  const actOk = clickAct.clicked === true &&
    act.body.indexOf('sí ✓ (Ana López)') !== -1 &&
    act.toast.indexOf('El usuario ya firmó') !== -1 && act.firmaLocal === true;

  // 4. Instalar los stubs de Capacitor (teléfono Android) y pulsar
  // "Generar PDF" (clic real): debe escribir en DOCUMENTS y abrirlo.
  await js(win, `function(){
    window.__capCalls = { write: [], stat: [], open: [], share: [] };
    window.__pdfB64 = null;
    window.Capacitor = {
      getPlatform: function () { return 'android'; },
      Plugins: {
        Filesystem: {
          writeFile: async function (o) { window.__capCalls.write.push({ path: o.path, directory: o.directory }); window.__pdfB64 = o.data; return { uri: 'file:///documents/' + o.path }; },
          stat: async function (o) { window.__capCalls.stat.push({ path: o.path, directory: o.directory }); return { uri: 'file:///documents/' + o.path, size: window.__pdfB64 ? window.__pdfB64.length : 0 }; }
        },
        FileOpener: { open: async function (o) { window.__capCalls.open.push(o); } },
        Share: { share: async function (o) { window.__capCalls.share.push(o); } }
      }
    };
    return true;}`);
  const clickPdf = await mouseClick(win, '#btnMantPdf');
  await sleep(900);
  const cap = await js(win, `function(){return {
    calls: window.__capCalls, toast: (document.getElementById('toast').textContent||''),
    b64len: window.__pdfB64 ? window.__pdfB64.length : 0 };}`);
  log('4-pdf-capacitor', { clickPdf, calls: cap.calls, toast: cap.toast, b64len: cap.b64len });
  const capOk = clickPdf.clicked === true &&
    cap.calls.write.length === 1 && cap.calls.write[0].path === 'orden-servicio-00001.pdf' &&
    cap.calls.write[0].directory === 'DOCUMENTS' && cap.calls.stat.length === 1 &&
    cap.calls.open.length === 1 && cap.calls.open[0].filePath === 'file:///documents/orden-servicio-00001.pdf' &&
    cap.calls.open[0].contentType === 'application/pdf' && cap.calls.share.length === 0 &&
    cap.toast.indexOf('PDF guardado: orden-servicio-00001.pdf (en Documentos).') !== -1 &&
    cap.b64len > 1000;
  // 4b. El PDF escrito es válido y trae el formato de papel.
  let pdfCap = { ok: false, faltan: ['sin b64'], nImg: 0 };
  const b64 = await js(win, `function(){return window.__pdfB64;}`);
  if (b64) {
    const buf = Buffer.from(b64, 'base64');
    pdfCap = pdfFormatoOk(buf.toString('latin1'));
    log('4b-pdf-contenido', { bytes: buf.length, cabecera: buf.slice(0, 5).toString(), formato: pdfCap });
    fs.writeFileSync(path.join(TMP, 'orden-servicio-00001.pdf'), buf);
  }

  // 5. Camino web (Capacitor real, plataforma web): pulsar "Generar PDF"
  // de nuevo y capturar la descarga por will-download.
  const dlPath = path.join(TMP, 'orden-servicio-00001-web.pdf');
  win.webContents.session.on('will-download', (event, item) => {
    item.setSavePath(dlPath);
  });
  await js(win, `function(){ window.Capacitor = window.__capReal; return true;}`);
  const clickPdfWeb = await mouseClick(win, '#btnMantPdf');
  let webBuf = null;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    if (fs.existsSync(dlPath) && fs.statSync(dlPath).size > 0) { webBuf = fs.readFileSync(dlPath); break; }
  }
  let pdfWeb = { ok: false, faltan: ['sin descarga'], nImg: 0 };
  if (webBuf) pdfWeb = pdfFormatoOk(webBuf.toString('latin1'));
  const webToast = await js(win, `function(){return (document.getElementById('toast').textContent||'');}`);
  log('5-pdf-web', { clickPdfWeb, descargado: !!webBuf, bytes: webBuf ? webBuf.length : 0,
    toast: webToast, formato: pdfWeb });
  await shot(win, 'smoke-254-pdf-web.png');
  const webOk = clickPdfWeb.clicked === true && !!webBuf && pdfWeb.ok;

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

  const ok = selectorOk && seedOk && actOk && capOk && pdfCap.ok && webOk &&
    consoleNuevos.length === 0 && errsNuevos.length === 0;
  console.log('[SMOKE-254] RESULTADO ' + JSON.stringify(results, null, 2));
  console.log('[SMOKE-254] VEREDICTO ' + (ok ? 'OK' : 'FALLO'));
  app.exit(ok ? 0 : 1);
}

app.whenReady().then(main).catch((e) => {
  console.error('[SMOKE-254] FALLO:', e && e.message ? e.message : e);
  console.log('[SMOKE-254] RESULTADO-PARCIAL ' + JSON.stringify(results, null, 2));
  app.exit(2);
});
