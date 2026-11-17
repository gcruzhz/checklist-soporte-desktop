# Parche escritorio 2.5.7: contraseña del usuario sistemas.
import sys

def patch(path, pairs):
    s = open(path, encoding='utf-8').read()
    for old, new, n in pairs:
        c = s.count(old)
        assert c == n, '%s: NO ENCONTRADO x%d (esperado %d): %r' % (path, c, n, old[:100])
        s = s.replace(old, new)
    open(path, 'w', encoding='utf-8').write(s)
    print('OK', path, 'bytes:', len(s))

# --- preload.js: exponer los dos métodos.
patch('/home/hatch/workspace/android/checklist-desktop/preload.js', [
 ("""  getMachineId: () => ipcRenderer.invoke('desktop-get-machine-id'),""",
  """  getMachineId: () => ipcRenderer.invoke('desktop-get-machine-id'),
  // Contraseña del usuario local de Windows (257): verificar la actual
  // y cambiarla. Las contraseñas solo viajan al proceso main; nunca se
  // guardan ni se mandan a la nube.
  verificarPasswordSistemas: (usuario, actual) => ipcRenderer.invoke('desktop-verificar-password-sistemas', usuario, actual),
  cambiarPasswordSistemas: (usuario, actual, nueva) => ipcRenderer.invoke('desktop-cambiar-password-sistemas', usuario, actual, nueva),""", 1),
])

# --- main.js: handlers IPC.
patch('/home/hatch/workspace/android/checklist-desktop/main.js', [
 ("""const { detectMachine, detectChecks, getMachineId } = require('./detect');""",
  """const { detectMachine, detectChecks, getMachineId, verificarPasswordSistemas, cambiarPasswordSistemas } = require('./detect');""", 1),
 ("""ipcMain.handle('desktop-get-machine-id', async () => getMachineId());""",
  """ipcMain.handle('desktop-get-machine-id', async () => getMachineId());

// Contraseña del usuario local de Windows (257). Las contraseñas nunca
// se guardan ni se registran: solo viajan del renderer al proceso main
// y de ahí a PowerShell, en esta PC.
ipcMain.handle('desktop-verificar-password-sistemas', async (event, usuario, actual) => verificarPasswordSistemas({}, usuario, actual));
ipcMain.handle('desktop-cambiar-password-sistemas', async (event, usuario, actual, nueva) => cambiarPasswordSistemas({}, usuario, actual, nueva));""", 1),
])

# --- detect.js: lógica de contraseña (escape, scripts, verificar/cambiar).
patch('/home/hatch/workspace/android/checklist-desktop/detect.js', [
 ("""const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');""",
  """const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const path = require('path');""", 1),
 ("""function withTimeout(promise, ms) {""",
  """// --- Contraseña del usuario local de Windows (257) ---
// Windows no permite leer la contraseña actual (solo hashes): la única
// forma de "comparar" una contraseña vieja es intentar validarla con
// ValidateCredentials. La contraseña nueva nunca se guarda, no va a
// Firestore, no se registra en logs ni se imprime: solo viaja a
// PowerShell en esta PC. El cambio exige elevación: si la app ya corre
// elevada, Set-LocalUser directo; si no, un .ps1 temporal ejecutado con
// UAC (Start-Process -Verb RunAs) que se borra inmediatamente después.

// Escape para cadenas PowerShell entre comillas simples: ' -> ''.
function psEscape(s) {
  return String(s || '').replace(/'/g, "''");
}

// Script de verificación: PS-OK (correcta), PS-FAIL (incorrecta),
// PS-NOUSER (el usuario no existe), PS-ERR (no se pudo verificar).
function buildVerificarPasswordScript(usuario, actual) {
  const u = psEscape(usuario);
  const p = psEscape(actual);
  return "try { " +
    "$lu = Get-LocalUser -Name '" + u + "' -ErrorAction SilentlyContinue; " +
    "if (-not $lu) { 'PS-NOUSER' } else { " +
    "Add-Type -AssemblyName System.DirectoryServices.AccountManagement; " +
    "$pc = [System.DirectoryServices.AccountManagement.PrincipalContext]::new([System.DirectoryServices.AccountManagement.ContextType]::Machine); " +
    "if ($pc.ValidateCredentials('" + u + "', '" + p + "')) { 'PS-OK' } else { 'PS-FAIL' } } " +
    "} catch { 'PS-ERR' }";
}

function parseVerificarPasswordOutput(out) {
  const s = String(out || '');
  if (s.indexOf('PS-OK') !== -1) return { ok: true };
  if (s.indexOf('PS-NOUSER') !== -1) return { ok: false, error: 'Usuario no encontrado.' };
  if (s.indexOf('PS-FAIL') !== -1) return { ok: false, error: 'Contraseña actual incorrecta.' };
  return { ok: false, error: 'No se pudo verificar la contraseña.' };
}

async function verificarPasswordSistemas(overrides, usuario, actual) {
  const user = String(usuario || '').trim();
  if (!user) return { ok: false, error: 'Escribe el nombre del usuario.' };
  if (!actual) return { ok: false, error: 'Escribe la contraseña actual.' };
  const runPs = (overrides && overrides.runPs) || runPowerShell;
  try {
    const out = await withTimeout(runPs(buildVerificarPasswordScript(user, actual)), CHECK_TIMEOUT_MS);
    return parseVerificarPasswordOutput(out);
  } catch (e) {
    return { ok: false, error: 'No se pudo verificar la contraseña.' };
  }
}

// Script de cambio: PS-OK + exit 0, o PS-FAIL + exit 2. La contraseña
// va como SecureString (ConvertTo-SecureString) y la variable se limpia.
function buildCambiarPasswordScript(usuario, nueva) {
  const u = psEscape(usuario);
  const p = psEscape(nueva);
  return "try { " +
    "$s = ConvertTo-SecureString '" + p + "' -AsPlainText -Force; " +
    "Set-LocalUser -Name '" + u + "' -Password $s; " +
    "Remove-Variable s -ErrorAction SilentlyContinue; 'PS-OK'; exit 0 " +
    "} catch { 'PS-FAIL'; exit 2 }";
}

const PS_IS_ADMIN = "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)";

// UAC: el usuario tarda en pulsar Sí, así que el tiempo de espera es
// mucho mayor que el de un chequeo normal. Devuelve el código de salida
// del .ps1 (0 = cambió, 2 = falló el cambio). El .ps1 temporal se borra
// siempre, aunque el UAC se cancele o el cambio falle.
const ELEVATED_TIMEOUT_MS = 120000;
async function runElevatedPsFile(script) {
  const tmp = path.join(os.tmpdir(), 'checklist-pass-' + crypto.randomBytes(8).toString('hex') + '.ps1');
  fs.writeFileSync(tmp, script + "\\n", 'utf8');
  try {
    const out = await new Promise((resolve, reject) => {
      execFile('powershell',
        ['-NoProfile', '-NonInteractive', '-Command',
         "$p = Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','" + tmp.replace(/'/g, "''") + "' -Wait -PassThru; 'PS-EXIT:' + $p.ExitCode"],
        { timeout: ELEVATED_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 },
        (err, stdout) => (err ? reject(err) : resolve(String(stdout || ''))));
    });
    const m = /PS-EXIT:(-?\\d+)/.exec(out);
    return m ? parseInt(m[1], 10) : -1;
  } finally {
    try { fs.unlinkSync(tmp); } catch (e) { /* ya borrado */ }
  }
}

async function cambiarPasswordSistemas(overrides, usuario, actual, nueva) {
  const user = String(usuario || '').trim();
  if (!user) return { ok: false, error: 'Escribe el nombre del usuario.' };
  if (!actual) return { ok: false, error: 'Escribe la contraseña actual.' };
  if (!nueva) return { ok: false, error: 'Escribe la contraseña nueva.' };
  const ver = await verificarPasswordSistemas(overrides, user, actual);
  if (!ver.ok) return ver; // sin la actual correcta, no se intenta el cambio
  const runPs = (overrides && overrides.runPs) || runPowerShell;
  let elevado = false;
  try {
    const out = await withTimeout(runPs(PS_IS_ADMIN), CHECK_TIMEOUT_MS);
    elevado = String(out || '').trim().toLowerCase().indexOf('true') !== -1;
  } catch (e) { elevado = false; }
  const script = buildCambiarPasswordScript(user, nueva);
  if (elevado) {
    try {
      const out = await withTimeout(runPs(script), CHECK_TIMEOUT_MS);
      if (String(out || '').indexOf('PS-OK') !== -1) return { ok: true };
      return { ok: false, error: 'No se pudo cambiar la contraseña.' };
    } catch (e) {
      return { ok: false, error: 'No se pudo cambiar la contraseña.' };
    }
  }
  const runElevated = (overrides && overrides.runElevated) || runElevatedPsFile;
  try {
    const code = await runElevated(script);
    if (code === 0) return { ok: true };
    if (code === 2) return { ok: false, error: 'No se pudo cambiar la contraseña.' };
    return { ok: false, error: 'Se necesita permiso de administrador para cambiar la contraseña.' };
  } catch (e) {
    return { ok: false, error: 'Se necesita permiso de administrador para cambiar la contraseña.' };
  }
}

function withTimeout(promise, ms) {""", 1),
 ("""  parseRegistryPol,
  parseSeceditInf,""",
  """  parseRegistryPol,
  parseSeceditInf,
  psEscape,
  buildVerificarPasswordScript,
  parseVerificarPasswordOutput,
  verificarPasswordSistemas,
  buildCambiarPasswordScript,
  runElevatedPsFile,
  cambiarPasswordSistemas,
  PS_IS_ADMIN,
  ELEVATED_TIMEOUT_MS,""", 1),
])
print('parches escritorio OK')
