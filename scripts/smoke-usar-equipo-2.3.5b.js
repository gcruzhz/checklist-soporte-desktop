// Variante B del smoke USAR-EQUIPO 2.3.5: página LARGA (8 equipos guardados,
// como la app real de Gerardo) + clics de RATÓN reales (sendInputEvent) en
// vez de el.focus(). Comprueba: tras "Usar este equipo" ¿dónde queda el
// viewport (scrollY)? ¿los campos quedan visibles y el clic de ratón les
// da el foco? ¿teclear con el ratón funciona? También pulsa Usar deprisa
// (150 ms tras abrir el panel, con el scrollIntoView suave aún animando).
// Misma base que smoke-usar-equipo-2.3.5.js (www temporal en /tmp, local).
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const TMP = '/tmp/checklist-smoke-usar-2.3.5b';
const TMPWWW = path.join(TMP, 'www');
const SHOTDIR = process.env.CHECKLIST_DESKTOP_SMOKE_SHOT_DIR || path.join(ROOT, 'docs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (typeof process.getuid === 'function' && process.getuid() === 0) {
  app.commandLine.appendSwitch('no-sandbox');
}
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.setPath('userData', path.join(TMP, 'userData'));

const results = {};
function log(step, obj) {
  results[step] = obj;
  console.log('[SMOKE-USAR-B] ' + step + ' ' + JSON.stringify(obj));
}
async function shot(win, name) {
  const p = path.join(SHOTDIR, name);
  const image = await win.webContents.capturePage();
  fs.writeFileSync(p, image.toPNG());
  console.log('[SMOKE-USAR-B] captura ' + p);
  return p;
}
async function js(win, fnString) {
  return win.webContents.executeJavaScript('(' + fnString + ')()', true);
}
async function typeReal(win, text) {
  for (const ch of text) {
    win.webContents.sendInputEvent({ type: 'keyDown', key: ch, keyCode: ch });
    win.webContents.sendInputEvent({ type: 'char', key: ch, keyCode: ch });
    win.webContents.sendInputEvent({ type: 'keyUp', key: ch, keyCode: ch });
    await sleep(15);
  }
}
// Clic de ratón real en el centro del elemento (coords de viewport).
async function mouseClick(win, selector) {
  const r = await js(win, `function(){var el=document.querySelector('${selector}');
    if(!el) return null; var b=el.getBoundingClientRect();
    return {x: Math.round(b.left+b.width/2), y: Math.round(b.top+b.height/2),
      top: Math.round(b.top), inViewport: b.top>=0 && b.bottom<=window.innerHeight};}`);
  if (!r) return { clicked: false, reason: 'sin elemento' };
  win.webContents.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await sleep(150);
  const active = await js(win, `function(){var a=document.activeElement;
    return {active: a?(a.id||a.tagName):null, scrollY: Math.round(window.scrollY)};}`);
  return { clicked: true, rect: r, after: active };
}

const DETECTED = {
  id: 'SERIE-DETECTADA-1', machineId: 'SERIE-DETECTADA-1',
  hostname: 'PC-GERARDO', marca: 'HP', modelo: 'ProBook 440 G9',
  serie: '5CD1234ABC', cpu: 'Intel Core i5-1235U', ramGB: 16, discoGB: 512,
  discoTipo: 'SSD', so: 'Windows 11 Pro 24H2', tipo: 'Laptop',
  mac: 'AA:BB:CC:DD:EE:FF', ip: '192.168.1.45', ipTipo: 'Dinámica',
  detectadoEn: Date.now(), detectadoPor: 'Gerardo', usado: false,
  checks: { t3: true, t4: true, t18: true },
  detalles: {}, versiones: { so: 'Windows 11 Pro 24H2' },
  anydeskId: '', anydeskAlias: '',
};

async function main() {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'www'), TMPWWW, { recursive: true });
  fs.writeFileSync(path.join(TMPWWW, 'firebase-config.js'),
    "// placeholder SOLO para el smoke test local 2.3.5b\nwindow.FIREBASE_CONFIG = { apiKey: 'TU_API_KEY' };\n");

  const win = new BrowserWindow({
    width: 1200, height: 800, title: 'Checklist de Soporte',
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  });
  ipcMain.handle('desktop-get-machine-id', async () => 'SERIE-DETECTADA-1');
  ipcMain.handle('desktop-open-external', async () => true);
  ipcMain.handle('desktop-detect', async () => DETECTED);
  await win.loadFile(path.join(TMPWWW, 'index.html'));
  win.focus();

  let ready = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    ready = await js(win, `function(){return {authReady: window._authReady, mainHidden: document.getElementById('mainApp').hidden};}`);
    if (ready.authReady && !ready.mainHidden) break;
  }
  if (!ready || !ready.authReady || ready.mainHidden) throw new Error('no llegó al modo local');
  await sleep(2500);

  // 1. Sembrar 8 equipos guardados (página larga) + 1 detectado.
  const seeded = await js(win, `function(){
    var mk=function(i){return {id:'id-seed-'+i, createdAt: Date.now()-i*86400000, deliveredAt:null, readyAt:null,
      checks:{}, extraItems:[], reasignaciones:[], autoDetectado:[],
      versiones:{so:'',antivirus:'',chrome:''},
      equipo:{tipo:'Laptop',marca:'HP',modelo:'ProBook 440 '+i,serie:'SERIE00'+i,inventario:'INV-00'+i,hostname:'PC-00'+i,cpu:'',ramGB:'',discoGB:'',discoTipo:'',ip:'',ipTipo:'',anydeskId:'',anydeskAlias:'',fotoSerie:null},
      usuario:{nombre:'Usuario '+i,area:'Soporte',correo:'u'+i+'@empresa.com'}, tecnico:'Gerardo'};};
    for(var i=0;i<8;i++) state.preparations.push(mk(i));
    save(); render();
    detectados = [${JSON.stringify(DETECTED)}]; renderDetectados();
    return {nPreps: state.preparations.length, docH: document.documentElement.scrollHeight,
      winH: window.innerHeight, scrollY: Math.round(window.scrollY)};}`);
  log('pagina-larga-sembrada', seeded);

  // 2. Abrir el panel de detectados con clic de ratón real y pulsar Usar
  // deprisa (150 ms), con el scrollIntoView suave aún en curso.
  const clickDet = await mouseClick(win, '#btnShowDet');
  log('clic-raton-btnShowDet', clickDet);
  await sleep(150);
  const beforeUse = await js(win, `function(){return {scrollY: Math.round(window.scrollY),
    detBoxHidden: document.getElementById('detBox').hidden};}`);
  const clickUse = await mouseClick(win, '[data-det-use]');
  log('clic-raton-usar-este-equipo', { beforeUse, clickUse });
  await sleep(600); // dejar que termine cualquier scroll suave
  const afterUse = await js(win, `function(){
    var r=function(id){var b=document.getElementById(id).getBoundingClientRect();
      return {top: Math.round(b.top), bottom: Math.round(b.bottom), inViewport: b.top>=0 && b.bottom<=window.innerHeight};};
    return {detBoxHidden: document.getElementById('detBox').hidden,
      newBoxHidden: document.getElementById('newBox').hidden,
      scrollY: Math.round(window.scrollY), docH: document.documentElement.scrollHeight,
      fModelo: document.getElementById('fModelo').value,
      fInvRect: r('fInv'), fUserRect: r('fUser'), fAreaRect: r('fArea'), fCorreoRect: r('fCorreo'),
      btnAddDisabled: document.getElementById('btnAdd').disabled};}`);
  log('tras-usar-pagina-larga', afterUse);
  await shot(win, 'smoke-usar-equipo-2.3.5b-form.png');

  // 3. Clic de ratón real en fInv (si está fuera del viewport, primero
  // scroll manual como haría el usuario) y tecleo real.
  let invClick;
  if (!afterUse.fInvRect.inViewport) {
    await js(win, `function(){document.getElementById('fInv').scrollIntoView({block:'center'});return true;}`);
    await sleep(400);
  }
  invClick = await mouseClick(win, '#fInv');
  log('clic-raton-fInv', invClick);
  await typeReal(win, 'INV-888');
  await sleep(120);
  const invVal = await js(win, `function(){var el=document.getElementById('fInv');
    return {value: el.value, active: document.activeElement===el};}`);
  log('tecleo-fInv-con-raton', invVal);
  // fUser / fArea / fCorreo con focus() + tecleo real (como en el smoke A).
  const typed = {};
  for (const [id, text] of [['fUser', 'Maria Prueba'], ['fArea', 'Soporte'], ['fCorreo', 'maria@empresa.com']]) {
    await js(win, `function(){document.getElementById('${id}').focus();return true;}`);
    await sleep(120);
    await typeReal(win, text);
    await sleep(120);
    typed[id] = await js(win, `function(){var el=document.getElementById('${id}');return {value: el.value, active: document.activeElement===el};}`);
  }
  log('tecleo-resto-campos', typed);
  await js(win, `function(){document.getElementById('btnAdd').click();return true;}`);
  await sleep(600);
  const saved = await js(win, `function(){
    var st=JSON.parse(localStorage.getItem('checklist-soporte-v1'));
    var last=st.preparations[st.preparations.length-1];
    return {n: st.preparations.length, last: last};}`);
  const ok = saved.last && saved.last.equipo.inventario === 'INV-888' &&
    saved.last.usuario.nombre === 'Maria Prueba' && saved.last.usuario.area === 'Soporte' &&
    saved.last.usuario.correo === 'maria@empresa.com' &&
    saved.last.equipo.modelo === 'ProBook 440 G9';
  log('guardado-pagina-larga', { ok, saved });
  if (!ok) throw new Error('el guardado en página larga no coincide');
  await shot(win, 'smoke-usar-equipo-2.3.5b-saved.png');

  console.log('[SMOKE-USAR-B] RESULTADO ' + JSON.stringify(results, null, 2));
  console.log('[SMOKE-USAR-B] OK: con página larga y clics de ratón reales, fInv/fUser/fArea/fCorreo se editan y se guardan');
  app.exit(0);
}

app.whenReady().then(main).catch((e) => {
  console.error('[SMOKE-USAR-B] FALLO:', e && e.message ? e.message : e);
  console.log('[SMOKE-USAR-B] RESULTADO-PARCIAL ' + JSON.stringify(results, null, 2));
  app.exit(2);
});
