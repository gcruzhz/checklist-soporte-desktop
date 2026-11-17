#!/usr/bin/env python3
r"""Parche 2.5.0 para scripts/test-detect-checks.js: pruebas de políticas
y usuario 'sistemas' (con salidas simuladas de net accounts, registro
y Get-LocalUser), más detalles.impresora en t9.

Uso: python3 scripts/patch_test_detect_20250.py
"""
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
SRC = BASE / "scripts" / "test-detect-checks.js"

text = SRC.read_text(encoding="utf-8")

def rep(old, new, tag):
    global text
    if old not in text:
        print(f"NO ENCONTRADO: {tag}")
        sys.exit(1)
    if text.count(old) != 1:
        print(f"NO ÚNICO ({text.count(old)}): {tag}")
        sys.exit(1)
    text = text.replace(old, new)
    print(f"ok: {tag}")

# 1. Cabecera: párrafo 2.5.0.
rep(
    """// versiones.esetAgent y NO afecta a t7.
// Uso: node scripts/test-detect-checks.js  (o: pnpm test-detect-checks)""",
    """// versiones.esetAgent y NO afecta a t7.
// 2.5.0 añade: políticas de seguridad (net accounts + bloqueo por
// inactividad: directiva de grupo InactivityTimeoutSecs o protector
// de pantalla) y usuario 'sistemas' (Get-LocalUser o perfil
// C:\\Users\\sistemas) en detalles.politicas /
// detalles.usuarioSistemas; t9 guarda además detalles.impresora con
// el nombre de la primera impresora real.
// Uso: node scripts/test-detect-checks.js  (o: pnpm test-detect-checks)""",
    "cabecera 2.5.0",
)

# 2. Requires: nuevos parsers.
rep(
    """  parseHiberbootEnabled,""",
    """  parseHiberbootEnabled,
  parseNetAccounts,
  parseInactivityTimeout,
  parseScreenSave,
  parseLocalUserSistemas,
  politicasCumple,""",
    "requires 2.5.0",
)

# 3. Mock runPs: ramas nuevas (al principio, antes que las genéricas).
rep(
    """    runPs: async (script) => {
      psCalls++;
      if (script.includes("GetFolderPath('Desktop')")) return (s.desktopPaths || []).join('\\r\\n');""",
    """    runPs: async (script) => {
      psCalls++;
      if (script.includes('InactivityTimeoutSecs')) return s.inactivityTimeout !== undefined ? String(s.inactivityTimeout) : '';
      if (script.includes('ScreenSaveTimeOut')) return s.screenSave || '';
      if (script.includes('Get-LocalUser')) return s.localUserSistemas || '';
      if (script.includes("GetFolderPath('Desktop')")) return (s.desktopPaths || []).join('\\r\\n');""",
    "mock runPs 2.5.0",
)

# 4. Mock runCmd: net accounts.
rep(
    """    runCmd: async (cmd, args) => {
      if (/cscript/i.test(cmd)) return s.ospp || '';""",
    """    runCmd: async (cmd, args) => {
      if (/^net$/i.test(cmd)) return s.netAccounts || '';
      if (/cscript/i.test(cmd)) return s.ospp || '';""",
    "mock runCmd 2.5.0",
)

# 5. Casos nuevos antes del resumen.
rep(
    """  check('PowerShell roto: detectChecks no lanza', true);
  check('PowerShell roto: solo t4, resto sin marcar', eq(Object.keys(r.checks).sort(), ['t4']), r.checks);

  console.log('\\n== resumen: ' + pass + ' pasaron, ' + fail + ' fallaron ==');""",
    """  check('PowerShell roto: detectChecks no lanza', true);
  check('PowerShell roto: solo t4, resto sin marcar', eq(Object.keys(r.checks).sort(), ['t4']), r.checks);

  // --- 2.5.0: políticas de seguridad y usuario 'sistemas' ---
  console.log('-- 2.5.0 políticas --');
  const NET_ES = [
    'La solicitud se procesará en un controlador de dominio para el dominio LAPI.',
    '',
    'Forzar al usuario a cambiar la contraseña al iniciar la sesión:   No',
    'La duración máxima de la contraseña (días):                      90',
    'La duración mínima de la contraseña (días):                      0',
    'La longitud mínima de la contraseña:                              10',
    'La longitud del historial de contraseñas:                        24',
    'Umbral de bloqueo:                                                5',
    'Duración del bloqueo:                                             30 minutos',
    'Ventana de observación de bloqueo:                                30 minutos',
  ].join('\\r\\n');
  const NET_EN = [
    'Force user logoff how long after time expires?:       Never',
    'Minimum password age (days):                         0',
    'Maximum password age (days):                         42',
    'Minimum password length:                             12',
    'Length of password history maintained:                24',
    'Lockout threshold:                                    3',
    'Lockout duration (minutes):                           30',
    'Lockout observation window (minutes):                 30',
  ].join('\\r\\n');
  check('2.5.0 net accounts ES: cambio 90', parseNetAccounts(NET_ES).cambioDias === 90, parseNetAccounts(NET_ES));
  check('2.5.0 net accounts ES: longitud 10', parseNetAccounts(NET_ES).minLongitud === 10, parseNetAccounts(NET_ES));
  check('2.5.0 net accounts ES: intentos 5', parseNetAccounts(NET_ES).bloqueoIntentos === 5, parseNetAccounts(NET_ES));
  check('2.5.0 net accounts EN: cambio 42, longitud 12, intentos 3', eq(parseNetAccounts(NET_EN), { cambioDias: 42, minLongitud: 12, bloqueoIntentos: 3 }), parseNetAccounts(NET_EN));
  check('2.5.0 net accounts vacío: todo null', eq(parseNetAccounts(''), { cambioDias: null, minLongitud: null, bloqueoIntentos: null }), parseNetAccounts(''));
  check('2.5.0 inactivity 350', parseInactivityTimeout('350') === 350);
  check('2.5.0 inactivity vacío: null', parseInactivityTimeout('') === null);
  check('2.5.0 inactivity texto: null', parseInactivityTimeout('no hay') === null);
  check('2.5.0 screenSave 1|350', eq(parseScreenSave('1|350'), { active: true, timeout: 350 }), parseScreenSave('1|350'));
  check('2.5.0 screenSave 0|600: activo false, timeout 600', eq(parseScreenSave('0|600'), { active: false, timeout: 600 }), parseScreenSave('0|600'));
  check('2.5.0 screenSave vacío: nulls', eq(parseScreenSave(''), { active: null, timeout: null }), parseScreenSave(''));
  check('2.5.0 localUser sistemas|True', eq(parseLocalUserSistemas('sistemas|True'), { existe: true, habilitada: true }), parseLocalUserSistemas('sistemas|True'));
  check('2.5.0 localUser sistemas|False: existe, deshabilitada', eq(parseLocalUserSistemas('sistemas|False'), { existe: true, habilitada: false }), parseLocalUserSistemas('sistemas|False'));
  check('2.5.0 localUser vacío: no existe', eq(parseLocalUserSistemas(''), { existe: false, habilitada: null }), parseLocalUserSistemas(''));
  check('2.5.0 politicasCumple todo bien (90/10/5/350)', politicasCumple({ cambioDias: 90, minLongitud: 10, bloqueoIntentos: 5, bloqueoSegundos: 350 }).cumple === true, politicasCumple({ cambioDias: 90, minLongitud: 10, bloqueoIntentos: 5, bloqueoSegundos: 350 }));
  check('2.5.0 politicasCumple cambio 120: no cumple', politicasCumple({ cambioDias: 120, minLongitud: 10, bloqueoIntentos: 5, bloqueoSegundos: 350 }).cumple === false && politicasCumple({ cambioDias: 120, minLongitud: 10, bloqueoIntentos: 5, bloqueoSegundos: 350 }).cumpleCambio === false, politicasCumple({ cambioDias: 120, minLongitud: 10, bloqueoIntentos: 5, bloqueoSegundos: 350 }));
  check('2.5.0 politicasCumple bloqueo 300: cumpleBloqueo false (umbral 350 del teléfono)', politicasCumple({ cambioDias: 90, minLongitud: 10, bloqueoIntentos: 5, bloqueoSegundos: 300 }).cumpleBloqueo === false, politicasCumple({ cambioDias: 90, minLongitud: 10, bloqueoIntentos: 5, bloqueoSegundos: 300 }));
  check('2.5.0 politicasCumple bloqueo 600: cumpleBloqueo true', politicasCumple({ cambioDias: 90, minLongitud: 10, bloqueoIntentos: 5, bloqueoSegundos: 600 }).cumpleBloqueo === true, politicasCumple({ cambioDias: 90, minLongitud: 10, bloqueoIntentos: 5, bloqueoSegundos: 600 }));
  check('2.5.0 politicasCumple sin datos: cumple null', politicasCumple({}).cumple === null, politicasCumple({}));
  check('2.5.0 politicasCumple parcial (solo cambio 90): cumple true', politicasCumple({ cambioDias: 90 }).cumple === true, politicasCumple({ cambioDias: 90 }));

  // Integración: políticas + sistemas + impresora en detectChecks.
  r = await detectChecks(makeOverrides({
    netAccounts: NET_ES,
    inactivityTimeout: '350',
    screenSave: '1|600',
    localUserSistemas: 'sistemas|True',
    files: ['C:\\\\Users\\\\sistemas'],
    printers: ['HP LaserJet Pro', 'Microsoft Print to PDF'],
    uninstall: ['Google Chrome'],
    hotfix: '2026-11-12',
    battery: { hasBattery: false, isCharging: false, percent: 0 },
    serial: 'ABC123',
  }));
  check('2.5.0 integración: politicas.cambioDias 90', r.detalles.politicas && r.detalles.politicas.cambioDias === 90, r.detalles.politicas);
  check('2.5.0 integración: politicas.minLongitud 10', r.detalles.politicas && r.detalles.politicas.minLongitud === 10, r.detalles.politicas);
  check('2.5.0 integración: politicas.bloqueoIntentos 5', r.detalles.politicas && r.detalles.politicas.bloqueoIntentos === 5, r.detalles.politicas);
  check('2.5.0 integración: bloqueoSegundos 350 (mínimo de GPO 350 y protector 600)', r.detalles.politicas && r.detalles.politicas.bloqueoSegundos === 350, r.detalles.politicas);
  check('2.5.0 integración: politicas.cumple true', r.detalles.politicas && r.detalles.politicas.cumple === true, r.detalles.politicas);
  check('2.5.0 integración: politicasFuente menciona net accounts y directiva', typeof r.detalles.politicasFuente === 'string' && r.detalles.politicasFuente.indexOf('net accounts') >= 0 && r.detalles.politicasFuente.indexOf('directiva de grupo') >= 0, r.detalles);
  check('2.5.0 integración: usuarioSistemas true', r.detalles.usuarioSistemas === true, r.detalles);
  check('2.5.0 integración: usuarioSistemasFuente cuenta + perfil', typeof r.detalles.usuarioSistemasFuente === 'string' && r.detalles.usuarioSistemasFuente.indexOf('cuenta local') >= 0 && r.detalles.usuarioSistemasFuente.indexOf('perfil') >= 0, r.detalles);
  check('2.5.0 integración: impresora es la primera real', r.detalles.impresora === 'HP LaserJet Pro', r.detalles);
  check('2.5.0 integración: t9 marcado', r.checks.t9 === true, r.checks);

  // Negativo: sin políticas, sin cuenta ni perfil, sin impresora real.
  r = await detectChecks(makeOverrides({
    netAccounts: '',
    inactivityTimeout: '',
    screenSave: '',
    localUserSistemas: '',
    printers: ['Microsoft Print to PDF'],
    uninstall: [],
    hotfix: '2026-11-12',
    battery: { hasBattery: false, isCharging: false, percent: 0 },
    serial: 'ABC123',
  }));
  check('2.5.0 sin datos: politicas ausente', r.detalles.politicas === undefined, r.detalles);
  check('2.5.0 sin cuenta ni perfil: usuarioSistemas false', r.detalles.usuarioSistemas === false, r.detalles);
  check('2.5.0 sin cuenta ni perfil: fuente dice sin cuenta ni perfil', r.detalles.usuarioSistemasFuente === 'sin cuenta ni perfil', r.detalles);
  check('2.5.0 sin impresora real: detalles.impresora ausente', r.detalles.impresora === undefined, r.detalles);
  check('2.5.0 sin impresora real: t9 sin marcar', r.checks.t9 === undefined, r.checks);

  // Solo perfil (usuario de dominio sin cuenta local): también cuenta.
  r = await detectChecks(makeOverrides({
    netAccounts: NET_ES,
    inactivityTimeout: '',
    screenSave: '1|350',
    localUserSistemas: '',
    files: ['C:\\\\Users\\\\sistemas'],
    printers: [],
    uninstall: [],
    hotfix: '2026-11-12',
    battery: { hasBattery: false, isCharging: false, percent: 0 },
    serial: 'ABC123',
  }));
  check('2.5.0 solo perfil: usuarioSistemas true', r.detalles.usuarioSistemas === true, r.detalles);
  check('2.5.0 solo perfil: fuente dice perfil', typeof r.detalles.usuarioSistemasFuente === 'string' && r.detalles.usuarioSistemasFuente.indexOf('perfil') >= 0, r.detalles);
  check('2.5.0 solo protector: bloqueoSegundos 350', r.detalles.politicas && r.detalles.politicas.bloqueoSegundos === 350, r.detalles.politicas);

  console.log('\\n== resumen: ' + pass + ' pasaron, ' + fail + ' fallaron ==');""",
    "casos 2.5.0",
)

SRC.write_text(text, encoding="utf-8")
print("test-detect-checks.js parcheado (2.5.0)")
