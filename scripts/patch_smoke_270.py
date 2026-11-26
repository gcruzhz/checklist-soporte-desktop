# Humo de escritorio 2.5.20: smoke-269-formatos.js -> smoke-270-formatos.js.
# Cambios: Acuse SIN folio (formulario, PDF, tarjeta, correo,
# Limpiar); botón Imprimir en Carta y Acuse (formulario y lista:
# crea el iframe oculto del PDF — la llamada a print() del diálogo
# del sistema no se ejerce aquí porque abriría el diálogo nativo;
# los tests node 270E/F la verifican con un iframe simulado);
# marcas de dedupe en el código (16). El resto del flujo es el
# mismo de 2.5.19. Corre con el Electron de node_modules:
#   xvfb-run -a ./node_modules/.bin/electron --no-sandbox scripts/smoke-270-formatos.js
# Uso: python3 patch_smoke_270.py (corre desde scripts/ o con rutas absolutas)
import os
import shutil

BASE = '/home/hatch/workspace/android/checklist-desktop/scripts'
SRC = os.path.join(BASE, 'smoke-269-formatos.js')
P = os.path.join(BASE, 'smoke-270-formatos.js')
WWW_MD5 = 'd0ae3c865687cd54bc33cd62410ebf31'

shutil.copyfile(SRC, P)
s = open(P, encoding='utf-8').read()


def rep(old, new, n=1):
    global s
    c = s.count(old)
    assert c == n, 'NO ENCONTRADO x%d (esperado %d): %r' % (c, n, old[:120])
    s = s.replace(old, new)


def repall(old, new):
    global s
    c = s.count(old)
    print('repall %r: %d' % (old[:50], c))
    s = s.replace(old, new)


# --- Renombres 269 -> 270 y versión 2.5.19 -> 2.5.20.
repall('SMOKE269', 'SMOKE270')
repall('smoke269', 'smoke270')
repall('SMOKE-269', 'SMOKE-270')
repall('mailto269', 'mailto270')
repall('opened269', 'opened270')
repall('tabs269', 'tabs270')
repall('msg269', 'msg270')
repall('src269', 'src270')
repall('2.5.19', '2.5.20')
repall('2.5.18', '2.5.19')
rep("const EXPECTED_WWW_MD5 = '97917c56481ed4a7d913505195a5ac0a';",
    "const EXPECTED_WWW_MD5 = '" + WWW_MD5 + "';")
# (El mensaje de error del md5 ya dice 2.5.20 por el repall de arriba.)

# --- Cabecera: descripción 2.5.20.
old_head = s[:s.index("const { app, BrowserWindow, ipcMain }")]
new_head = """// Smoke test 2.5.20 — Acuse SIN folio (el formato original no lo
// lleva; 2.5.18 lo agregó por error); sin duplicados en «Cartas/Acuses
// guardados» (dedupe por id y por folio + guarda en curso); botón
// «🖨️ Imprimir» en Carta y Acuse (formulario y lista) que abre el PDF
// en un iframe oculto y llama a print().
// La Carta SÍ conserva su folio en todos lados (formulario, PDF,
// tarjeta, WhatsApp/correo). El resto del flujo (guardado, PDF,
// WhatsApp, correo, reabrir, limpiar, eliminar) es el mismo de 2.5.19.
//   - Inicio trae los 2 botones (#btnGoAcuse, #btnGoCarta) y la
//     versión 2.5.20 (sin 2.5.19).
//   - Acuse: SIN campo de folio en el formulario (nada de «Se asigna
//     al abrir» ni de consumir números); guardar avisa «Acuse
//     guardado.» sin folio; la tarjeta no muestra folio; el PDF no
//     lleva la línea FOLIO:; el correo no lleva folio en el cuerpo;
//     Limpiar vacía sin asignar nada.
//   - Carta: al abrir ya trae folio 00001 (secuencia independiente);
//     PDF FO-SI-10 de 2 páginas con DATOS DEL SOLICITANTE en celdas
//     con borde, «Área:» y «Jefe Directo:» CADA UNO en su propia caja
//     apilada (x=410 w=166 h=22, dos rectángulos iguales), y tabla
//     Exclusivo de Sistemas verde con divisores verticales.
//   - Imprimir: el botón del formulario y el de la tarjeta crean el
//     iframe oculto del PDF (src blob:stub en este humo, donde
//     createObjectURL está simulado); la llamada a print() del
//     diálogo del sistema se verifica en los tests node 270E/F.
// Corre con el Electron de node_modules:
//   xvfb-run -a ./node_modules/.bin/electron --no-sandbox scripts/smoke-270-formatos.js
// El www es el ./www del proyecto (copiado con node scripts/copy-www.js
// desde ../checklist-cloud/www, md5 verificado). firebase-config.js se
// sustituye por placeholder (modo local sin nube): el login real con
// Firebase NO se ejerce aquí; los botones se pulsan con clics reales y
// las descargas de PDF se capturan con URL.createObjectURL + clic de
// <a> simulados (no se descarga nada real).
// Logs y capturas en docs/smoke270-*.
'use strict';
"""
s = new_head + s[s.index("const { app, BrowserWindow, ipcMain }"):]

# --- 2. Vista Acuse: sin campo de folio; botón Imprimir presente.
rep("""    folioReadonly: document.getElementById('fAc-folio').readOnly,
    folioPh: document.getElementById('fAc-folio').placeholder,
    folioVal: document.getElementById('fAc-folio').value,
    lista: (document.getElementById('acuseList').innerText||'')};}`);""",
    """    sinFolio: document.getElementById('fAc-folio') === null,
    btnImprimir: !!document.getElementById('btnAcuseImprimir'),
    lista: (document.getElementById('acuseList').innerText||'')};}`);""")
rep("""    vistaAcuse.folioReadonly === true &&
    vistaAcuse.folioPh === 'Se asigna al abrir' &&
    vistaAcuse.folioVal === '00001' &&
    vistaAcuse.para === '' && vistaAcuse.de === '' && vistaAcuse.anexo === '' &&
    vistaAcuse.lista.indexOf('Aún no hay acuses guardados.') !== -1 &&
    vistaAcuse.texto.indexOf('Guardar acuse') !== -1 &&
    vistaAcuse.texto.indexOf('Generar PDF') !== -1;""",
    """    vistaAcuse.sinFolio === true &&
    vistaAcuse.btnImprimir === true &&
    vistaAcuse.para === '' && vistaAcuse.de === '' && vistaAcuse.anexo === '' &&
    vistaAcuse.lista.indexOf('Aún no hay acuses guardados.') !== -1 &&
    vistaAcuse.texto.indexOf('Guardar acuse') !== -1 &&
    vistaAcuse.texto.indexOf('Generar PDF') !== -1 &&
    vistaAcuse.texto.indexOf('Imprimir') !== -1;""")

# --- 4. Guardar acuse: toast sin folio, tarjeta sin folio, botón Imprimir.
rep("""    trasGuardar.toast.indexOf('Acuse guardado con folio 00001.') !== -1 &&
    trasGuardar.lista.indexOf('Folio 00001') !== -1 &&""",
    """    trasGuardar.toast.indexOf('Acuse guardado.') !== -1 &&
    trasGuardar.toast.indexOf('folio') === -1 &&
    trasGuardar.lista.indexOf('Folio') === -1 &&""")
rep("""    trasGuardar.html.indexOf('data-acuse-pdf=') !== -1 &&
    trasGuardar.html.indexOf('data-acuse-wa=') !== -1 &&""",
    """    trasGuardar.html.indexOf('data-acuse-pdf=') !== -1 &&
    trasGuardar.html.indexOf('data-acuse-print=') !== -1 &&
    trasGuardar.html.indexOf('data-acuse-wa=') !== -1 &&""")

# --- 5. PDF del acuse SIN línea FOLIO.
rep("    folio: (pdfAcuse.txt || '').indexOf('FOLIO: 00001') !== -1,",
    "    sinFolio: (pdfAcuse.txt || '').indexOf('FOLIO:') === -1,")
rep("""    pdfAcuse.txt.indexOf('ACUSE DE RECIBO') !== -1 &&
    pdfAcuse.txt.indexOf('FOLIO: 00001') !== -1 &&
    pdfAcuse.txt.indexOf('/ImLapi') !== -1;""",
    """    pdfAcuse.txt.indexOf('ACUSE DE RECIBO') !== -1 &&
    pdfAcuse.txt.indexOf('FOLIO:') === -1 &&
    pdfAcuse.txt.indexOf('/ImLapi') !== -1;""")

# --- 5c. (270) Imprimir el Acuse desde el formulario: crea el iframe oculto.
rep("""  // 6. Lista: «PDF por WhatsApp» -> descarga capturada + toast de
  // WhatsApp; «PDF por correo» -> descarga + mailto con el asunto.""",
    """  // 5c. (270) «Imprimir» del Acuse desde el formulario: crea el
  // iframe oculto del PDF (src blob:stub, createObjectURL simulado).
  // La llamada a print() del diálogo del sistema NO se ejerce aquí
  // (abriría el diálogo nativo); los tests node 270E/F la verifican
  // con un iframe simulado.
  const iframesAntes = await js(win, `function(){return document.querySelectorAll('iframe').length;}`);
  const clickImprimirAcuse = await mouseClick(win, '#btnAcuseImprimir');
  await sleep(600);
  const trasImprimirAcuse = await js(win, `function(){var fr=document.querySelectorAll('iframe');
    var last=fr[fr.length-1];
    return {n: fr.length, src: last ? last.src : null, oculto: last ? (last.style.position==='fixed' && last.style.width==='0px') : false};}`);
  log('5c-imprimir-acuse', { clickImprimirAcuse, iframesAntes, trasImprimirAcuse });
  const imprimirAcuseOk = clickImprimirAcuse.clicked === true &&
    trasImprimirAcuse.n === iframesAntes + 1 &&
    trasImprimirAcuse.src === 'blob:stub' && trasImprimirAcuse.oculto === true;

  // 6. Lista: «PDF por WhatsApp» -> descarga capturada + toast de
  // WhatsApp; «PDF por correo» -> descarga + mailto con el asunto.""")

# --- 6b. Correo del acuse: cuerpo SIN folio.
rep("    mailCuerpo.indexOf('Folio 00001') !== -1 &&",
    "    mailCuerpo.indexOf('Folio') === -1 &&")

# --- 7b. Limpiar el acuse: sin folio que asignar.
rep("""    anexo: document.getElementById('fAc-anexo').value,
    folio: document.getElementById('fAc-folio').value,
    fecha: document.getElementById('fAc-fecha').value};}`);""",
    """    anexo: document.getElementById('fAc-anexo').value,
    fecha: document.getElementById('fAc-fecha').value};}`);""")
rep("""    trasLimpiar.para === '' && trasLimpiar.de === '' && trasLimpiar.anexo === '' &&
    trasLimpiar.folio === '00002' &&
    trasLimpiar.fecha === '2026-09-01';""",
    """    trasLimpiar.para === '' && trasLimpiar.de === '' && trasLimpiar.anexo === '' &&
    trasLimpiar.fecha === '2026-09-01';""")

# --- 10. Guardar carta: la tarjeta también trae Imprimir.
rep("""    trasGuardarCarta.html.indexOf('data-carta-pdf=') !== -1 &&
    trasGuardarCarta.html.indexOf('data-carta-wa=') !== -1 &&""",
    """    trasGuardarCarta.html.indexOf('data-carta-pdf=') !== -1 &&
    trasGuardarCarta.html.indexOf('data-carta-print=') !== -1 &&
    trasGuardarCarta.html.indexOf('data-carta-wa=') !== -1 &&""")

# --- 12c. (270) Imprimir la carta desde su tarjeta: crea el iframe oculto.
rep("""  // 13. Reabrir la carta carga sus datos (incluidas las 2 filas de
  // equipo); quitar la 2ª fila deja 1; Limpiar vacía; Volver a Inicio.""",
    """  // 12c. (270) «Imprimir» de la carta desde su tarjeta: crea el
  // iframe oculto del PDF (como en 5c; print() se verifica en node).
  const iframesAntesC = await js(win, `function(){return document.querySelectorAll('iframe').length;}`);
  const clickImprimirCarta = await mouseClick(win, '#cartaList [data-carta-print]');
  await sleep(600);
  const trasImprimirCarta = await js(win, `function(){var fr=document.querySelectorAll('iframe');
    var last=fr[fr.length-1];
    return {n: fr.length, src: last ? last.src : null, oculto: last ? (last.style.position==='fixed' && last.style.width==='0px') : false};}`);
  log('12c-imprimir-carta', { clickImprimirCarta, iframesAntesC, trasImprimirCarta });
  const imprimirCartaOk = clickImprimirCarta.clicked === true &&
    trasImprimirCarta.n === iframesAntesC + 1 &&
    trasImprimirCarta.src === 'blob:stub' && trasImprimirCarta.oculto === true;

  // 13. Reabrir la carta carga sus datos (incluidas las 2 filas de
  // equipo); quitar la 2ª fila deja 1; Limpiar vacía; Volver a Inicio.""")

# --- 16. Marcas 270 en el código: dedupe + imprimir.
rep("  // 16. (269) mensajeErrorNube distingue la causa real y el código",
    "  // 16. (270) mensajeErrorNube distingue la causa real y el código")
rep("""    src270.indexOf('pendienteSync') !== -1 && src270.indexOf('cartaReintentarSync') !== -1 &&
    src270.indexOf('acuseReintentarSync') !== -1;""",
    """    src270.indexOf('pendienteSync') !== -1 && src270.indexOf('cartaReintentarSync') !== -1 &&
    src270.indexOf('acuseReintentarSync') !== -1 &&
    src270.indexOf('dedupeCartas') !== -1 && src270.indexOf('dedupeAcuses') !== -1 &&
    src270.indexOf('cartaGuardando') !== -1 && src270.indexOf('acuseGuardando') !== -1 &&
    src270.indexOf('imprimirPdfDoc') !== -1 && src270.indexOf('contentWindow.print()') !== -1 &&
    src270.indexOf('data-carta-print') !== -1 && src270.indexOf('data-acuse-print') !== -1 &&
    src270.indexOf('id="btnCartaImprimir"') !== -1 && src270.indexOf('id="btnAcuseImprimir"') !== -1 &&
    src270.indexOf('id="fAc-folio"') === -1 && src270.indexOf('acuseAsignarFolio') === -1;""")

# --- 15. El iframe de Imprimir usa createObjectURL SIMULADO
# ('blob:stub'), que no carga como URL real: su error de carga es
# artefacto del humo, no de la app; se ignora como los conocidos.
rep("""  const conocidos = function (m) {
    return m.indexOf('synapse is not defined') !== -1 ||
      m.indexOf('Electron Security Warning') !== -1 ||
      m.indexOf('Insecure Content-Security-Policy') !== -1;
  };""",
    """  const conocidos = function (m) {
    return m.indexOf('synapse is not defined') !== -1 ||
      m.indexOf('Electron Security Warning') !== -1 ||
      m.indexOf('Insecure Content-Security-Policy') !== -1 ||
      // (270) El iframe de Imprimir usa createObjectURL SIMULADO
      // ('blob:stub'), que no carga como URL real: el error de carga
      // es artefacto del humo, no de la app.
      m.indexOf('blob:stub') !== -1 ||
      m.indexOf('ERR_INVALID_URL') !== -1;
  };""")

# --- Veredicto: incluir los dos nuevos pasos.
rep("""  const ok = selectorOk && vistaAcuseOk && validOk && guardarOk && pdfAcuseOk && pdfFormOk && msgOk &&""",
    """  const ok = selectorOk && vistaAcuseOk && validOk && guardarOk && pdfAcuseOk && pdfFormOk && imprimirAcuseOk && msgOk &&""")
rep("""    vistaCartaOk && validCartaOk && addEqOk && guardarCartaOk && pdfCartaOk && pdfCartaFormOk &&
    waCartaOk && mailCartaOk && abrirCartaOk && quitarOk && limpiarCartaOk && volverCartaOk && delCartaOk &&""",
    """    vistaCartaOk && validCartaOk && addEqOk && guardarCartaOk && pdfCartaOk && pdfCartaFormOk &&
    waCartaOk && mailCartaOk && imprimirCartaOk && abrirCartaOk && quitarOk && limpiarCartaOk && volverCartaOk && delCartaOk &&""")

# --- Verificación final: sin restos de 269 ni del folio del Acuse.
for bad in ['SMOKE-269', 'smoke269', 'SMOKE269', 'mailto269', 'FOLIO: 00001',
            "trasLimpiar.folio === '00002'"]:
    assert bad not in s, 'QUEDÓ RESTO: %r' % bad
# 'fAc-folio' solo queda 2 veces: el chequeo sinFolio y el chequeo en
# el código fuente (16) de que el campo no existe.
assert s.count('fAc-folio') == 2, 'fAc-folio aparece %d veces' % s.count('fAc-folio')
# 'Folio 00001' solo queda 1 vez: la tarjeta de la CARTA (que sí lleva folio).
assert s.count('Folio 00001') == 1, 'Folio 00001 aparece %d veces' % s.count('Folio 00001')
# '2.5.19' solo queda 3 veces como referencia a la versión anterior
# («sin 2.5.19» y el chequeo de que la app ya no la trae).
assert s.count('2.5.19') == 3, '2.5.19 aparece %d veces: %r' % (
    s.count('2.5.19'), [l for l in s.splitlines() if '2.5.19' in l])
assert '2.5.20' in s and 'd0ae3c86' in s, 'falta versión/md5 2.5.20'
open(P, 'w', encoding='utf-8').write(s)
print('smoke-270-formatos.js escrito')
