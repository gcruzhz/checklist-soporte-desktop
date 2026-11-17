// Smoke test 2.5.3 — Orden en Entregados:
//   Por preparar -> pestaña Entregados: el recién entregado aparece
//   HASTA ARRIBA (deliveredAt descendente), no hasta abajo.
//   - No-admin: propios primero, deliveredAt desc dentro de cada grupo.
//   - Admin: deliveredAt desc plano, sin agrupar.
//   - En preparación y Listos conservan createdAt ascendente.
//   - Búsqueda XTEST en Entregados sigue filtrando.
// Corre con el Electron de node_modules:
//   xvfb-run -a ./node_modules/.bin/electron --no-sandbox scripts/smoke-253-orden.js
// El www es el ./www del proyecto (copiado con node scripts/copy-www.js
// desde ../checklist-cloud/www, md5 verificado). firebase-config.js se
// sustituye por placeholder (modo local sin nube, como los smokes
// 2.3.4/2.3.5/2.3.8/2.4.0/2.5.1/2.5.2): el login real con Firebase NO se
// ejerce aquí; la sesión y los equipos se siembran por executeJavaScript
// y las pestañas se pulsan con clics reales de ratón.
// El tecleo XTEST es a nivel SO (como en 2.4.0/2.5.1/2.5.2): xtest-type.py
// no teclea mayúsculas ni @ . - ; los textos son solo minúsculas y dígitos,
// y la comparación es exacta contra lo enviado.
// Logs y capturas en docs/smoke-253-*.
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TMP = '/home/hatch/workspace/tmp/smoke253/run';
const TMPWWW = path.join(TMP, 'www');
const SHOTDIR = path.join(ROOT, 'docs');
const EXPECTED_WWW_MD5 = '4042e1451131e22fe7f56f53f3f34955';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (typeof process.getuid === 'function' && process.getuid() === 0) {
  app.commandLine.appendSwitch('no-sandbox');
}
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.setPath('userData', path.join(TMP, 'userData'));

const results = {};
function log(step, obj) {
  results[step] = obj;
  console.log('[SMOKE-253] ' + step + ' ' + JSON.stringify(obj));
}
async function shot(win, name) {
  const p = path.join(SHOTDIR, name);
  const image = await win.webContents.capturePage();
  fs.writeFileSync(p, image.toPNG());
  console.log('[SMOKE-253] captura ' + p);
  return p;
}
async function js(win, fnString) {
  return win.webContents.executeJavaScript('(' + fnString + ')()', true);
}
function typeXtest(text) {
  return new Promise((resolve) => {
    execFile('python3', [path.join(ROOT, 'scripts', 'xtest-type.py'), 'Checklist', text],
      { env: process.env, timeout: 30000 },
      (err, stdout) => resolve({ err: err ? String(err.message || err).slice(0, 150) : null, out: (stdout || '').trim().slice(0, 300) }));
  });
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

// Orden de modelos en #list (índices en innerHTML): el primero es el de arriba.
function ordenEnLista(html, modelos) {
  const idx = modelos.map(function (m) { return html.indexOf(m); });
  return { idx, todosPresentes: idx.every(function (i) { return i !== -1; }),
    enOrden: idx.every(function (v, i, a) { return i === 0 || a[i - 1] < v; }) };
}

async function main() {
  // 0. www del ./www del proyecto (copiado con copy-www.js): md5 verificado.
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'www'), TMPWWW, { recursive: true });
  const idxMd5 = crypto.createHash('md5').update(fs.readFileSync(path.join(TMPWWW, 'index.html'))).digest('hex');
  log('0-www-origen', { src: 'proyecto-www', md5: idxMd5, esperado: EXPECTED_WWW_MD5, coincide: idxMd5 === EXPECTED_WWW_MD5 });
  if (idxMd5 !== EXPECTED_WWW_MD5) throw new Error('md5 del www no coincide con 2.5.3: ' + idxMd5);
  fs.writeFileSync(path.join(TMPWWW, 'firebase-config.js'),
    "// placeholder SOLO para el smoke test local 2.5.3\nwindow.FIREBASE_CONFIG = { apiKey: 'TU_API_KEY' };\n");
  const preloadPath = path.join(ROOT, 'preload.js');
  log('0-preload', { preloadPath });

  const win = new BrowserWindow({
    width: 1200, height: 800, title: 'Checklist de Soporte',
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  ipcMain.handle('desktop-get-machine-id', async () => 'SERIE-SMOKE-253');
  ipcMain.handle('desktop-open-external', async () => true);
  const consoleErrs = [];
  win.webContents.on('console-message', (e, level, msg) => {
    if (level === 2 || /error/i.test(msg)) consoleErrs.push(msg);
  });
  await win.loadFile(path.join(TMPWWW, 'index.html'));
  win.focus();

  // 1. Arranque en modo local: selector de sección al abrir, versión 2.5.3.
  let ready = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    ready = await js(win, `function(){return {
      authReady: window._authReady, mainHidden: document.getElementById('mainApp').hidden,
      inicioHidden: document.getElementById('viewInicio').hidden,
      inicioText: (document.getElementById('viewInicio').innerText||''),
      versionText: (document.body.textContent||'').indexOf('2.5.3')!==-1,
      sin253vieja: (document.body.textContent||'').indexOf('2.5.2')===-1,
      splashInDom: !!document.getElementById('splash')};}`);
    if (ready.authReady && !ready.mainHidden) break;
  }
  log('1-boot-selector', ready);
  if (!ready || !ready.authReady || ready.mainHidden) throw new Error('no llegó al modo local');
  const selectorOk = !ready.inicioHidden &&
    ready.versionText === true && ready.sin253vieja === true &&
    ready.inicioText.indexOf('Por preparar') !== -1 &&
    ready.inicioText.indexOf('Recibir renta') !== -1 &&
    ready.inicioText.indexOf('Entrega Renta') !== -1 &&
    ready.inicioText.indexOf('Mantenimientos Preventivos') !== -1;
  log('1b-selector-4-secciones', { selectorOk });
  await sleep(2500);
  await js(win, `function(){window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message));});return true;}`);
  await shot(win, 'smoke-253-inicio.png');

  // 2. Ir a Por preparar y sembrar la sesión + 6 equipos: 4 entregados
  // (2 propios + 2 ajenos, con createdAt y deliveredAt cruzados) y 2 en
  // preparación. El orden viejo (createdAt asc) daría otro resultado en
  // Entregados, así que la prueba distingue el cambio 2.5.3.
  const goPrep = await mouseClick(win, '#btnGoPreparar');
  await sleep(400);
  const seed = await js(win, `function(){
    window.CLOUD_ENABLED = true;
    window.cloudUser = { uid: 'u1', email: 'gerardo@smoke.local', nombre: 'Gerardo' };
    window.cloudRole = 'usuario';
    window.showOthers = true;
    window.adminViewUid = 'todos';
    window.searchText = '';
    var T = Date.now();
    function mk(id, created, delivered, ready, tecUid, tec, modelo) {
      return { id: id, createdAt: created, deliveredAt: delivered, readyAt: ready,
        checks: {}, extraItems: [], reasignaciones: [],
        equipo: { tipo: 'Laptop', marca: 'Dell', modelo: modelo, serie: 'S-' + id, inventario: '1' },
        usuario: { nombre: 'Ana', area: 'Sistemas', correo: '' },
        tecnico: tec, tecnicoUid: tecUid };
    }
    state.preparations = [
      mk('d253-own-old', T-500000, T-100000, T-150000, 'u1', 'Gerardo', 'ModeloPropioViejo253'),
      mk('d253-for-new', T-400000, T-50000, T-100000, 'uAxel', 'Axel Danyael', 'ModeloAjenoNuevo253'),
      mk('d253-own-new', T-300000, T-300000, T-350000, 'u1', 'Gerardo', 'ModeloPropioNuevo253'),
      mk('d253-for-old', T-200000, T-200000, T-250000, 'uAxel', 'Axel Danyael', 'ModeloAjenoViejo253'),
      mk('p253-a', T-300000, null, null, 'u1', 'Gerardo', 'ModeloPrepViejo253'),
      mk('p253-b', T-100000, null, null, 'u1', 'Gerardo', 'ModeloPrepNuevo253'),
    ];
    render();
    return { n: state.preparations.length, role: window.cloudRole,
      showOthers: window.showOthers, todos: currentList().map(function (p) { return p.id; }) };}`);
  log('2-ir-preparar-siembra', { goPrep, seed });
  await shot(win, 'smoke-253-preparar.png');
  const seedOk = goPrep.clicked === true && seed.n === 6 && seed.todos.length === 6;

  // 3. Pestaña Entregados (clic real en el chip): no-admin, propios
  // primero y deliveredAt desc en cada grupo. El ajeno entregado hace
  // minutos (el más reciente de todos) NO sube por encima de los propios.
  const clickEntregados = await mouseClick(win, '[data-f="entregado"]');
  await sleep(400);
  const entr = await js(win, `function(){var h=document.getElementById('list').innerHTML;
    return { filterStatus: filterStatus,
      ids: currentList().map(function (p) { return p.id; }),
      html: h };}`);
  log('3-entregados-noadmin', { clickEntregados, ids: entr.ids, filterStatus: entr.filterStatus });
  await shot(win, 'smoke-253-entregados.png');
  const idsEntrOk = entr.ids.join(',') === 'd253-own-old,d253-own-new,d253-for-new,d253-for-old';
  const pantallaEntr = ordenEnLista(entr.html,
    ['ModeloPropioViejo253', 'ModeloPropioNuevo253', 'ModeloAjenoNuevo253', 'ModeloAjenoViejo253']);
  log('3b-entregados-orden-pantalla', { idsEntrOk, pantallaEntr });

  // 4. Pestaña En preparación (clic real): conserva createdAt asc.
  const clickPrep = await mouseClick(win, '[data-f="preparacion"]');
  await sleep(400);
  const prep = await js(win, `function(){var h=document.getElementById('list').innerHTML;
    return { filterStatus: filterStatus,
      ids: currentList().map(function (p) { return p.id; }), html: h };}`);
  log('4-preparacion-asc', { clickPrep, ids: prep.ids, filterStatus: prep.filterStatus });
  await shot(win, 'smoke-253-preparacion.png');
  const idsPrepOk = prep.ids.join(',') === 'p253-a,p253-b';
  const pantallaPrep = ordenEnLista(prep.html, ['ModeloPrepViejo253', 'ModeloPrepNuevo253']);
  log('4b-preparacion-orden-pantalla', { idsPrepOk, pantallaPrep });

  // 5. Admin en Entregados: deliveredAt desc plano, sin agrupar.
  await js(win, `function(){window.cloudRole='admin'; return true;}`);
  const clickEntregadosAdmin = await mouseClick(win, '[data-f="entregado"]');
  await sleep(400);
  const entrAdmin = await js(win, `function(){var h=document.getElementById('list').innerHTML;
    return { filterStatus: filterStatus, role: window.cloudRole,
      ids: currentList().map(function (p) { return p.id; }), html: h };}`);
  log('5-entregados-admin', { clickEntregadosAdmin, role: entrAdmin.role, ids: entrAdmin.ids, filterStatus: entrAdmin.filterStatus });
  await shot(win, 'smoke-253-admin.png');
  const idsAdminOk = entrAdmin.ids.join(',') === 'd253-for-new,d253-own-old,d253-for-old,d253-own-new';
  const pantallaAdmin = ordenEnLista(entrAdmin.html,
    ['ModeloAjenoNuevo253', 'ModeloPropioViejo253', 'ModeloAjenoViejo253', 'ModeloPropioNuevo253']);
  log('5b-admin-orden-pantalla', { idsAdminOk, pantallaAdmin });

  // 6. Búsqueda XTEST en Entregados: solo queda el equipo buscado.
  const tSearch = await clickTypeXTEST(win, '#search', 'modelopropionuevo253');
  await sleep(400);
  const busq = await js(win, `function(){var h=document.getElementById('list').innerHTML;
    return { searchText: searchText, filterStatus: filterStatus,
      soloNuevo: h.indexOf('ModeloPropioNuevo253') !== -1,
      sinViejo: h.indexOf('ModeloPropioViejo253') === -1,
      sinAjenos: h.indexOf('ModeloAjenoNuevo253') === -1 && h.indexOf('ModeloAjenoViejo253') === -1,
      nCards: (h.match(/class="card"/g) || []).length };}`);
  log('6-XTEST-busqueda', { tSearch, busq });
  await shot(win, 'smoke-253-busqueda.png');

  // 7. Foco final + errores JS (se ignoran los ya conocidos del 251:
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
  log('7-foco-errores', { finalFocus, consoleErrs: consoleErrs.slice(0, 8), consoleNuevos, errsNuevos });

  const ok = selectorOk && seedOk &&
    clickEntregados.clicked === true && entr.filterStatus === 'entregado' &&
    idsEntrOk && pantallaEntr.todosPresentes && pantallaEntr.enOrden &&
    clickPrep.clicked === true && prep.filterStatus === 'preparacion' &&
    idsPrepOk && pantallaPrep.todosPresentes && pantallaPrep.enOrden &&
    clickEntregadosAdmin.clicked === true && entrAdmin.filterStatus === 'entregado' &&
    entrAdmin.role === 'admin' &&
    idsAdminOk && pantallaAdmin.todosPresentes && pantallaAdmin.enOrden &&
    tSearch.ok === true && busq.soloNuevo && busq.sinViejo && busq.sinAjenos &&
    consoleNuevos.length === 0 && errsNuevos.length === 0;
  console.log('[SMOKE-253] RESULTADO ' + JSON.stringify(results, null, 2));
  console.log('[SMOKE-253] VEREDICTO ' + (ok ? 'OK' : 'FALLO'));
  app.exit(ok ? 0 : 1);
}

app.whenReady().then(main).catch((e) => {
  console.error('[SMOKE-253] FALLO:', e && e.message ? e.message : e);
  console.log('[SMOKE-253] RESULTADO-PARCIAL ' + JSON.stringify(results, null, 2));
  app.exit(2);
});
