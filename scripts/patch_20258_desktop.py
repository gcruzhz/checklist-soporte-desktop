# Parche escritorio 2.5.8: actualizaciones de Windows (WUA).
import sys

# ---------- detect.js ----------
P = '/home/hatch/workspace/android/checklist-desktop/detect.js'
s = open(P, encoding='utf-8').read()

def rep(old, new, n=1):
    global s
    c = s.count(old)
    assert c == n, 'NO ENCONTRADO x%d (esperado %d): %r' % (c, n, old[:120])
    s = s.replace(old, new)

# --- 1. Bloque nuevo después de cambiarPasswordSistemas (antes de withTimeout).
rep("""function withTimeout(promise, ms) {""",
"""// --- Actualizaciones de Windows (258) ---
// Sin el módulo PSWindowsUpdate (no viene instalado en Windows): se usa
// la API de Windows Update Agent vía COM. La búsqueda NO necesita
// elevación; la instalación sí (directo si la app corre elevada, si no
// un .ps1 temporal con UAC que se borra al terminar, como en 257).
// La búsqueda puede tardar minutos y la instalación mucho más, así que
// los tiempos de espera son generosos y la UI nunca se bloquea: el
// renderer solo recibe el resultado cuando termina. La app NUNCA
// reinicia sola: si Windows pide reinicio, solo se avisa.
const WUA_SEARCH_TIMEOUT_MS = 15 * 60 * 1000;
const WUA_INSTALL_TIMEOUT_MS = 120 * 60 * 1000;

function runPowerShellLong(script, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(String(stdout || '')))
    );
  });
}

// Búsqueda WUA: una línea WUA-UPDATE:<KB>|<título> por actualización,
// luego WUA-COUNT:<n> y WUA-OK. Si algo falla, WUA-ERR.
function buildBuscarActualizacionesScript() {
  return "try { " +
    "$s = New-Object -ComObject Microsoft.Update.Session; " +
    "$sr = $s.CreateUpdateSearcher(); " +
    "$res = $sr.Search(\\"IsInstalled=0 and Type='Software'\\"); " +
    "foreach ($u in $res.Updates) { $kb = ($u.KBArticleIDs -join ','); 'WUA-UPDATE:' + $kb + '|' + $u.Title } " +
    "'WUA-COUNT:' + $res.Updates.Count; 'WUA-OK' " +
    "} catch { 'WUA-ERR' }";
}

// Última actualización instalada (Get-HotFix, InstalledOn más reciente).
function buildUltimaActualizacionScript() {
  return "try { $h = Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 1; " +
    "if ($h -and $h.InstalledOn) { 'WUA-LAST:' + $h.InstalledOn.ToString('yyyy-MM-dd') } else { 'WUA-LAST:' } } catch { 'WUA-LAST:' }";
}

function parseUltimaActualizacion(output) {
  const m = String(output || '').match(/WUA-LAST:(\\d{4}-\\d{2}-\\d{2})/);
  return m ? m[1] : '';
}

function parseBuscarActualizacionesOutput(out) {
  const s = String(out || '');
  if (s.indexOf('WUA-ERR') !== -1 || s.indexOf('WUA-OK') === -1) return { ok: false, pendientes: [], error: 'Windows Update no respondió.' };
  const pendientes = [];
  s.split(/\\r?\\n/).forEach(function (line) {
    const m = /^WUA-UPDATE:([^|]*)\\|(.*)$/.exec(line.trim());
    if (m) pendientes.push({ kb: m[1].trim(), titulo: m[2].trim() });
  });
  return { ok: true, pendientes: pendientes };
}

async function buscarActualizaciones(overrides) {
  const runLong = (overrides && overrides.runPsLong) || runPowerShellLong;
  const runPs = (overrides && overrides.runPs) || runPowerShell;
  try {
    const out = await runLong(buildBuscarActualizacionesScript(), WUA_SEARCH_TIMEOUT_MS);
    const parsed = parseBuscarActualizacionesOutput(out);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    let ultima = '';
    try {
      const hot = await withTimeout(runPs(buildUltimaActualizacionScript()), CHECK_TIMEOUT_MS);
      ultima = parseUltimaActualizacion(hot);
    } catch (e) { ultima = ''; }
    return { ok: true, pendientes: parsed.pendientes, ultimaInstalada: ultima, ultimaBusqueda: new Date().toISOString().slice(0, 10) };
  } catch (e) {
    return { ok: false, error: 'Windows Update no respondió.' };
  }
}

// Instalación WUA: vuelve a buscar las pendientes en la misma sesión y
// las instala (ResultCode 2 = instalada). Tokens WUA-INST-OK:<n>,
// WUA-INST-FAIL:<n>, WUA-REBOOT:SI|NO; si no hay pendientes, 0/0/NO.
function buildInstalarActualizacionesScript() {
  return "try { " +
    "$s = New-Object -ComObject Microsoft.Update.Session; " +
    "$sr = $s.CreateUpdateSearcher(); " +
    "$res = $sr.Search(\\"IsInstalled=0 and Type='Software'\\"); " +
    "if ($res.Updates.Count -eq 0) { 'WUA-INST-OK:0'; 'WUA-INST-FAIL:0'; 'WUA-REBOOT:NO' } else { " +
    "$inst = $s.CreateUpdateInstaller(); $inst.Updates = $res.Updates; " +
    "$r = $inst.Install(); " +
    "$ok = 0; $mal = 0; for ($i = 0; $i -lt $res.Updates.Count; $i++) { if ($r.GetUpdateResult($i).ResultCode -eq 2) { $ok++ } else { $mal++ } } " +
    "'WUA-INST-OK:' + $ok; 'WUA-INST-FAIL:' + $mal; " +
    "if ($r.RebootRequired) { 'WUA-REBOOT:SI' } else { 'WUA-REBOOT:NO' } } " +
    "} catch { 'WUA-ERR' }";
}

function parseInstalarActualizacionesOutput(out) {
  const s = String(out || '');
  if (s.indexOf('WUA-ERR') !== -1) return { ok: false, error: 'No se pudieron instalar las actualizaciones.' };
  const okM = /WUA-INST-OK:(\\d+)/.exec(s);
  const failM = /WUA-INST-FAIL:(\\d+)/.exec(s);
  if (!okM || !failM) return { ok: false, error: 'No se pudieron instalar las actualizaciones.' };
  return { ok: true, instaladas: parseInt(okM[1], 10), fallidas: parseInt(failM[1], 10), reinicioRequerido: s.indexOf('WUA-REBOOT:SI') !== -1 };
}

async function instalarActualizaciones(overrides) {
  const runLong = (overrides && overrides.runPsLong) || runPowerShellLong;
  const runPs = (overrides && overrides.runPs) || runPowerShell;
  let elevado = false;
  try {
    const out = await withTimeout(runPs(PS_IS_ADMIN), CHECK_TIMEOUT_MS);
    elevado = String(out || '').trim().toLowerCase().indexOf('true') !== -1;
  } catch (e) { elevado = false; }
  const script = buildInstalarActualizacionesScript();
  if (elevado) {
    try {
      const out = await runLong(script, WUA_INSTALL_TIMEOUT_MS);
      return parseInstalarActualizacionesOutput(out);
    } catch (e) {
      return { ok: false, error: 'No se pudieron instalar las actualizaciones.' };
    }
  }
  // Sin elevación: .ps1 temporal con UAC que devuelve su salida por un
  // archivo temporal (el proceso elevado no puede devolver stdout por
  // Start-Process). Ambos temporales se borran al terminar.
  const runElevatedOut = (overrides && overrides.runElevatedOutput) || runElevatedPsFileOutput;
  try {
    const res = await runElevatedOut(script, WUA_INSTALL_TIMEOUT_MS);
    if (!res || res.code !== 0) return { ok: false, error: 'Se necesita permiso de administrador para instalar las actualizaciones.' };
    return parseInstalarActualizacionesOutput(res.output || '');
  } catch (e) {
    return { ok: false, error: 'Se necesita permiso de administrador para instalar las actualizaciones.' };
  }
}

// Variante de runElevatedPsFile que captura la salida del .ps1 elevado
// en un archivo temporal (Start-Process no devuelve el stdout del hijo).
// Devuelve { code, output }. Los dos temporales se borran siempre.
async function runElevatedPsFileOutput(script, timeoutMs) {
  const tmp = path.join(os.tmpdir(), 'checklist-wua-' + crypto.randomBytes(8).toString('hex') + '.ps1');
  const outFile = path.join(os.tmpdir(), 'checklist-wua-' + crypto.randomBytes(8).toString('hex') + '.txt');
  fs.writeFileSync(tmp, script + "\\n", 'utf8');
  const timeout = timeoutMs || ELEVATED_TIMEOUT_MS;
  try {
    const out = await new Promise((resolve, reject) => {
      execFile('powershell',
        ['-NoProfile', '-NonInteractive', '-Command',
         "$p = Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','" + tmp.replace(/'/g, "''") + "' -Wait -PassThru -RedirectStandardOutput '" + outFile.replace(/'/g, "''") + "'; 'PS-EXIT:' + $p.ExitCode"],
        { timeout: timeout, windowsHide: true, maxBuffer: 1024 * 1024 },
        (err, stdout) => (err ? reject(err) : resolve(String(stdout || ''))));
    });
    const m = /PS-EXIT:(-?\\d+)/.exec(out);
    let output = '';
    try { output = fs.readFileSync(outFile, 'utf8'); } catch (e) { output = ''; }
    return { code: m ? parseInt(m[1], 10) : -1, output: output };
  } finally {
    try { fs.unlinkSync(tmp); } catch (e) { /* ya borrado */ }
    try { fs.unlinkSync(outFile); } catch (e) { /* ya borrado */ }
  }
}

function withTimeout(promise, ms) {""")

# --- 2. Exportar lo nuevo.
rep("""  PS_IS_ADMIN,
  ELEVATED_TIMEOUT_MS,""",
"""  PS_IS_ADMIN,
  ELEVATED_TIMEOUT_MS,
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
  runElevatedPsFileOutput,""")

open(P, 'w', encoding='utf-8').write(s)
print('OK detect.js, bytes:', len(s))
print('WUA refs:', s.count('WUA-'), '| buscarActualizaciones:', s.count('buscarActualizaciones'), '| instalarActualizaciones:', s.count('instalarActualizaciones'))

# ---------- main.js ----------
P = '/home/hatch/workspace/android/checklist-desktop/main.js'
s = open(P, encoding='utf-8').read()

def rep2(old, new, n=1):
    global s
    c = s.count(old)
    assert c == n, 'MAIN NO ENCONTRADO x%d (esperado %d): %r' % (c, n, old[:120])
    s = s.replace(old, new)

rep2("const { detectMachine, detectChecks, getMachineId, verificarPasswordSistemas, cambiarPasswordSistemas } = require('./detect');",
     "const { detectMachine, detectChecks, getMachineId, verificarPasswordSistemas, cambiarPasswordSistemas, buscarActualizaciones, instalarActualizaciones } = require('./detect');")
rep2("""ipcMain.handle('desktop-cambiar-password-sistemas', async (event, usuario, actual, nueva) => cambiarPasswordSistemas({}, usuario, actual, nueva));""",
"""ipcMain.handle('desktop-cambiar-password-sistemas', async (event, usuario, actual, nueva) => cambiarPasswordSistemas({}, usuario, actual, nueva));

// Actualizaciones de Windows (258): búsqueda e instalación con la API
// WUA. La instalación pide permiso de administrador si hace falta; la
// app nunca reinicia sola (solo avisa si Windows pide reinicio).
ipcMain.handle('desktop-buscar-actualizaciones', async () => buscarActualizaciones({}));
ipcMain.handle('desktop-instalar-actualizaciones', async () => instalarActualizaciones({}));""")

open(P, 'w', encoding='utf-8').write(s)
print('OK main.js')

# ---------- preload.js ----------
P = '/home/hatch/workspace/android/checklist-desktop/preload.js'
s = open(P, encoding='utf-8').read()

def rep3(old, new, n=1):
    global s
    c = s.count(old)
    assert c == n, 'PRELOAD NO ENCONTRADO x%d (esperado %d): %r' % (c, n, old[:120])
    s = s.replace(old, new)

rep3("""  cambiarPasswordSistemas: (usuario, actual, nueva) => ipcRenderer.invoke('desktop-cambiar-password-sistemas', usuario, actual, nueva),""",
"""  cambiarPasswordSistemas: (usuario, actual, nueva) => ipcRenderer.invoke('desktop-cambiar-password-sistemas', usuario, actual, nueva),
  // Actualizaciones de Windows (258): buscar las pendientes e
  // instalarlas (pide permiso de administrador). Nunca reinicia sola.
  buscarActualizaciones: () => ipcRenderer.invoke('desktop-buscar-actualizaciones'),
  instalarActualizaciones: () => ipcRenderer.invoke('desktop-instalar-actualizaciones'),""")

open(P, 'w', encoding='utf-8').write(s)
print('OK preload.js')
