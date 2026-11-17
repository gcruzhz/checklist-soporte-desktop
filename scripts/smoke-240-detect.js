// Smoke test 2.4.0 — secuencia exacta confirmada por Gerardo 2026-11-15:
//   Detectar -> 'Usar este equipo' -> teclear en el formulario.
// En 2.3.x esa secuencia mataba el teclado en Windows (sospechoso: el
// alert('Equipo detectado, ya aparece en los teléfonos') de la antigua
// línea ~2514, cerrado con clic real, justo entre Detectar y Usar).
// En 2.4.0 ese alert ya es showToast y el confirm de descartar ya es
// modal inline (#confirmModal): aquí NO debe aparecer ninguna ventana
// de diálogo nativa y el tecleo XTEST (nivel SO) debe entrar antes y
// después de Detectar.
// Corre con el Electron de node_modules (el binario empaquetado del
// AppImage IGNORA un script .js como argumento y arranca su propio
// main.js; verificado 2026-11-15):
//   xvfb-run -a ./node_modules/.bin/electron --no-sandbox scripts/smoke-240-detect.js
// El www se copia desde resources/app.asar del AppImage 2.4.0 EXTRAÍDO
// (copia manual con readdir/readFile porque fs.cpSync no atraviesa
// directorios asar; se verifica su md5 contra el www del teléfono) y el
// preload se carga desde el asar. firebase-config.js se sustituye por
// placeholder (modo local sin nube, como los smokes 2.3.4/2.3.5/2.3.8):
// el login real con Firebase NO se ejerce aquí (sin credenciales en
// esta tarea); la llegada del equipo detectado a los teléfonos se SIMULA
// sembrando `detectados` a mano, igual que en smoke-usar-equipo-2.3.5.
// El chat (#tabEquipo) queda oculto en modo local (CLOUD_ENABLED false),
// así que el tecleo en chat NO se puede cubrir aquí: queda para la
// prueba de Gerardo en su PC real.
// NOTA XTEST: xtest-type.py no teclea mayúsculas ni @ . - (el keysym sin
// Shift produce minúsculas y esos símbolos no llegan); por eso los
// textos de prueba son solo minúsculas y dígitos, y la comparación es
// exacta contra lo enviado.
// Logs y capturas en docs/smoke-240-*.
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ASAR = '/home/hatch/workspace/tmp/smoke240/squashfs-root/resources/app.asar';
const TMP = '/home/hatch/workspace/tmp/smoke240/run';
const TMPWWW = path.join(TMP, 'www');
const SHOTDIR = path.join(ROOT, 'docs');
const EXPECTED_WWW_MD5 = '4d2f22edffc1b2d42aeb70356ae478d8';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (typeof process.getuid === 'function' && process.getuid() === 0) {
  app.commandLine.appendSwitch('no-sandbox');
}
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.setPath('userData', path.join(TMP, 'userData'));

const results = {};
function log(step, obj) {
  results[step] = obj;
  console.log('[SMOKE-240] ' + step + ' ' + JSON.stringify(obj));
}
async function shot(win, name) {
  const p = path.join(SHOTDIR, name);
  const image = await win.webContents.capturePage();
  fs.writeFileSync(p, image.toPNG());
  console.log('[SMOKE-240] captura ' + p);
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
  // 0. www desde el asar del AppImage 2.4.0 (con respaldo al ./www).
  fs.rmSync(TMP, { recursive: true, force: true });
  let wwwSrc = null;
  try {
    const idx = fs.readFileSync(path.join(ASAR, 'www', 'index.html'));
    const md5 = crypto.createHash('md5').update(idx).digest('hex');
    if (md5 === EXPECTED_WWW_MD5) {
      copyDirAsar(path.join(ASAR, 'www'), TMPWWW);
      const idx2 = fs.readFileSync(path.join(TMPWWW, 'index.html'));
      wwwSrc = 'asar-AppImage-2.4.0';
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
    "// placeholder SOLO para el smoke test local 2.4.0\nwindow.FIREBASE_CONFIG = { apiKey: 'TU_API_KEY' };\n");
  const preloadPath = fs.existsSync(path.join(ASAR, 'preload.js'))
    ? path.join(ASAR, 'preload.js') : path.join(ROOT, 'preload.js');
  log('0-preload', { preloadPath });

  const win = new BrowserWindow({
    width: 1200, height: 800, title: 'Checklist de Soporte',
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: false },
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

  // 1. Arranque en modo local (sin login Firebase: placeholder).
  let ready = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    ready = await js(win, `function(){return {
      authReady: window._authReady, mainHidden: document.getElementById('mainApp').hidden,
      hasDesktop: !!window.Desktop, hasDetect: !!(window.Desktop && window.Desktop.detect),
      versionText: (document.body.innerText||'').indexOf('2.4.0')!==-1,
      splashInDom: !!document.getElementById('splash')};}`);
    if (ready.authReady && !ready.mainHidden) break;
  }
  log('1-boot-modo-local', ready);
  if (!ready || !ready.authReady || ready.mainHidden) throw new Error('no llegó al modo local');
  await sleep(2500);
  await js(win, `function(){window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message));});return true;}`);
  await shot(win, 'smoke-240-main.png');
  const listStart = await runPy('xwin.py', ['--list']);
  const idsStart = parseIds(listStart.out);
  log('1b-ventanas-tras-boot', { ids: idsStart, detalle: listStart.out });

  // 2. BASELINE (sesión fresca, sin detectar): Nuevo equipo -> teclear.
  const openNew = await mouseClick(win, '#btnShowNew');
  await sleep(300);
  const base = await clickTypeXTEST(win, '#fInv', 'base240');
  log('2-baseline-nuevo-equipo-XTEST', { openNew, base });
  await shot(win, 'smoke-240-form-blanco.png');
  // Cerrar el panel y volver arriba para que el menú quede en viewport.
  const closeNew = await mouseClick(win, '#btnShowNew');
  await sleep(300);
  let panelCerrado = await js(win, `function(){return {newBoxHidden: document.getElementById('newBox').hidden};}`);
  if (!panelCerrado.newBoxHidden) {
    await js(win, `function(){document.getElementById('newBox').hidden = true; window.scrollTo(0,0); return true;}`);
    await sleep(200);
    panelCerrado = await js(win, `function(){return {newBoxHidden: document.getElementById('newBox').hidden, fallbackJs: true};}`);
  } else {
    await js(win, `function(){window.scrollTo(0,0); return true;}`);
  }
  log('2b-panel-cerrado', { closeNew, panelCerrado });

  // 3. DETECTAR con clic real de ratón (sendInputEvent), con cloudUser y
  // window.Cloud.reportDetected simulados para que el handler real corra
  // hasta el showToast('Equipo detectado...') sin nube.
  const stub = await js(win, `function(){
    window.cloudUser = { uid: 'smoke-240', email: 'gerardo@smoke.local', nombre: 'Gerardo' };
    window.Cloud = { reportDetected: function(d){ window._reportedDetect = d; return Promise.resolve(); } };
    return {cloudUser: !!window.cloudUser, cloudReport: !!(window.Cloud && window.Cloud.reportDetected)};}`);
  log('3a-stubs-nube-local', stub);
  const detBtn = await js(win, `function(){var b=document.getElementById('btnDetectar');
    return {hidden: b.hidden, disabled: b.disabled, text: b.innerText.slice(0,60)};}`);
  log('3b-btnDetectar-estado', detBtn);
  // Línea base de ventanas JUSTO antes del clic (las ventanas auxiliares
  // de Electron —p. ej. 4194307/4194308, clase electron, sin nombre— se
  // crean perezosamente durante el arranque/clics y NO son diálogos).
  const listBeforeDet = await runPy('xwin.py', ['--list']);
  const idsBeforeDet = parseIds(listBeforeDet.out);
  log('3b2-ventanas-antes-detectar', { ids: idsBeforeDet, detalle: listBeforeDet.out });
  const clickDet = await mouseClick(win, '#btnDetectar');
  let afterDet = null;
  for (let i = 0; i < 10; i++) {
    await sleep(500);
    afterDet = await js(win, `function(){var t=document.getElementById('toast');
      return {toastHidden: t.hidden, toastText: t.textContent,
        reported: !!window._reportedDetect,
        reportedMarca: window._reportedDetect ? window._reportedDetect.marca : null,
        reportedSerie: window._reportedDetect ? window._reportedDetect.serie : null,
        active: document.activeElement ? (document.activeElement.id||document.activeElement.tagName) : null,
        hasFocus: document.hasFocus()};}`);
    if (!afterDet.toastHidden && afterDet.toastText) break;
  }
  const listAfterDet = await runPy('xwin.py', ['--list']);
  const idsAfterDet = parseIds(listAfterDet.out);
  const ventanasNuevas = idsAfterDet.filter((x) => idsBeforeDet.indexOf(x) === -1);
  // Detalle (nombre/clase/geometría) de cada ventana nueva: un diálogo
  // nativo de Chromium es una ventana pequeña (en 2.3.8j: 193x83); las
  // auxiliares de Electron son 1x1 o sin geometría útil.
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
  log('3c-detectar-toast', { clickDet, afterDet, ventanasNuevas, nuevasDetalle, dialogoSospechoso, listaTrasDetectar: listAfterDet.out });
  await shot(win, 'smoke-240-toast.png');

  // 4. Llegada simulada a los teléfonos: sembrar detectados y abrir panel.
  const seeded = await js(win, `function(){detectados = [${JSON.stringify(DETECTED)}]; renderDetectados();
    return {n: detectados.length, detListText: document.getElementById('detList').innerText.slice(0,200)};}`);
  log('4a-equipo-detectado-sembrado', seeded);
  const openDet = await mouseClick(win, '#btnShowDet');
  await sleep(500);
  const detPanel = await js(win, `function(){return {
    detBoxHidden: document.getElementById('detBox').hidden,
    useBtns: document.querySelectorAll('[data-det-use]').length};}`);
  log('4b-panel-detectados-abierto', { openDet, detPanel });
  await shot(win, 'smoke-240-detPanel.png');

  // 5. 'Usar este equipo' con clic real -> formulario con datos -> XTEST.
  const clickUse = await mouseClick(win, '[data-det-use="SERIE-DETECTADA-1"]');
  await sleep(500);
  const formLleno = await js(win, `function(){return {
    newBoxHidden: document.getElementById('newBox').hidden,
    fMarca: document.getElementById('fMarca').value,
    fModelo: document.getElementById('fModelo').value,
    fSerie: document.getElementById('fSerie').value,
    fHostname: document.getElementById('fHostname').value,
    fTipo: document.getElementById('fTipo').value};}`);
  log('5a-usar-equipo-form', { clickUse, formLleno });
  const tInv = await clickTypeXTEST(win, '#fInv', 'inv240');
  log('5b-XTEST-tras-usar-fInv', tInv);
  const tUser = await clickTypeXTEST(win, '#fUser', 'gerardo240');
  log('5c-XTEST-tras-usar-fUser', tUser);
  const tArea = await clickTypeXTEST(win, '#fArea', 'soporte240');
  log('5d-XTEST-tras-usar-fArea', tArea);
  const tCorreo = await clickTypeXTEST(win, '#fCorreo', 'gerardo240');
  log('5e-XTEST-tras-usar-fCorreo', tCorreo);
  await shot(win, 'smoke-240-form-detectado.png');

  // 6. Búsqueda (campo que también moría tras Detectar en 2.3.x).
  // El chat queda fuera: #tabEquipo está oculto en modo local.
  const tSearch = await clickTypeXTEST(win, '#search', 'probook');
  log('6a-XTEST-busqueda', tSearch);
  const chatEstado = await js(win, `function(){return {
    tabEquipoHidden: document.getElementById('tabEquipo').hidden,
    viewEquipoHidden: document.getElementById('viewEquipo').hidden,
    chatInputVisible: !!(document.getElementById('chatInput') && document.getElementById('chatInput').offsetParent!==null)};}`);
  log('6b-chat-modo-local', chatEstado);

  // 7. Foco final + diagnóstico de foco + errores JS + ventanas.
  const finalFocus = await js(win, `function(){var d=document.getElementById('focusDiag');
    return {active: document.activeElement ? (document.activeElement.id||document.activeElement.tagName) : null,
      hasFocus: document.hasFocus(),
      focusDiag: d ? d.textContent.slice(0,120) : null,
      errs: window.__errs || []};}`);
  const listEnd = await runPy('xwin.py', ['--list']);
  const idsEnd = parseIds(listEnd.out);
  const ventanasNuevasTotal = idsEnd.filter((x) => idsBeforeDet.indexOf(x) === -1);
  log('7-foco-final', { finalFocus, consoleErrs: consoleErrs.slice(0, 5), ventanasNuevasTotal, idsStart, idsBeforeDet, idsEnd });
  await shot(win, 'smoke-240-final.png');

  const ok = base.ok && afterDet && !afterDet.toastHidden &&
    afterDet.toastText.indexOf('Equipo detectado') === 0 &&
    afterDet.reported === true && !dialogoSospechoso &&
    formLleno.fMarca === 'HP' && formLleno.fModelo === 'ProBook 440 G9' &&
    formLleno.fSerie === '5CD1234ABC' &&
    tInv.ok && tUser.ok && tArea.ok && tCorreo.ok && tSearch.ok;
  console.log('[SMOKE-240] RESULTADO ' + JSON.stringify(results, null, 2));
  console.log('[SMOKE-240] VEREDICTO ' + (ok ? 'OK' : 'FALLO'));
  app.exit(ok ? 0 : 1);
}

app.whenReady().then(main).catch((e) => {
  console.error('[SMOKE-240] FALLO:', e && e.message ? e.message : e);
  console.log('[SMOKE-240] RESULTADO-PARCIAL ' + JSON.stringify(results, null, 2));
  app.exit(2);
});
