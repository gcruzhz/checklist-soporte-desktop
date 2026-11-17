# -*- coding: utf-8 -*-
"""Adapta scripts/smoke-254-orden.js -> scripts/smoke-255-orden.js.
- Renombres 254->255, md5 del www 2.5.5, versiones 2.5.4->2.5.5.
- pdfFormatoOk: + carta (MediaBox 612 792, 1 pagina, Descripcion solo
  hostname, datos del equipo despues de Conclusion).
- Paso 3b: crear orden sin responsable/area por el formulario real
  (folio 00002, vista "Pendiente de firma").
- Paso 3c: campo faltante (hostname) queda en rojo + toast lo nombra.
- Paso 5b: renta — Exportar a Excel en Recibir/Entrega y seleccion
  en Entrega Renta (2 checkboxes + Seleccionar todos).
- Paso 4: vuelve a la orden 00001 (firmada) antes del PDF.
Uso: python3 scripts/patch_smoke_255.py
"""
import io

P = '/home/hatch/workspace/android/checklist-desktop/scripts/smoke-255-orden.js'
s = io.open(P, encoding='utf-8').read()
n0 = len(s)

def rep(old, new, cnt=1, tag=''):
    global s
    c = s.count(old)
    assert c == cnt, 'REP %s: esperado %d, hallado %d: %r' % (tag, cnt, c, old[:90])
    s = s.replace(old, new)

# --- cabecera ---
start = s.index('// Smoke test 2.5.4')
end = s.index("const { app, BrowserWindow, ipcMain } = require('electron');")
header = """// Smoke test 2.5.5 — Mantenimientos + renta.
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
//     solo con el hostname y los demás datos al final en Conclusión).
//   - Sin Capacitor (el real, plataforma web) pulsar "Generar PDF" de nuevo
//     descarga el PDF por <a> (will-download) y también es válido.
//   - Renta: el botón "Exportar a Excel" aparece en Recibir y Entrega
//     renta; en Entrega Renta hay un checkbox por equipo entregado +
//     "Seleccionar todos".
// Corre con el Electron de node_modules:
//   xvfb-run -a ./node_modules/.bin/electron --no-sandbox scripts/smoke-255-orden.js
// El www es el ./www del proyecto (copiado con node scripts/copy-www.js
// desde ../checklist-cloud/www, md5 verificado). firebase-config.js se
// sustituye por placeholder (modo local sin nube): el login real con
// Firebase NO se ejerce aquí; la sesión y la orden se siembran por
// executeJavaScript y los botones se pulsan con clics reales de ratón.
// Logs y capturas en docs/smoke-255-*.
'use strict';

"""
s = s[:start] + header + s[end:]

# --- renombres globales ---
rep('59c59866029bac73971aa7821c07bb01', '982773d2156b664e638fefa99618893e', tag='md5')
s = s.replace('SMOKE-254', 'SMOKE-255')
s = s.replace('smoke-254-', 'smoke-255-')
s = s.replace('smoke254', 'smoke255')
s = s.replace('signed254', 'signed255')
s = s.replace('2.5.4', '2.5.5')
s = s.replace('2.5.3', '2.5.4')

# --- pdfFormatoOk: checks de carta ---
rep("""  const nImg = (pdfStr.match(/\\/Subtype \\/Image/g) || []).length;
  return { faltan, nImg, imgsOk: nImg === 2 && pdfStr.indexOf('/Imtecnico Do') !== -1 && pdfStr.indexOf('/Imusuario Do') !== -1,
    ok: faltan.length === 0 && nImg === 2 };""",
"""  const nImg = (pdfStr.match(/\\/Subtype \\/Image/g) || []).length;
  const carta = pdfStr.indexOf('/MediaBox [0 0 612 792]') !== -1;
  const unaPagina = (pdfStr.match(/\\/Type \\/Page[^s]/g) || []).length === 1;
  const iDesc = pdfStr.indexOf('DESCRIPCIÓN DEL EQUIPO');
  const iHost = pdfStr.indexOf('Hostname: PC-01');
  const iCond = pdfStr.indexOf('CONDICIONES GENERALES');
  const iConcl = pdfStr.indexOf('CONCLUSIÓN Y/O COMENTARIOS');
  const soloHost = iDesc !== -1 && iHost > iDesc && iHost < iCond;
  const datosAlFinal = iConcl !== -1 && pdfStr.indexOf('Dell') > iConcl && pdfStr.indexOf('Serie: S1, Modelo:') > iConcl;
  return { faltan, nImg, imgsOk: nImg === 2 && pdfStr.indexOf('/Imtecnico Do') !== -1 && pdfStr.indexOf('/Imusuario Do') !== -1,
    carta, unaPagina, soloHost, datosAlFinal,
    ok: faltan.length === 0 && nImg === 2 && carta && unaPagina && soloHost && datosAlFinal };""", tag='pdfFormatoOk')

# --- seed: stubs asignarFolio + upsertMant (la nube real no se ejerce) ---
rep("""    window.Cloud.getMantenimiento = async function (id) { return window.__signed255; };""",
"""    window.Cloud.getMantenimiento = async function (id) { return window.__signed255; };
    window.Cloud.asignarFolio = async function () { return '00002'; };
    window.Cloud.upsertMant = async function () { return {}; };""", tag='seed-stubs')

# --- pasos 3b y 3c antes del paso 4 ---
pasos = """  // 3b. Crear orden SIN responsable ni área por el formulario real:
  // abrir el formulario, llenar serie/hostname/modelo/título/falla/
  // descripción/fecha/WhatsApp + firma del técnico, dejar área y
  // responsable vacíos y pulsar "Crear orden" (clic real). Debe crearse
  // con folio 00002 y la vista debe decir "Pendiente de firma".
  const openForm255 = await mouseClick(win, '#btnMantNuevo');
  if (!openForm255.clicked) await js(win, `function(){ mantOpenForm(null, null); return true; }`);
  await js(win, `function(){
    document.getElementById('fM-serie').value = 'S-255';
    document.getElementById('fM-hostname').value = 'PC-255';
    document.getElementById('fM-modelo').value = 'ProBook 255';
    document.getElementById('fM-titulo').value = 'Caso smoke 255';
    document.getElementById('fM-tipoFalla').value = 'Software';
    document.getElementById('fM-descEquipo').value = 'Laptop smoke';
    document.getElementById('fM-fechaServ').value = '2026-11-16';
    document.getElementById('fM-whatsapp').value = '5512345678';
    window.mantFirmaData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=';
    return { area: document.getElementById('fM-area').value, resp: document.getElementById('fM-responsable').value };}`);
  const clickCrear255 = await mouseClick(win, '#btnMantCrear');
  await sleep(800);
  const creada255 = await js(win, `function(){
    var m = mantenimientos.find(function (x) { return x.equipo && x.equipo.serie === 'S-255'; });
    return { existe: !!m, folio: m ? m.folio : null, estado: m ? m.estado : null,
      resp: m ? m.responsable : null, area: m ? m.area : null,
      body: document.getElementById('mantOrderBody').innerHTML,
      toast: (document.getElementById('toast').textContent||'') };}`);
  log('3b-crear-sin-responsable', { openForm255, clickCrear255, creada255 });
  const crearOk = clickCrear255.clicked === true && creada255.existe === true &&
    creada255.folio === '00002' && creada255.estado === 'creada' &&
    creada255.resp === '' && creada255.area === '' &&
    creada255.body.indexOf('Pendiente de firma') !== -1 &&
    creada255.toast.indexOf('Orden de servicio creada con folio 00002.') !== -1;

  // 3c. Campo obligatorio faltante en rojo: abrir el formulario, llenar
  // todo menos el hostname y pulsar "Crear orden". El hostname queda con
  // la clase campo-falta y el toast lo nombra; la orden no se crea.
  await js(win, `function(){ mantOpenForm(null, null);
    document.getElementById('fM-serie').value = 'S-255B';
    document.getElementById('fM-modelo').value = 'ProBook 255B';
    document.getElementById('fM-titulo').value = 'Caso smoke 255B';
    document.getElementById('fM-tipoFalla').value = 'Software';
    document.getElementById('fM-descEquipo').value = 'Laptop smoke B';
    document.getElementById('fM-fechaServ').value = '2026-11-16';
    document.getElementById('fM-whatsapp').value = '5512345678';
    window.mantFirmaData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=';
    return true;}`);
  const clickCrearRojo = await mouseClick(win, '#btnMantCrear');
  await sleep(600);
  const rojo255 = await js(win, `function(){return {
    hostRojo: document.getElementById('fM-hostname').classList.contains('campo-falta'),
    serieRojo: document.getElementById('fM-serie').classList.contains('campo-falta'),
    toast: (document.getElementById('toast').textContent||''),
    n: mantenimientos.length };}`);
  log('3c-campo-en-rojo', { clickCrearRojo, rojo255 });
  const rojoOk = clickCrearRojo.clicked === true && rojo255.hostRojo === true &&
    rojo255.serieRojo === false && rojo255.toast.indexOf('hostname') !== -1 && rojo255.n === 2;

"""
rep("  // 4. Instalar los stubs de Capacitor (teléfono Android) y pulsar",
    pasos + "  // 4. Instalar los stubs de Capacitor (teléfono Android) y pulsar", tag='pasos-3b-3c')

# --- paso 4: volver a la orden 00001 (firmada) antes del PDF ---
rep("""  // 4. Instalar los stubs de Capacitor (teléfono Android) y pulsar
  // "Generar PDF" (clic real): debe escribir en DOCUMENTS y abrirlo.""",
"""  // 4. Volver a la orden 00001 (firmada en el paso 3) para el PDF y
  // pulsar "Generar PDF" (clic real): debe escribir en DOCUMENTS y abrirlo.
  await js(win, `function(){ mantShowOrder('smoke255'); return mantOrderId; }`);
  await sleep(400);
  // 4. Instalar los stubs de Capacitor (teléfono Android) y pulsar
  // "Generar PDF" (clic real): debe escribir en DOCUMENTS y abrirlo.""", tag='paso4-restore')

# --- paso 5b: renta, antes del paso 6 ---
renta = """  // 5b. Renta (puntos 6 y 7): el botón "Exportar a Excel" aparece en
  // Recibir y Entrega renta; en Entrega Renta hay un checkbox por equipo
  // entregado + "Seleccionar todos" y el contador dice sin selección.
  const renta255 = await js(win, `function(){
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
  log('5b-renta-exportar-seleccion', renta255);
  const rentaOk = renta255.rec.texto.indexOf('Exportar a Excel') !== -1 && renta255.rec.deshab === false &&
    renta255.forTexto.indexOf('Exportar a Excel') !== -1 && renta255.forDeshab === false &&
    renta255.checks === 2 && renta255.selTodos === true &&
    renta255.selInfo.indexOf('Sin selección: se exportan/comparten todos los entregados (2)') !== -1;

"""
rep("  // 6. Foco final + errores JS (se ignoran los ya conocidos del 251:",
    renta + "  // 6. Foco final + errores JS (se ignoran los ya conocidos del 251:", tag='paso-5b')

# --- veredicto final ---
rep("  const ok = selectorOk && seedOk && actOk && capOk && pdfCap.ok && webOk &&",
    "  const ok = selectorOk && seedOk && actOk && crearOk && rojoOk && capOk && pdfCap.ok && webOk && rentaOk &&", tag='veredicto')

io.open(P, 'w', encoding='utf-8').write(s)
print('OK patch smoke 255: %d -> %d caracteres' % (n0, len(s)))
