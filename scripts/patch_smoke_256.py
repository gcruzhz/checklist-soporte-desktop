# Parche smoke 2.5.6: smoke-255-orden.js -> smoke-256-orden.js (ya copiado).
P = '/home/hatch/workspace/android/checklist-desktop/scripts/smoke-256-orden.js'
s = open(P, encoding='utf-8').read()

def rep(old, new, n=1):
    global s
    c = s.count(old)
    assert c == n, 'NO ENCONTRADO x%d (esperado %d): %r' % (c, n, old[:100])
    s = s.replace(old, new)

# --- Identidad 2.5.6.
s = s.replace('SMOKE-255', 'SMOKE-256')
s = s.replace('smoke-255', 'smoke256')
s = s.replace('smoke255', 'smoke256')
rep("const EXPECTED_WWW_MD5 = '982773d2156b664e638fefa99618893e';",
    "const EXPECTED_WWW_MD5 = 'd8ee4bc00e5e4ae547c5420161950e34';")
rep("if (idxMd5 !== EXPECTED_WWW_MD5) throw new Error('md5 del www no coincide con 2.5.5: ' + idxMd5);",
    "if (idxMd5 !== EXPECTED_WWW_MD5) throw new Error('md5 del www no coincide con 2.5.6: ' + idxMd5);")
rep("// placeholder SOLO para el smoke test local 2.5.5",
    "// placeholder SOLO para el smoke test local 2.5.6")

# --- Boot: versión 2.5.6 y nada de 2.5.5.
rep("versionText: (document.body.textContent||'').indexOf('2.5.5')!==-1,",
    "versionText: (document.body.textContent||'').indexOf('2.5.6')!==-1,")
rep("sin254vieja: (document.body.textContent||'').indexOf('2.5.4')===-1,",
    "sin255vieja: (document.body.textContent||'').indexOf('2.5.5')===-1,")
rep("ready.versionText === true && ready.sin254vieja === true &&",
    "ready.versionText === true && ready.sin255vieja === true &&")

# --- pdfFormatoOk: título de conformidad nuevo, datos en COMENTARIOS
# (no en Conclusión), sin "Invalid Date" y sin "Hora:".
rep("'FECHA, HORA, NOMBRE Y FIRMA DE CONFORMIDAD',",
    "'FECHA, NOMBRE Y FIRMA DE CONFORMIDAD',")
old_final = """  const iDesc = pdfStr.indexOf('DESCRIPCIÓN DEL EQUIPO');
  const iHost = pdfStr.indexOf('Hostname: PC-01');
  const iCond = pdfStr.indexOf('CONDICIONES GENERALES');
  const iConcl = pdfStr.indexOf('CONCLUSIÓN Y/O COMENTARIOS');
  const soloHost = iDesc !== -1 && iHost > iDesc && iHost < iCond;
  const datosAlFinal = iConcl !== -1 && pdfStr.indexOf('Dell') > iConcl && pdfStr.indexOf('Serie: S1, Modelo:') > iConcl;
  return { faltan, nImg, imgsOk: nImg === 2 && pdfStr.indexOf('/Imtecnico Do') !== -1 && pdfStr.indexOf('/Imusuario Do') !== -1,
    carta, unaPagina, soloHost, datosAlFinal,
    ok: faltan.length === 0 && nImg === 2 && carta && unaPagina && soloHost && datosAlFinal };"""
new_final = """  const iDesc = pdfStr.indexOf('DESCRIPCIÓN DEL EQUIPO');
  const iHost = pdfStr.indexOf('Hostname: PC-01');
  const iCond = pdfStr.indexOf('CONDICIONES GENERALES');
  const iConcl = pdfStr.indexOf('CONCLUSIÓN Y/O COMENTARIOS');
  const iCom = pdfStr.indexOf('(COMENTARIOS) Tj');
  const soloHost = iDesc !== -1 && iHost > iDesc && iHost < iCond;
  const entreConclYFechas = iConcl !== -1 ? pdfStr.slice(iConcl, pdfStr.indexOf('FECHA DE PLANEACIÓN')) : '';
  const datosEnComent = iCom !== -1 && pdfStr.indexOf('Dell') > iCom && pdfStr.indexOf('Serie: S1, Modelo:') > iCom;
  const datosFueraConcl = entreConclYFechas.indexOf('Serie:') === -1 && entreConclYFechas.indexOf('Procesador:') === -1 && entreConclYFechas.indexOf('Datos del equipo') === -1;
  const sinInvalidDate = pdfStr.indexOf('Invalid Date') === -1;
  const sinHora = pdfStr.indexOf('Hora:') === -1;
  return { faltan, nImg, imgsOk: nImg === 2 && pdfStr.indexOf('/Imtecnico Do') !== -1 && pdfStr.indexOf('/Imusuario Do') !== -1,
    carta, unaPagina, soloHost, datosAlFinal: datosEnComent && datosFueraConcl, sinInvalidDate, sinHora,
    ok: faltan.length === 0 && nImg === 2 && carta && unaPagina && soloHost && datosEnComent && datosFueraConcl && sinInvalidDate && sinHora };"""
rep(old_final, new_final)

# --- Cabecera: describir 2.5.6.
rep("// Smoke test 2.5.5 — Mantenimientos + renta.",
    "// Smoke test 2.5.6 — Mantenimientos + renta.")
rep("//     tamaño carta (MediaBox 612 792, 1 página, DESCRIPCIÓN DEL EQUIPO\n//     solo con el hostname y los demás datos al final en Conclusión).",
    "//     tamaño carta (MediaBox 612 792, 1 página, DESCRIPCIÓN DEL EQUIPO\n//     solo con el hostname y los demás datos al final en el cuadro\n//     COMENTARIOS, sin duplicar; conformidad sin hora y con fecha válida).")

# --- Resto de referencias 2.5.5/255 en comentarios y nombres.
s = s.replace('2.5.5', '2.5.6')
s = s.replace('255', '256')
open(P, 'w', encoding='utf-8').write(s)
print('OK smoke-256, bytes:', len(s))
print('2.5.5 restante:', s.count('2.5.5'), '| 2.5.4 restante:', s.count('2.5.4'), '| SMOKE-255 restante:', s.count('SMOKE-255'))
