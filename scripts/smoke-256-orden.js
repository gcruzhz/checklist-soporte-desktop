// Smoke test 2.5.6 — Mantenimientos + renta.
//   - Crear orden SIN responsable ni área por el formulario real: se crea
//     con folio 00002 y la vista dice "Pendiente de firma" en esos campos.
//   - Campo obligatorio faltante (hostname) queda en rojo (campo-falta) y
//     el toast lo nombra; la orden no se crea.
//   - Orden sin firma del usuario: la vista dice "pendiente".
//   - Cloud.getMantenimiento (simulado) devuelve la orden firmada;
//     pulsar "Actualizar" (clic real) re-renderiza con "sí ✓ (Ana López)"
//     y el toast "El usuario ya firmó ✓".
//   - Con Capacitor (stubs en la página) pulsar "Generar PDF" escribe de
//     verdad con Filesystem.writeFile en DOCUMENTS, abre con FileOpener y
//     avisa "PDF guardado: orden-servicio-00001.pdf (en Documentos).";
//     el PDF resultante es válido (%PDF), trae el formato de papel
//     F0.S1.01 Rev0 (ORDEN DE SERVICIO, folio, secciones, firmas) y es
//     tamaño carta (MediaBox 612 792, 1 página, DESCRIPCIÓN DEL EQUIPO
//     solo con el hostname y los demás datos al final en el cuadro
//     COMENTARIOS, sin duplicar; conformidad sin hora y con fecha válida).
//   - Sin Capacitor (el real, plataforma web) pulsar "Generar PDF" de nuevo
//     descarga el PDF por <a> (will-download) y también es válido.
//   - Renta: el botón "Exportar a Excel" aparece en Recibir y Entrega
//     renta; en Entrega Renta hay un checkbox por equipo entregado +
//     "Seleccionar todos".
// Corre con el Electron de node_modules:
//   xvfb-run -a ./node_modules/.bin/electron --no-sandbox scripts/smoke256-orden.js
// El www es el ./www del proyecto (copiado con node scripts/copy-www.js
// desde ../checklist-cloud/www, md5 verificado). firebase-config.js se
// sustituye por placeholder (modo local sin nube): el login real con
// Firebase NO se ejerce aquí; la sesión y la orden se siembran por
// executeJavaScript y los botones se pulsan con clics reales de ratón.
// Logs y capturas en docs/smoke256-*.
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const TMP = '/home/hatch/workspace/tmp/smoke256/run';
const TMPWWW = path.join(TMP, 'www');
const SHOTDIR = path.join(ROOT, 'docs');
const EXPECTED_WWW_MD5 = 'd8ee4bc00e5e4ae547c5420161950e34';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (typeof process.getuid === 'function' && process.getuid() === 0) {
  app.commandLine.appendSwitch('no-sandbox');
}
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.setPath('userData', path.join(TMP, 'userData'));

const results = {};
function log(step, obj) {
  results[step] = obj;
  console.log('[SMOKE-256] ' + step + ' ' + JSON.stringify(obj));
}
async function shot(win, name) {
  const p = path.join(SHOTDIR, name);
  const image = await win.webContents.capturePage();
  fs.writeFileSync(p, image.toPNG());
  console.log('[SMOKE-256] captura ' + p);
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
    'FECHA DE LIBERACIÓN', 'ÁREA SOLICITANTE', 'FECHA, NOMBRE Y FIRMA DE CONFORMIDAD',
    'Ana López', 'Escala de satisfacción', 'INACEPTABLE', 'EXCELENTE'];
  const faltan = need.filter(function (s) { return pdfStr.indexOf(s) === -1; });
  const nImg = (pdfStr.match(/\/Subtype \/Image/g) || []).length;
  const carta = pdfStr.indexOf('/MediaBox [0 0 612 792]') !== -1;
  const unaPagina = (pdfStr.match(/\/Type \/Page[^s]/g) || []).length === 1;
  const iDesc = pdfStr.indexOf('DESCRIPCIÓN DEL EQUIPO');
  const iHost = pdfStr.indexOf('Hostname: PC-01');
  const iCond = pdfStr.indexOf('CONDICIONES GENERALES');
  const iConcl = pdfStr.indexOf('CONCLUSIÓN Y/O COMENTARIOS');
  const iCom = pdfStr.indexOf('(COMENTARIOS) Tj');
  const soloHost = iDesc !== -1 && iHost > iDesc && iHost < iCond;
  const entreConclYFechas = iConcl !== -1 ? pdfStr.slice(iConcl, pdfStr.indexOf('FECHA DE PLANEACIÓN')) : '';
  const datosEnComent = iCom !== -1 && pdfStr.indexOf('Dell') > iCom && pdfStr.indexOf('Serie: S1, Modelo:') > iCom;
  const datosFueraConcl = entreConclYFechas.indexOf('Serie:') === -1 && entreConclYFechas.indexOf('Procesador:') === -1 && entreConclYFechas.indexOf('Datos del equipo') === -1;
  const sinInvalidDate = pdfStr.indexOf('Invalid Date') === -1;
  const sinHora = pdfStr.indexOf('Hora:') === -1;
  return { faltan, nImg, imgsOk: nImg === 2 && pdfStr.indexOf('/Imtecnico Do') !== -1 && pdfStr.indexOf('/Imusuario Do') !== -1,
    carta, unaPagina, soloHost, datosAlFinal: datosEnComent && datosFueraConcl, sinInvalidDate, sinHora,
    ok: faltan.length === 0 && nImg === 2 && carta && unaPagina && soloHost && datosEnComent && datosFueraConcl && sinInvalidDate && sinHora };
}

async function main() {
  // 0. www del ./www del proyecto (copiado con copy-www.js): md5 verificado.
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'www'), TMPWWW, { recursive: true });
  const idxMd5 = crypto.createHash('md5').update(fs.readFileSync(path.join(TMPWWW, 'index.html'))).digest('hex');
  log('0-www-origen', { src: 'proyecto-www', md5: idxMd5, esperado: EXPECTED_WWW_MD5, coincide: idxMd5 === EXPECTED_WWW_MD5 });
  if (idxMd5 !== EXPECTED_WWW_MD5) throw new Error('md5 del www no coincide con 2.5.6: ' + idxMd5);
  fs.writeFileSync(path.join(TMPWWW, 'firebase-config.js'),
    "// placeholder SOLO para el smoke test local 2.5.6\nwindow.FIREBASE_CONFIG = { apiKey: 'TU_API_KEY' };\n");
  const preloadPath = path.join(ROOT, 'preload.js');
  log('0-preload', { preloadPath });

  const win = new BrowserWindow({
    width: 1200, height: 800, title: 'Checklist de Soporte',
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  ipcMain.handle('desktop-get-machine-id', async () => 'SERIE-SMOKE-256');
  ipcMain.handle('desktop-open-external', async () => true);
  const consoleErrs = [];
  win.webContents.on('console-message', (e, level, msg) => {
    if (level === 2 || /error/i.test(msg)) consoleErrs.push(msg);
  });
  await win.loadFile(path.join(TMPWWW, 'index.html'));
  win.focus();

  // 1. Arranque en modo local: selector de sección al abrir, versión 2.5.6.
  let ready = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    ready = await js(win, `function(){return {
      authReady: window._authReady, mainHidden: document.getElementById('mainApp').hidden,
      inicioHidden: document.getElementById('viewInicio').hidden,
      inicioText: (document.getElementById('viewInicio').innerText||''),
      versionText: (document.body.textContent||'').indexOf('2.5.6')!==-1,
      sin256vieja: (document.body.textContent||'').indexOf('2.5.5')===-1,
      splashInDom: !!document.getElementById('splash')};}`);
    if (ready.authReady && !ready.mainHidden) break;
  }
  log('1-boot-selector', ready);
  if (!ready || !ready.authReady || ready.mainHidden) throw new Error('no llegó al modo local');
  const selectorOk = !ready.inicioHidden &&
    ready.versionText === true && ready.sin256vieja === true &&
    ready.inicioText.indexOf('Por preparar') !== -1 &&
    ready.inicioText.indexOf('Recibir renta') !== -1 &&
    ready.inicioText.indexOf('Entrega Renta') !== -1 &&
    ready.inicioText.indexOf('Mantenimientos Preventivos') !== -1;
  log('1b-selector-4-secciones', { selectorOk });
  await sleep(2500);
  await js(win, `function(){window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message));});return true;}`);
  await shot(win, 'smoke256-inicio.png');

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
    m.id = 'smoke256'; m.folio = '00001'; m.estado = 'creada';
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
    mantShowOrder('smoke256');
    // La nube simulada: la orden ya firmada por el usuario (firma.html).
    window.__signed256 = JSON.parse(JSON.stringify(m));
    window.__signed256.estado = 'firmada';
    window.__signed256.firma = { nombre: 'Ana López', area: 'Ventas', comentarios: 'Todo bien', satisfaccion: 9, firma: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=', firmadoEn: Date.now() };
    window.Cloud.getMantenimiento = async function (id) { return window.__signed256; };
    window.Cloud.asignarFolio = async function () { return '00002'; };
    window.Cloud.upsertMant = async function () { return {}; };
    window.__capReal = window.Capacitor;
    return { n: mantenimientos.length, orderId: mantOrderId,
      body: document.getElementById('mantOrderBody').innerHTML,
      btnAct: !!document.getElementById('btnMantActualizar') };}`);
  log('2-ir-mant-siembra', { goMant, n: seed.n, orderId: seed.orderId, btnAct: seed.btnAct,
    pendiente: seed.body.indexOf('Firma del usuario: pendiente') !== -1 });
  await shot(win, 'smoke256-orden-pendiente.png');
  const seedOk = goMant.clicked === true && seed.n === 1 && seed.orderId === 'smoke256' &&
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
  await shot(win, 'smoke256-orden-firmada.png');
  const actOk = clickAct.clicked === true &&
    act.body.indexOf('sí ✓ (Ana López)') !== -1 &&
    act.toast.indexOf('El usuario ya firmó') !== -1 && act.firmaLocal === true;

  // 3b. Crear orden SIN responsable ni área por el formulario real:
  // abrir el formulario, llenar serie/hostname/modelo/título/falla/
  // descripción/fecha/WhatsApp + firma del técnico, dejar área y
  // responsable vacíos y pulsar "Crear orden" (clic real). Debe crearse
  // con folio 00002 y la vista debe decir "Pendiente de firma".
  const openForm256 = await mouseClick(win, '#btnMantNuevo');
  if (!openForm256.clicked) await js(win, `function(){ mantOpenForm(null, null); return true; }`);
  await js(win, `function(){
    document.getElementById('fM-serie').value = 'S-256';
    document.getElementById('fM-hostname').value = 'PC-256';
    document.getElementById('fM-modelo').value = 'ProBook 256';
    document.getElementById('fM-titulo').value = 'Caso smoke 256';
    document.getElementById('fM-tipoFalla').value = 'Software';
    document.getElementById('fM-descEquipo').value = 'Laptop smoke';
    document.getElementById('fM-fechaServ').value = '2026-11-16';
    document.getElementById('fM-whatsapp').value = '5512345678';
    window.mantFirmaData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=';
    return { area: document.getElementById('fM-area').value, resp: document.getElementById('fM-responsable').value };}`);
  const clickCrear256 = await mouseClick(win, '#btnMantCrear');
  await sleep(800);
  const creada256 = await js(win, `function(){
    var m = mantenimientos.find(function (x) { return x.equipo && x.equipo.serie === 'S-256'; });
    return { existe: !!m, folio: m ? m.folio : null, estado: m ? m.estado : null,
      resp: m ? m.responsable : null, area: m ? m.area : null,
      body: document.getElementById('mantOrderBody').innerHTML,
      toast: (document.getElementById('toast').textContent||'') };}`);
  log('3b-crear-sin-responsable', { openForm256, clickCrear256, creada256 });
  const crearOk = clickCrear256.clicked === true && creada256.existe === true &&
    creada256.folio === '00002' && creada256.estado === 'creada' &&
    creada256.resp === '' && creada256.area === '' &&
    creada256.body.indexOf('Pendiente de firma') !== -1 &&
    creada256.toast.indexOf('Orden de servicio creada con folio 00002.') !== -1;

  // 3c. Campo obligatorio faltante en rojo: abrir el formulario, llenar
  // todo menos el hostname y pulsar "Crear orden". El hostname queda con
  // la clase campo-falta y el toast lo nombra; la orden no se crea.
  await js(win, `function(){ mantOpenForm(null, null);
    document.getElementById('fM-serie').value = 'S-256B';
    document.getElementById('fM-modelo').value = 'ProBook 256B';
    document.getElementById('fM-titulo').value = 'Caso smoke 256B';
    document.getElementById('fM-tipoFalla').value = 'Software';
    document.getElementById('fM-descEquipo').value = 'Laptop smoke B';
    document.getElementById('fM-fechaServ').value = '2026-11-16';
    document.getElementById('fM-whatsapp').value = '5512345678';
    window.mantFirmaData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=';
    return true;}`);
  const clickCrearRojo = await mouseClick(win, '#btnMantCrear');
  await sleep(600);
  const rojo256 = await js(win, `function(){return {
    hostRojo: document.getElementById('fM-hostname').classList.contains('campo-falta'),
    serieRojo: document.getElementById('fM-serie').classList.contains('campo-falta'),
    toast: (document.getElementById('toast').textContent||''),
    n: mantenimientos.length };}`);
  log('3c-campo-en-rojo', { clickCrearRojo, rojo256 });
  const rojoOk = clickCrearRojo.clicked === true && rojo256.hostRojo === true &&
    rojo256.serieRojo === false && rojo256.toast.indexOf('hostname') !== -1 && rojo256.n === 2;

  // 4. Volver a la orden 00001 (firmada en el paso 3) para el PDF y
  // pulsar "Generar PDF" (clic real): debe escribir en DOCUMENTS y abrirlo.
  await js(win, `function(){ mantShowOrder('smoke256'); return mantOrderId; }`);
  await sleep(400);
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
  await shot(win, 'smoke256-pdf-web.png');
  const webOk = clickPdfWeb.clicked === true && !!webBuf && pdfWeb.ok;

  // 5b. Renta (puntos 6 y 7): el botón "Exportar a Excel" aparece en
  // Recibir y Entrega renta; en Entrega Renta hay un checkbox por equipo
  // entregado + "Seleccionar todos" y el contador dice sin selección.
  const renta256 = await js(win, `function(){
    var ahora = Date.now();
    function mkR(id, estado, dias) {
      return { id: id, flujo: 'rec', tipo: 'Laptop', modelo: 'ProBook ' + id, inventario: 'INV-' + id,
        accesorios: { cargador: true, mouse: true, maletin: true }, sinDanos: true, danos: '', obs: '',
        estado: estado, recibidoPor: 'Gerardo', entregadoPor: estado === 'entregado' ? 'Gerardo' : '',
        entregadoAt: estado === 'entregado' ? ahora - dias * 86400000 : null,
        creadoPor: null, createdAt: ahora - dias * 86400000, fotoDanos: null, danosIA: '' };
    }
    state.renta = [mkR('r1', 'recibido', 1), mkR('r2', 'entregado', 2), mkR('r3', 'entregado', 5)];
    render();
    showVista('rec');
    var recBtn = document.getElementById('btnAbrirRec');
    var rec = { texto: recBtn.textContent, deshab: recBtn.disabled };
    showVista('for');
    var forBtn = document.getElementById('btnAbrirFor');
    return { rec: rec,
      forTexto: forBtn.textContent, forDeshab: forBtn.disabled,
      checks: document.querySelectorAll('[data-renta-sel]').length,
      selTodos: document.getElementById('list-for').innerHTML.indexOf('Seleccionar todos') !== -1,
      selInfo: (document.getElementById('rentaSelInfo') ? document.getElementById('rentaSelInfo').textContent : '') };}`);
  log('5b-renta-exportar-seleccion', renta256);
  const rentaOk = renta256.rec.texto.indexOf('Exportar a Excel') !== -1 && renta256.rec.deshab === false &&
    renta256.forTexto.indexOf('Exportar a Excel') !== -1 && renta256.forDeshab === false &&
    renta256.checks === 2 && renta256.selTodos === true &&
    renta256.selInfo.indexOf('Sin selección: se exportan/comparten todos los entregados (2)') !== -1;

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

  const ok = selectorOk && seedOk && actOk && crearOk && rojoOk && capOk && pdfCap.ok && webOk && rentaOk &&
    consoleNuevos.length === 0 && errsNuevos.length === 0;
  console.log('[SMOKE-256] RESULTADO ' + JSON.stringify(results, null, 2));
  console.log('[SMOKE-256] VEREDICTO ' + (ok ? 'OK' : 'FALLO'));
  app.exit(ok ? 0 : 1);
}

app.whenReady().then(main).catch((e) => {
  console.error('[SMOKE-256] FALLO:', e && e.message ? e.message : e);
  console.log('[SMOKE-256] RESULTADO-PARCIAL ' + JSON.stringify(results, null, 2));
  app.exit(2);
});
