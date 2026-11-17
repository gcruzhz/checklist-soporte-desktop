#!/usr/bin/env python3
r"""Parche 2.5.0 para detect.js: políticas de seguridad y usuario 'sistemas'.

- `net accounts` (política de contraseñas del dominio o local):
  duración máxima, longitud mínima, umbral de bloqueo.
- Bloqueo por inactividad: directiva de grupo InactivityTimeoutSecs
  o protector de pantalla (ScreenSaveTimeOut con ScreenSaveActive=1);
  el efectivo es el menor de los dos presentes y > 0.
- Usuario 'sistemas': Get-LocalUser o perfil C:\Users\sistemas.
- El detector solo mide valores crudos (detalles.politicas /
  detalles.usuarioSistemas); el cumplimiento lo calcula la app del
  teléfono con mantPoliticasCumple() (cambio <= 90, longitud >= 10,
  intentos <= 5, bloqueo >= 350). politicasCumple() replica esa lógica.
- t9 además guarda detalles.impresora = nombre de la primera
  impresora real (la app lo lee en d.impresora/detalles.impresora).

Uso: python3 scripts/patch_detect_20250.py
Hace backup en tests/detect-2.4.0.js.bak (detect.js no cambió en 2.4.0).
"""
import shutil
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
SRC = BASE / "detect.js"
BAK = BASE / "tests" / "detect-2.4.0.js.bak"

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
    """// Agente ESET Management Agent (2.3.8): se detecta por su clave de
// desinstalación (DisplayVersion), con respaldo en ERAAgent.exe y
// confirmación por el servicio EraAgentSvc o el proceso ERAAgent.exe;
// su versión va en versiones.esetAgent y NO afecta a t7 (no es
// antivirus). Si no está instalado, no va nada.
'use strict';""",
    """// Agente ESET Management Agent (2.3.8): se detecta por su clave de
// desinstalación (DisplayVersion), con respaldo en ERAAgent.exe y
// confirmación por el servicio EraAgentSvc o el proceso ERAAgent.exe;
// su versión va en versiones.esetAgent y NO afecta a t7 (no es
// antivirus). Si no está instalado, no va nada.
// 2.5.0 (Mantenimientos Preventivos): políticas de seguridad y usuario
// 'sistemas'. `net accounts` trae la política de contraseñas del
// dominio o local (duración máxima en días, longitud mínima, umbral de
// bloqueo); el bloqueo por inactividad viene de la directiva de grupo
// "Interactive logon: Machine inactivity limit"
// (HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System\\
// InactivityTimeoutSecs, segundos) o, si no está, del protector de
// pantalla (HKCU\\Control Panel\\Desktop\\ScreenSaveTimeOut, segundos,
// solo si ScreenSaveActive es 1). El bloqueo efectivo es el menor de
// los dos valores presentes y mayores que 0 (el que se dispara
// primero). Get-LocalUser dice si existe la cuenta local 'sistemas' y
// además se revisa el perfil C:\\Users\\sistemas (Gerardo:
// "cuenta/perfil de Windows con el nombre de sistemas").
// Nada de esto lee contraseñas ni secretos: son valores de
// configuración del equipo, visibles para cualquier usuario que inicie
// sesión. Los resultados van en detalles.politicas
// { cambioDias, minLongitud, bloqueoIntentos, bloqueoSegundos,
//   cumpleCambio, cumpleLongitud, cumpleIntentos, cumpleBloqueo,
//   cumple } (solo si al menos un valor se pudo leer; sin dato no se
// escribe nada, nunca se inventa) y detalles.usuarioSistemas
// (booleano; solo si al menos una de las dos pruebas se pudo correr),
// con la fuente en detalles.politicasFuente /
// detalles.usuarioSistemasFuente. El cumplimiento usa los mismos
// umbrales que mantPoliticasCumple() en la app del teléfono (cambio
// <= 90 días, longitud >= 10, intentos <= 5, bloqueo >= 350 s), que
// los recalcula desde los valores crudos: el detector mide, la app
// decide. Ninguno de estos datos es un punto del checklist (no marca
// ningún t*). t9 además guarda detalles.impresora con el nombre de la
// primera impresora real (la app lo lee para el mantenimiento).
'use strict';""",
    "cabecera 2.5.0",
)

# 2. Constantes PowerShell.
rep(
    """// Servicio del agente ESET Management Agent (2.3.8): EraAgentSvc.
// "Name|DisplayName|Status" (vacío si no está instalado). Es la
// confirmación de que el agente está presente, no la fuente de la
// versión (esa es la desinstalación o ERAAgent.exe).
const PS_SERVICES_ESET_AGENT = `Get-Service EraAgentSvc -ErrorAction SilentlyContinue | ForEach-Object { "$($_.Name)|$($_.DisplayName)|$($_.Status)" }`;""",
    """// Servicio del agente ESET Management Agent (2.3.8): EraAgentSvc.
// "Name|DisplayName|Status" (vacío si no está instalado). Es la
// confirmación de que el agente está presente, no la fuente de la
// versión (esa es la desinstalación o ERAAgent.exe).
const PS_SERVICES_ESET_AGENT = `Get-Service EraAgentSvc -ErrorAction SilentlyContinue | ForEach-Object { "$($_.Name)|$($_.DisplayName)|$($_.Status)" }`;
// Políticas de seguridad (2.5.0): directiva de grupo "Interactive
// logon: Machine inactivity limit" (segundos de inactividad antes de
// bloquear el equipo). Devuelve el número o vacío.
const PS_INACTIVITY_TIMEOUT = `(Get-ItemProperty 'HKLM:\\\\SOFTWARE\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Policies\\\\System' -Name InactivityTimeoutSecs -ErrorAction SilentlyContinue).InactivityTimeoutSecs`;
// Protector de pantalla (2.5.0): "ScreenSaveActive|ScreenSaveTimeOut"
// (activo 1/0 y segundos antes de que salte el protector). Solo
// bloquea el equipo si el protector está activo.
const PS_SCREENSAVE = `$a = (Get-ItemProperty 'HKCU:\\\\Control Panel\\\\Desktop' -Name ScreenSaveActive -ErrorAction SilentlyContinue).ScreenSaveActive; $t = (Get-ItemProperty 'HKCU:\\\\Control Panel\\\\Desktop' -Name ScreenSaveTimeOut -ErrorAction SilentlyContinue).ScreenSaveTimeOut; "$a|$t"`;
// Cuenta local 'sistemas' (2.5.0): "Nombre|Enabled" (vacío si no
// existe la cuenta).
const PS_LOCAL_USER_SISTEMAS = `Get-LocalUser -Name 'sistemas' -ErrorAction SilentlyContinue | ForEach-Object { "$($_.Name)|$($_.Enabled)" }`;""",
    "constantes PS 2.5.0",
)

# 3. Parsers + politicasCumple, tras parseHiberbootEnabled.
rep(
    """// HiberbootEnabled: '0' = inicio rápido desactivado; '1' = activado;
// '' (clave ausente) = no se puede determinar.
function parseHiberbootEnabled(output) {
  const s = String(output || '').trim();
  if (s === '0') return true;
  if (s === '1') return false;
  return null;
}""",
    """// HiberbootEnabled: '0' = inicio rápido desactivado; '1' = activado;
// '' (clave ausente) = no se puede determinar.
function parseHiberbootEnabled(output) {
  const s = String(output || '').trim();
  if (s === '0') return true;
  if (s === '1') return false;
  return null;
}

// --- Políticas de seguridad (2.5.0, Mantenimientos Preventivos) ---

// `net accounts` (política del dominio o local) en español o inglés.
// Devuelve { cambioDias, minLongitud, bloqueoIntentos } con null en lo
// que no se pueda leer (línea ausente o sin número). "Nunca"/"Never"
// no es un número: también va null.
function parseNetAccounts(output) {
  const s = String(output || '');
  const numAfter = (re) => {
    const m = s.match(re);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  };
  return {
    cambioDias: numAfter(
      /(?:duraci.n m.xima de la contrase.a \\(d.as\\)|maximum password age \\(days\\))\\s*:\\s*(\\d+)/i
    ),
    minLongitud: numAfter(
      /(?:longitud m.nima de la contrase.a|minimum password length)\\s*:\\s*(\\d+)/i
    ),
    bloqueoIntentos: numAfter(
      /(?:umbral de bloqueo|lockout threshold)\\s*:\\s*(\\d+)/i
    ),
  };
}

// InactivityTimeoutSecs: solo el número (segundos) o vacío.
function parseInactivityTimeout(output) {
  const s = String(output || '').trim();
  if (/^\\d+$/.test(s)) return Number(s);
  return null;
}

// Salida "ScreenSaveActive|ScreenSaveTimeOut": { active, timeout }
// (null en lo que venga vacío).
function parseScreenSave(output) {
  const s = String(output || '').trim();
  const m = s.match(/^(\\d*)\\|(\\d*)$/);
  if (!m) return { active: null, timeout: null };
  const active = m[1] === '' ? null : m[1] !== '0';
  const timeout =
    m[2] === '' || !Number.isFinite(Number(m[2])) ? null : Number(m[2]);
  return { active, timeout };
}

// Get-LocalUser 'sistemas': "sistemas|True" (o "sistemas|False") o
// vacío si no existe la cuenta. Devuelve { existe, habilitada }.
function parseLocalUserSistemas(output) {
  const lines = splitLines(output);
  if (!lines.length) return { existe: false, habilitada: null };
  const parts = lines[0].split('|');
  const habilitada =
    parts.length > 1 ? /^true$/i.test(parts[1].trim()) : null;
  return { existe: true, habilitada };
}

// Cumplimiento de las políticas con los mismos umbrales que
// mantPoliticasCumple() en la app del teléfono (que los recalcula
// desde los valores crudos): cambio <= 90 días, longitud >= 10,
// intentos <= 5, bloqueo >= 350 s. Sin dato va null; `cumple` es true
// solo si todos los valores conocidos cumplen, false si alguno no
// cumple, null si no hay ningún valor.
function politicasCumple(p) {
  p = p || {};
  const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const cambio = num(p.cambioDias);
  const lon = num(p.minLongitud);
  const inten = num(p.bloqueoIntentos);
  const bloq = num(p.bloqueoSegundos);
  const cC = cambio === null ? null : cambio <= 90;
  const cL = lon === null ? null : lon >= 10;
  const cI = inten === null ? null : inten <= 5;
  const cB = bloq === null ? null : bloq >= 350;
  const vals = [cC, cL, cI, cB].filter((v) => v !== null);
  return {
    cambioDias: cambio,
    minLongitud: lon,
    bloqueoIntentos: inten,
    bloqueoSegundos: bloq,
    cumpleCambio: cC,
    cumpleLongitud: cL,
    cumpleIntentos: cI,
    cumpleBloqueo: cB,
    cumple: vals.length ? vals.every((v) => v === true) : null,
  };
}""",
    "parsers politicas 2.5.0",
)

# 4. t9: además el nombre de la primera impresora real.
rep(
    """            const real = (await getPrinterNames()).filter((n) => !isVirtualPrinter(n));
            if (real.length) {
              detalles.impresoras = real.length;
              mark('t9');
            }""",
    """            const real = (await getPrinterNames()).filter((n) => !isVirtualPrinter(n));
            if (real.length) {
              detalles.impresoras = real.length;
              // 2.5.0: el nombre de la primera impresora real (la app
              // del teléfono lo lee en d.impresora/detalles.impresora
              // para el mantenimiento).
              detalles.impresora = real[0];
              mark('t9');
            }""",
    "t9 detalles.impresora",
)

# 5. Tareas nuevas tras t24 (última tarea del bloque isWin).
rep(
    """      // t24 — Accesos directos de historia clínica Y estudios de gabinete
      // (.lnk o .url, por nombre o destino, en el Escritorio real y en
      // el Menú Inicio). Historia acepta 'hcweb', 'HC Web' (con espacio)
      // e 'historia (clínica)'; hacen falta los dos, pueden ser archivos
      // distintos.
      tasks.push(
        (async () => {
          try {
            const scan = await getDesktopScan();
            if (scan.historia && scan.gabinete) mark('t24');
          } catch (e) {
            /* sin marcar */
          }
        })()
      );
    }""",
    """      // t24 — Accesos directos de historia clínica Y estudios de gabinete
      // (.lnk o .url, por nombre o destino, en el Escritorio real y en
      // el Menú Inicio). Historia acepta 'hcweb', 'HC Web' (con espacio)
      // e 'historia (clínica)'; hacen falta los dos, pueden ser archivos
      // distintos.
      tasks.push(
        (async () => {
          try {
            const scan = await getDesktopScan();
            if (scan.historia && scan.gabinete) mark('t24');
          } catch (e) {
            /* sin marcar */
          }
        })()
      );

      // Políticas de seguridad (2.5.0, Mantenimientos Preventivos):
      // `net accounts` (política de contraseñas del dominio o local)
      // + bloqueo por inactividad (directiva de grupo
      // InactivityTimeoutSecs o protector de pantalla ScreenSaveTimeOut
      // con ScreenSaveActive=1). El bloqueo efectivo es el menor de
      // los dos valores presentes y mayores que 0 (el que se dispara
      // primero); si ninguno se puede leer, bloqueoSegundos va null
      // (sin dato, no inventado). detalles.politicas lleva los valores
      // crudos + los campos cumple* (misma lógica que la app del
      // teléfono); detalles.politicasFuente dice de dónde salió cada
      // valor. Solo se escribe detalles.politicas si al menos un valor
      // se pudo leer. No es un punto del checklist: no marca ningún t*.
      tasks.push(
        (async () => {
          try {
            let na = { cambioDias: null, minLongitud: null, bloqueoIntentos: null };
            try {
              const out = await withTimeout(runCmd('net', ['accounts']), CHECK_TIMEOUT_MS);
              na = parseNetAccounts(out);
            } catch (e) {
              /* sin política de cuentas */
            }
            let inactivity = null;
            try {
              const out = await withTimeout(runPs(PS_INACTIVITY_TIMEOUT), CHECK_TIMEOUT_MS);
              inactivity = parseInactivityTimeout(out);
            } catch (e) {
              /* sin directiva de grupo */
            }
            let screen = { active: null, timeout: null };
            try {
              const out = await withTimeout(runPs(PS_SCREENSAVE), CHECK_TIMEOUT_MS);
              screen = parseScreenSave(out);
            } catch (e) {
              /* sin protector */
            }
            // Bloqueo efectivo: el menor de los valores presentes y > 0.
            const cands = [];
            if (inactivity !== null && inactivity > 0) cands.push(inactivity);
            if (screen.active && screen.timeout !== null && screen.timeout > 0) {
              cands.push(screen.timeout);
            }
            const bloqueo = cands.length ? Math.min.apply(null, cands) : null;
            const fuentes = [];
            if (na.cambioDias !== null || na.minLongitud !== null || na.bloqueoIntentos !== null) {
              fuentes.push('net accounts');
            }
            if (inactivity !== null && inactivity > 0) {
              fuentes.push('directiva de grupo (InactivityTimeoutSecs)');
            }
            if (screen.active && screen.timeout !== null && screen.timeout > 0) {
              fuentes.push('protector de pantalla');
            }
            if (
              na.cambioDias !== null ||
              na.minLongitud !== null ||
              na.bloqueoIntentos !== null ||
              bloqueo !== null
            ) {
              detalles.politicas = politicasCumple({
                cambioDias: na.cambioDias,
                minLongitud: na.minLongitud,
                bloqueoIntentos: na.bloqueoIntentos,
                bloqueoSegundos: bloqueo,
              });
              if (fuentes.length) detalles.politicasFuente = fuentes.join(' + ');
            }
          } catch (e) {
            /* sin políticas */
          }
        })()
      );

      // Usuario 'sistemas' (2.5.0, Mantenimientos Preventivos): cuenta
      // local Get-LocalUser 'sistemas' o perfil C:\\Users\\sistemas
      // (Gerardo: "cuenta/perfil de Windows con el nombre de sistemas").
      // detalles.usuarioSistemas es booleano; la fuente queda en
      // detalles.usuarioSistemasFuente. Solo se escribe si al menos una
      // de las dos pruebas se pudo correr (si PowerShell está roto, sin
      // dato, no un falso "No"). No es un punto del checklist.
      tasks.push(
        (async () => {
          try {
            let cuenta = { existe: false, habilitada: null };
            let cuentaProbada = false;
            try {
              const out = await withTimeout(runPs(PS_LOCAL_USER_SISTEMAS), CHECK_TIMEOUT_MS);
              cuenta = parseLocalUserSistemas(out);
              cuentaProbada = true;
            } catch (e) {
              /* sin cuenta local */
            }
            let perfil = false;
            let perfilProbado = false;
            try {
              const usersDir = userProfile ? pth.dirname(userProfile) : '';
              if (usersDir) {
                perfil = fileExists(pth.join(usersDir, 'sistemas'));
                perfilProbado = true;
              }
            } catch (e) {
              /* sin perfil */
            }
            if (cuenta.existe || perfil) {
              detalles.usuarioSistemas = true;
              const fuentes = [];
              if (cuenta.existe) {
                fuentes.push(
                  'cuenta local' + (cuenta.habilitada === false ? ' (deshabilitada)' : '')
                );
              }
              if (perfil) fuentes.push('perfil C:\\\\Users\\\\sistemas');
              detalles.usuarioSistemasFuente = fuentes.join(' + ');
            } else if (cuentaProbada && perfilProbado) {
              detalles.usuarioSistemas = false;
              detalles.usuarioSistemasFuente = 'sin cuenta ni perfil';
            }
          } catch (e) {
            /* sin dato */
          }
        })()
      );
    }""",
    "tareas politicas + usuarioSistemas",
)

# 6. Exports.
rep(
    """  parseHiberbootEnabled,""",
    """  parseHiberbootEnabled,
  parseNetAccounts,
  parseInactivityTimeout,
  parseScreenSave,
  parseLocalUserSistemas,
  politicasCumple,""",
    "exports 2.5.0",
)

shutil.copy2(SRC, BAK)
print(f"backup: {BAK}")
SRC.write_text(text, encoding="utf-8")
print("detect.js parcheado (2.5.0)")
