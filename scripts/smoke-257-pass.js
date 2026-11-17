// Smoke test 2.5.7 — Contraseña del usuario local Windows "sistemas".
//   - Botón "Contraseña de sistemas" visible solo con window.Desktop
//     (el preload real expone verificar/cambiarPasswordSistemas) y el
//     panel #passBox se abre con clic real: usuario por defecto
//     "sistemas", 3 campos type=password, botones Verificar/Cambiar.
//   - Validación web: nueva != confirmar -> toast "no coinciden" y NO
//     se llama al IPC (psCalls sigue en 0).
//   - Verificar con la actual correcta (simulada) -> toast
//     "Contraseña actual correcta ✓" y campos limpios; con la actual
//     incorrecta -> toast "Contraseña actual incorrecta.".
//   - Cambiar con actual correcta -> toast "Contraseña cambiada ✓" y
//     campos limpios; con la nueva simulando falta de permiso ->
//     toast de permiso de administrador.
//   - Ninguna contraseña de prueba queda en localStorage.
// Los handlers IPC se simulan en ESTE proceso (main del smoke): el
// preload invoca los canales reales pero la respuesta es simulada,
// así que NO se ejecuta PowerShell ni se cambia ninguna contraseña
// real en esta máquina (Linux, además, ni tiene PowerShell).
// Corre con el Electron de node_modules:
//   xvfb-run -a ./node_modules/.bin/electron --no-sandbox scripts/smoke-257-pass.js
// El www es el ./www del proyecto (copiado con node scripts/copy-www.js
// desde ../checklist-cloud/www, md5 verificado). firebase-config.js se
// sustituye por placeholder (modo local sin nube): el login real con
// Firebase NO se ejerce aquí; los botones se pulsan con clics reales.
// Logs y capturas en docs/smoke257-*.
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const TMP = '/home/hatch/workspace/tmp/smoke257/run';
const TMPWWW = path.join(TMP, 'www');
const SHOTDIR = path.join(ROOT, 'docs');
const EXPECTED_WWW_MD5 = '470df09b8cbb8d0eda96a7bffaf5862b';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (typeof process.getuid === 'function' && process.getuid() === 0) {
  app.commandLine.appendSwitch('no-sandbox');
}
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.setPath('userData', path.join(TMP, 'userData'));

const results = {};
function log(step, obj) {
  results[step] = obj;
  console.log('[SMOKE-257] ' + step + ' ' + JSON.stringify(obj));
}
async function shot(win, name) {
  const p = path.join(SHOTDIR, name);
  const image = await win.webContents.capturePage();
  fs.writeFileSync(p, image.toPNG());
  console.log('[SMOKE-257] captura ' + p);
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
function setPass(u, a, n, c) {
  return `function(){var g=function(id){return document.getElementById(id);};
    g('fPsUser').value=${JSON.stringify(u)}; g('fPsActual').value=${JSON.stringify(a)};
    g('fPsNueva').value=${JSON.stringify(n)}; g('fPsConfirm').value=${JSON.stringify(c)};
    return {u:g('fPsUser').value, a:g('fPsActual').value, n:g('fPsNueva').value, c:g('fPsConfirm').value};}`;
}

async function main() {
  // 0. www del ./www del proyecto (copiado con copy-www.js): md5 verificado.
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'www'), TMPWWW, { recursive: true });
  const idxMd5 = crypto.createHash('md5').update(fs.readFileSync(path.join(TMPWWW, 'index.html'))).digest('hex');
  log('0-www-origen', { src: 'proyecto-www', md5: idxMd5, esperado: EXPECTED_WWW_MD5, coincide: idxMd5 === EXPECTED_WWW_MD5 });
  if (idxMd5 !== EXPECTED_WWW_MD5) throw new Error('md5 del www no coincide con 2.5.7: ' + idxMd5);
  fs.writeFileSync(path.join(TMPWWW, 'firebase-config.js'),
    "// placeholder SOLO para el smoke test local 2.5.7\nwindow.FIREBASE_CONFIG = { apiKey: 'TU_API_KEY' };\n");
  const preloadPath = path.join(ROOT, 'preload.js');
  log('0-preload', { preloadPath });

  // IPC simulado (proceso main del smoke): registra las llamadas y
  // devuelve respuestas simuladas; NUNCA ejecuta PowerShell real.
  const psCalls = [];
  ipcMain.handle('desktop-get-machine-id', async () => 'SERIE-SMOKE-257');
  ipcMain.handle('desktop-verificar-password-sistemas', async (e, u, a) => {
    psCalls.push(['ver', u, a]);
    if (u !== 'sistemas') return { ok: false, error: 'Usuario no encontrado.' };
    if (a === 'ContraseñaVieja123') return { ok: true };
    return { ok: false, error: 'Contraseña actual incorrecta.' };
  });
  ipcMain.handle('desktop-cambiar-password-sistemas', async (e, u, a, n) => {
    psCalls.push(['cam', u, a, n]);
    if (a !== 'ContraseñaVieja123') return { ok: false, error: 'Contraseña actual incorrecta.' };
    if (n === 'SinPermiso123') return { ok: false, error: 'Se necesita permiso de administrador para cambiar la contraseña.' };
    return { ok: true };
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

  // 1. Arranque en modo local: selector de sección al abrir, versión 2.5.7.
  let ready = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    ready = await js(win, `function(){return {
      authReady: window._authReady, mainHidden: document.getElementById('mainApp').hidden,
      inicioHidden: document.getElementById('viewInicio').hidden,
      inicioText: (document.getElementById('viewInicio').innerText||''),
      versionText: (document.body.textContent||'').indexOf('2.5.7')!==-1,
      sin256vieja: (document.body.textContent||'').indexOf('2.5.6')===-1,
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
  await shot(win, 'smoke257-inicio.png');

  // 2. Ir a Por preparar: el botón de contraseña existe, está visible
  // (hay window.Desktop real del preload) y el panel arranca oculto.
  const goPrep = await mouseClick(win, '#btnGoPreparar');
  await sleep(400);
  const passBtn = await js(win, `function(){var b=document.getElementById('btnPassSistemas');
    var box=document.getElementById('passBox');
    return {existe: !!b, hidden: b ? b.hidden : null,
      texto: b ? b.textContent : '', boxHidden: box ? box.hidden : null,
      desktop: !!window.Desktop,
      verificarFn: typeof (window.Desktop && window.Desktop.verificarPasswordSistemas),
      cambiarFn: typeof (window.Desktop && window.Desktop.cambiarPasswordSistemas)};}`);
  log('2-boton-contrasena', { goPrep, passBtn, psCalls: psCalls.length });
  const passBtnOk = goPrep.clicked === true && passBtn.existe === true &&
    passBtn.hidden === false && passBtn.texto.indexOf('Contraseña de sistemas') !== -1 &&
    passBtn.boxHidden === true && passBtn.desktop === true &&
    passBtn.verificarFn === 'function' && passBtn.cambiarFn === 'function';

  // 3. Clic real en el botón: se abre el panel con los campos.
  const clickPass = await mouseClick(win, '#btnPassSistemas');
  await sleep(400);
  const panel = await js(win, `function(){var g=function(id){return document.getElementById(id);};
    return {boxHidden: g('passBox').hidden,
      user: {value: g('fPsUser').value, type: g('fPsUser').type},
      actual: {type: g('fPsActual').type, value: g('fPsActual').value},
      nueva: {type: g('fPsNueva').type},
      confirmar: {type: g('fPsConfirm').type},
      btnVer: !!g('btnPsVerificar'), btnCam: !!g('btnPsCambiar')};}`);
  log('3-panel-campos', { clickPass, panel });
  await shot(win, 'smoke257-panel.png');
  const panelOk = clickPass.clicked === true && panel.boxHidden === false &&
    panel.user.value === 'sistemas' && panel.user.type === 'text' &&
    panel.actual.type === 'password' && panel.nueva.type === 'password' &&
    panel.confirmar.type === 'password' && panel.btnVer === true && panel.btnCam === true;

  // 4. Validación: nueva != confirmar -> toast y SIN llamada al IPC.
  await js(win, setPass('sistemas', 'ContraseñaVieja123', 'NuevaPass123', 'OtraPass123'));
  const clickMismatch = await mouseClick(win, '#btnPsCambiar');
  await sleep(400);
  const mismatch = await js(win, `function(){return {toast: ${toastOf()},
    nueva: document.getElementById('fPsNueva').value};}`);
  log('4-validacion-mismatch', { clickMismatch, mismatch, psCalls: psCalls.length });
  const mismatchOk = clickMismatch.clicked === true &&
    mismatch.toast.indexOf('no coinciden') !== -1 && psCalls.length === 0;

  // 5. Verificar con la actual correcta (simulada) -> toast y campos limpios.
  await js(win, setPass('sistemas', 'ContraseñaVieja123', '', ''));
  const clickVerOk = await mouseClick(win, '#btnPsVerificar');
  await sleep(500);
  const verOk = await js(win, `function(){return {toast: ${toastOf()},
    actual: document.getElementById('fPsActual').value};}`);
  log('5-verificar-ok', { clickVerOk, verOk, psCalls });
  const verOkOk = clickVerOk.clicked === true &&
    verOk.toast.indexOf('Contraseña actual correcta') !== -1 &&
    verOk.actual === '' && psCalls.length === 1 &&
    psCalls[0][0] === 'ver' && psCalls[0][1] === 'sistemas' && psCalls[0][2] === 'ContraseñaVieja123';

  // 6. Verificar con la actual incorrecta -> toast de incorrecta.
  await js(win, setPass('sistemas', 'ContraseñaMala123', '', ''));
  const clickVerMal = await mouseClick(win, '#btnPsVerificar');
  await sleep(500);
  const verMal = await js(win, `function(){return {toast: ${toastOf()},
    actual: document.getElementById('fPsActual').value};}`);
  log('6-verificar-incorrecta', { clickVerMal, verMal, psCalls: psCalls.length });
  const verMalOk = clickVerMal.clicked === true &&
    verMal.toast.indexOf('Contraseña actual incorrecta') !== -1 &&
    verMal.actual === '' && psCalls.length === 2;

  // 7. Cambiar con actual correcta -> toast y campos limpios.
  await js(win, setPass('sistemas', 'ContraseñaVieja123', 'NuevaPass123', 'NuevaPass123'));
  const clickCamOk = await mouseClick(win, '#btnPsCambiar');
  await sleep(500);
  const camOk = await js(win, `function(){var g=function(id){return document.getElementById(id);};
    return {toast: ${toastOf()}, actual: g('fPsActual').value,
      nueva: g('fPsNueva').value, confirmar: g('fPsConfirm').value};}`);
  log('7-cambiar-ok', { clickCamOk, camOk, psCalls });
  await shot(win, 'smoke257-cambiada.png');
  const camOkOk = clickCamOk.clicked === true &&
    camOk.toast.indexOf('Contraseña cambiada') !== -1 &&
    camOk.actual === '' && camOk.nueva === '' && camOk.confirmar === '' &&
    psCalls.length === 3 && psCalls[2][0] === 'cam' &&
    psCalls[2][1] === 'sistemas' && psCalls[2][2] === 'ContraseñaVieja123' &&
    psCalls[2][3] === 'NuevaPass123';

  // 8. Cambiar sin permiso de administrador (simulado) -> toast de permiso.
  await js(win, setPass('sistemas', 'ContraseñaVieja123', 'SinPermiso123', 'SinPermiso123'));
  const clickCamAdmin = await mouseClick(win, '#btnPsCambiar');
  await sleep(500);
  const camAdmin = await js(win, `function(){return {toast: ${toastOf()}};}`);
  log('8-cambiar-sin-permiso', { clickCamAdmin, camAdmin, psCalls: psCalls.length });
  const camAdminOk = clickCamAdmin.clicked === true &&
    camAdmin.toast.indexOf('permiso de administrador') !== -1 && psCalls.length === 4;

  // 9. Ninguna contraseña de prueba quedó en localStorage.
  const ls = await js(win, `function(){var out={};
    for (var i=0;i<localStorage.length;i++){var k=localStorage.key(i); out[k]=localStorage.getItem(k);}
    return JSON.stringify(out);}`);
  const lsSinPass = ls.indexOf('ContraseñaVieja123') === -1 &&
    ls.indexOf('ContraseñaMala123') === -1 && ls.indexOf('NuevaPass123') === -1 &&
    ls.indexOf('SinPermiso123') === -1;
  log('9-localstorage-sin-contrasenas', { lsSinPass, claves: Object.keys(JSON.parse(ls)) });

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

  const ok = selectorOk && passBtnOk && panelOk && mismatchOk && verOkOk &&
    verMalOk && camOkOk && camAdminOk && lsSinPass &&
    consoleNuevos.length === 0 && errsNuevos.length === 0;
  console.log('[SMOKE-257] RESULTADO ' + JSON.stringify(results, null, 2));
  console.log('[SMOKE-257] VEREDICTO ' + (ok ? 'OK' : 'FALLO'));
  app.exit(ok ? 0 : 1);
}

app.whenReady().then(main).catch((e) => {
  console.error('[SMOKE-257] FALLO:', e && e.message ? e.message : e);
  console.log('[SMOKE-257] RESULTADO-PARCIAL ' + JSON.stringify(results, null, 2));
  app.exit(2);
});
