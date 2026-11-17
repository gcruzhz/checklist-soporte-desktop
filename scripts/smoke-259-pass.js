// Smoke test 2.5.9 — Compartir características de un equipo detectado
// por WhatsApp y por correo (ambos paneles).
//   - Botón "Detectar este equipo" (IPC desktop-detect simulado) reporta
//     el equipo; el panel #detBox muestra la tarjeta con los botones
//     "Compartir por WhatsApp" y "Compartir por correo" (y los de siempre).
//   - Clic en WhatsApp -> wa.me/?text= con hostname, serie, antivirus y
//     políticas (capturado por setWindowOpenHandler, igual que main.js:
//     la app llama window.open(wa.me) y main.js lo manda al navegador
//     del sistema; aquí solo se captura la URL, NO se abre nada real).
//     (El wrapper de window.open del preload corre en su mundo aislado y
//     no afecta a la página; el mecanismo real es el handler de main.js.)
//   - Clic en correo -> mailto: con asunto "Equipo detectado: <hostname>"
//     y el mismo texto en el cuerpo (capturado por will-navigate).
//   - Compartir NO marca el equipo como usado (sigue en el panel) ni
//     llama a Cloud salvo el reportDetected de la detección.
//   - En Mantenimientos el panel #mantDetBox lista el mismo equipo con
//     los dos botones (data-mant-det-wa / data-mant-det-mail) y el de
//     WhatsApp también abre wa.me.
// Los handlers IPC se simulan en ESTE proceso (main del smoke): el
// preload invoca los canales reales pero la respuesta es simulada, así
// que NO se comparte nada real ni se toca Windows Update.
// Corre con el Electron de node_modules:
//   xvfb-run -a ./node_modules/.bin/electron --no-sandbox scripts/smoke-259-pass.js
// El www es el ./www del proyecto (copiado con node scripts/copy-www.js
// desde ../checklist-cloud/www, md5 verificado). firebase-config.js se
// sustituye por placeholder (modo local sin nube): el login real con
// Firebase NO se ejerce aquí; los botones se pulsan con clics reales.
// Logs y capturas en docs/smoke259-*.
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const TMP = '/home/hatch/workspace/tmp/smoke259/run';
const TMPWWW = path.join(TMP, 'www');
const SHOTDIR = path.join(ROOT, 'docs');
const EXPECTED_WWW_MD5 = 'b59360c846ef2eaa97731a5423ec0bdf';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (typeof process.getuid === 'function' && process.getuid() === 0) {
  app.commandLine.appendSwitch('no-sandbox');
}
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.setPath('userData', path.join(TMP, 'userData'));

const results = {};
function log(step, obj) {
  results[step] = obj;
  console.log('[SMOKE-259] ' + step + ' ' + JSON.stringify(obj));
}
async function shot(win, name) {
  const p = path.join(SHOTDIR, name);
  const image = await win.webContents.capturePage();
  fs.writeFileSync(p, image.toPNG());
  console.log('[SMOKE-259] captura ' + p);
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

// Equipo detectado con el formato REAL del detector 2.5.8: políticas y
// usuario sistemas en detalles, impresora en detalles.impresora.
const DETECTED_259 = {
  id: 'SERIE-SMOKE-259', machineId: 'SERIE-SMOKE-259',
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
  if (idxMd5 !== EXPECTED_WWW_MD5) throw new Error('md5 del www no coincide con 2.5.9: ' + idxMd5);
  fs.writeFileSync(path.join(TMPWWW, 'firebase-config.js'),
    "// placeholder SOLO para el smoke test local 2.5.9\nwindow.FIREBASE_CONFIG = { apiKey: 'TU_API_KEY' };\n");
  const preloadPath = path.join(ROOT, 'preload.js');
  log('0-preload', { preloadPath });

  // IPC simulado (proceso main del smoke): registra las llamadas; la
  // apertura externa y el mailto solo se capturan, NUNCA se comparte nada.
  const opened259 = [];
  const mailto259 = [];
  ipcMain.handle('desktop-get-machine-id', async () => 'SERIE-SMOKE-259');
  ipcMain.handle('desktop-open-external', async (event, url) => { opened259.push(String(url)); return true; });
  ipcMain.handle('desktop-detect', async () => DETECTED_259);

  const win = new BrowserWindow({
    width: 1200, height: 800, title: 'Checklist de Soporte',
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  // Igual que main.js (líneas 38-44): window.open a http(s) se intercepta
  // y va al navegador del sistema; aquí la URL solo se captura en
  // opened259 y la ventana in-app se deniega (no se abre nada real).
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) opened259.push(String(url));
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (String(url).startsWith('mailto:')) { event.preventDefault(); mailto259.push(String(url)); }
  });
  const consoleErrs = [];
  win.webContents.on('console-message', (e, level, msg) => {
    if (level === 2 || /error/i.test(msg)) consoleErrs.push(msg);
  });
  await win.loadFile(path.join(TMPWWW, 'index.html'));
  win.focus();

  // 1. Arranque en modo local: selector de sección al abrir, versión 2.5.9.
  let ready = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    ready = await js(win, `function(){return {
      authReady: window._authReady, mainHidden: document.getElementById('mainApp').hidden,
      inicioHidden: document.getElementById('viewInicio').hidden,
      inicioText: (document.getElementById('viewInicio').innerText||''),
      versionText: (document.body.textContent||'').indexOf('2.5.9')!==-1,
      sin258vieja: (document.body.textContent||'').indexOf('2.5.8')===-1,
      splashInDom: !!document.getElementById('splash')};}`);
    if (ready.authReady && !ready.mainHidden) break;
  }
  log('1-boot-selector', ready);
  if (!ready || !ready.authReady || ready.mainHidden) throw new Error('no llegó al modo local');
  const selectorOk = !ready.inicioHidden &&
    ready.versionText === true && ready.sin258vieja === true &&
    ready.inicioText.indexOf('Por preparar') !== -1 &&
    ready.inicioText.indexOf('Recibir renta') !== -1 &&
    ready.inicioText.indexOf('Entrega Renta') !== -1 &&
    ready.inicioText.indexOf('Mantenimientos Preventivos') !== -1;
  log('1b-selector-4-secciones', { selectorOk });
  await sleep(2500);
  await js(win, `function(){window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message));});return true;}`);
  await shot(win, 'smoke259-inicio.png');

  // 2. Sesión simulada (el login real NO se ejerce en modo local) y stub
  // de Cloud.reportDetected con la lógica del real: mete el equipo en el
  // array global `detectados` con usado=false.
  const stub = await js(win, `function(){
    window.CLOUD_ENABLED = true;
    window.cloudUser = { uid: 'smoke-259', email: 'gerardo@smoke.local', nombre: 'Gerardo' };
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
    return { cloudUser: window.cloudUser.nombre, hasReportDetected: typeof window.Cloud.reportDetected === 'function',
      hasDesktopDetect: !!(window.Desktop && window.Desktop.detect) };}`);
  log('2-stub-sesion-reportDetected', stub);

  // 3. Ir a Por preparar y pulsar Detectar: se reporta la detección.
  const goPrep = await mouseClick(win, '#btnGoPreparar');
  await sleep(400);
  const clickDetectar = await mouseClick(win, '#btnDetectar');
  await sleep(1000);
  const detResult = await js(win, `function(){return {
    calls: window.__reportDetectedCalls || [],
    toastText: (document.getElementById('toast').textContent||''),
    detectadosN: detectados.length,
    detBoxHidden: document.getElementById('detBox').hidden};}`);
  log('3-detectar', { clickDetectar, detResult });
  const reportOk = detResult.calls.length === 1 &&
    detResult.calls[0].detectadoPor === 'Gerardo' &&
    detResult.calls[0].machineId === 'SERIE-SMOKE-259' &&
    detResult.calls[0].serie === '5CD1234ABC' &&
    detResult.calls[0].hostname === 'PC-GERARDO' &&
    detResult.toastText.indexOf('Equipo detectado, ya aparece en los teléfonos') !== -1;

  // 4. Abrir el panel #detBox: la tarjeta trae los dos botones nuevos
  // junto a los de siempre.
  const clickShowDet = await mouseClick(win, '#btnShowDet');
  await sleep(400);
  const panel = await js(win, `function(){var list=document.getElementById('detList');
    return {boxHidden: document.getElementById('detBox').hidden,
      texto: (list.innerText||''),
      waBtns: document.querySelectorAll('[data-det-wa]').length,
      mailBtns: document.querySelectorAll('[data-det-mail]').length,
      waId: (document.querySelector('[data-det-wa]')||{}).getAttribute ? document.querySelector('[data-det-wa]').getAttribute('data-det-wa') : null,
      waTexto: document.querySelector('[data-det-wa]') ? (document.querySelector('[data-det-wa]').innerText||'').trim() : null,
      mailTexto: document.querySelector('[data-det-mail]') ? (document.querySelector('[data-det-mail]').innerText||'').trim() : null,
      useBtns: document.querySelectorAll('[data-det-use]').length};}`);
  log('4-panel-detBotones', { clickShowDet, panel });
  await shot(win, 'smoke259-panel.png');
  const panelOk = clickShowDet.clicked === true && panel.boxHidden === false &&
    panel.waBtns === 1 && panel.mailBtns === 1 &&
    panel.waId === 'SERIE-SMOKE-259' &&
    panel.waTexto && panel.waTexto.indexOf('Compartir por WhatsApp') !== -1 &&
    panel.mailTexto && panel.mailTexto.indexOf('Compartir por correo') !== -1 &&
    panel.useBtns === 1 &&
    panel.texto.indexOf('PC-GERARDO') !== -1 &&
    panel.texto.indexOf('5CD1234ABC') !== -1;

  // 5. Diagnóstico del mecanismo de compartir en este Electron: si
  // navigator.share existe, shareText lo usa y wa.me nunca se abre.
  const shareProbe = await js(win, `function(){return {
    shareType: typeof navigator.share,
    openType: typeof window.open,
    openEsPreload: String(window.open).indexOf('open-external') !== -1};}`);
  log('5a-share-probe', shareProbe);
  // Clic en "Compartir por WhatsApp": wa.me con el texto del equipo.
  const clickWa = await mouseClick(win, '[data-det-wa="SERIE-SMOKE-259"]');
  await sleep(600);
  const waUrl = opened259.length ? opened259[opened259.length - 1] : '';
  const waTxt = waUrl.indexOf('https://wa.me/?text=') === 0 ? decodeURIComponent(waUrl.split('text=')[1]) : '';
  log('5-whatsapp', { clickWa, opened259, waTxt: waTxt.slice(0, 400) });
  await shot(win, 'smoke259-whatsapp.png');
  const waOk = clickWa.clicked === true &&
    opened259.length === 1 &&
    waUrl.indexOf('https://wa.me/?text=') === 0 &&
    waTxt.indexOf('PC-GERARDO') !== -1 &&
    waTxt.indexOf('5CD1234ABC') !== -1 &&
    waTxt.indexOf('ESET NOD32') !== -1 &&
    waTxt.indexOf('Políticas:') !== -1 &&
    waTxt.indexOf('Usuario de sistemas: Sí') !== -1;

  // 6. Clic en "Compartir por correo": mailto con asunto y cuerpo.
  const clickMail = await mouseClick(win, '[data-det-mail="SERIE-SMOKE-259"]');
  await sleep(600);
  const mailUrl = mailto259.length ? mailto259[mailto259.length - 1] : '';
  const mailAsunto = mailUrl.indexOf('mailto:?subject=') === 0 ? decodeURIComponent(mailUrl.split('subject=')[1].split('&body=')[0]) : '';
  const mailCuerpo = mailUrl.indexOf('&body=') !== -1 ? decodeURIComponent(mailUrl.split('&body=')[1]) : '';
  log('6-correo', { clickMail, mailto259: mailto259.map((u) => u.slice(0, 120)), mailAsunto, mailCuerpo: mailCuerpo.slice(0, 400) });
  const mailOk = clickMail.clicked === true &&
    mailto259.length === 1 &&
    mailUrl.indexOf('mailto:?subject=') === 0 &&
    mailAsunto === 'Equipo detectado: PC-GERARDO' &&
    mailCuerpo.indexOf('PC-GERARDO') !== -1 &&
    mailCuerpo.indexOf('5CD1234ABC') !== -1 &&
    mailCuerpo.indexOf('Políticas:') !== -1;

  // 7. Compartir no marca el equipo como usado: sigue en el panel y el
  // único llamado a Cloud fue el reportDetected de la detección.
  const sigue = await js(win, `function(){return {
    calls: (window.__reportDetectedCalls || []).length,
    detectadosN: detectados.length,
    usado: detectados.length ? detectados[0].usado : null,
    texto: (document.getElementById('detList').innerText||'')};}`);
  log('7-sigue-pendiente', sigue);
  const sigueOk = sigue.calls === 1 && sigue.detectadosN === 1 &&
    sigue.usado === false && sigue.texto.indexOf('PC-GERARDO') !== -1;

  // 8. Mantenimientos (pestaña persistente, no el botón del menú Inicio,
  // que queda oculto fuera de esa vista): el mismo equipo aparece en
  // #mantDetList con los dos botones; el de WhatsApp también abre wa.me.
  const goMant = await mouseClick(win, '[data-v="mant"]');
  await sleep(400);
  const clickMantDet = await mouseClick(win, '#btnMantDet');
  await sleep(400);
  const mantPanel = await js(win, `function(){var list=document.getElementById('mantDetList');
    return {boxHidden: document.getElementById('mantDetBox').hidden,
      texto: (list.innerText||''),
      waBtns: document.querySelectorAll('[data-mant-det-wa]').length,
      mailBtns: document.querySelectorAll('[data-mant-det-mail]').length,
      waId: (document.querySelector('[data-mant-det-wa]')||{}).getAttribute ? document.querySelector('[data-mant-det-wa]').getAttribute('data-mant-det-wa') : null,
      useBtns: document.querySelectorAll('[data-mant-det-use]').length};}`);
  log('8-panel-mantBotones', { goMant, clickMantDet, mantPanel });
  await shot(win, 'smoke259-mant.png');
  const mantPanelOk = mantPanel.boxHidden === false &&
    mantPanel.waBtns === 1 && mantPanel.mailBtns === 1 &&
    mantPanel.waId === 'SERIE-SMOKE-259' && mantPanel.useBtns === 1 &&
    mantPanel.texto.indexOf('PC-GERARDO') !== -1;
  const nOpenedAntes = opened259.length;
  const clickMantWa = await mouseClick(win, '[data-mant-det-wa="SERIE-SMOKE-259"]');
  await sleep(600);
  const waMantUrl = opened259.length > nOpenedAntes ? opened259[opened259.length - 1] : '';
  const waMantTxt = waMantUrl.indexOf('https://wa.me/?text=') === 0 ? decodeURIComponent(waMantUrl.split('text=')[1]) : '';
  log('8b-whatsapp-mant', { clickMantWa, waMantTxt: waMantTxt.slice(0, 200) });
  const mantWaOk = clickMantWa.clicked === true &&
    opened259.length === nOpenedAntes + 1 &&
    waMantUrl.indexOf('https://wa.me/?text=') === 0 &&
    waMantTxt.indexOf('PC-GERARDO') !== -1;

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

  const ok = selectorOk && reportOk && panelOk && waOk && mailOk &&
    sigueOk && mantPanelOk && mantWaOk &&
    consoleNuevos.length === 0 && errsNuevos.length === 0;
  console.log('[SMOKE-259] RESULTADO ' + JSON.stringify(results, null, 2));
  console.log('[SMOKE-259] VEREDICTO ' + (ok ? 'OK' : 'FALLO'));
  app.exit(ok ? 0 : 1);
}
app.whenReady().then(main).catch((e) => {
  console.error('[SMOKE-259] FALLO:', e && e.message ? e.message : e);
  console.log('[SMOKE-259] RESULTADO-PARCIAL ' + JSON.stringify(results, null, 2));
  app.exit(2);
});
