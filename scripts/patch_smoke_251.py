# Parche smoke 2.5.1: versión, defaults 2.5.1, PDF+conformidad, Cerrar, admin borra.
import io

P = '/home/hatch/workspace/android/checklist-desktop/scripts/smoke-251-mant.js'
s = io.open(P, encoding='utf-8').read()

def rep(old, new, n=1):
    global s
    c = s.count(old)
    assert c == n, 'NO ENCONTRADO o repetido (%d): %r' % (c, old[:100])
    s = s.replace(old, new)

s = s.replace('SMOKE-250', 'SMOKE-251').replace('smoke-250', 'smoke-251').replace('smoke250', 'smoke251')
s = s.replace('Smoke test 2.5.0', 'Smoke test 2.5.1').replace('AppImage 2.5.0', 'AppImage 2.5.1')
s = s.replace('2.5.0', '2.5.1')
rep("const EXPECTED_WWW_MD5 = '19e2adf071a2db1fec91352ccfed95e7';",
    "const EXPECTED_WWW_MD5 = '4dea8d9390bb0379e11387f1d4cc947f';")
rep("const ASAR = '/home/hatch/workspace/tmp/smoke251/squashfs-root/resources/app.asar';",
    "const ASAR = '/home/hatch/workspace/tmp/smoke251/squashfs-root/resources/app.asar';")
# El www del teléfono 2.5.1 para la comprobación estática de firma.html.
rep("const SHOTDIR = path.join(ROOT, 'docs');",
    "const SHOTDIR = path.join(ROOT, 'docs');\nconst FIRMA_HTML = '/home/hatch/workspace/android/checklist-cloud/hosting/public/firma.html';")

# 4a: defaults 2.5.1 en el formulario (empresa, tipos, diagonales, título+año, descEquipo, cambios).
rep("""    hasCrear: !!document.getElementById('btnMantCrear'),
    hasGuardar: !!document.getElementById('btnMantGuardar'),
    hasCancelar: !!document.getElementById('btnMantCancelar')};}`);""",
"""    hasCrear: !!document.getElementById('btnMantCrear'),
    hasGuardar: !!document.getElementById('btnMantGuardar'),
    hasCancelar: !!document.getElementById('btnMantCancelar'),
    fMempresa: document.getElementById('fM-empresa').value,
    tipoSw: document.getElementById('fM-tipo-sw').checked,
    tipoHw: document.getElementById('fM-tipo-hw').checked,
    fMtRep: document.getElementById('fM-tRep').value,
    fMtViaje: document.getElementById('fM-tViaje').value,
    fMtCaido: document.getElementById('fM-tCaido').value,
    fMtipoFalla: document.getElementById('fM-tipoFalla').value,
    fMfechaPlan: document.getElementById('fM-fechaPlan').value,
    fMfechaComp: document.getElementById('fM-fechaComp').value,
    fMperiodo: document.getElementById('fM-periodoPrueba').value,
    fMdescEquipo: document.getElementById('fM-descEquipo').value,
    fMdescCambios: document.getElementById('fM-descCambios').value,
    fMtitulo: document.getElementById('fM-titulo').value,
    fManio: document.getElementById('fM-anio').value};}`);""")
rep("""  log('4b-observaciones-detectadas', { obsOk, obsDet: formLleno.obsDet.slice(0, 400) });""",
"""  log('4b-observaciones-detectadas', { obsOk, obsDet: formLleno.obsDet.slice(0, 400) });
  const defaultsOk = formLleno.fMempresa === 'Lapi' && formLleno.tipoSw === true && formLleno.tipoHw === true &&
    formLleno.fMtRep === '/' && formLleno.fMtViaje === '/' && formLleno.fMtCaido === '/' &&
    formLleno.fMtipoFalla === '/' && formLleno.fMfechaPlan === '/' && formLleno.fMfechaComp === '/' &&
    formLleno.fMperiodo === '/' && formLleno.fMdescEquipo === 'PC-GERARDO' &&
    formLleno.fMdescCambios === 'se realiza mantenimiento preventivo en hardware y software, sopleteo y limpieza general, instalación de actualización, revisión de políticas y antivirus, desinstalación de software no permitido' &&
    formLleno.fMtitulo === 'Mantenimiento Preventivo sistemas' && formLleno.fManio === '2026';
  log('4c-defaults-251', { defaultsOk, formLleno });""")

# 7: el tipo ya no es select; los checkboxes ya van marcados por default.
rep("""    var tipo = document.getElementById('fM-tipo');
    if (tipo) { tipo.value = 'SOFTWARE'; tipo.dispatchEvent(new Event('change', { bubbles: true })); }
    var falla = document.getElementById('fM-tipoFalla');""",
"""    var tipo = (document.getElementById('fM-tipo-sw').checked ? 'SOFTWARE' : '') + (document.getElementById('fM-tipo-hw').checked ? '/HARDWARE' : '');
    var falla = document.getElementById('fM-tipoFalla');""")
rep("""    return { tipo: tipo ? tipo.value : null, falla: falla ? falla.value : null, fecha: fecha ? fecha.value : null };}`);""",
"""    return { tipo: tipo, falla: falla ? falla.value : null, fecha: fecha ? fecha.value : null };}`);""")
rep("""    var fecha = document.getElementById('fM-fechaServ');
    if (fecha) fecha.value = '2026-11-16';""",
"""    var fecha = document.getElementById('fM-fechaServ');
    if (fecha) fecha.value = '2026-11-16';
    var lib = document.getElementById('fM-fechaLib');
    if (lib) lib.value = '2026-11-20';""")

# 8 (nuevo): simular firma del usuario, PDF válido con conformidad abajo
# a la derecha y botón Compartir habilitado; 9: Cerrar en firma.html;
# 10: el admin elimina la orden. Se insertan antes del foco final.
rep("""  // 8. Foco final + errores JS.""",
"""  // 8. Simular la firma del usuario y verificar PDF + compartir.
  const firmaUsr = await js(win, `function(){
    var m = mantenimientos[0];
    if (!m) return { orden: false };
    m.firma = { nombre: 'Ana Lopez', area: 'Ventas', comentarios: '', satisfaccion: 9, firma: 'data:image/png;base64,iVBORw0KGgo=', firmadoEn: Date.now() };
    m.estado = 'firmada';
    renderMantOrder(m);
    return { orden: true, folio: m.folio, compartirDisabled: document.getElementById('btnMantCompartir').disabled,
      nota: (document.getElementById('mantOrderNote').textContent || '') };}`);
  log('8a-firma-usuario-compartir', firmaUsr);
  const pdfCheck = await js(win, `async function(){
    var m = mantenimientos[0];
    if (!m) return { pdf: false };
    var blob = buildPdfMant(m, {});
    var buf = await blob.arrayBuffer();
    var bytes = new Uint8Array(buf);
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    var rows = [], re = /BT \\/(F\\d) (\\d+) Tf ([\\d.]+) ([\\d.]+) Td \\(((?:\\\\.|[^()\\\\])*)\) Tj ET/g, mm;
    while ((mm = re.exec(s))) rows.push({ t: mm[5], x: Number(mm[3]) });
    var conf = rows.find(function (r) { return r.t.indexOf('Conformidad del usuario') === 0; });
    var rightEdge = conf ? conf.x + pdfTextWidth(conf.t, 'F2', 12) : -1;
    return { pdf: true, bytes: bytes.length, folioInPdf: s.indexOf('Folio: ' + m.folio) !== -1,
      ludiNoContacto: s.indexOf('Rosa Blanca 63') !== -1,
      conformidadX: conf ? conf.x : null, conformidadBordeDerecho: rightEdge,
      conformidadAlFinal: s.indexOf('Conformidad del usuario') > s.indexOf('Generado el') &&
        s.indexOf('Conformidad del usuario') > s.indexOf('Liberación'),
      liberacionFecha: s.indexOf('Fecha: 2026-11-16') === -1,
      diagonales: (s.match(/Fecha: \\//g) || []).length >= 3 };}`);
  log('8b-pdf-conformidad', pdfCheck);
  // 9. Botón Cerrar en firma.html (comprobación estática del HTML del teléfono).
  const firmaHtml = fs.readFileSync(FIRMA_HTML, 'utf8');
  const cerrarOk = firmaHtml.includes('id="btnCerrarSigned"') && firmaHtml.includes('id="btnCerrarDone"') &&
    firmaHtml.includes('window.close()') && firmaHtml.includes('Ya puedes cerrar esta ventana') &&
    firmaHtml.includes("['Empresa', o.empresa || 'Lapi']");
  log('9-firma-html-cerrar', { cerrarOk });
  // 10. El admin elimina la orden (botón de la tarjeta + confirmación).
  const adminDel = await js(win, `function(){
    cloudRole = 'admin';
    renderMant();
    var card = document.getElementById('mantList').innerHTML;
    return { cardTieneEliminar: card.indexOf('data-mant-del-order') !== -1, n: mantenimientos.length };}`);
  log('10a-admin-ve-eliminar', adminDel);
  await js(win, `function(){ var b = document.querySelector('[data-mant-del-order]'); if (b) b.click(); return true; }`);
  await sleep(400);
  const delModal = await js(win, `function(){ return { modalVisible: !document.getElementById('confirmModal').hidden,
    msg: (document.getElementById('confirmMsg').textContent || '') }; }`);
  log('10b-modal-eliminar', delModal);
  const delConfirm = await mouseClick(win, '#confirmYes');
  await sleep(500);
  const delAfter = await js(win, `function(){ return { n: mantenimientos.length,
    toast: (document.getElementById('toast').textContent || '') }; }`);
  log('10c-orden-eliminada', { delConfirm, delAfter });

  // 11. Foco final + errores JS.""")
rep("""  const finalFocus = await js(win, `function(){var d=document.getElementById('focusDiag');""",
"""  const finalFocus = await js(win, `function(){var d=document.getElementById('focusDiag');""")
rep("""  const folioOk = !orden.orderBoxHidden && orden.orderText.indexOf('00001') !== -1;
  const ok = selectorOk && !mantView.viewMantHidden &&
    formLleno.fMserie === '5CD1234ABC' && formLleno.fMhostname === 'PC-GERARDO' &&
    formLleno.fMmodelo === 'ProBook 440 G9' && obsOk &&
    formLleno.hasCrear && formLleno.hasGuardar && formLleno.hasCancelar &&
    tArea.ok && tResp.ok && tTitulo.ok && tDesc.ok && tWa.ok &&
    firma.firmaData === true && folioOk && !dialogoSospechoso &&
    orden.toastText.indexOf('Orden de servicio creada con folio 00001') !== -1;""",
"""  const folioOk = !orden.orderBoxHidden && orden.orderText.indexOf('00001') !== -1;
  const tituloCompuestoOk = orden.orderText.indexOf('Mantenimiento Preventivo sistemas 2026') !== -1 ||
    (typeof mantenimientos !== 'undefined' && mantenimientos.length > 0 && mantenimientos[0].tituloCaso === 'mantenimiento250 2026');
  const ok = selectorOk && !mantView.viewMantHidden &&
    formLleno.fMserie === '5CD1234ABC' && formLleno.fMhostname === 'PC-GERARDO' &&
    formLleno.fMmodelo === 'ProBook 440 G9' && obsOk && defaultsOk &&
    formLleno.hasCrear && formLleno.hasGuardar && formLleno.hasCancelar &&
    tArea.ok && tResp.ok && tTitulo.ok && tDesc.ok && tWa.ok &&
    firma.firmaData === true && folioOk && !dialogoSospechoso &&
    orden.toastText.indexOf('Orden de servicio creada con folio 00001') !== -1 &&
    firmaUsr.compartirDisabled === false &&
    pdfCheck.pdf === true && pdfCheck.bytes > 0 && pdfCheck.folioInPdf === true &&
    Math.abs(pdfCheck.conformidadBordeDerecho - 547) < 1.5 && pdfCheck.conformidadAlFinal === true &&
    pdfCheck.diagonales === true && cerrarOk === true &&
    adminDel.cardTieneEliminar === true && delModal.modalVisible === true &&
    delModal.msg.indexOf('no se puede deshacer') !== -1 && delAfter.n === 0 &&
    delAfter.toast.indexOf('eliminada') !== -1;""")

io.open(P, 'w', encoding='utf-8').write(s)
print('smoke 251 ok')
