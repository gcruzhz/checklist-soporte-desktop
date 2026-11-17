// Smoke test 2.5.0 — Mantenimientos Preventivos:
//   Inicio (selector de sección) -> Mantenimientos -> equipo detectado
//   con políticas + usuario sistemas + impresora -> 'Usar este equipo'
//   -> formulario -> teclear (XTEST) -> firma del técnico en canvas ->
//   'Crear orden de servicio' -> folio 00001 y vista de la orden.
// Corre con el Electron de node_modules:
//   xvfb-run -a ./node_modules/.bin/electron --no-sandbox scripts/smoke-250-mant.js
// El www se toma del asar del AppImage 2.5.0 EXTRAÍDO si existe
// (md5 verificado contra el www del teléfono) y si no, del ./www del
// proyecto (byte-idéntico al del teléfono). firebase-config.js se
// sustituye por placeholder (modo local sin nube, como los smokes
// 2.3.4/2.3.5/2.3.8/2.4.0): el login real con Firebase NO se ejerce
// aquí; Cloud.asignarFolio / upsertMant / markDetectadoUsado se
// simulan para que el flujo real corra hasta la vista de la orden.
// El tecleo XTEST es a nivel SO (como en 2.4.0): xtest-type.py no
// teclea mayúsculas ni @ . - ; los textos son solo minúsculas y
// dígitos, y la comparación es exacta contra lo enviado.
// Logs y capturas en docs/smoke-250-*.
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ASAR = '/home/hatch/workspace/tmp/smoke250/squashfs-root/resources/app.asar';
const TMP = '/home/hatch/workspace/tmp/smoke250/run';
const TMPWWW = path.join(TMP, 'www');
const SHOTDIR = path.join(ROOT, 'docs');
const EXPECTED_WWW_MD5 = '19e2adf071a2db1fec91352ccfed95e7';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (typeof process.getuid === 'function' && process.getuid() === 0) {
  app.commandLine.appendSwitch('no-sandbox');
}
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.setPath('userData', path.join(TMP, 'userData'));

const results = {};
function log(step, obj) {
  results[step] = obj;
  console.log('[SMOKE-250] ' + step + ' ' + JSON.stringify(obj));
}
async function shot(win, name) {
  const p = path.join(SHOTDIR, name);
  const image = await win.webContents.capturePage();
  fs.writeFileSync(p, image.toPNG());
  console.log('[SMOKE-250] captura ' + p);
  return p;
}
async function js(win, fnString) {
  return win.webContents.executeJavaScript('(' + fnString + ')()', true);
}
function runPy(script, args) {
  return new Promise((resolve) => {
    execFile('python3', [path.join(ROOT, 'scripts', script)].concat(args),
      { env: process.env, timeout: 15000 },
      (err, stdout) => resolve({ err: err ? String(err.message || err).slice(0, 150) : null, out: (stdout || '').trim() }));
  });
}
function typeXtest(text) {
  return new Promise((resolve) => {
    execFile('python3', [path.join(ROOT, 'scripts', 'xtest-type.py'), 'Checklist', text],
      { env: process.env, timeout: 30000 },
      (err, stdout) => resolve({ err: err ? String(err.message || err).slice(0, 150) : null, out: (stdout || '').trim().slice(0, 300) }));
  });
}
// Copia recursiva desde un directorio asar (fs.cpSync falla con ENOTDIR
// sobre directorios asar; readdir/readFile sí los atraviesan).
function copyDirAsar(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name), d = path.join(dst, name);
    if (fs.statSync(s).isDirectory()) copyDirAsar(s, d);
    else fs.writeFileSync(d, fs.readFileSync(s));
  }
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
function parseIds(listOut) {
  const ids = [];
  (listOut || '').split('\n').forEach((line) => {
    const m = line.match(/id=(\d+)/);
    if (m) ids.push(m[1]);
  });
  return ids;
}

// Equipo detectado con el formato REAL del detector 2.5.0:
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
  // 0. www desde el asar del AppImage 2.5.0 (con respaldo al ./www).
  fs.rmSync(TMP, { recursive: true, force: true });
  let wwwSrc = null;
  try {
    const idx = fs.readFileSync(path.join(ASAR, 'www', 'index.html'));
    const md5 = crypto.createHash('md5').update(idx).digest('hex');
    if (md5 === EXPECTED_WWW_MD5) {
      copyDirAsar(path.join(ASAR, 'www'), TMPWWW);
      const idx2 = fs.readFileSync(path.join(TMPWWW, 'index.html'));
      wwwSrc = 'asar-AppImage-2.5.0';
      log('0-www-origen', { src: wwwSrc, md5Asar: md5, md5Copia: crypto.createHash('md5').update(idx2).digest('hex') });
    } else {
      log('0-www-origen', { src: 'asar-md5-distinto', md5, esperado: EXPECTED_WWW_MD5 });
    }
  } catch (e) {
    log('0-www-origen', { src: 'asar-fallo', err: String(e && e.message).slice(0, 200) });
  }
  if (!wwwSrc) {
    fs.cpSync(path.join(ROOT, 'www'), TMPWWW, { recursive: true });
    const idx = fs.readFileSync(path.join(TMPWWW, 'index.html'));
    wwwSrc = 'proyecto-www';
    log('0-www-origen', { src: wwwSrc, md5: crypto.createHash('md5').update(idx).digest('hex') });
  }
  fs.writeFileSync(path.join(TMPWWW, 'firebase-config.js'),
    "// placeholder SOLO para el smoke test local 2.5.0\nwindow.FIREBASE_CONFIG = { apiKey: 'TU_API_KEY' };\n");
  const preloadPath = fs.existsSync(path.join(ASAR, 'preload.js'))
    ? path.join(ASAR, 'preload.js') : path.join(ROOT, 'preload.js');
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
      versionText: (document.body.innerText||'').indexOf('2.5.0')!==-1,
      splashInDom: !!document.getElementById('splash')};}`);
    if (ready.authReady && !ready.mainHidden) break;
  }
  log('1-boot-selector', ready);
  if (!ready || !ready.authReady || ready.mainHidden) throw new Error('no llegó al modo local');
  const selectorOk = !ready.inicioHidden &&
    ready.inicioText.indexOf('Por preparar') !== -1 &&
    ready.inicioText.indexOf('Recibir renta') !== -1 &&
    ready.inicioText.indexOf('Entrega Renta') !== -1 &&
    ready.inicioText.indexOf('Mantenimientos Preventivos') !== -1;
  log('1b-selector-4-secciones', { selectorOk });
  await sleep(2500);
  await js(win, `function(){window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message));});return true;}`);
  await shot(win, 'smoke-250-inicio.png');

  // 2. Ir a Mantenimientos.
  const goMant = await mouseClick(win, '#btnGoMant');
  await sleep(400);
  const mantView = await js(win, `function(){return {
    viewMantHidden: document.getElementById('viewMant').hidden,
    hasNuevo: !!document.getElementById('btnMantNuevo'),
    hasDet: !!document.getElementById('btnMantDet'),
    mantListEmpty: (document.getElementById('mantList').innerText||'').slice(0,120)};}`);
  log('2-vista-mant', { goMant, mantView });
  await shot(win, 'smoke-250-mant.png');

  // 3. Sembrar el equipo detectado (con políticas/sistemas/impresora)
  // y abrir el panel de detectados de Mantenimientos.
  const seeded = await js(win, `function(){detectados = [${JSON.stringify(DETECTED_MANT)}]; renderMantDetectados();
    return {n: detectados.length, mantDetListText: document.getElementById('mantDetList').innerText.slice(0,200)};}`);
  log('3a-detectado-sembrado', seeded);
  const openDet = await mouseClick(win, '#btnMantDet');
  await sleep(500);
  const detPanel = await js(win, `function(){return {
    mantDetBoxHidden: document.getElementById('mantDetBox').hidden,
    useBtns: document.querySelectorAll('[data-mant-det-use]').length};}`);
  log('3b-panel-detectados-mant', { openDet, detPanel });
  await shot(win, 'smoke-250-detPanel.png');

  // 4. 'Usar este equipo' en Mantenimientos -> formulario con datos.
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
  log('4a-usar-equipo-form', { clickUse, formLleno });
  const obsOk = formLleno.obsDet.indexOf('Políticas:') !== -1 &&
    formLleno.obsDet.indexOf('Usuario de sistemas: Sí') !== -1 &&
    formLleno.obsDet.indexOf('Impresora: HP LaserJet Pro') !== -1 &&
    formLleno.obsDet.indexOf('Serie: 5CD1234ABC') !== -1 &&
    formLleno.obsDet.indexOf('Hostname: PC-GERARDO') !== -1;
  log('4b-observaciones-detectadas', { obsOk, obsDet: formLleno.obsDet.slice(0, 400) });
  await shot(win, 'smoke-250-form.png');

  // 5. Tecleo XTEST en el formulario del mantenimiento.
  const tArea = await clickTypeXTEST(win, '#fM-area', 'soporte250');
  log('5a-XTEST-area', tArea);
  const tResp = await clickTypeXTEST(win, '#fM-responsable', 'gerardo250');
  log('5b-XTEST-responsable', tResp);
  const tTitulo = await clickTypeXTEST(win, '#fM-titulo', 'mantenimiento250');
  log('5c-XTEST-titulo', tTitulo);
  const tDesc = await clickTypeXTEST(win, '#fM-descEquipo', 'equipo250');
  log('5d-XTEST-descEquipo', tDesc);
  const tWa = await clickTypeXTEST(win, '#fM-whatsapp', '5512345678');
  log('5e-XTEST-whatsapp', tWa);

  // 6. Firma del técnico en el canvas (eventos de puntero reales).
  const firma = await js(win, `function(){
    var cv = document.getElementById('fM-firmaCanvas');
    if (!cv) return { canvas: false };
    var r = cv.getBoundingClientRect();
    function ev(type, x, y) {
      var e = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, clientX: r.left + x, clientY: r.top + y, offsetX: x, offsetY: y });
      cv.dispatchEvent(e);
    }
    ev('pointerdown', 20, 70);
    ev('pointermove', 80, 40);
    ev('pointermove', 160, 90);
    ev('pointermove', 260, 50);
    ev('pointerup', 260, 50);
    return { canvas: true, firmaData: (typeof mantFirmaData === 'string' && mantFirmaData.indexOf('data:image/png') === 0) };}`);
  log('6-firma-tecnico', firma);
  await shot(win, 'smoke-250-firma.png');

  // 7. 'Crear orden de servicio': completar lo que falta (tipo, fecha)
  // y crear con folio simulado 00001.
  await js(win, `function(){
    window.CLOUD_ENABLED = true;
    window.cloudUser = { uid: 'smoke-250', email: 'gerardo@smoke.local', nombre: 'Gerardo' };
    window.Cloud = window.Cloud || {};
    window.Cloud.asignarFolio = async function(){ return '00001'; };
    window.Cloud.upsertMant = async function(){ return true; };
    window.Cloud.markDetectadoUsado = async function(){ return true; };
    var tipo = document.getElementById('fM-tipo');
    if (tipo) { tipo.value = 'SOFTWARE'; tipo.dispatchEvent(new Event('change', { bubbles: true })); }
    var falla = document.getElementById('fM-tipoFalla');
    if (falla) { falla.value = 'Mantenimiento preventivo'; falla.dispatchEvent(new Event('change', { bubbles: true })); }
    var fecha = document.getElementById('fM-fechaServ');
    if (fecha) fecha.value = '2026-11-16';
    return { tipo: tipo ? tipo.value : null, falla: falla ? falla.value : null, fecha: fecha ? fecha.value : null };}`);
  const listBeforeCrear = await runPy('xwin.py', ['--list']);
  const idsBeforeCrear = parseIds(listBeforeCrear.out);
  const clickCrear = await mouseClick(win, '#btnMantCrear');
  await sleep(800);
  const orden = await js(win, `function(){return {
    orderBoxHidden: document.getElementById('mantOrderBox').hidden,
    orderText: (document.getElementById('mantOrderBox').innerText||'').slice(0, 500),
    toastText: (document.getElementById('toast').textContent||''),
    mantCount: (typeof mantenimientos !== 'undefined' ? mantenimientos.length : -1)};}`);
  log('7-crear-orden', { clickCrear, orden });
  const listAfterCrear = await runPy('xwin.py', ['--list']);
  const idsAfterCrear = parseIds(listAfterCrear.out);
  const ventanasNuevas = idsAfterCrear.filter((x) => idsBeforeCrear.indexOf(x) === -1);
  const nuevasDetalle = [];
  for (const id of ventanasNuevas) {
    const g = await runPy('xwin.py', ['--geom', id]);
    nuevasDetalle.push({ id, geom: g.out });
  }
  const dialogoSospechoso = nuevasDetalle.some((n) => {
    const m = (n.geom || '').match(/w=(\d+) h=(\d+)/);
    return m && parseInt(m[1], 10) >= 50 && parseInt(m[1], 10) <= 900 &&
      parseInt(m[2], 10) >= 30 && parseInt(m[2], 10) <= 500;
  });
  log('7b-ventanas-tras-crear', { ventanasNuevas, nuevasDetalle, dialogoSospechoso });
  await shot(win, 'smoke-250-orden.png');

  // 8. Foco final + errores JS.
  const finalFocus = await js(win, `function(){var d=document.getElementById('focusDiag');
    return {active: document.activeElement ? (document.activeElement.id||document.activeElement.tagName) : null,
      hasFocus: document.hasFocus(),
      focusDiag: d ? d.textContent.slice(0,120) : null,
      errs: window.__errs || []};}`);
  log('8-foco-final', { finalFocus, consoleErrs: consoleErrs.slice(0, 5) });

  const folioOk = !orden.orderBoxHidden && orden.orderText.indexOf('00001') !== -1;
  const ok = selectorOk && !mantView.viewMantHidden &&
    formLleno.fMserie === '5CD1234ABC' && formLleno.fMhostname === 'PC-GERARDO' &&
    formLleno.fMmodelo === 'ProBook 440 G9' && obsOk &&
    formLleno.hasCrear && formLleno.hasGuardar && formLleno.hasCancelar &&
    tArea.ok && tResp.ok && tTitulo.ok && tDesc.ok && tWa.ok &&
    firma.firmaData === true && folioOk && !dialogoSospechoso &&
    orden.toastText.indexOf('Orden de servicio creada con folio 00001') !== -1;
  console.log('[SMOKE-250] RESULTADO ' + JSON.stringify(results, null, 2));
  console.log('[SMOKE-250] VEREDICTO ' + (ok ? 'OK' : 'FALLO'));
  app.exit(ok ? 0 : 1);
}

app.whenReady().then(main).catch((e) => {
  console.error('[SMOKE-250] FALLO:', e && e.message ? e.message : e);
  console.log('[SMOKE-250] RESULTADO-PARCIAL ' + JSON.stringify(results, null, 2));
  app.exit(2);
});
