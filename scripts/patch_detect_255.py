# -*- coding: utf-8 -*-
"""Parche 2.5.5 detector: punto 3 (gpedit.msc).
- parseRegistryPol: formato binario PReg de
  C:\\Windows\\System32\\GroupPolicy\\Machine|User\\Registry.pol
  (InactivityTimeoutSecs, ScreenSaveTimeOut, ScreenSaveActive).
- parseSeceditInf: `secedit /export` (.inf UTF-16LE, [System Access])
  con MaximumPasswordAge / MinimumPasswordLength / PasswordComplexity /
  LockoutBadCount / LockoutDuration (min -> s) / ResetLockoutCount.
  LockoutDuration 0 = bloqueo hasta desbloqueo manual.
- Cadena de prioridad en la tarea de politicas: Registry.pol >
  registro (PS) para inactividad/protector; secedit > net accounts para
  las directivas de cuenta. Fuente por valor en politicasFuente:
  'gpedit (Registry.pol)' / 'directiva (secedit)' / 'net accounts' /
  'registro'. politicasCumple: bloqueoManual -> cumpleBloqueo true.
- readFileBin como override (pruebas) / fs.readFileSync (produccion).
Uso: python3 scripts/patch_detect_255.py
"""
import io

P = '/home/hatch/workspace/android/checklist-desktop/detect.js'
s = io.open(P, encoding='utf-8').read()
n0 = len(s)

def rep(old, new, cnt=1, tag=''):
    global s
    c = s.count(old)
    assert c == cnt, 'REP %s: esperado %d, hallado %d: %r' % (tag, cnt, c, old[:90])
    s = s.replace(old, new)

# --- 1. Parsers de gpedit antes de politicasCumple ---
rep('''// Cumplimiento de las políticas con los mismos umbrales que
// mantPoliticasCumple() en la app del teléfono (que los recalcula
// desde los valores crudos): cambio <= 90 días, longitud >= 10,
// intentos <= 5, bloqueo >= 350 s. Sin dato va null; `cumple` es true
// solo si todos los valores conocidos cumplen, false si alguno no
// cumple, null si no hay ningún valor.
function politicasCumple(p) {''',
'''// --- Directiva de grupo local, gpedit.msc (2.5.5) ---
//
// Gerardo: "Las directivas se revisan en gpedit.msc". El almacén de la
// directiva local es C:\\Windows\\System32\\GroupPolicy\\Machine\\Registry.pol
// (equipo) y ...\\User\\Registry.pol (usuario), formato binario PReg:
// cabecera "PReg" + versión DWORD, luego entradas '[' + clave UTF-16LE
// + ';' + nombre de valor + ';' + tipo DWORD + ';' + tamaño DWORD +
// datos + ']'. Solo se leen los valores de directiva que le importan al
// detector; nunca contraseñas ni secretos.
const GPOL_VALUE_NAMES = ['InactivityTimeoutSecs', 'ScreenSaveTimeOut', 'ScreenSaveActive'];

function registryPolValue(type, data) {
  if (type === 4) return data.length >= 4 ? data.readUInt32LE(0) : null; // REG_DWORD
  if (type === 1 || type === 2) { // REG_SZ / REG_EXPAND_SZ
    const str = data.toString('utf16le').replace(/\\0+$/, '');
    if (str === '') return null;
    const n = Number(str);
    return Number.isFinite(n) ? n : str;
  }
  if (type === 11) { // REG_QWORD
    try {
      const v = data.readBigUInt64LE(0);
      return v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : null;
    } catch (e) { return null; }
  }
  return null;
}

function parseRegistryPol(buf) {
  const out = {};
  if (!Buffer.isBuffer(buf) || buf.length < 8) return out;
  if (buf[0] !== 0x50 || buf[1] !== 0x52 || buf[2] !== 0x65 || buf[3] !== 0x67) return out; // "PReg"
  let off = 8;
  const readUtf16z = () => {
    let end = off;
    while (end + 1 < buf.length && !(buf[end] === 0 && buf[end + 1] === 0)) end += 2;
    const str = buf.toString('utf16le', off, end);
    off = end + 2;
    return str;
  };
  while (off < buf.length) {
    if (buf[off] !== 0x5b) break; // '['
    off += 1;
    readUtf16z(); // clave (no se necesita: el nombre de valor basta)
    if (buf[off] !== 0x3b) break; // ';'
    off += 1;
    const name = readUtf16z();
    if (buf[off] !== 0x3b) break;
    off += 1;
    if (off + 8 > buf.length) break;
    const type = buf.readUInt32LE(off); off += 4;
    const size = buf.readUInt32LE(off); off += 4;
    if (off + size > buf.length) break;
    const data = buf.subarray(off, off + size);
    off += size;
    if (buf[off] !== 0x5d) break; // ']'
    off += 1;
    if (GPOL_VALUE_NAMES.indexOf(name) >= 0) out[name] = registryPolValue(type, data);
  }
  return out;
}

// `secedit /export` (directivas de cuenta de gpedit: Configuración de
// seguridad): archivo .inf UTF-16LE con [System Access]
// MaximumPasswordAge, MinimumPasswordLength, PasswordComplexity,
// LockoutBadCount, LockoutDuration (minutos), ResetLockoutCount.
// LockoutDuration 0 = bloqueo hasta desbloqueo manual. MaximumPasswordAge
// -1 = nunca caduca (sin dato). Todo se convierte a las unidades del
// detector (días / segundos). La duración de bloqueo de cuenta va en
// lockoutSegundos, distinta de bloqueoSegundos (bloqueo por inactividad).
function parseSeceditInf(text) {
  const str = (Buffer.isBuffer(text) ? text.toString('utf16le') : String(text || '')).replace(/^\\uFEFF/, '');
  const get = (name) => {
    const m = str.match(new RegExp('^\\\\s*' + name + '\\\\s*=\\\\s*(-?\\\\d+)', 'im'));
    return m ? Number(m[1]) : null;
  };
  const maxAge = get('MaximumPasswordAge');
  const lockMin = get('LockoutDuration');
  const resetMin = get('ResetLockoutCount');
  return {
    cambioDias: maxAge === null || maxAge < 0 ? null : maxAge,
    minLongitud: get('MinimumPasswordLength'),
    complejidad: get('PasswordComplexity'),
    bloqueoIntentos: get('LockoutBadCount'),
    lockoutSegundos: lockMin === null ? null : lockMin * 60,
    bloqueoManual: lockMin === 0,
    resetLockoutSegundos: resetMin === null ? null : resetMin * 60,
  };
}

// Cumplimiento de las políticas con los mismos umbrales que
// mantPoliticasCumple() en la app del teléfono (que los recalcula
// desde los valores crudos): cambio <= 90 días, longitud >= 10,
// intentos <= 5, bloqueo >= 350 s. Sin dato va null; `cumple` es true
// solo si todos los valores conocidos cumplen, false si alguno no
// cumple, null si no hay ningún valor. bloqueoManual (LockoutDuration 0
// en la directiva: la cuenta queda bloqueada hasta desbloqueo manual)
// hace cumpleBloqueo true sin importar los segundos.
function politicasCumple(p) {''', tag='parsers-gpedit')

# --- 2. politicasCumple: bloqueoManual ---
rep('''  const bloq = num(p.bloqueoSegundos);
  const cC = cambio === null ? null : cambio <= 90;''',
'''  const bloq = num(p.bloqueoSegundos);
  const manual = p.bloqueoManual === true;
  const cC = cambio === null ? null : cambio <= 90;''', tag='cumple-manual')
rep('''  const cB = bloq === null ? null : bloq >= 350;''',
'''  const cB = manual ? true : (bloq === null ? null : bloq >= 350);''', tag='cumple-cB')
rep('''    bloqueoSegundos: bloq,
    cumpleCambio: cC,''',
'''    bloqueoSegundos: bloq,
    bloqueoManual: manual,
    lockoutSegundos: num(p.lockoutSegundos),
    complejidad: num(p.complejidad),
    cumpleCambio: cC,''', tag='cumple-return')

# --- 3. overrides: readFileBin ---
rep('''//   fileExists: (p) => bool, listDir: (dir) => [nombres],''',
'''//   fileExists: (p) => bool, listDir: (dir) => [nombres],
//   readFileBin: (p) => Buffer (Registry.pol y el .inf de secedit),''', tag='overrides-doc')
rep('''    const listDir = overrides.listDir || ((dir) => {
      try {
        return fs.readdirSync(dir);
      } catch (e) {
        return [];
      }
    });''',
'''    const listDir = overrides.listDir || ((dir) => {
      try {
        return fs.readdirSync(dir);
      } catch (e) {
        return [];
      }
    });
    const readFileBin = overrides.readFileBin || ((p) => fs.readFileSync(p));''', tag='overrides-const')

# --- 4. Tarea de politicas: reescritura completa (por anclas) ---
start = s.index("      // Políticas de seguridad (2.5.0, Mantenimientos Preventivos):")
endm = "      // Usuario 'sistemas' (2.5.0, Mantenimientos Preventivos): cuenta"
end = s.index(endm)
span = s[start:end]
assert span.count("tasks.push") == 1, 'span politicas: tasks.push != 1'
assert "parseNetAccounts(out)" in span, 'span politicas: sin parseNetAccounts'
assert "detalles.politicas = politicasCumple" in span, 'span politicas: sin politicasCumple'
assert "detalles.politicasFuente" in span, 'span politicas: sin politicasFuente'
new_task = '''      // Políticas de seguridad (2.5.0, Mantenimientos Preventivos;
      // 2.5.5 lee además la directiva local de gpedit.msc):
      // 1) Registry.pol (Machine + User) para InactivityTimeoutSecs y
      //    ScreenSaveTimeOut/ScreenSaveActive — fuente 'gpedit
      //    (Registry.pol)'.
      // 2) `secedit /export` para las directivas de cuenta
      //    (MaximumPasswordAge, MinimumPasswordLength, PasswordComplexity,
      //    LockoutBadCount, LockoutDuration) — fuente 'directiva
      //    (secedit)'. secedit necesita administrador: si falla, se cae
      //    a `net accounts` — fuente 'net accounts'.
      // 3) Respaldo: las lecturas de registro actuales (PS
      //    InactivityTimeoutSecs y ScreenSaveTimeOut) — fuente 'registro'.
      // El bloqueo efectivo es el menor de los valores presentes y > 0
      // (el que se dispara primero); si ninguno se puede leer,
      // bloqueoSegundos va null (sin dato, no inventado). LockoutDuration
      // 0 = bloqueo hasta desbloqueo manual (bloqueoManual: true, cumple
      // el bloqueo). detalles.politicas lleva los valores crudos + los
      // campos cumple* (misma lógica que la app del teléfono);
      // detalles.politicasFuente dice de dónde salió cada valor. Solo se
      // escribe detalles.politicas si al menos un valor se pudo leer. No
      // es un punto del checklist: no marca ningún t*.
      tasks.push(
        (async () => {
          try {
            // (2.5.5) Directiva local: Registry.pol de equipo y usuario.
            let gpol = {};
            try {
              const windir = process.env.SystemRoot || 'C:\\\\Windows';
              const polMachine = pth.join(windir, 'System32', 'GroupPolicy', 'Machine', 'Registry.pol');
              const polUser = pth.join(windir, 'System32', 'GroupPolicy', 'User', 'Registry.pol');
              const bMachine = await readFileBin(polMachine);
              const bUser = await readFileBin(polUser);
              gpol = Object.assign({}, parseRegistryPol(bMachine), parseRegistryPol(bUser));
            } catch (e) {
              /* sin almacén de directiva local */
            }
            // (2.5.5) Directivas de cuenta: secedit (admin) o net accounts.
            let sec = null;
            try {
              const tmpDir = process.env.TEMP || process.env.TMP || 'C:\\\\Windows\\\\Temp';
              const cfg = pth.join(tmpDir, 'checklist-soporte-secedit.inf');
              await withTimeout(runCmd('secedit', ['/export', '/cfg', cfg, '/quiet']), CHECK_TIMEOUT_MS);
              const inf = await readFileBin(cfg);
              sec = parseSeceditInf(inf);
            } catch (e) {
              /* secedit sin permisos o sin archivo: cae a net accounts */
            }
            let na = { cambioDias: null, minLongitud: null, bloqueoIntentos: null };
            try {
              const out = await withTimeout(runCmd('net', ['accounts']), CHECK_TIMEOUT_MS);
              na = parseNetAccounts(out);
            } catch (e) {
              /* sin política de cuentas */
            }
            // Por valor: secedit manda si trae el dato; si no, net accounts.
            const secVal = (k) => (sec && sec[k] !== null && sec[k] !== undefined ? sec[k] : null);
            const cuenta = {
              cambioDias: secVal('cambioDias') !== null ? secVal('cambioDias') : na.cambioDias,
              minLongitud: secVal('minLongitud') !== null ? secVal('minLongitud') : na.minLongitud,
              bloqueoIntentos: secVal('bloqueoIntentos') !== null ? secVal('bloqueoIntentos') : na.bloqueoIntentos,
            };
            const srcCuenta = (k, v) => {
              if (v === null) return null;
              return secVal(k) !== null ? 'directiva (secedit)' : 'net accounts';
            };
            // Inactividad y protector: Registry.pol primero, registro (PS) después.
            let inactivity = null;
            let inactivityFuente = null;
            if (gpol.InactivityTimeoutSecs !== undefined && gpol.InactivityTimeoutSecs !== null) {
              inactivity = Number(gpol.InactivityTimeoutSecs);
              if (!Number.isFinite(inactivity)) inactivity = null;
              else inactivityFuente = 'gpedit (Registry.pol)';
            }
            if (inactivity === null) {
              try {
                const out = await withTimeout(runPs(PS_INACTIVITY_TIMEOUT), CHECK_TIMEOUT_MS);
                inactivity = parseInactivityTimeout(out);
                if (inactivity !== null) inactivityFuente = 'registro';
              } catch (e) {
                /* sin directiva de grupo */
              }
            }
            let screen = { active: null, timeout: null };
            let screenFuente = null;
            if (gpol.ScreenSaveTimeOut !== undefined && gpol.ScreenSaveTimeOut !== null) {
              screen.timeout = Number(gpol.ScreenSaveTimeOut);
              if (!Number.isFinite(screen.timeout)) screen.timeout = null;
              else {
                screenFuente = 'gpedit (Registry.pol)';
                screen.active = gpol.ScreenSaveActive !== undefined && gpol.ScreenSaveActive !== null
                  ? Number(gpol.ScreenSaveActive) !== 0
                  : true;
              }
            }
            if (screen.timeout === null) {
              try {
                const out = await withTimeout(runPs(PS_SCREENSAVE), CHECK_TIMEOUT_MS);
                screen = parseScreenSave(out);
                if (screen.timeout !== null) screenFuente = 'registro';
              } catch (e) {
                /* sin protector */
              }
            }
            // Bloqueo efectivo: el menor de los valores presentes y > 0.
            const cands = [];
            if (inactivity !== null && inactivity > 0) cands.push(inactivity);
            if (screen.active && screen.timeout !== null && screen.timeout > 0) {
              cands.push(screen.timeout);
            }
            const bloqueo = cands.length ? Math.min.apply(null, cands) : null;
            const bloqueoManual = !!(sec && sec.bloqueoManual);
            const fuentes = [];
            const addFuente = (f) => { if (f && fuentes.indexOf(f) < 0) fuentes.push(f); };
            addFuente(srcCuenta('cambioDias', cuenta.cambioDias));
            addFuente(srcCuenta('minLongitud', cuenta.minLongitud));
            addFuente(srcCuenta('bloqueoIntentos', cuenta.bloqueoIntentos));
            if (inactivity !== null && inactivity > 0) addFuente(inactivityFuente);
            if (screen.active && screen.timeout !== null && screen.timeout > 0) addFuente(screenFuente);
            if (bloqueoManual) addFuente('directiva (secedit)');
            if (
              cuenta.cambioDias !== null ||
              cuenta.minLongitud !== null ||
              cuenta.bloqueoIntentos !== null ||
              bloqueo !== null ||
              bloqueoManual
            ) {
              detalles.politicas = politicasCumple({
                cambioDias: cuenta.cambioDias,
                minLongitud: cuenta.minLongitud,
                bloqueoIntentos: cuenta.bloqueoIntentos,
                bloqueoSegundos: bloqueo,
                bloqueoManual: bloqueoManual,
                lockoutSegundos: sec ? sec.lockoutSegundos : null,
                complejidad: sec ? sec.complejidad : null,
              });
              if (fuentes.length) detalles.politicasFuente = fuentes.join(' + ');
            }
          } catch (e) {
            /* sin políticas */
          }
        })()
      );

'''
s = s[:start] + new_task + s[end:]

# --- 5. Exports ---
rep('''  parseLocalUserSistemas,
  politicasCumple,''',
'''  parseLocalUserSistemas,
  politicasCumple,
  parseRegistryPol,
  parseSeceditInf,
  registryPolValue,''', tag='exports')

io.open(P, 'w', encoding='utf-8').write(s)
print('OK patch detect 255: %d -> %d caracteres' % (n0, len(s)))
