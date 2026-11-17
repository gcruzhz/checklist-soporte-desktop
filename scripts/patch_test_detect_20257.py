# Parche tests detector 2.5.7: contraseña del usuario sistemas.
P = '/home/hatch/workspace/android/checklist-desktop/scripts/test-detect-checks.js'
s = open(P, encoding='utf-8').read()

def rep(old, new, n=1):
    global s
    c = s.count(old)
    assert c == n, 'NO ENCONTRADO x%d (esperado %d): %r' % (c, n, old[:120])
    s = s.replace(old, new)

rep("""// el nombre de la primera impresora real.""",
"""// el nombre de la primera impresora real.
// 2.5.7 añade: contraseña del usuario local de Windows 'sistemas'
// (verificar con ValidateCredentials, cambiar con Set-LocalUser; sin
// elevación se usa un .ps1 temporal con UAC); escape PowerShell de
// comillas simples en usuario y contraseñas.""")

rep("""  parseEsetRegistryVersion,
  findEsetAgentVersion,
  expandEnvVars,
} = require('../detect');""",
"""  parseEsetRegistryVersion,
  findEsetAgentVersion,
  expandEnvVars,
  psEscape,
  buildVerificarPasswordScript,
  parseVerificarPasswordOutput,
  verificarPasswordSistemas,
  buildCambiarPasswordScript,
  runElevatedPsFile,
  cambiarPasswordSistemas,
  PS_IS_ADMIN,
  ELEVATED_TIMEOUT_MS,
  CHECK_TIMEOUT_MS,
} = require('../detect');""")

serie257 = """
  // --- 2.5.7: contraseña del usuario sistemas ---
  console.log('-- contraseña sistemas (257) --');
  function makePsMock(behavior) {
    const calls = [];
    const runPs = async (script) => {
      calls.push(script);
      if (script.indexOf('ValidateCredentials') !== -1) {
        if (behavior.verifyThrow) throw new Error('ps roto');
        return behavior.verify || 'PS-OK';
      }
      if (script.indexOf('IsInRole') !== -1) return behavior.admin ? 'True' : 'False';
      if (script.indexOf('Set-LocalUser') !== -1) {
        if (behavior.changeThrow) throw new Error('ps roto');
        return behavior.change || 'PS-OK';
      }
      throw new Error('script no simulado: ' + script.slice(0, 60));
    };
    return { runPs, calls };
  }
  // Escape PowerShell: la comilla simple se duplica; $, " y espacios
  // quedan tal cual dentro de comillas simples (literales en PS).
  check('257 escape comilla simple', psEscape("a'b") === "a''b");
  check('257 escape varias comillas', psEscape("''") === "''''");
  check('257 escape $ " y espacios intactos', psEscape('Pa$$ "w0rd" con espacios') === 'Pa$$ "w0rd" con espacios');
  check('257 escape vacío y null', psEscape('') === '' && psEscape(null) === '' && psEscape(undefined) === '');
  // Scripts: la contraseña escapada va entre comillas simples; el script
  // de cambio usa SecureString y sale con código.
  const scrV = buildVerificarPasswordScript('sistemas', "Vieja'123");
  check('257 script verificar lleva usuario y actual escapados', scrV.indexOf("'sistemas'") !== -1 && scrV.indexOf("'Vieja''123'") !== -1 && scrV.indexOf("Vieja'123'") === -1);
  check('257 script verificar trae los 4 tokens', scrV.indexOf('PS-OK') !== -1 && scrV.indexOf('PS-FAIL') !== -1 && scrV.indexOf('PS-NOUSER') !== -1 && scrV.indexOf('PS-ERR') !== -1);
  check('257 script verificar usa ValidateCredentials', scrV.indexOf('ValidateCredentials') !== -1);
  const scrC = buildCambiarPasswordScript('sistemas', 'Nueva$456 "x"');
  check('257 script cambiar lleva nueva escapada', scrC.indexOf("'Nueva$456 \\"x\\"'") !== -1);
  check('257 script cambiar usa SecureString + Set-LocalUser', scrC.indexOf('ConvertTo-SecureString') !== -1 && scrC.indexOf('Set-LocalUser') !== -1);
  check('257 script cambiar sale con exit 0/2', scrC.indexOf('exit 0') !== -1 && scrC.indexOf('exit 2') !== -1);
  check('257 script cambiar limpia la variable', scrC.indexOf('Remove-Variable s') !== -1);
  // parseVerificarPasswordOutput
  check('257 parse OK', parseVerificarPasswordOutput('PS-OK').ok === true);
  check('257 parse FAIL', parseVerificarPasswordOutput('PS-FAIL').error === 'Contraseña actual incorrecta.');
  check('257 parse NOUSER', parseVerificarPasswordOutput('PS-NOUSER').error === 'Usuario no encontrado.');
  check('257 parse ERR/basura', parseVerificarPasswordOutput('basura').error === 'No se pudo verificar la contraseña.' && parseVerificarPasswordOutput('').ok === false);
  // verificarPasswordSistemas con runPs simulado
  let m257 = makePsMock({ verify: 'PS-OK' });
  let vr257 = await verificarPasswordSistemas(m257, 'sistemas', 'ContraseñaVieja123');
  check('257 verificar OK', vr257.ok === true && m257.calls.length === 1 && m257.calls[0].indexOf('ContraseñaVieja123') !== -1);
  m257 = makePsMock({ verify: 'PS-FAIL' });
  vr257 = await verificarPasswordSistemas(m257, 'sistemas', 'ContraseñaMala123');
  check('257 verificar incorrecta', vr257.ok === false && vr257.error === 'Contraseña actual incorrecta.');
  m257 = makePsMock({ verify: 'PS-NOUSER' });
  vr257 = await verificarPasswordSistemas(m257, 'sistemas', 'ContraseñaVieja123');
  check('257 verificar usuario inexistente', vr257.ok === false && vr257.error === 'Usuario no encontrado.');
  m257 = makePsMock({ verifyThrow: true });
  vr257 = await verificarPasswordSistemas(m257, 'sistemas', 'ContraseñaVieja123');
  check('257 verificar con PS roto', vr257.ok === false && vr257.error === 'No se pudo verificar la contraseña.');
  m257 = makePsMock({ verify: 'PS-OK' });
  vr257 = await verificarPasswordSistemas(m257, '', 'ContraseñaVieja123');
  check('257 verificar sin usuario no llama a PS', vr257.ok === false && vr257.error === 'Escribe el nombre del usuario.' && m257.calls.length === 0);
  vr257 = await verificarPasswordSistemas(m257, 'sistemas', '');
  check('257 verificar sin actual no llama a PS', vr257.ok === false && vr257.error === 'Escribe la contraseña actual.' && m257.calls.length === 0);
  // cambiarPasswordSistemas
  m257 = makePsMock({ verify: 'PS-FAIL' });
  let cr257 = await cambiarPasswordSistemas(m257, 'sistemas', 'ContraseñaMala123', 'NuevaPass123');
  check('257 cambiar con actual incorrecta no intenta el cambio', cr257.ok === false && cr257.error === 'Contraseña actual incorrecta.' && m257.calls.length === 1 && m257.calls[0].indexOf('Set-LocalUser') === -1);
  m257 = makePsMock({ verify: 'PS-OK', admin: true, change: 'PS-OK' });
  cr257 = await cambiarPasswordSistemas(m257, 'sistemas', 'ContraseñaVieja123', 'NuevaPass123');
  check('257 cambiar elevado OK', cr257.ok === true && m257.calls.some((c) => c.indexOf('Set-LocalUser') !== -1) && m257.calls.some((c) => c.indexOf('IsInRole') !== -1));
  m257 = makePsMock({ verify: 'PS-OK', admin: true, change: 'PS-FAIL' });
  cr257 = await cambiarPasswordSistemas(m257, 'sistemas', 'ContraseñaVieja123', 'NuevaPass123');
  check('257 cambiar elevado con fallo', cr257.ok === false && cr257.error === 'No se pudo cambiar la contraseña.');
  let elevCalls = [];
  m257 = makePsMock({ verify: 'PS-OK', admin: false });
  m257.runElevated = async (script) => { elevCalls.push(script); return 0; };
  cr257 = await cambiarPasswordSistemas(m257, 'sistemas', 'ContraseñaVieja123', 'NuevaPass123');
  check('257 cambiar sin elevación usa UAC y OK', cr257.ok === true && elevCalls.length === 1 && elevCalls[0].indexOf('Set-LocalUser') !== -1 && elevCalls[0].indexOf('NuevaPass123') !== -1);
  m257 = makePsMock({ verify: 'PS-OK', admin: false });
  m257.runElevated = async () => 2;
  cr257 = await cambiarPasswordSistemas(m257, 'sistemas', 'ContraseñaVieja123', 'NuevaPass123');
  check('257 cambiar UAC con exit 2', cr257.ok === false && cr257.error === 'No se pudo cambiar la contraseña.');
  m257 = makePsMock({ verify: 'PS-OK', admin: false });
  m257.runElevated = async () => { throw new Error('UAC cancelado'); };
  cr257 = await cambiarPasswordSistemas(m257, 'sistemas', 'ContraseñaVieja123', 'NuevaPass123');
  check('257 cambiar UAC cancelado pide admin', cr257.ok === false && cr257.error === 'Se necesita permiso de administrador para cambiar la contraseña.');
  m257 = makePsMock({ verify: 'PS-OK', admin: true });
  cr257 = await cambiarPasswordSistemas(m257, 'sistemas', 'ContraseñaVieja123', '');
  check('257 cambiar sin nueva no llama a PS', cr257.ok === false && cr257.error === 'Escribe la contraseña nueva.' && m257.calls.length === 0);
  // runElevatedPsFile existe y el timeout UAC es mayor que el de chequeo
  check('257 timeout UAC mayor que chequeo', ELEVATED_TIMEOUT_MS > CHECK_TIMEOUT_MS && typeof runElevatedPsFile === 'function');
  check('257 script admin es IsInRole', PS_IS_ADMIN.indexOf('IsInRole') !== -1);
"""
rep("  console.log('\\n== resumen: ' + pass + ' pasaron, ' + fail + ' fallaron ==');",
    serie257 + "\n  console.log('\\n== resumen: ' + pass + ' pasaron, ' + fail + ' fallaron ==');")

open(P, 'w', encoding='utf-8').write(s)
print('OK test-detect-checks.js, bytes:', len(s))
