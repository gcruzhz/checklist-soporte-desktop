# Parche de pruebas del detector 2.5.8: serie 258 (actualizaciones Windows).
P = '/home/hatch/workspace/android/checklist-desktop/scripts/test-detect-checks.js'
s = open(P, encoding='utf-8').read()

def rep(old, new, n=1):
    global s
    c = s.count(old)
    assert c == n, 'NO ENCONTRADO x%d (esperado %d): %r' % (c, n, old[:120])
    s = s.replace(old, new)

# --- 1. Importar lo nuevo.
rep("""  PS_IS_ADMIN,
  ELEVATED_TIMEOUT_MS,
  CHECK_TIMEOUT_MS,
} = require('../detect');""",
"""  PS_IS_ADMIN,
  ELEVATED_TIMEOUT_MS,
  CHECK_TIMEOUT_MS,
  WUA_SEARCH_TIMEOUT_MS,
  WUA_INSTALL_TIMEOUT_MS,
  runPowerShellLong,
  buildBuscarActualizacionesScript,
  buildUltimaActualizacionScript,
  parseUltimaActualizacion,
  parseBuscarActualizacionesOutput,
  buscarActualizaciones,
  buildInstalarActualizacionesScript,
  parseInstalarActualizacionesOutput,
  instalarActualizaciones,
  runElevatedPsFileOutput,
} = require('../detect');""")

# --- 2. Serie 258 antes del resumen final.
serie258 = """
  // --- 2.5.8: actualizaciones de Windows (WUA) ---
  console.log('-- actualizaciones Windows (258) --');
  // Mock WUA: despacha según el script (búsqueda / hotfix / instalar /
  // IsInRole) y según runElevatedOutput para la ruta con UAC.
  function makeWuaMock(behavior) {
    const calls = [];
    const runPs = async (script) => {
      calls.push(script);
      if (script.indexOf('IsInRole') !== -1) return behavior.admin ? 'True' : 'False';
      if (script.indexOf('Get-HotFix') !== -1) {
        if (behavior.hotfixThrow) throw new Error('hotfix roto');
        return behavior.hotfix || 'WUA-LAST:2026-11-10';
      }
      throw new Error('runPs no simulado: ' + script.slice(0, 60));
    };
    const runPsLong = async (script, timeoutMs) => {
      calls.push(script);
      if (script.indexOf('CreateUpdateInstaller') !== -1) {
        if (behavior.installThrow) throw new Error('instalación rota');
        return behavior.install || 'WUA-INST-OK:0\\nWUA-INST-FAIL:0\\nWUA-REBOOT:NO';
      }
      if (script.indexOf('Microsoft.Update.Session') !== -1) {
        if (behavior.searchThrow) throw new Error('búsqueda rota');
        return behavior.search || 'WUA-OK';
      }
      throw new Error('runPsLong no simulado: ' + script.slice(0, 60));
    };
    const runElevatedOutput = async (script, timeoutMs) => {
      calls.push('ELEVATED:' + script);
      if (behavior.elevatedThrow) throw new Error('UAC cancelado');
      return behavior.elevated || { code: 0, output: 'WUA-INST-OK:0\\nWUA-INST-FAIL:0\\nWUA-REBOOT:NO' };
    };
    return { runPs, runPsLong, runElevatedOutput, calls };
  }
  // Scripts: tokens y API correctos.
  const scrB258 = buildBuscarActualizacionesScript();
  check('258 script buscar usa WUA COM', scrB258.indexOf('Microsoft.Update.Session') !== -1 && scrB258.indexOf('CreateUpdateSearcher') !== -1);
  check('258 script buscar filtra no instaladas', scrB258.indexOf("IsInstalled=0 and Type='Software'") !== -1);
  check('258 script buscar trae tokens WUA', scrB258.indexOf('WUA-UPDATE:') !== -1 && scrB258.indexOf('WUA-COUNT:') !== -1 && scrB258.indexOf('WUA-OK') !== -1 && scrB258.indexOf('WUA-ERR') !== -1);
  check('258 script buscar NO usa PSWindowsUpdate', scrB258.indexOf('PSWindowsUpdate') === -1 && scrB258.indexOf('Get-WindowsUpdate') === -1);
  const scrI258 = buildInstalarActualizacionesScript();
  check('258 script instalar usa CreateUpdateInstaller', scrI258.indexOf('CreateUpdateInstaller') !== -1 && scrI258.indexOf('.Install()') !== -1);
  check('258 script instalar cuenta por ResultCode 2', scrI258.indexOf('GetUpdateResult') !== -1 && scrI258.indexOf('ResultCode -eq 2') !== -1);
  check('258 script instalar trae tokens', scrI258.indexOf('WUA-INST-OK:') !== -1 && scrI258.indexOf('WUA-INST-FAIL:') !== -1 && scrI258.indexOf('WUA-REBOOT:') !== -1);
  check('258 script instalar maneja 0 pendientes', scrI258.indexOf('Count -eq 0') !== -1);
  check('258 script instalar NUNCA reinicia', scrI258.indexOf('Restart-Computer') === -1 && scrI258.indexOf('shutdown') === -1 && scrI258.indexOf('/r ') === -1);
  // parseBuscarActualizacionesOutput
  const p258a = parseBuscarActualizacionesOutput('WUA-UPDATE:KB5034123|Actualización acumulada 2026-01\\r\\nWUA-UPDATE:|Actualización de .NET\\r\\nWUA-UPDATE:KB5034444,KB5034555|Parche de seguridad\\nWUA-COUNT:3\\nWUA-OK');
  check('258 parse buscar 3 pendientes', p258a.ok === true && p258a.pendientes.length === 3 && p258a.pendientes[0].kb === 'KB5034123' && p258a.pendientes[0].titulo === 'Actualización acumulada 2026-01' && p258a.pendientes[1].kb === '' && p258a.pendientes[2].kb === 'KB5034444,KB5034555');
  check('258 parse buscar 0 pendientes', parseBuscarActualizacionesOutput('WUA-COUNT:0\\nWUA-OK').ok === true && parseBuscarActualizacionesOutput('WUA-COUNT:0\\nWUA-OK').pendientes.length === 0);
  check('258 parse buscar ERR', parseBuscarActualizacionesOutput('WUA-ERR').ok === false && parseBuscarActualizacionesOutput('WUA-ERR').error === 'Windows Update no respondió.');
  check('258 parse buscar basura sin WUA-OK', parseBuscarActualizacionesOutput('basura').ok === false);
  // parseUltimaActualizacion
  check('258 parse última fecha', parseUltimaActualizacion('WUA-LAST:2026-11-10') === '2026-11-10');
  check('258 parse última vacía', parseUltimaActualizacion('WUA-LAST:') === '' && parseUltimaActualizacion('') === '');
  check('258 script última usa Get-HotFix', buildUltimaActualizacionScript().indexOf('Get-HotFix') !== -1 && buildUltimaActualizacionScript().indexOf('WUA-LAST:') !== -1);
  // parseInstalarActualizacionesOutput
  const pi258 = parseInstalarActualizacionesOutput('WUA-INST-OK:2\\nWUA-INST-FAIL:1\\nWUA-REBOOT:SI');
  check('258 parse instalar 2/1 con reinicio', pi258.ok === true && pi258.instaladas === 2 && pi258.fallidas === 1 && pi258.reinicioRequerido === true);
  check('258 parse instalar 0/0 sin reinicio', parseInstalarActualizacionesOutput('WUA-INST-OK:0\\nWUA-INST-FAIL:0\\nWUA-REBOOT:NO').ok === true && parseInstalarActualizacionesOutput('WUA-INST-OK:0\\nWUA-INST-FAIL:0\\nWUA-REBOOT:NO').reinicioRequerido === false);
  check('258 parse instalar ERR', parseInstalarActualizacionesOutput('WUA-ERR').ok === false && parseInstalarActualizacionesOutput('WUA-ERR').error === 'No se pudieron instalar las actualizaciones.');
  check('258 parse instalar incompleto', parseInstalarActualizacionesOutput('WUA-INST-OK:1').ok === false);
  // buscarActualizaciones con mocks
  let m258 = makeWuaMock({ search: 'WUA-UPDATE:KB1|U1\\nWUA-UPDATE:KB2|U2\\nWUA-COUNT:2\\nWUA-OK' });
  let rb258 = await buscarActualizaciones(m258);
  check('258 buscar 2 pendientes', rb258.ok === true && rb258.pendientes.length === 2 && rb258.pendientes[1].titulo === 'U2' && rb258.ultimaInstalada === '2026-11-10' && /^\\d{4}-\\d{2}-\\d{2}$/.test(rb258.ultimaBusqueda));
  m258 = makeWuaMock({ search: 'WUA-COUNT:0\\nWUA-OK', hotfix: 'WUA-LAST:' });
  rb258 = await buscarActualizaciones(m258);
  check('258 buscar 0 pendientes sin última', rb258.ok === true && rb258.pendientes.length === 0 && rb258.ultimaInstalada === '');
  m258 = makeWuaMock({ search: 'WUA-ERR' });
  rb258 = await buscarActualizaciones(m258);
  check('258 buscar con WUA-ERR', rb258.ok === false && rb258.error === 'Windows Update no respondió.');
  m258 = makeWuaMock({ searchThrow: true });
  rb258 = await buscarActualizaciones(m258);
  check('258 buscar con PS roto', rb258.ok === false && rb258.error === 'Windows Update no respondió.');
  m258 = makeWuaMock({ search: 'WUA-COUNT:0\\nWUA-OK', hotfixThrow: true });
  rb258 = await buscarActualizaciones(m258);
  check('258 buscar con hotfix roto sigue OK', rb258.ok === true && rb258.ultimaInstalada === '');
  // instalarActualizaciones con mocks
  m258 = makeWuaMock({ admin: true, install: 'WUA-INST-OK:2\\nWUA-INST-FAIL:0\\nWUA-REBOOT:SI' });
  let ri258 = await instalarActualizaciones(m258);
  check('258 instalar elevado directo con reinicio', ri258.ok === true && ri258.instaladas === 2 && ri258.fallidas === 0 && ri258.reinicioRequerido === true && m258.calls.some((c) => c.indexOf('ELEVATED:') !== 0 && c.indexOf('CreateUpdateInstaller') !== -1));
  m258 = makeWuaMock({ admin: false, elevated: { code: 0, output: 'WUA-INST-OK:1\\nWUA-INST-FAIL:1\\nWUA-REBOOT:NO' } });
  ri258 = await instalarActualizaciones(m258);
  check('258 instalar sin elevación usa UAC', ri258.ok === true && ri258.instaladas === 1 && ri258.fallidas === 1 && ri258.reinicioRequerido === false && m258.calls.some((c) => c.indexOf('ELEVATED:') === 0));
  m258 = makeWuaMock({ admin: false, elevated: { code: 1, output: '' } });
  ri258 = await instalarActualizaciones(m258);
  check('258 instalar UAC denegado pide admin', ri258.ok === false && ri258.error === 'Se necesita permiso de administrador para instalar las actualizaciones.');
  m258 = makeWuaMock({ admin: false, elevatedThrow: true });
  ri258 = await instalarActualizaciones(m258);
  check('258 instalar UAC cancelado pide admin', ri258.ok === false && ri258.error === 'Se necesita permiso de administrador para instalar las actualizaciones.');
  m258 = makeWuaMock({ admin: true, install: 'WUA-ERR' });
  ri258 = await instalarActualizaciones(m258);
  check('258 instalar con WUA-ERR', ri258.ok === false && ri258.error === 'No se pudieron instalar las actualizaciones.');
  m258 = makeWuaMock({ admin: true, installThrow: true });
  ri258 = await instalarActualizaciones(m258);
  check('258 instalar con PS roto', ri258.ok === false && ri258.error === 'No se pudieron instalar las actualizaciones.');
  // Tiempos: instalación > búsqueda > chequeo; helpers existen.
  check('258 timeouts en orden', WUA_INSTALL_TIMEOUT_MS > WUA_SEARCH_TIMEOUT_MS && WUA_SEARCH_TIMEOUT_MS > CHECK_TIMEOUT_MS && WUA_INSTALL_TIMEOUT_MS === 120 * 60 * 1000 && WUA_SEARCH_TIMEOUT_MS === 15 * 60 * 1000);
  check('258 helpers existen', typeof runPowerShellLong === 'function' && typeof runElevatedPsFileOutput === 'function' && typeof buscarActualizaciones === 'function' && typeof instalarActualizaciones === 'function');
"""
rep("""  check('257 script admin es IsInRole', PS_IS_ADMIN.indexOf('IsInRole') !== -1);

  console.log('\\n== resumen: ' + pass + ' pasaron, ' + fail + ' fallaron ==');""",
"""  check('257 script admin es IsInRole', PS_IS_ADMIN.indexOf('IsInRole') !== -1);
""" + serie258 + """
  console.log('\\n== resumen: ' + pass + ' pasaron, ' + fail + ' fallaron ==');""")

open(P, 'w', encoding='utf-8').write(s)
print('OK test-detect-checks.js, bytes:', len(s))
print('258 refs:', s.count('258'))
