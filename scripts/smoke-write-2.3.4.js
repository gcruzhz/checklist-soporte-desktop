// Smoke test de ESCRITURA 2.3.4 (solo diagnóstico, no toca el www real).
// Copia ./www a /tmp/checklist-smoke-2.3.4/www con firebase-config.js
// sustituido por un placeholder (apiKey 'TU_API_KEY') para forzar el modo
// local sin nube de boot() (index.html:1090: si !CLOUD_ENABLED muestra
// mainApp directamente, sin login). Así se prueba el formulario en el
// mismo Electron/preload que la app real, sin credenciales ni red.
// Escribe con eventos de teclado reales (sendInputEvent) en los campos
// de Nuevo equipo y de Reasignar, guarda y verifica en localStorage
// (LS_KEY 'checklist-soporte-v1') y en el DOM que los datos quedaron.
// Uso: CHECKLIST_DESKTOP_SMOKE_SHOT dir opcional; correr bajo xvfb-run:
//   xvfb-run -a ./node_modules/.bin/electron scripts/smoke-write-2.3.4.js
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const TMP = '/tmp/checklist-smoke-2.3.4';
const TMPWWW = path.join(TMP, 'www');
const SHOTDIR = process.env.CHECKLIST_DESKTOP_SMOKE_SHOT_DIR || path.join(ROOT, 'docs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (typeof process.getuid === 'function' && process.getuid() === 0) {
  app.commandLine.appendSwitch('no-sandbox');
}
app.commandLine.appendSwitch('disable-dev-shm-usage');
// Perfil limpio en cada corrida: el localStorage (LS_KEY) no debe traer
// equipos de una corrida anterior, o los conteos n=1 / n=2 fallan.
app.setPath('userData', path.join(TMP, 'userData'));

const results = {};
function log(step, obj) {
  results[step] = obj;
  console.log('[SMOKE-WRITE] ' + step + ' ' + JSON.stringify(obj));
}

async function shot(win, name) {
  const p = path.join(SHOTDIR, name);
  const image = await win.webContents.capturePage();
  fs.writeFileSync(p, image.toPNG());
  console.log('[SMOKE-WRITE] captura ' + p);
  return p;
}

async function js(win, fnString) {
  return win.webContents.executeJavaScript('(' + fnString + ')()', true);
}

// Tecleo real carácter a carácter sobre el elemento enfocado.
// Electron 38 exige `keyCode` además de `key` en sendInputEvent
// (sin keyCode rechaza el evento con 'Invalid event object').
async function typeReal(win, text) {
  for (const ch of text) {
    win.webContents.sendInputEvent({ type: 'keyDown', key: ch, keyCode: ch });
    win.webContents.sendInputEvent({ type: 'char', key: ch, keyCode: ch });
    win.webContents.sendInputEvent({ type: 'keyUp', key: ch, keyCode: ch });
    await sleep(15);
  }
}

async function typeInto(win, id, text) {
  await js(win, `function(){document.getElementById('${id}').focus();return true;}`);
  await sleep(120);
  await typeReal(win, text);
  await sleep(120);
  return js(win, `function(){var el=document.getElementById('${id}');return {value: el.value, active: document.activeElement===el};}`);
}

async function main() {
  // 1. Copia temporal del www real (sin modificarlo) + config placeholder.
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'www'), TMPWWW, { recursive: true });
  fs.writeFileSync(path.join(TMPWWW, 'firebase-config.js'),
    "// placeholder SOLO para el smoke test local 2.3.4\nwindow.FIREBASE_CONFIG = { apiKey: 'TU_API_KEY' };\n");
  console.log('[SMOKE-WRITE] www temporal en ' + TMPWWW);

  const win = new BrowserWindow({
    width: 1200, height: 900, title: 'Checklist de Soporte',
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  });
  // Handlers IPC iguales a main.js (la página los usa en render()):
  // getMachineId lo pide loadMachineId() en cada render().
  ipcMain.handle('desktop-get-machine-id', async () => 'smoke-machine-2.3.4');
  ipcMain.handle('desktop-open-external', async () => true);
  ipcMain.handle('desktop-detect', async () => ({}));
  await win.loadFile(path.join(TMPWWW, 'index.html'));
  win.focus();

  // Esperar a boot(): modo local -> mainApp visible, _authReady true.
  let ready = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    ready = await js(win, `function(){return {
      authReady: window._authReady, mainHidden: document.getElementById('mainApp').hidden,
      loginHidden: document.getElementById('loginView').hidden,
      hasDesktop: !!window.Desktop, cloudEnabled: (typeof CLOUD_ENABLED!=='undefined'?CLOUD_ENABLED:null),
      splashGone: !document.getElementById('splash')};}`);
    if (ready.authReady && !ready.mainHidden) break;
  }
  log('boot-modo-local', ready);
  if (!ready || !ready.authReady || ready.mainHidden) throw new Error('no llegó al modo local');

  // 2. Estado inicial de los campos (disabled/readonly/visibilidad/estilo).
  const baseline = await js(win, `function(){
    var ids=['fTipo','fMarca','fModelo','fSerie','fInv','fHostname','fTec','fUser','fArea','fCorreo'];
    var out={};
    ids.forEach(function(id){var el=document.getElementById(id);var cs=getComputedStyle(el);
      out[id]={disabled:el.disabled,readonly:el.readOnly,visible:!!el.offsetParent,
        pointerEvents:cs.pointerEvents,userSelect:cs.userSelect};});
    out.btnAddDisabled=document.getElementById('btnAdd').disabled;
    out.newBoxHidden=document.getElementById('newBox').hidden;
    return out;}`);
  log('campos-estado-inicial', baseline);

  // 3. Abrir Nuevo equipo y teclear de verdad en cada campo.
  await js(win, `function(){document.getElementById('btnShowNew').click();return true;}`);
  await sleep(400);
  const typed = {};
  typed.fMarca = await typeInto(win, 'fMarca', 'HP');
  typed.fModelo = await typeInto(win, 'fModelo', 'ProBook 440');
  typed.fSerie = await typeInto(win, 'fSerie', 'SERIE234');
  typed.fInv = await typeInto(win, 'fInv', 'INV-100');
  typed.fHostname = await typeInto(win, 'fHostname', 'PC-PRUEBA-234');
  typed.fTec = await typeInto(win, 'fTec', 'Tecnico Prueba');
  typed.fUser = await typeInto(win, 'fUser', 'Maria Prueba');
  typed.fArea = await typeInto(win, 'fArea', 'Soporte');
  typed.fCorreo = await typeInto(win, 'fCorreo', 'maria@empresa.com');
  // fTipo es <select>: cambiar por valor + evento change.
  await js(win, `function(){var s=document.getElementById('fTipo');s.value='Laptop';s.dispatchEvent(new Event('change',{bubbles:true}));return s.value;}`);
  const afterType = await js(win, `function(){return {
    btnAddDisabled: document.getElementById('btnAdd').disabled,
    hint: document.getElementById('saveHint').textContent,
    fTipo: document.getElementById('fTipo').value};}`);
  log('tecleo-real', { typed, afterType });
  await shot(win, 'smoke-write-2.3.4-form.png');

  // 4. Guardar y verificar persistencia.
  await js(win, `function(){document.getElementById('btnAdd').click();return true;}`);
  await sleep(600);
  const saved = await js(win, `function(){
    var raw=localStorage.getItem('checklist-soporte-v1');
    var st=raw?JSON.parse(raw):null;
    var ps=(st&&st.preparations)||[];
    return {n:ps.length, prep: ps[0]||null,
      listText: document.getElementById('list').innerText.slice(0,400),
      newBoxHidden: document.getElementById('newBox').hidden};}`);
  log('guardado-equipo-nuevo', saved);
  await shot(win, 'smoke-write-2.3.4-saved.png');
  if (saved.n !== 1) throw new Error('no se guardó el equipo (n=' + saved.n + ')');
  const p0 = saved.prep;
  const match = p0.equipo.marca === 'HP' && p0.equipo.modelo === 'ProBook 440' &&
    p0.equipo.serie === 'SERIE234' && p0.equipo.inventario === 'INV-100' &&
    p0.equipo.hostname === 'PC-PRUEBA-234' && p0.usuario.nombre === 'Maria Prueba' &&
    p0.usuario.area === 'Soporte' && p0.usuario.correo === 'maria@empresa.com' &&
    p0.tecnico === 'Tecnico Prueba' && p0.equipo.tipo === 'Laptop';
  log('datos-guardados-coinciden', { match, prep: p0 });
  if (!match) throw new Error('los datos guardados no coinciden con lo tecleado');

  // 5. Reasignación (panel grande, para todos los usuarios): elegir el
  // equipo guardado, verificar que 'Era de' se autorrellena y teclear
  // el nuevo usuario; guardar y verificar.
  await js(win, `function(){document.getElementById('btnShowRe').click();return true;}`);
  await sleep(400);
  const reOptions = await js(win, `function(){var s=document.getElementById('fReEquipo');
    return {n:s.options.length, texts:Array.from(s.options).map(function(o){return o.text;})};}`);
  log('reBox-opciones', reOptions);
  await js(win, `function(){var s=document.getElementById('fReEquipo');
    s.value=s.options[1].value; s.dispatchEvent(new Event('change',{bubbles:true})); return s.value;}`);
  await sleep(300);
  const reDeAuto = await js(win, `function(){return document.getElementById('fReDe').value;}`);
  log('reBox-era-de-autorrelleno', { fReDe: reDeAuto });
  const reTypedA = await typeInto(win, 'fReA', 'Nuevo Usuario Reasignado');
  log('reBox-tecleo-fReA', reTypedA);
  await shot(win, 'smoke-write-2.3.4-reassign.png');
  await js(win, `function(){document.getElementById('btnReGuardar').click();return true;}`);
  await sleep(600);
  const reSaved = await js(win, `function(){
    var st=JSON.parse(localStorage.getItem('checklist-soporte-v1'));
    var ps=st.preparations||[];
    return {n:ps.length, prep: ps[0]||null};}`);
  log('guardado-reasignacion', reSaved);
  const reMatch = reSaved.prep && reSaved.prep.usuario.nombre === 'Nuevo Usuario Reasignado' &&
    reSaved.prep.reasignaciones && reSaved.prep.reasignaciones.length === 1 &&
    reSaved.prep.reasignaciones[0].de === 'Maria Prueba' &&
    reSaved.prep.reasignaciones[0].a === 'Nuevo Usuario Reasignado';
  log('reasignacion-coincide', { reMatch });
  if (!reMatch) throw new Error('la reasignación no quedó guardada como se tecleó');

  // 6. Reasignación 'Otro equipo' (datos manuales).
  await js(win, `function(){document.getElementById('btnShowRe').click();return true;}`);
  await sleep(400);
  await js(win, `function(){var s=document.getElementById('fReEquipo');
    s.value='__nuevo__'; s.dispatchEvent(new Event('change',{bubbles:true})); return true;}`);
  await sleep(300);
  const otroVisible = await js(win, `function(){return !document.getElementById('reEquipoNuevo').hidden;}`);
  const oModelo = await typeInto(win, 'fReModelo', 'ThinkPad X1');
  const oSerie = await typeInto(win, 'fReSerie', 'OTRO999');
  const oA = await typeInto(win, 'fReA', 'Usuario Otro');
  log('reBox-otro-equipo', { otroVisible, oModelo, oSerie, oA });
  await js(win, `function(){document.getElementById('btnReGuardar').click();return true;}`);
  await sleep(600);
  const otroSaved = await js(win, `function(){
    var st=JSON.parse(localStorage.getItem('checklist-soporte-v1'));
    var ps=st.preparations||[];
    return {n:ps.length, segundo: ps[1]||null};}`);
  log('guardado-otro-equipo', otroSaved);
  const otroMatch = otroSaved.n === 2 && otroSaved.segundo &&
    otroSaved.segundo.equipo.modelo === 'ThinkPad X1' &&
    otroSaved.segundo.equipo.serie === 'OTRO999' &&
    otroSaved.segundo.usuario.nombre === 'Usuario Otro';
  log('otro-equipo-coincide', { otroMatch });
  if (!otroMatch) throw new Error('el "Otro equipo" no quedó guardado como se tecleó');

  console.log('[SMOKE-WRITE] RESULTADO ' + JSON.stringify(results, null, 2));
  console.log('[SMOKE-WRITE] OK: escritura, guardado y reasignación funcionan en Electron (modo local)');
  app.exit(0);
}

app.whenReady().then(main).catch((e) => {
  console.error('[SMOKE-WRITE] FALLO:', e && e.message ? e.message : e);
  console.log('[SMOKE-WRITE] RESULTADO-PARCIAL ' + JSON.stringify(results, null, 2));
  app.exit(2);
});
