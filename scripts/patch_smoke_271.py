# Humo de escritorio 2.5.21: smoke-270-formatos.js -> smoke-271-formatos.js.
# Cambio: el botón «🖨️ Imprimir» en el TELÉFONO ya no usa iframe +
# window.print() (el WebView de Android lo ignora: era un no-op
# silencioso); ahora guarda el PDF en CACHE con Filesystem y lo imprime
# con el plugin nativo @capgo/capacitor-printer 8.1.11 (Printer.printPdf,
# diálogo del sistema), con fallback FileOpener -> Share -> toast. En
# ESCRITORIO (Electron) se conserva el iframe oculto + window.print(),
# que ahí sí funciona: este humo lo verifica igual que en 2.5.20 (el
# print() del iframe se stubbea y se cuenta; el diálogo real bloquearía
# el renderer — lección 2.5.20). Los tests node 271E/F verifican las
# rutas nativas con plugins simulados. El resto del flujo es el mismo
# de 2.5.20. Corre con el Electron de node_modules:
#   xvfb-run -a ./node_modules/.bin/electron --no-sandbox scripts/smoke-271-formatos.js
# Uso: python3 patch_smoke_271.py (corre desde scripts/ o con rutas absolutas)
import os
import shutil

BASE = '/home/hatch/workspace/android/checklist-desktop/scripts'
SRC = os.path.join(BASE, 'smoke-270-formatos.js')
P = os.path.join(BASE, 'smoke-271-formatos.js')
WWW_MD5 = '0f748b69b4dbe2113e304efc9d340c41'

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


# --- Renombres 270 -> 271 y versión 2.5.20 -> 2.5.21 (2.5.19 -> 2.5.20
# como referencia a la versión anterior).
repall('SMOKE270', 'SMOKE271')
repall('smoke270', 'smoke271')
repall('SMOKE-270', 'SMOKE-271')
repall('mailto270', 'mailto271')
repall('opened270', 'opened271')
repall('tabs270', 'tabs271')
repall('msg270', 'msg271')
repall('src270', 'src271')
repall('(270)', '(271)')
repall('270E/F', '271E/F')
repall('2.5.20', '2.5.21')
repall('2.5.19', '2.5.20')
rep("const EXPECTED_WWW_MD5 = 'd0ae3c865687cd54bc33cd62410ebf31';",
    "const EXPECTED_WWW_MD5 = '" + WWW_MD5 + "';")
# (El mensaje de error del md5 ya dice 2.5.21 por el repall de arriba.)

# --- Cabecera: descripción 2.5.21.
old_head = s[:s.index("const { app, BrowserWindow, ipcMain }")]
new_head = """// Smoke test 2.5.21 — botón «🖨️ Imprimir» arreglado de raíz en el
// teléfono (Carta y Acuse): en Android/iOS nativo ya NO usa iframe +
// window.print() (el WebView lo ignora); guarda el PDF en CACHE con
// Filesystem y lo imprime con @capgo/capacitor-printer 8.1.11
// (Printer.printPdf, diálogo del sistema), con fallback FileOpener
// -> Share -> toast. En escritorio (Electron) se conserva el iframe
// oculto + window.print(), que ahí sí funciona: este humo lo verifica
// igual que en 2.5.20 (el print() del iframe se stubbea y se cuenta;
// el diálogo real bloquearía el renderer — lección 2.5.20). Las rutas
// nativas las verifican los tests node 271A-F con plugins simulados.
// El resto del flujo (guardado, PDF, WhatsApp, correo, reabrir,
// limpiar, eliminar, dedupe, Acuse sin folio) es el mismo de 2.5.20.
//   - Inicio trae los 2 botones (#btnGoAcuse, #btnGoCarta) y la
//     versión 2.5.21 (sin 2.5.20).
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
//   - Imprimir (escritorio): el botón del formulario y el de la
//     tarjeta crean el iframe oculto del PDF (src blob:stub en este
//     humo, donde createObjectURL está simulado); la llamada a print()
//     del diálogo del sistema se cuenta con el stub (1 en Acuse, 2 en
//     Carta); los tests node 271E/F la verifican con iframe simulado.
// Corre con el Electron de node_modules:
//   xvfb-run -a ./node_modules/.bin/electron --no-sandbox scripts/smoke-271-formatos.js
// El www es el ./www del proyecto (copiado con node scripts/copy-www.js
// desde ../checklist-cloud/www, md5 verificado). firebase-config.js se
// sustituye por placeholder (modo local sin nube): el login real con
// Firebase NO se ejerce aquí; los botones se pulsan con clics reales y
// las descargas de PDF se capturan con URL.createObjectURL + clic de
// <a> simulados (no se descarga nada real).
// Logs y capturas en docs/smoke271-*.
'use strict';
"""
s = new_head + s[s.index("const { app, BrowserWindow, ipcMain }"):]

# --- 16. Marcas 271 en el código: ruta nativa (Printer) + ruta web
# (iframe + print) conservada en escritorio.
rep("  // 16. (271) mensajeErrorNube distingue la causa real y el código",
    "  // 16. (271) mensajeErrorNube distingue la causa real y el código;\n  // además, el www trae la ruta nativa de impresión (Printer) y\n  // conserva la ruta web (iframe + print) para escritorio.")
rep("""    src271.indexOf('imprimirPdfDoc') !== -1 && src271.indexOf('contentWindow.print()') !== -1 &&""",
    """    src271.indexOf('imprimirPdfDoc') !== -1 && src271.indexOf('contentWindow.print()') !== -1 &&
    src271.indexOf('imprimirPdfNativo') !== -1 && src271.indexOf('imprimirPdfWeb') !== -1 &&
    src271.indexOf('Plugins.Printer') !== -1 && src271.indexOf('printPdf') !== -1 &&
    src271.indexOf('cap-plugins/printer-plugin.js') !== -1 &&
    src271.indexOf('<script src="cap-plugins/printer-plugin.js"></script>') !== -1 &&""")

# --- Verificación final: sin restos de 270 ni de la versión anterior.
for bad in ['SMOKE-270', 'smoke270', 'SMOKE270', 'mailto270', '270E/F',
            'd0ae3c86', '2.5.19']:
    assert bad not in s, 'QUEDÓ RESTO: %r' % bad
# 'fAc-folio' solo queda 2 veces: el chequeo sinFolio y el chequeo en
# el código fuente (16) de que el campo no existe.
assert s.count('fAc-folio') == 2, 'fAc-folio aparece %d veces' % s.count('fAc-folio')
# 'Folio 00001' solo queda 1 vez: la tarjeta de la CARTA (que sí lleva folio).
assert s.count('Folio 00001') == 1, 'Folio 00001 aparece %d veces' % s.count('Folio 00001')
# '2.5.20' queda 5 veces como referencia a la versión anterior
# («igual que en 2.5.20», «lección 2.5.20», «el mismo de 2.5.20»,
# «sin 2.5.20» y el chequeo de que la app ya no la trae).
assert s.count('2.5.20') == 5, '2.5.20 aparece %d veces: %r' % (
    s.count('2.5.20'), [l for l in s.splitlines() if '2.5.20' in l])
assert '2.5.21' in s and '0f748b69' in s, 'falta versión/md5 2.5.21'
open(P, 'w', encoding='utf-8').write(s)
print('smoke-271-formatos.js escrito')
