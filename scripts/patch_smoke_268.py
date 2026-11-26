# Genera scripts/smoke-268-formatos.js desde smoke-267-formatos.js
# con los cambios del flujo 2.5.18 (folio al abrir, cajas con borde).
# Uso: python3 scripts/patch_smoke_268.py (corre desde checklist-desktop)
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, 'scripts', 'smoke-267-formatos.js')
DST = os.path.join(BASE, 'scripts', 'smoke-268-formatos.js')

s = open(SRC, encoding='utf-8').read()


def rep(old, new, n=1):
    global s
    c = s.count(old)
    assert c == n, 'NO x%d (esp %d): %r' % (c, n, old[:100])
    s = s.replace(old, new)


# --- Renombrado general 267 -> 268. ---
rep('SMOKE267', 'SMOKE268', s.count('SMOKE267'))
rep('SMOKE-267', 'SMOKE-268', s.count('SMOKE-267'))
rep('smoke267', 'smoke268', s.count('smoke267'))
rep('2.5.17', '2.5.18', s.count('2.5.17'))
rep('2.5.16', '2.5.17', s.count('2.5.16'))
rep("EXPECTED_WWW_MD5 = '79156c45171429fdc346788d75465282';",
    "EXPECTED_WWW_MD5 = '874e3d4ee9fa04346b5b222e500769d1';")

# --- Cabecera: qué cubre el smoke 268 (texto ya con 2.5.18). ---
rep("""// Smoke test 2.5.18 — PDF del Acuse Sistemas corregido para verse IGUAL
// que el formato real, y Carta Responsiva re-verificada.
//   - Inicio trae los 2 botones (#btnGoAcuse, #btnGoCarta) y la
//     versión 2.5.18 (sin 2.5.17).
//   - Acuse: fecha en español largo «1 de Septiembre de 2026», PDF con
//     logo Lapi (/ImLapi), título «ACUSE DE RECIBO», línea naranja,
//     PARA/DE en negrita cursiva, ANEXO subrayado y tabla RECIBE gris.
//   - Carta: campo nuevo Área (fCa-area, se guarda, se reabre y se
//     limpia), PDF FO-SI-10 de 2 páginas con logo, Código con bordes,
//     encabezado verde y «Área» en DATOS DEL SOLICITANTE.""",
"""// Smoke test 2.5.18 — folio automático AL ABRIR en Acuse y Carta, y
// cajas con borde visible en el PDF de la Carta (como la imagen del
// formato original FO-SI-10).
//   - Inicio trae los 2 botones (#btnGoAcuse, #btnGoCarta) y la
//     versión 2.5.18 (sin 2.5.17).
//   - Acuse: al abrir ya trae folio 00001 (readonly, «Se asigna al
//     abrir»); guardar usa ese folio; el PDF lo lleva arriba a la
//     derecha, junto a la fecha; Limpiar asigna el siguiente (00002).
//   - Carta: al abrir ya trae folio 00001 (secuencia independiente de
//     la del Acuse); PDF FO-SI-10 de 2 páginas con DATOS DEL
//     SOLICITANTE en celdas con borde, «Área: Jefe Directo:» y tabla
//     Exclusivo de Sistemas verde con divisores verticales.""")

# --- Paso 2: la vista Acuse ya trae folio 00001 al abrir. ---
rep("""    para: document.getElementById('fAc-para').value,
    de: document.getElementById('fAc-de').value,
    anexo: document.getElementById('fAc-anexo').value,
    lista: (document.getElementById('acuseList').innerText||'')};}`);""",
"""    para: document.getElementById('fAc-para').value,
    de: document.getElementById('fAc-de').value,
    anexo: document.getElementById('fAc-anexo').value,
    folioReadonly: document.getElementById('fAc-folio').readOnly,
    folioPh: document.getElementById('fAc-folio').placeholder,
    folioVal: document.getElementById('fAc-folio').value,
    lista: (document.getElementById('acuseList').innerText||'')};}`);""")
rep("""  const vistaAcuseOk = goAcuse.clicked === true && vistaAcuse.acuseHidden === false &&
    vistaAcuse.inicioHidden === true &&
    vistaAcuse.fecha === vistaAcuse.hoy &&
    vistaAcuse.para === '' && vistaAcuse.de === '' && vistaAcuse.anexo === '' &&""",
"""  const vistaAcuseOk = goAcuse.clicked === true && vistaAcuse.acuseHidden === false &&
    vistaAcuse.inicioHidden === true &&
    vistaAcuse.fecha === vistaAcuse.hoy &&
    vistaAcuse.folioReadonly === true &&
    vistaAcuse.folioPh === 'Se asigna al abrir' &&
    vistaAcuse.folioVal === '00001' &&
    vistaAcuse.para === '' && vistaAcuse.de === '' && vistaAcuse.anexo === '' &&""")

# --- Paso 4: toast con folio y tarjeta con folio. ---
rep("""  const guardarOk = clickGuardar.clicked === true &&
    trasGuardar.toast.indexOf('Acuse guardado.') !== -1 &&
    trasGuardar.lista.indexOf('Beatriz Garduño Dominguez') !== -1 &&""",
"""  const guardarOk = clickGuardar.clicked === true &&
    trasGuardar.toast.indexOf('Acuse guardado con folio 00001.') !== -1 &&
    trasGuardar.lista.indexOf('Folio 00001') !== -1 &&
    trasGuardar.lista.indexOf('Beatriz Garduño Dominguez') !== -1 &&""")

# --- Paso 5: el PDF del acuse lleva el folio. ---
rep("""    recibe: (pdfAcuse.txt || '').indexOf('RECIBE') !== -1,
    titulo: (pdfAcuse.txt || '').indexOf('ACUSE DE RECIBO') !== -1,
    logo: (pdfAcuse.txt || '').indexOf('/ImLapi') !== -1 } });""",
"""    recibe: (pdfAcuse.txt || '').indexOf('RECIBE') !== -1,
    titulo: (pdfAcuse.txt || '').indexOf('ACUSE DE RECIBO') !== -1,
    folio: (pdfAcuse.txt || '').indexOf('FOLIO: 00001') !== -1,
    logo: (pdfAcuse.txt || '').indexOf('/ImLapi') !== -1 } });""")
rep("""    pdfAcuse.txt.indexOf('RECIBE') !== -1 &&
    pdfAcuse.txt.indexOf('ACUSE DE RECIBO') !== -1 &&
    pdfAcuse.txt.indexOf('/ImLapi') !== -1;""",
"""    pdfAcuse.txt.indexOf('RECIBE') !== -1 &&
    pdfAcuse.txt.indexOf('ACUSE DE RECIBO') !== -1 &&
    pdfAcuse.txt.indexOf('FOLIO: 00001') !== -1 &&
    pdfAcuse.txt.indexOf('/ImLapi') !== -1;""")

# --- Paso 6b: el correo del acuse lleva el folio en el cuerpo. ---
rep("""    mailAsunto === 'Acuse Sistemas — Checklist de Soporte' &&
    mailCuerpo.indexOf('Beatriz Gardu') !== -1 &&
    mailCuerpo.indexOf('SISTEMAS') !== -1;""",
"""    mailAsunto === 'Acuse Sistemas — Checklist de Soporte' &&
    mailCuerpo.indexOf('Folio 00001') !== -1 &&
    mailCuerpo.indexOf('Beatriz Gardu') !== -1 &&
    mailCuerpo.indexOf('SISTEMAS') !== -1;""")

# --- Paso 7b: Limpiar asigna el folio siguiente (00002). ---
rep("""  const trasLimpiar = await js(win, `function(){return {
    para: document.getElementById('fAc-para').value,
    de: document.getElementById('fAc-de').value,
    anexo: document.getElementById('fAc-anexo').value,
    fecha: document.getElementById('fAc-fecha').value};}`);""",
"""  const trasLimpiar = await js(win, `function(){return {
    para: document.getElementById('fAc-para').value,
    de: document.getElementById('fAc-de').value,
    anexo: document.getElementById('fAc-anexo').value,
    folio: document.getElementById('fAc-folio').value,
    fecha: document.getElementById('fAc-fecha').value};}`);""")
rep("""  const limpiarOk = clickLimpiar.clicked === true &&
    trasLimpiar.para === '' && trasLimpiar.de === '' && trasLimpiar.anexo === '' &&
    trasLimpiar.fecha === '2026-09-01';""",
"""  const limpiarOk = clickLimpiar.clicked === true &&
    trasLimpiar.para === '' && trasLimpiar.de === '' && trasLimpiar.anexo === '' &&
    trasLimpiar.folio === '00002' &&
    trasLimpiar.fecha === '2026-09-01';""")

# --- Paso 8: la vista Carta ya trae folio 00001 al abrir
# (secuencia independiente de la del Acuse). ---
rep("""  // 8. Entrar a Carta Responsiva: folio de solo lectura («Se asigna
  // al guardar»), fecha = hoy, 1 fila de equipo por defecto, lista vacía.""",
"""  // 8. Entrar a Carta Responsiva: folio ya asignado al abrir
  // («Se asigna al abrir», 00001, secuencia independiente de la del
  // Acuse), fecha = hoy, 1 fila de equipo por defecto, lista vacía.""")
rep("""    vistaCarta.folioReadonly === true &&
    vistaCarta.folioPh === 'Se asigna al guardar' &&
    vistaCarta.folioVal === '' && vistaCarta.nombre === '' &&""",
"""    vistaCarta.folioReadonly === true &&
    vistaCarta.folioPh === 'Se asigna al abrir' &&
    vistaCarta.folioVal === '00001' && vistaCarta.nombre === '' &&""")

# --- Paso 11: el PDF de la carta lleva las cajas con borde, los
# divisores verticales y «Área: Jefe Directo:». ---
rep("""    area: (pdfCarta.txt || '').indexOf('Área') !== -1,
    count2: (pdfCarta.txt || '').indexOf('/Count 2') !== -1,
    paginas: pdfCarta.paginas } });""",
"""    area: (pdfCarta.txt || '').indexOf('Área') !== -1,
    areaJefe: (pdfCarta.txt || '').indexOf('Área: Jefe Directo:') !== -1,
    areaValor: (pdfCarta.txt || '').indexOf('Sistemas - María García') !== -1,
    cajaIzq: (pdfCarta.txt || '').indexOf('184.0 22.0 re S') !== -1,
    cajaIp: (pdfCarta.txt || '').indexOf('166.0 44.0 re S') !== -1,
    cajaObs: (pdfCarta.txt || '').indexOf('540.0 22.0 re S') !== -1,
    divisor: (pdfCarta.txt || '').indexOf('153.0') !== -1,
    count2: (pdfCarta.txt || '').indexOf('/Count 2') !== -1,
    paginas: pdfCarta.paginas } });""")
rep("""    pdfCarta.txt.indexOf('Página:') !== -1 && pdfCarta.txt.indexOf('1 de 2') !== -1 &&
    pdfCarta.txt.indexOf('Área') !== -1;""",
"""    pdfCarta.txt.indexOf('Página:') !== -1 && pdfCarta.txt.indexOf('1 de 2') !== -1 &&
    pdfCarta.txt.indexOf('Área') !== -1 &&
    pdfCarta.txt.indexOf('Área: Jefe Directo:') !== -1 &&
    pdfCarta.txt.indexOf('Sistemas - María García') !== -1 &&
    pdfCarta.txt.indexOf('184.0 22.0 re S') !== -1 &&
    pdfCarta.txt.indexOf('166.0 44.0 re S') !== -1 &&
    pdfCarta.txt.indexOf('540.0 22.0 re S') !== -1 &&
    pdfCarta.txt.indexOf('153.0') !== -1;""")

# --- Paso 13c: Limpiar la carta asigna el folio siguiente (00002).
# La fecha NO se resetea al limpiar (el prefill solo llena si está
# vacía): queda la del paso 10 ('2026-11-25'), igual que en el Acuse
# el paso 7b espera '2026-09-01'. (En 267 pasaba por casualidad: el
# humo corría el mismo 25 y hoyISO() era '2026-11-25'.) ---
rep("""  const limpiarCartaOk = clickLimpiarCarta.clicked === true &&
    trasLimpiarCarta.nombre === '' && trasLimpiarCarta.folio === '' &&
    trasLimpiarCarta.area === '' &&
    trasLimpiarCarta.filas === 1 && trasLimpiarCarta.fecha === hoyISO();""",
"""  const limpiarCartaOk = clickLimpiarCarta.clicked === true &&
    trasLimpiarCarta.nombre === '' && trasLimpiarCarta.folio === '00002' &&
    trasLimpiarCarta.area === '' &&
    trasLimpiarCarta.filas === 1 && trasLimpiarCarta.fecha === '2026-11-25';""")

open(DST, 'w', encoding='utf-8').write(s)
print('smoke-268-formatos.js escrito:', len(s), 'bytes')
