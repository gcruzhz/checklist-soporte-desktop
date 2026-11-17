// Detector de características del equipo (Checklist de Soporte 2.3.8).
// Devuelve el objeto del contrato de la colección Firestore `detectados`:
// { id, hostname, marca, modelo, serie, cpu, ramGB, discoGB, discoTipo, so,
//   tipo ('Laptop'|'Desktop'), mac, ip, ipTipo, redes,
//   detalles: { osFuente }, detectadoEn (ms), detectadoPor, usado }.
// ip es la IPv4 de la interfaz principal e ipTipo 'Estática' o 'Dinámica'
// (por el campo dhcp de la interfaz; en Windows con respaldo de
// PowerShell). Si el tipo no se puede determinar, solo va ip; si no hay
// IPv4, no van ni ip ni ipTipo.
// `detectadoPor` queda en '' aquí: lo rellena la app web con el técnico
// que inició sesión antes de llamar a window.Cloud.reportDetected().
// `id` sigue la misma regla que reportDetected(): la serie si existe,
// si no hostname + '-' + detectadoEn. Las series "de relleno" ("-", "None",
// "To be filled by O.E.M.", ...) se tratan como si no existieran.
// Si algún dato no se puede leer, se pone '' o 0: detect() nunca rompe.
//
// 2.3.1 añade detectChecks(): además de los datos del equipo, detecta
// puntos del checklist (software y hardware) que se pueden comprobar
// automáticamente en Windows con PowerShell/registro. Devuelve
// { checks, detalles, versiones } donde checks solo contiene ids de la
// plantilla actual (t3, t4, t6-t12, t18-t25) con valor true — o la cadena
// de la opción elegida en t8 ('Office 365' | 'LibreOffice') —, detalles
// trae las pistas que respaldan cada marca (último hotfix, antivirus, ...)
// y versiones trae { so, antivirus, chrome, esetAgent } solo con las que se pudieron
// determinar (si una no se determina, se omite).
// NUNCA se auto-marcan: t1, t2, t26 (físico, hay que ver el equipo)
// ni t13-t17 (datos del usuario). Si un chequeo
// no se puede determinar, el punto queda sin marcar: mejor no marcar
// que marcar mal. Cada chequeo tiene timeout y fallo silencioso.
// En Linux/Mac solo corre la parte multiplataforma (t3 por batería,
// t4 por serie, versiones.so por distro+release); los chequeos de
// Windows quedan sin determinar.
// 2.3.2: t12 (Invgate) ya es detectable (servicio, proceso, clave de
// desinstalación o carpeta en Program Files); t19 acepta Adobe Acrobat
// además de Reader (detalles.adobe = 'Acrobat' | 'Reader'); t22 acepta
// acceso directo .lnk de Alfaweb en el Escritorio; t24 busca los
// accesos 'hcweb' (o 'historia clínica') y 'gabinete'; detectMachine()
// añade discoTipo ('HDD' | 'SSD' | 'NVMe') desde diskLayout[0] e
// ip / ipTipo ('Estática' | 'Dinámica') de la interfaz principal;
// detectChecks() añade anydeskId (9-10 dígitos, vía AnyDesk.exe
// --get-id, con respaldo en service.conf/user.conf) y anydeskAlias
// (vía --get-alias o ad.anynet.alias) cuando AnyDesk está instalado.
// 2.3.3: machineId determinista (serie real o hostname + MAC) incluido
// en detectMachine() y usado como id del documento: antes el id era
// hostname + timestamp y cada detección creaba un documento nuevo, por
// lo que el equipo "desaparecía" del panel al detectarlo varias veces.
// getMachineId() se expone en main.js / preload.js como
// window.Desktop.getMachineId() -> Promise<string> (el teléfono lo usa
// para el bloqueo del botón por máquina). Accesos directos robustos:
// el Escritorio real se resuelve con PowerShell (Desktop y
// CommonDesktopDirectory) con respaldos %USERPROFILE%\Desktop,
// %USERPROFILE%\OneDrive\Desktop y Escritorio público; se escanean
// .lnk Y .url, por nombre y por destino (URL= en .url, cadenas del
// .lnk). Alfaprinter también cuenta como impresora instalada
// (Get-Printer, /alfa/i). Antivirus: selección entre varios productos
// (prefiere el habilitado/en tiempo real y nunca Defender si hay otro
// activo), emparejamiento nombre <-> desinstalación por nombre
// normalizado + publisher, y para ESET la versión se toma del registro
// (HKLM\SOFTWARE\ESET\ESET Security\CurrentVersion\Info\ProductVersion)
// o de egui.exe/ekrn.exe antes que de la desinstalación; la fuente queda
// en detalles.antivirusFuente. Si la versión no se determina con
// seguridad, versiones.antivirus lleva solo el nombre.
// 2.3.4: RAM en GiB (1024^3): un equipo con 16 GiB se detectaba como
// 17 GB porque se dividía entre 1e9 (decimal). El disco sigue en
// decimal (/1e9), que coincide con la etiqueta del fabricante.
// SO en Windows ya no viene de si.osInfo() (miente: kernel 10.0 y sin
// manifiesto reporta Windows 10 en un equipo con Windows 11): viene de
// Get-ComputerInfo, con respaldo en el registro
// (HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion) y, en último
// caso, si.osInfo() con la corrección por build (>= 22000 -> Windows 11).
// Aplica igual a detectMachine().so y a versiones.so en detectChecks().
// 2.3.5: el Escritorio real se resuelve además por el registro
// (HKCU\...\Explorer\User Shell Folders\Desktop, expandiendo
// %USERPROFILE% y demás variables) y por glob de carpetas
// '%USERPROFILE%\OneDrive*\Desktop' (en equipos corporativos OneDrive
// es 'OneDrive - <Empresa>', no 'OneDrive'), y se escanean TODAS las
// rutas que existan, no solo la primera. Patrones con espacio y
// variantes: t22 acepta 'Alfa Web', 'AlfaLab' y 'Alfa Lab' (pero NUNCA
// un nombre que case con /print/i, para que Alfaprinter no marque t22);
// t24 acepta 'HC Web' (con espacio) además de 'hcweb'/'historia' y
// sigue exigiendo historia Y gabinete (pueden ser archivos distintos).
// También se escanea %APPDATA%\Microsoft\Windows\Start Menu\Programs
// (Menú Inicio, un nivel de subcarpetas) para t22, t23 y t24. El match
// por destino (.url: línea URL=; .lnk: cadenas del binario) usa los
// mismos patrones. Diagnóstico en detalles: escritorioRutas (rutas de
// Escritorio realmente escaneadas) y atajosVistos (nº de .lnk/.url
// revisados en Escritorio + Menú Inicio); solo van cuando se escaneó
// al menos una ruta.
// 2.3.6: SO en Windows con las fuentes RÁPIDAS primero (el registro
// antes que Get-ComputerInfo, que es notoriamente lento y en la PC
// real de Gerardo moría por el timeout de 15 s): registro (con UBR) ->
// (Get-CimInstance Win32_OperatingSystem).Caption -> Get-ComputerInfo
// -> si.osInfo() con la corrección por build. La fuente que dio el
// nombre queda en detalles.osFuente ('registro' | 'cim' |
// 'computerinfo' | 'si'), igual en detectMachine().so y en
// versiones.so de detectChecks(). detectMachine() añade además redes:
// TODAS las interfaces con IPv4 no interna [{ nombre, ip, ipTipo }]
// (ipTipo 'Estática' | 'Dinámica' o '' si no se determina; en Windows
// con respaldo PowerShell Get-NetIPAddress + Get-NetIPInterface por
// InterfaceAlias). ip/ipTipo del adaptador principal NO cambian.
// 2.3.8: normalización 10 vs 11 POR BUILD en TODAS las fuentes del SO:
// en la PC de Gerardo (ROBIT5, Dell Pro 14) el registro decía
// ProductName 'Windows 10 Pro' con DisplayVersion '26H2' y
// CurrentBuildNumber 26300 (UBR 9711) — eso es Windows 11 (Windows 10
// nunca pasó de la 19045 ni tiene 26H2) — y la tarjeta mostraba
// 'Windows 10 Pro 26H2 (compilación 26300.9711)' con fuente 'registro'.
// La 2.3.6 solo corregía por build en la rama si.osInfo(); las tres
// fuentes PowerShell (registro, CIM, Get-ComputerInfo) devolvían el
// nombre tal cual, así que el 'Windows 10' mentiroso sobrevivía. Ahora
// parseOsVersion() normaliza con el build de su propia línea
// (build >= 22000 -> Windows 11, build < 22000 -> Windows 10,
// conservando edición, DisplayVersion y compilación) y, si una fuente
// viene sin build, resolveWindowsOsNameDetailed() contrasta el nombre
// con el build de si.osInfo() antes de darlo por bueno. Un nombre
// 'Windows 10' con build >= 22000 ya no puede sobrevivir en ninguna
// fuente. detalles.osFuente y 'SO detectado por:' no cambian.
// RAM instalada, no visible (2.3.8): en la misma PC ROBIT5 la RAM
// decía 15 GB con 16 GB instalados, porque mem.total es la memoria
// visible (descuenta lo reservado por hardware, aquí la gráfica
// integrada). Ahora se suman los módulos de si.memLayout() y, si viene
// vacío, mem.total se redondea al tamaño estándar más cercano
// (4, 8, 12, 16, 24, 32, 48, 64, 96, 128). El disco no cambia.
// Agente ESET Management Agent (2.3.8): se detecta por su clave de
// desinstalación (DisplayVersion), con respaldo en ERAAgent.exe y
// confirmación por el servicio EraAgentSvc o el proceso ERAAgent.exe;
// su versión va en versiones.esetAgent y NO afecta a t7 (no es
// antivirus). Si no está instalado, no va nada.
// 2.5.0 (Mantenimientos Preventivos): políticas de seguridad y usuario
// 'sistemas'. `net accounts` trae la política de contraseñas del
// dominio o local (duración máxima en días, longitud mínima, umbral de
// bloqueo); el bloqueo por inactividad viene de la directiva de grupo
// "Interactive logon: Machine inactivity limit"
// (HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\
// InactivityTimeoutSecs, segundos) o, si no está, del protector de
// pantalla (HKCU\Control Panel\Desktop\ScreenSaveTimeOut, segundos,
// solo si ScreenSaveActive es 1). El bloqueo efectivo es el menor de
// los dos valores presentes y mayores que 0 (el que se dispara
// primero). Get-LocalUser dice si existe la cuenta local 'sistemas' y
// además se revisa el perfil C:\Users\sistemas (Gerardo:
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
'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const path = require('path');
const si = require('systeminformation');

function str(v) {
  return v === undefined || v === null ? '' : String(v);
}

async function safe(fn, fallback) {
  try {
    const v = await fn();
    return v === undefined || v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

// Los fabricantes y las VMs devuelven series "de relleno" ("-", "None",
// "To be filled by O.E.M.", ...). No son una serie real: tratarlas como
// ausentes evita que todos esos equipos colisionen en el mismo documento
// de Firestore (id = serie) y que el teléfono muestre "Serie: -".
const PLACEHOLDER_SERIALS = new Set([
  '',
  '-',
  'none',
  'n/a',
  'not applicable',
  'unknown',
  'default string',
  'system serial number',
  'to be filled by o.e.m.',
  'to be filled by o.e.m',
]);

function cleanSerial(v) {
  const s = str(v).trim();
  if (PLACEHOLDER_SERIALS.has(s.toLowerCase())) return '';
  if (/^[-–—_.\s]+$/.test(s)) return '';
  return s;
}

// machineId determinista (2.3.3): la serie real si existe y no es de
// relleno (reutiliza cleanSerial); si no, hostname + '-' + primera MAC
// no interna (sin ':' ni '-'). Sin serie ni MAC, solo el hostname; sin
// nada de eso, '' (detectMachine() cae entonces al timestamp como id).
// Con caché: en producción se llama sin argumentos y el valor se
// reutiliza; con overrides (pruebas o datos ya leídos por
// detectMachine()) no se cachea. Nunca cambia entre detecciones del
// mismo equipo: por eso sirve como id estable del documento en
// Firestore y como bloqueo del botón por máquina en el teléfono.
let cachedMachineId = '';
async function getMachineId(overrides = {}) {
  const hasOverrides =
    overrides &&
    (overrides.serial !== undefined ||
      overrides.hostname !== undefined ||
      overrides.mac !== undefined ||
      overrides.ifaces !== undefined);
  if (cachedMachineId && !hasOverrides) return cachedMachineId;
  const serie = cleanSerial(
    overrides.serial !== undefined
      ? overrides.serial
      : (await safe(() => si.system(), {})).serial
  );
  if (serie) {
    if (!hasOverrides) cachedMachineId = serie;
    return serie;
  }
  const hostname = str(
    overrides.hostname !== undefined
      ? overrides.hostname
      : (await safe(() => si.osInfo(), {})).hostname
  ).trim();
  let mac = str(overrides.mac || '').trim();
  if (!mac) {
    const ifaces = await safe(
      () =>
        overrides.ifaces !== undefined
          ? typeof overrides.ifaces === 'function'
            ? overrides.ifaces()
            : overrides.ifaces
          : si.networkInterfaces(),
      []
    );
    if (Array.isArray(ifaces)) {
      const ext = ifaces.find(
        (n) => n && !n.internal && n.mac && n.mac !== '00:00:00:00:00:00'
      );
      if (ext) mac = str(ext.mac);
    }
  }
  const macClean = mac.replace(/[:-]/g, '').trim();
  const id = hostname ? (macClean ? hostname + '-' + macClean : hostname) : macClean;
  if (!hasOverrides) cachedMachineId = id;
  return id;
}

// Tipo del disco principal (diskLayout[0]): 'NVMe' cuando interfaceType
// es NVMe o el tipo contiene NVMe; 'SSD' cuando el tipo es SSD;
// 'HDD' en cualquier otro caso con disco presente; '' sin disco.
function discoTipoFromDisk(disk) {
  if (!disk) return '';
  const type = str(disk.type);
  const iface = str(disk.interfaceType);
  if (/nvme/i.test(iface) || /nvme/i.test(type)) return 'NVMe';
  if (/ssd/i.test(type)) return 'SSD';
  return 'HDD';
}

// Tamaños estándar de RAM instalada (GiB) para el redondeo de respaldo.
const RAM_STANDARD_SIZES = [4, 8, 12, 16, 24, 32, 48, 64, 96, 128];

// RAM INSTALADA, no visible (2.3.8): en Windows mem.total es la memoria
// visible para el sistema (TotalVisibleMemorySize), que descuenta lo
// reservado por hardware — en ROBIT5 (Dell Pro 14, 16 GB instalados)
// la gráfica integrada reserva parte y mem.total da ~15.4 GiB, así que
// Math.round daba 15. La instalada es la suma de los módulos DIMM de
// si.memLayout(): si la lista no está vacía se suman sus tamaños.
// Si memLayout viene vacío (VMs, algunos equipos), mem.total se
// redondea al tamaño estándar más cercano (4, 8, 12, 16, 24, 32, 48,
// 64, 96, 128): 15.4 GiB -> 16. Fuera del rango de la lista (< 3 GiB
// o > 128 GiB) se usa Math.round directo. El disco NO cambia (sigue
// decimal, coincide con su etiqueta).
function ramGBFromMem(mem, memLayout) {
  if (Array.isArray(memLayout) && memLayout.length) {
    const total = memLayout.reduce((acc, m) => acc + (Number(m && m.size) || 0), 0);
    if (total > 0) return Math.round(total / 1073741824);
  }
  const total = Number(mem && mem.total) || 0;
  if (total <= 0) return 0;
  const gib = total / 1073741824;
  if (gib < 3 || gib > 128) return Math.round(gib);
  let best = RAM_STANDARD_SIZES[0];
  for (const s of RAM_STANDARD_SIZES) {
    if (Math.abs(gib - s) < Math.abs(gib - best)) best = s;
  }
  return best;
}

// overrides (gancho de pruebas; en producción se llama sin argumentos):
// { platform, ifaces: [...] | async () => [...], runPs: async (script) => stdout,
//   osInfo: {...} | async () => {...}, mem: {...}, memLayout: [...], disks: [...] }
// osInfo/mem/memLayout/disks permiten simular en pruebas un equipo Windows con
// valores de si.* que en esta VM Linux no se pueden producir (p. ej. una
// RAM de 16 GiB o un si.osInfo() que miente y dice Windows 10).
// En Windows, si la interfaz principal no trae el campo dhcp, se
// respalda con PowerShell (PS_IP_DHCP) para la interfaz que tiene la IP.
async function detectMachine(overrides = {}) {
  const detectadoEn = Date.now();
  const platform = overrides.platform || process.platform;
  const isWin = platform === 'win32';
  const runPs = overrides.runPs || runPowerShell;

  const system = await safe(() => si.system(), {});
  const osInfo =
    overrides.osInfo !== undefined
      ? typeof overrides.osInfo === 'function'
        ? await safe(overrides.osInfo, {})
        : overrides.osInfo
      : await safe(() => si.osInfo(), {});
  const cpuInfo = await safe(() => si.cpu(), {});
  const mem =
    overrides.mem !== undefined
      ? typeof overrides.mem === 'function'
        ? await safe(overrides.mem, {})
        : overrides.mem
      : await safe(() => si.mem(), {});
  // Módulos DIMM instalados (2.3.8: la RAM es la instalada, no la
  // visible; ver ramGBFromMem). En producción si.memLayout(). Si en
  // pruebas se simula mem pero no memLayout, NO se lee el real: el
  // mem simulado es la autoridad y memLayout se toma vacío (si no,
  // el memLayout real de esta VM contaminaría el caso simulado).
  const memLayout =
    overrides.memLayout !== undefined
      ? typeof overrides.memLayout === 'function'
        ? await safe(overrides.memLayout, [])
        : overrides.memLayout
      : overrides.mem !== undefined
        ? []
        : await safe(() => si.memLayout(), []);
  const disks =
    overrides.disks !== undefined
      ? typeof overrides.disks === 'function'
        ? await safe(overrides.disks, [])
        : overrides.disks
      : await safe(() => si.diskLayout(), []);
  const chassis = await safe(() => si.chassis(), {});
  const ifaces = await safe(
    () =>
      overrides.ifaces !== undefined
        ? typeof overrides.ifaces === 'function'
          ? overrides.ifaces()
          : overrides.ifaces
        : si.networkInterfaces(),
    []
  );

  const hostname = str(osInfo.hostname);
  const marca = str(system.manufacturer);
  const modelo = str(system.model);
  const serie = cleanSerial(system.serial);
  const cpu = str(cpuInfo.brand);
  const ramGB = ramGBFromMem(mem, memLayout); // instalada (memLayout) o estándar más cercano; 16 GiB -> 16, no 17 ni 15

  // Contrato: discoGB = Math.round(diskLayout[0].size / 1e9); 0 si no hay.
  // OJO: esta VM tiene dos discos (vdb 8 GB y vdd 161 GB); [0] es el de 8 GB.
  let discoGB = 0;
  if (Array.isArray(disks) && disks.length && disks[0] && disks[0].size > 0) {
    discoGB = Math.round(disks[0].size / 1e9);
  }
  const discoTipo = discoTipoFromDisk(Array.isArray(disks) && disks.length ? disks[0] : null);

  // SO: en Windows si.osInfo() puede mentir (kernel 10.0, sin manifiesto
  // las APIs reportan Windows 10 en un equipo con Windows 11), así que
  // el nombre viene de resolveWindowsOsNameDetailed (2.3.6): registro
  // primero (rápido), luego CimInstance, luego Get-ComputerInfo y, en
  // último caso, si.osInfo(). 2.3.8: TODAS las fuentes se normalizan
  // 10 vs 11 por build (el registro también miente: en ROBIT5 decía
  // 'Windows 10 Pro' con build 26300). En Linux/Mac sigue distro + release.
  // osFuente registra la fuente que dio el nombre ('registro' | 'cim' |
  // 'computerinfo' | 'si'; en Linux/Mac siempre 'si' cuando hay nombre).
  let so = [str(osInfo.distro), str(osInfo.release)].filter(Boolean).join(' ');
  let osFuente = '';
  if (isWin) {
    const res = await resolveWindowsOsNameDetailed(runPs, osInfo);
    so = res.nombre;
    osFuente = res.fuente;
  } else if (so) {
    osFuente = 'si';
  }
  const chassisType = str(chassis.type).toLowerCase();
  const tipo = chassisType === 'laptop' || chassisType === 'notebook' ? 'Laptop' : 'Desktop';

  let mac = '';
  if (Array.isArray(ifaces)) {
    const ext = ifaces.find(
      (n) => n && !n.internal && n.mac && n.mac !== '00:00:00:00:00:00'
    );
    if (ext) mac = str(ext.mac);
  }

  // redes (2.3.6): TODAS las interfaces con IPv4 no interna, con nombre
  // del adaptador, su IPv4 y si es estática o dinámica. Fuente: el campo
  // dhcp de systeminformation (true = dinámica, false = estática). En
  // Windows, si una interfaz no trae dhcp, respaldo con PowerShell
  // (Get-NetIPAddress + Get-NetIPInterface, emparejando por
  // InterfaceAlias, el nombre del adaptador). Si el tipo no se puede
  // determinar, ipTipo va ''; si no hay IPv4 usable, redes es [].
  let redes = listNetworks(ifaces);
  if (isWin && redes.some((r) => !r.ipTipo)) {
    try {
      const out = await withTimeout(runPs(PS_NET_IP_DHCP), CHECK_TIMEOUT_MS);
      const entries = parseNetIpDhcp(out);
      redes = redes.map((r) => {
        if (r.ipTipo) return r;
        const entry =
          entries.find((e) => str(e.alias).toLowerCase() === r.nombre.toLowerCase()) ||
          entries.find((e) => e.ip === r.ip);
        return entry && entry.dhcp !== null
          ? { nombre: r.nombre, ip: r.ip, ipTipo: ipTipoFromDhcp(entry.dhcp) }
          : r;
      });
    } catch (e) {
      /* ipTipo queda '' en las que no lo traían */
    }
  }

  // IP de la interfaz principal e ipTipo. SIN CAMBIO (compatibilidad):
  // la IP es la de la interfaz principal (ruta por defecto, si no la
  // primera no interna) y el tipo sale de su campo dhcp o, si no lo
  // trae, de redes (ya resuelto arriba). Si tampoco está, respaldo con
  // PowerShell (Get-NetIPInterface, Dhcp Enabled/Disabled) buscando por
  // la IP. Si el tipo no se puede determinar, solo va ip; si no hay
  // IPv4 usable, no van ni ip ni ipTipo.
  const primary = selectPrimaryInterface(ifaces);
  const ip = primary ? str(primary.ip4).trim() : '';
  let ipTipo = '';
  if (primary) {
    const redEntry = redes.find((r) => r.ip === ip);
    ipTipo = (redEntry && redEntry.ipTipo) || ipTipoFromDhcp(primary.dhcp);
  }
  if (ip && !ipTipo && isWin) {
    try {
      const out = await withTimeout(runPs(PS_IP_DHCP), CHECK_TIMEOUT_MS);
      const entry = parseIpDhcp(out).find((e) => e.ip === ip);
      if (entry) ipTipo = ipTipoFromDhcp(entry.dhcp);
    } catch (e) {
      /* solo ip, sin tipo */
    }
  }

  // machineId determinista (2.3.3): serie real o hostname + MAC. El id del
  // documento es el machineId: antes era hostname + timestamp y cada
  // detección creaba un documento nuevo (el equipo "desaparecía" del panel).
  const machineId = await getMachineId({ serial: serie, hostname, ifaces });
  const id = machineId || String(detectadoEn);

  return {
    id,
    machineId,
    hostname,
    marca,
    modelo,
    serie,
    cpu,
    ramGB,
    discoGB,
    discoTipo,
    so,
    tipo,
    mac,
    ...(ip ? { ip } : {}),
    ...(ipTipo ? { ipTipo } : {}),
    redes,
    ...(osFuente ? { detalles: { osFuente } } : {}),
    detectadoEn,
    detectadoPor: '',
    usado: false,
  };
}

// ---------------------------------------------------------------------------
// detectChecks(): puntos del checklist que se pueden comprobar en el equipo.
// ---------------------------------------------------------------------------

// Solo estos ids pueden salir de aquí. Cualquier otro (t1, t2, t5,
// t13-t17, t26, ...) se descarta en `mark()` aunque un chequeo lo intentara.
const ALLOWED_CHECK_IDS = new Set([
  't3', 't4',
  't6', 't7', 't8', 't9', 't10', 't11', 't12',
  't18', 't19', 't20', 't21', 't22', 't23', 't24', 't25',
]);

const CHECK_TIMEOUT_MS = 15000; // por chequeo; corren en paralelo
const HOTFIX_MAX_DAYS = 90; // t6: último hotfix dentro de 90 días

// Scripts de PowerShell (Windows). Cada uno devuelve texto simple, una
// línea por elemento, para que el parseo sea trivial y simulable en pruebas.
const PS_UNINSTALL = `Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' , 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' , 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | ForEach-Object { $_.DisplayName }`;
const PS_HOTFIX = `Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 1 | ForEach-Object { $_.InstalledOn.ToString('yyyy-MM-dd') }`;
const PS_ANTIVIRUS = `Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct -ErrorAction SilentlyContinue | ForEach-Object { "$($_.displayName)|$($_.productState)" }`;
const PS_HIBERBOOT = `(Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power' -Name HiberbootEnabled -ErrorAction SilentlyContinue).HiberbootEnabled`;
const PS_PRINTERS = `Get-Printer -ErrorAction SilentlyContinue | ForEach-Object { $_.Name }`;
const PS_VPN_ADAPTERS = `Get-NetAdapter -ErrorAction SilentlyContinue | ForEach-Object { $_.InterfaceDescription }`;
const PS_PROCESSES = `Get-Process -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName -Unique`;
// Desinstalación con versión y editor: "DisplayName|DisplayVersion|Publisher"
// por programa (sirve para versiones.antivirus, versiones.chrome y
// detalles.invgate; el Publisher ayuda a emparejar el antivirus de
// SecurityCenter2 con su clave, p. ej. ESET).
const PS_UNINSTALL_VERSIONS = `Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' , 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' , 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | ForEach-Object { "$($_.DisplayName)|$($_.DisplayVersion)|$($_.Publisher)" }`;
// Servicios de Invgate: "Name|DisplayName|Status" (vacío si no hay agente).
const PS_SERVICES_INVGATE = `Get-Service *invgate* -ErrorAction SilentlyContinue | ForEach-Object { "$($_.Name)|$($_.DisplayName)|$($_.Status)" }`;
// SO (Windows, ÚLTIMO recurso entre las fuentes PowerShell, 2.3.6):
// "WindowsProductName|DisplayVersion|OsBuildNumber".
// DisplayVersion no lo da Get-ComputerInfo: se lee del registro
// (HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion). Get-ComputerInfo
// es notoriamente lento y en la PC real moría por el timeout de 15 s,
// por eso ya no va primero: solo se intenta si el registro y CIM
// fallaron o vinieron vacíos.
const PS_OS_VERSION = `$ci = Get-ComputerInfo -ErrorAction SilentlyContinue; $dv = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion' -Name DisplayVersion -ErrorAction SilentlyContinue).DisplayVersion; if ($ci) { "$($ci.WindowsProductName)|$dv|$($ci.OsBuildNumber)" }`;
// SO (Windows, PRIMERA fuente, 2.3.6): ProductName, DisplayVersion,
// CurrentBuildNumber y UBR leídos directamente del registro, sin
// Get-ComputerInfo (rápido: un solo Get-ItemProperty). Formato
// "Producto|DisplayVersion|Build|UBR" (UBR puede venir vacío); con UBR
// el nombre es 'Windows 11 Pro 26H2 (compilación 26200.6899)'.
const PS_OS_REGISTRY = `$p = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion' -ErrorAction SilentlyContinue); if ($p) { "$($p.ProductName)|$($p.DisplayVersion)|$($p.CurrentBuildNumber)|$($p.UBR)" }`;
// SO (Windows, segunda fuente, 2.3.6): Caption + BuildNumber de
// Win32_OperatingSystem. El campo de versión va vacío (DisplayVersion
// no existe aquí; el registro ya se intentó): mismo formato
// "Producto||Build" que parseOsVersion(), así da
// 'Microsoft Windows 11 Pro (compilación 26200)'.
const PS_OS_CIM = `$o = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue; if ($o) { "$($o.Caption)||$($o.BuildNumber)" }`;
// IP + DHCP por interfaz (Windows, respaldo cuando systeminformation no
// trae el campo dhcp): "IPAddress|Dhcp" con Dhcp Enabled/Disabled.
// Se une por ifIndex dentro del propio script, así la IP ya identifica
// la interfaz sin tener que casar nombres de adaptador.
const PS_IP_DHCP = `Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | ForEach-Object { $d = (Get-NetIPInterface -InterfaceIndex $_.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue).Dhcp; "$($_.IPAddress)|$d" }`;
// IP + DHCP por interfaz CON nombre del adaptador (Windows, 2.3.6):
// "InterfaceAlias|IPAddress|Dhcp" (Dhcp Enabled/Disabled). Sirve para
// rellenar redes cuando systeminformation no trae el campo dhcp: se
// empareja por InterfaceAlias (el nombre del adaptador, p. ej.
// 'Ethernet0' o 'Wi-Fi'). También se une por ifIndex dentro del script.
const PS_NET_IP_DHCP = `Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | ForEach-Object { $d = (Get-NetIPInterface -InterfaceIndex $_.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue).Dhcp; "$($_.InterfaceAlias)|$($_.IPAddress)|$d" }`;
// Ubicación de AnyDesk: "InstallLocation|DisplayIcon" de su clave de
// desinstalación (vacío si no está instalado por MSI/EXE).
const PS_ANYDESK_LOCATION = `Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' , 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' , 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like '*AnyDesk*' } | ForEach-Object { "$($_.InstallLocation)|$($_.DisplayIcon)" }`;
// Rutas reales del Escritorio (2.3.3): el Escritorio del usuario y el
// público. En equipos corporativos el Escritorio suele estar redirigido
// (p. ej. a OneDrive): [Environment]::GetFolderPath('Desktop') devuelve
// la ruta real, no %USERPROFILE%\Desktop. Devuelve dos líneas.
// 2.3.5: además se lee el registro User Shell Folders (PS_DESKTOP_REGISTRY,
// ahí es donde Windows guarda la redirección real, p. ej.
// '%USERPROFILE%\OneDrive - Grupo Lapi\Desktop') y se hace glob de
// carpetas '%USERPROFILE%\OneDrive*\Desktop' en JS; se escanean TODAS
// las rutas que existan, no solo la primera.
const PS_DESKTOP_PATHS = `[Environment]::GetFolderPath('Desktop'); [Environment]::GetFolderPath('CommonDesktopDirectory')`;
// Escritorio según el registro (2.3.5): el valor Desktop de
// HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell
// Folders suele venir con variables (%USERPROFILE%\OneDrive -
// <Empresa>\Desktop); el propio script lo expande con
// [Environment]::ExpandEnvironmentVariables, y expandEnvVars() en JS
// hace lo mismo por si llega sin expandir (o en pruebas). Una línea o vacío.
const PS_DESKTOP_REGISTRY = `$d = (Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders' -Name Desktop -ErrorAction SilentlyContinue).Desktop; if ($d) { [Environment]::ExpandEnvironmentVariables($d) }`;
// Versión de ESET desde su propio registro (2.3.3): ProductVersion de
// HKLM\SOFTWARE\ESET\ESET Security\CurrentVersion\Info (ruta
// confirmada en el foro de ESET y en AIDA64; también se prueba la
// variante 'ESET NOD32 Antivirus'). Es la fuente fiable de la versión
// del producto: la DisplayVersion de desinstalación no siempre coincide
// con la versión que muestra ESET. Devuelve la versión o vacío.
const PS_ESET_VERSION = `$v = (Get-ItemProperty 'HKLM:\\SOFTWARE\\ESET\\ESET Security\\CurrentVersion\\Info' -Name ProductVersion -ErrorAction SilentlyContinue).ProductVersion; if (-not $v) { $v = (Get-ItemProperty 'HKLM:\\SOFTWARE\\ESET\\ESET NOD32 Antivirus\\CurrentVersion\\Info' -Name ProductVersion -ErrorAction SilentlyContinue).ProductVersion }; $v`;
// Servicio del agente ESET Management Agent (2.3.8): EraAgentSvc.
// "Name|DisplayName|Status" (vacío si no está instalado). Es la
// confirmación de que el agente está presente, no la fuente de la
// versión (esa es la desinstalación o ERAAgent.exe).
const PS_SERVICES_ESET_AGENT = `Get-Service EraAgentSvc -ErrorAction SilentlyContinue | ForEach-Object { "$($_.Name)|$($_.DisplayName)|$($_.Status)" }`;
// Políticas de seguridad (2.5.0): directiva de grupo "Interactive
// logon: Machine inactivity limit" (segundos de inactividad antes de
// bloquear el equipo). Devuelve el número o vacío.
const PS_INACTIVITY_TIMEOUT = `(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System' -Name InactivityTimeoutSecs -ErrorAction SilentlyContinue).InactivityTimeoutSecs`;
// Protector de pantalla (2.5.0): "ScreenSaveActive|ScreenSaveTimeOut"
// (activo 1/0 y segundos antes de que salte el protector). Solo
// bloquea el equipo si el protector está activo.
const PS_SCREENSAVE = `$a = (Get-ItemProperty 'HKCU:\\Control Panel\\Desktop' -Name ScreenSaveActive -ErrorAction SilentlyContinue).ScreenSaveActive; $t = (Get-ItemProperty 'HKCU:\\Control Panel\\Desktop' -Name ScreenSaveTimeOut -ErrorAction SilentlyContinue).ScreenSaveTimeOut; "$a|$t"`;
// Cuenta local 'sistemas' (2.5.0): "Nombre|Enabled" (vacío si no
// existe la cuenta).
const PS_LOCAL_USER_SISTEMAS = `Get-LocalUser -Name 'sistemas' -ErrorAction SilentlyContinue | ForEach-Object { "$($_.Name)|$($_.Enabled)" }`;

// Impresoras virtuales de Windows: no cuentan como "impresora configurada".
const VIRTUAL_PRINTER_RE = /microsoft print to pdf|microsoft xps document writer|onenote|\bfax\b|print to pdf/i;
// Clientes VPN conocidos (registro) y adaptadores VPN/TAP (red).
const VPN_CLIENT_RE = /cisco anyconnect|forticlient|openvpn|wireguard|globalprotect|palo alto/i;
const VPN_ADAPTER_RE = /vpn|tap-windows|wireguard|anyconnect|forticlient|globalprotect|fortinet|openvpn/i;

function splitLines(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

// --- Parsers (exportados para pruebas con salidas simuladas) ---

function parseUninstallNames(output) {
  return splitLines(output);
}

// Decodificación estándar de AntiVirusProduct.productState
// (root/SecurityCenter2): el número, en hex de 6 dígitos, se lee por
// pares — byte central 0x10 = protección en tiempo real activada,
// byte final 0x00 = definiciones al día. Ejemplos conocidos:
// 262144 (040000) desactivado y al día; 266240 (041000) activado y al
// día; 397312 (061000) activado y al día; 393216 (060000) desactivado
// y al día; 397568 (061100) activado y al día.
function decodeProductState(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return { enabled: false, upToDate: false };
  const hex = Math.floor(n).toString(16).padStart(6, '0');
  const stateByte = parseInt(hex.slice(2, 4), 16);
  const sigByte = parseInt(hex.slice(4, 6), 16);
  return {
    enabled: (stateByte & 0x10) !== 0,
    upToDate: sigByte === 0x00,
  };
}

// Líneas "Nombre|productState" -> [{ name, productState, enabled, upToDate }]
function parseAntivirusProducts(output) {
  return splitLines(output).map((line) => {
    const i = line.lastIndexOf('|');
    const name = i >= 0 ? line.slice(0, i).trim() : line;
    const productState = i >= 0 ? line.slice(i + 1).trim() : '';
    return { name, productState, ...decodeProductState(productState) };
  });
}

function parseHotfixDate(output) {
  const m = String(output || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : '';
}

function isHotfixRecent(dateStr, nowMs, maxDays) {
  if (!dateStr) return false;
  const t = Date.parse(dateStr + 'T00:00:00Z');
  if (!Number.isFinite(t)) return false;
  const days = (nowMs - t) / 86400000;
  return days >= 0 && days <= maxDays;
}

// HiberbootEnabled: '0' = inicio rápido desactivado; '1' = activado;
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
      /(?:duraci.n m.xima de la contrase.a \(d.as\)|maximum password age \(days\))\s*:\s*(\d+)/i
    ),
    minLongitud: numAfter(
      /(?:longitud m.nima de la contrase.a|minimum password length)\s*:\s*(\d+)/i
    ),
    bloqueoIntentos: numAfter(
      /(?:umbral de bloqueo|lockout threshold)\s*:\s*(\d+)/i
    ),
  };
}

// InactivityTimeoutSecs: solo el número (segundos) o vacío.
function parseInactivityTimeout(output) {
  const s = String(output || '').trim();
  if (/^\d+$/.test(s)) return Number(s);
  return null;
}

// Salida "ScreenSaveActive|ScreenSaveTimeOut": { active, timeout }
// (null en lo que venga vacío).
function parseScreenSave(output) {
  const s = String(output || '').trim();
  const m = s.match(/^(\d*)\|(\d*)$/);
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

// --- Directiva de grupo local, gpedit.msc (2.5.5) ---
//
// Gerardo: "Las directivas se revisan en gpedit.msc". El almacén de la
// directiva local es C:\Windows\System32\GroupPolicy\Machine\Registry.pol
// (equipo) y ...\User\Registry.pol (usuario), formato binario PReg:
// cabecera "PReg" + versión DWORD, luego entradas '[' + clave UTF-16LE
// + ';' + nombre de valor + ';' + tipo DWORD + ';' + tamaño DWORD +
// datos + ']'. Solo se leen los valores de directiva que le importan al
// detector; nunca contraseñas ni secretos.
const GPOL_VALUE_NAMES = ['InactivityTimeoutSecs', 'ScreenSaveTimeOut', 'ScreenSaveActive'];

function registryPolValue(type, data) {
  if (type === 4) return data.length >= 4 ? data.readUInt32LE(0) : null; // REG_DWORD
  if (type === 1 || type === 2) { // REG_SZ / REG_EXPAND_SZ
    const str = data.toString('utf16le').replace(/\0+$/, '');
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
  const str = (Buffer.isBuffer(text) ? text.toString('utf16le') : String(text || '')).replace(/^\uFEFF/, '');
  const get = (name) => {
    const m = str.match(new RegExp('^\\s*' + name + '\\s*=\\s*(-?\\d+)', 'im'));
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
  const manual = p.bloqueoManual === true;
  const cC = cambio === null ? null : cambio <= 90;
  const cL = lon === null ? null : lon >= 10;
  const cI = inten === null ? null : inten <= 5;
  const cB = manual ? true : (bloq === null ? null : bloq >= 350);
  const vals = [cC, cL, cI, cB].filter((v) => v !== null);
  return {
    cambioDias: cambio,
    minLongitud: lon,
    bloqueoIntentos: inten,
    bloqueoSegundos: bloq,
    bloqueoManual: manual,
    lockoutSegundos: num(p.lockoutSegundos),
    complejidad: num(p.complejidad),
    cumpleCambio: cC,
    cumpleLongitud: cL,
    cumpleIntentos: cI,
    cumpleBloqueo: cB,
    cumple: vals.length ? vals.every((v) => v === true) : null,
  };
}

function isVirtualPrinter(name) {
  return VIRTUAL_PRINTER_RE.test(String(name || ''));
}

function parsePrinters(output) {
  return splitLines(output).filter((n) => !isVirtualPrinter(n));
}

// Adaptadores VPN: se excluyen los "WAN Miniport" (miniports VPN del
// sistema, presentes en todo Windows aunque no haya VPN configurada).
function parseVpnAdapters(output) {
  return splitLines(output).filter(
    (d) => !/^\s*WAN Miniport/i.test(d) && VPN_ADAPTER_RE.test(d)
  );
}

// Patrones de accesos directos (2.3.5): con espacio y variantes.
// ALFAWEB_RE casa 'Alfaweb', 'Alfa Web', 'AlfaLab' y 'Alfa Lab'
// (Gerardo escribió 'alfalab web': el programa puede ser AlfaLab, no
// Alfaweb). HISTORIA_RE casa 'hcweb', 'HC Web' (con espacio) e
// 'historia (clínica)'. La exclusión /print/i NO va aquí: se aplica en
// scanDesktopEntries() y en la tarea t21/t22/t23, para que un archivo
// de Alfaprinter no marque t22.
const ALFAWEB_RE = /alfa\s*web|alfalab|alfa\s*lab/i;
const HISTORIA_RE = /hc\s*web|historia/i;

// Expande variables de entorno estilo Windows (%NOMBRE%) en una ruta,
// con el mapa vars { NOMBRE_MAYUSCULAS: valor }. Las que no se conocen
// se dejan tal cual (nunca se inventa una ruta). Sirve para el valor
// del registro User Shell Folders, que suele venir sin expandir.
function expandEnvVars(s, vars) {
  return str(s).replace(/%([^%]+)%/g, (m, name) => {
    const v = vars ? vars[String(name).toUpperCase()] : undefined;
    return v !== undefined && v !== '' ? v : m;
  });
}

// Accesos directos del escritorio: hace falta uno de historia clínica
// (o 'hcweb'/'HC Web', como se llaman en realidad los accesos) Y uno de
// gabinete. Cada patrón se busca por separado: los dos .lnk pueden ser
// archivos distintos (lo habitual) o el mismo si nombra los dos.
function parseDesktopShortcuts(names) {
  const lnk = (names || []).filter((n) => /\.lnk$/i.test(n));
  return {
    historia: lnk.some((n) => HISTORIA_RE.test(n)),
    gabinete: lnk.some((n) => /gabinete/i.test(n)),
  };
}

// Líneas "DisplayName|DisplayVersion|Publisher" -> [{ name, version, publisher }]
// (las líneas viejas de 2 campos, sin Publisher, siguen valiendo).
function parseUninstallVersions(output) {
  return splitLines(output).map((line) => {
    const parts = line.split('|').map((p) => p.trim());
    return {
      name: parts[0] || '',
      version: parts[1] || '',
      publisher: parts[2] || '',
    };
  });
}

// Nombre normalizado para emparejar: minúsculas, solo letras/números,
// un espacio entre palabras.
function normalizeName(v) {
  return str(v).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Palabras genéricas que no distinguen un antivirus de otro.
const GENERIC_AV_WORDS = new Set([
  'antivirus', 'security', 'internet', 'protection', 'total', 'free',
  'pro', 'plus', 'premium', 'essential', 'endpoint', 'suite', 'software',
  'microsoft', 'windows',
]);

function avSignificantTokens(name) {
  return normalizeName(name).split(' ').filter((t) => t && !GENERIC_AV_WORDS.has(t));
}

// Puntuación de emparejamiento SecurityCenter2 <-> desinstalación:
// 100 nombre normalizado idéntico; 80 un nombre contiene al otro;
// 60 al menos 2 tokens significativos compartidos, o 1 solo cuando uno
// de los dos nombres tiene un único token significativo (p. ej.
// 'ESET Security' <-> 'ESET NOD32 Antivirus': solo comparten 'eset').
// +20 si el Publisher de la clave coincide con el fabricante del
// nombre de SecurityCenter2. Menos de 60 no es emparejamiento.
function scoreAntivirusMatch(scName, entry) {
  const want = normalizeName(scName);
  const got = normalizeName(entry && entry.name);
  if (!want || !got) return 0;
  if (want === got) return 100;
  if (got.includes(want) || want.includes(got)) return 80;
  const wantTokens = avSignificantTokens(scName);
  const gotTokens = avSignificantTokens(entry.name);
  const shared = wantTokens.filter((t) => gotTokens.includes(t));
  let score = 0;
  if (shared.length >= 2) score = 60;
  else if (shared.length === 1 && (wantTokens.length <= 1 || gotTokens.length <= 1)) score = 60;
  const pub = normalizeName(entry.publisher);
  const vendor = want.split(' ')[0] || '';
  if (pub && vendor && (pub.includes(vendor) || want.includes(pub.split(' ')[0] || ' '))) score += 20;
  return score;
}

// Mejor versión de desinstalación para un nombre de SecurityCenter2.
// Devuelve { version, source }: source es 'desinstalación' o '' cuando
// no hay emparejamiento fiable (mejor no poner versión que poner la de
// otro producto).
function findAntivirusVersion(scName, entries) {
  if (!scName || !Array.isArray(entries)) return { version: '', source: '' };
  let best = null;
  let bestScore = 0;
  for (const e of entries) {
    const score = scoreAntivirusMatch(scName, e);
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  if (!best || bestScore < 60) return { version: '', source: '' };
  return { version: str(best.version).trim(), source: 'desinstalación' };
}

function isWindowsDefenderName(name) {
  return /windows defender|microsoft defender/i.test(str(name));
}

// Entre varios antivirus de SecurityCenter2, prefiere el habilitado y
// al día; si hay varios, prefiere uno que NO sea Windows Defender (en
// un equipo con otro antivirus activo, Defender aparece pero no es el
// antivirus real). Si ninguno está habilitado/al día, prefiere un
// habilitado, luego uno que no sea Defender, luego el primero.
function selectAntivirusProduct(products) {
  if (!Array.isArray(products) || !products.length) return null;
  const active = products.filter((p) => p.enabled && p.upToDate);
  const pool = active.length ? active : products.filter((p) => p.enabled);
  const candidates = pool.length ? pool : products;
  const nonDefender = candidates.filter((p) => !isWindowsDefenderName(p.name));
  return nonDefender[0] || candidates[0];
}

// Contenido de un .url: la línea URL= (InternetShortcut). '' si no hay.
function parseUrlFile(text) {
  const m = String(text || '').match(/^URL\s*=\s*(.+?)\s*$/im);
  return m ? m[1].trim() : '';
}

// Cadenas imprimibles de un .lnk: el destino va como texto dentro del
// binario (ruta o URL). Best-effort: si no se puede leer, solo vale el
// nombre del archivo.
function extractLnkTargets(text) {
  return String(text || '')
    .split(/[\x00-\x1F\x7F]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4);
}

// Accesos directos ya resueltos: [{ name, target }] (.lnk o .url; target
// es la URL del .url o las cadenas del .lnk, '' si no se pudo leer).
// Match por nombre Y por destino. t24 exige historia Y gabinete (pueden
// ser archivos distintos); t22 Alfaweb (con las variantes de ALFAWEB_RE);
// t23 Alfaprinter por acceso.
// EXCLUSIÓN t22 (2.3.5): un acceso cuyo nombre o destino case con
// /print/i NO marca t22, aunque contenga 'alfa': un 'Alfaprinter.lnk'
// (o un 'Alfaweb Printer.lnk') es de la impresora, no de Alfaweb.
// parseDesktopShortcuts() se mantiene para compatibilidad (solo t24).
function scanDesktopEntries(entries) {
  const list = (entries || []).map((e) =>
    typeof e === 'string' ? { name: e, target: '' } : { name: str(e.name), target: str(e.target) }
  );
  const isShortcut = (n) => /\.(lnk|url)$/i.test(n);
  const hay = (re) =>
    list.some(
      (e) => isShortcut(e.name) && (re.test(e.name) || (e.target && re.test(e.target)))
    );
  const hayAlfaweb = () =>
    list.some((e) => {
      if (!isShortcut(e.name)) return false;
      const hit =
        ALFAWEB_RE.test(e.name) || (e.target && ALFAWEB_RE.test(e.target));
      if (!hit) return false;
      return !/print/i.test(e.name) && !(e.target && /print/i.test(e.target));
    });
  return {
    historia: hay(HISTORIA_RE),
    gabinete: hay(/gabinete/i),
    alfaweb: hayAlfaweb(),
    alfaprinter: hay(/alfaprinter/i),
  };
}

// Versión de ESET desde su registro: una línea con forma N.N[.N[.N]];
// '' si no hay ninguna (nunca se inventa una versión).
function parseEsetRegistryVersion(output) {
  const line = String(output || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean) || '';
  return /^\d+\.\d+(\.\d+){0,2}$/.test(line) ? line : '';
}

// Versión del ESET Management Agent en desinstalación (2.3.8): la
// entrada con DisplayName 'ESET Management Agent' y su DisplayVersion.
// '' si no está instalado o la versión no tiene forma N[.N...] (nunca
// se inventa una versión).
function findEsetAgentVersion(entries) {
  if (!Array.isArray(entries)) return '';
  const e = entries.find((x) => /eset management agent/i.test(String((x && x.name) || '')));
  if (!e) return '';
  const v = str(e.version).trim();
  return /^\d+(\.\d+)*$/.test(v) ? v : '';
}

// Busca en la lista de desinstalación la versión de un programa por nombre:
// coincidencia exacta (sin distinguir mayúsculas) o que un nombre contenga
// al otro. Devuelve la versión o '' si no hay entrada o no tiene versión.
function findUninstallVersion(name, entries) {
  if (!name || !Array.isArray(entries)) return '';
  const want = String(name).trim().toLowerCase();
  if (!want) return '';
  const exact = entries.find((e) => String(e.name || '').trim().toLowerCase() === want);
  if (exact) return str(exact.version).trim();
  const contained = entries.find((e) => {
    const n = String(e.name || '').trim().toLowerCase();
    return n && (n.includes(want) || want.includes(n));
  });
  return contained ? str(contained.version).trim() : '';
}

// Líneas "Name|DisplayName|Status" de Get-Service *invgate*.
function parseInvgateServices(output) {
  return splitLines(output).map((line) => {
    const parts = line.split('|').map((p) => p.trim());
    return { name: parts[0] || '', displayName: parts[1] || '', status: parts[2] || '' };
  });
}

// Línea "WindowsProductName|DisplayVersion|OsBuildNumber[|UBR]" ->
// 'Windows 11 Pro 26H2 (compilación 26200)' o, con UBR distinto de 0,
// 'Windows 11 Pro 26H2 (compilación 26200.6899)'. Las partes que falten
// se omiten; sin nombre de producto devuelve { nombre: '', build: 0 }.
// 2.3.8: el nombre se NORMALIZA por el número de compilación (build):
// las fuentes mienten en Windows 11 (ProductName del registro, Caption
// de Win32_OperatingSystem y WindowsProductName de Get-ComputerInfo
// pueden decir 'Windows 10' en un Windows 11 real). Build >= 22000 es
// Windows 11 y build < 22000 es Windows 10, así que un 'Windows 10 Pro'
// con build 26300 sale como 'Windows 11 Pro' (la edición — Pro/Home —
// y DisplayVersion/compilación se conservan).
function parseOsVersionDetailed(output) {
  const parts = String(output || '').split('|').map((p) => p.trim());
  const product = parts[0] || '';
  if (!product) return { nombre: '', build: 0 };
  const displayVersion = parts[1] || '';
  let build = parts[2] || '';
  const ubr = parts[3] || '';
  let out = product;
  if (displayVersion) out += ' ' + displayVersion;
  if (build) {
    if (ubr && ubr !== '0') build += '.' + ubr;
    out += ' (compilación ' + build + ')';
  }
  const buildNum = parseInt(parts[2] || '', 10);
  const b = Number.isFinite(buildNum) && buildNum > 0 ? buildNum : 0;
  return { nombre: fixWindowsOsName(out, b), build: b };
}

// Envoltorio compatible: solo el nombre (ya normalizado por build).
function parseOsVersion(output) {
  return parseOsVersionDetailed(output).nombre;
}

// --- SO en Windows (2.3.4): Get-ComputerInfo / registro / build ---

// Build de Windows desde si.osInfo(): el campo build directo, o el
// último segmento numérico de release ('10.0.26200' -> 26200). 0 si no
// se puede determinar.
function windowsBuildFromOsInfo(osInfo) {
  if (!osInfo) return 0;
  const b = parseInt(str(osInfo.build).trim(), 10);
  if (Number.isFinite(b) && b > 0) return b;
  const rel = str(osInfo.release);
  const m = rel.match(/(\d+)\s*$/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n)) return n;
  }
  const m2 = rel.match(/(\d{5,})/);
  return m2 ? parseInt(m2[1], 10) : 0;
}

// Normalización 10 vs 11 por número de compilación (2.3.8): la verdad
// de fondo es el build, no el nombre — en Windows 11 las fuentes
// (registro, CIM, Get-ComputerInfo, si.osInfo) pueden seguir diciendo
// 'Windows 10' por compatibilidad. Build >= 22000 es Windows 11:
// 'Windows 10 Pro' -> 'Windows 11 Pro' (la edición se conserva).
// Build > 0 y < 22000 es Windows 10: un 'Windows 11' con ese build
// baja a 'Windows 10'. Sin build (0 o no numérico) el nombre queda
// tal cual, porque no hay con qué contrastarlo.
function fixWindowsOsName(name, build) {
  const s = str(name);
  const b = Number(build);
  if (Number.isFinite(b) && b >= 22000) {
    if (/windows 10/i.test(s)) return s.replace(/windows 10/i, 'Windows 11');
  } else if (Number.isFinite(b) && b > 0) {
    if (/windows 11/i.test(s)) return s.replace(/windows 11/i, 'Windows 10');
  }
  return s;
}

// Nombre del SO en Windows, con las fuentes en orden (2.3.6: las
// RÁPIDAS primero, porque Get-ComputerInfo es notoriamente lento y
// puede morir por el timeout de 15 s en la PC real):
// 1) registro directo (PS_OS_REGISTRY: ProductName + DisplayVersion +
//    CurrentBuildNumber + UBR),
// 2) (Get-CimInstance Win32_OperatingSystem).Caption (+ BuildNumber),
// 3) Get-ComputerInfo + DisplayVersion del registro (PS_OS_VERSION),
// 4) si.osInfo() con la corrección por build.
// 2.3.8: TODAS las fuentes se normalizan 10 vs 11 por build
// (parseOsVersionDetailed usa el build de la propia línea; si una
// fuente trae nombre pero no build, se contrasta con el build de
// si.osInfo() antes de dar el nombre por bueno). La 2.3.6 solo
// corregía la rama si.osInfo(): ese era el hueco — el registro, el CIM
// y Get-ComputerInfo devolvían 'Windows 10' tal cual en un Win11.
// osInfoOrProvider es el objeto ya leído de si.osInfo() (detectMachine)
// o una función que lo devuelve (detectChecks, solo se llama si hacen
// falta las tres fuentes de PowerShell o si una viene sin build).
// Devuelve { nombre, fuente }, con fuente 'registro' | 'cim' |
// 'computerinfo' | 'si' (o '' si ninguna fuente da un nombre). Si una
// fuente falla o viene vacía, se pasa a la siguiente sin romper nada.
async function resolveWindowsOsNameDetailed(runPs, osInfoOrProvider) {
  // osInfo se lee perezosamente y una sola vez: solo hace falta si una
  // fuente PowerShell da nombre sin build, o si fallan las tres.
  let osInfoCache = null;
  let osInfoRead = false;
  const readOsInfo = async () => {
    if (osInfoRead) return osInfoCache;
    osInfoRead = true;
    try {
      osInfoCache =
        typeof osInfoOrProvider === 'function'
          ? await osInfoOrProvider()
          : osInfoOrProvider;
    } catch (e) {
      osInfoCache = null;
    }
    return osInfoCache;
  };
  // Una fuente PowerShell: { nombre, build } ya normalizado por su
  // propio build. Si la fuente trae nombre pero no build
  // (CurrentBuildNumber/BuildNumber/OsBuildNumber vacío), se contrasta
  // con el build de si.osInfo(): un 'Windows 10' sin build propio pero
  // con build >= 22000 en si.osInfo() es Windows 11.
  const tryPs = async (script, fuente) => {
    const out = await withTimeout(runPs(script), CHECK_TIMEOUT_MS);
    const det = parseOsVersionDetailed(out);
    if (!det.nombre) return null;
    if (!det.build) {
      const osInfo = await readOsInfo();
      const b = windowsBuildFromOsInfo(osInfo);
      if (b > 0) det.nombre = fixWindowsOsName(det.nombre, b);
    }
    return { nombre: det.nombre, fuente };
  };
  try {
    const v = await tryPs(PS_OS_REGISTRY, 'registro');
    if (v) return v;
  } catch (e) {
    /* siguiente fuente */
  }
  try {
    const v = await tryPs(PS_OS_CIM, 'cim');
    if (v) return v;
  } catch (e) {
    /* siguiente fuente */
  }
  try {
    const v = await tryPs(PS_OS_VERSION, 'computerinfo');
    if (v) return v;
  } catch (e) {
    /* siguiente fuente */
  }
  const osInfo = await readOsInfo();
  const base = [str(osInfo && osInfo.distro), str(osInfo && osInfo.release)]
    .filter(Boolean)
    .join(' ');
  const nombre = fixWindowsOsName(base, windowsBuildFromOsInfo(osInfo));
  return { nombre, fuente: nombre ? 'si' : '' };
}

// Envoltorio compatible: solo el nombre (sin la fuente).
async function resolveWindowsOsName(runPs, osInfoOrProvider) {
  return (await resolveWindowsOsNameDetailed(runPs, osInfoOrProvider)).nombre;
}

// Versión de un archivo (FileVersion de chrome.exe): primera línea con
// forma N.N.N.N; '' si no hay ninguna.
function parseFileVersion(output) {
  const m = String(output || '').match(/(\d+\.\d+\.\d+\.\d+)/);
  return m ? m[1] : '';
}

// --- IP: interfaz principal y estática/dinámica (exportados para pruebas) ---

// ¿IPv4 usable? Cuatro octetos, sin loopback (127.x) ni 0.0.0.0.
function isUsableIpv4(v) {
  const s = str(v).trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return false;
  if (s === '0.0.0.0' || s.startsWith('127.')) return false;
  return s.split('.').every((o) => Number(o) <= 255);
}

// Interfaz principal: la marcada default: true con IPv4 usable; si no hay
// ninguna marcada, la primera no interna con IPv4 usable. null si no hay.
function selectPrimaryInterface(ifaces) {
  if (!Array.isArray(ifaces)) return null;
  const usable = ifaces.filter((n) => n && isUsableIpv4(n.ip4) && !n.internal);
  if (!usable.length) return null;
  return usable.find((n) => n.default === true) || usable[0];
}

// dhcp true = dinámica, false = estática; cualquier otro valor -> ''.
function ipTipoFromDhcp(dhcp) {
  if (dhcp === true) return 'Dinámica';
  if (dhcp === false) return 'Estática';
  return '';
}

// Líneas "IPAddress|Dhcp" de PS_IP_DHCP -> [{ ip, dhcp: true|false|null }]
// (Dhcp es Enabled/Disabled en Get-NetIPInterface).
function parseIpDhcp(output) {
  return splitLines(output).map((line) => {
    const i = line.lastIndexOf('|');
    const ip = i >= 0 ? line.slice(0, i).trim() : line;
    const raw = i >= 0 ? line.slice(i + 1).trim().toLowerCase() : '';
    return {
      ip,
      dhcp: raw === 'enabled' ? true : raw === 'disabled' ? false : null,
    };
  });
}

// Líneas "InterfaceAlias|IPAddress|Dhcp" de PS_NET_IP_DHCP ->
// [{ alias, ip, dhcp: true|false|null }]. Solo valen las líneas con
// IPv4 usable en el segundo campo (las de 2 campos del script viejo y
// las IPs no usables se descartan).
function parseNetIpDhcp(output) {
  return splitLines(output)
    .map((line) => {
      const parts = line.split('|').map((p) => p.trim());
      if (parts.length !== 3 || !isUsableIpv4(parts[1])) return null;
      const raw = parts[2].toLowerCase();
      return {
        alias: parts[0],
        ip: parts[1],
        dhcp: raw === 'enabled' ? true : raw === 'disabled' ? false : null,
      };
    })
    .filter(Boolean);
}

// Todas las interfaces con IPv4 usable (no interna):
// [{ nombre, ip, ipTipo }] con nombre = iface de systeminformation
// (Ethernet, Wi-Fi, ...), ip la IPv4 e ipTipo 'Estática' | 'Dinámica'
// o '' si el campo dhcp no viene. El orden es el de networkInterfaces().
function listNetworks(ifaces) {
  if (!Array.isArray(ifaces)) return [];
  return ifaces
    .filter((n) => n && !n.internal && isUsableIpv4(n.ip4))
    .map((n) => ({
      nombre: str(n.iface).trim(),
      ip: str(n.ip4).trim(),
      ipTipo: ipTipoFromDhcp(n.dhcp),
    }));
}

// --- AnyDesk: ID (9-10 dígitos) y alias (exportados para pruebas) ---

// Salida de `AnyDesk.exe --get-id`: solo el número, normalmente 9
// dígitos (los hay de 10). Si viene con texto alrededor, se toma la
// primera secuencia de 9-10 dígitos; si no hay ninguna, '' (nunca se
// inventa un número).
function parseAnydeskId(output) {
  const s = String(output || '').trim();
  if (/^\d{9,10}$/.test(s)) return s;
  const m = s.match(/\b\d{9,10}\b/);
  return m ? m[0] : '';
}

// Salida de `AnyDesk.exe --get-alias`: alias tipo 'equipo@ad' (nombre
// + espacio de nombres). Solo se acepta un token sin espacios con '@';
// si no, ''.
function parseAnydeskAlias(output) {
  const s = String(output || '').trim().split(/\r?\n/)[0].trim();
  return /^\S+@\S+$/.test(s) ? s : '';
}

// Líneas "InstallLocation|DisplayIcon" de PS_ANYDESK_LOCATION.
function parseAnydeskLocations(output) {
  return splitLines(output).map((line) => {
    const i = line.lastIndexOf('|');
    return {
      installLocation: i >= 0 ? line.slice(0, i).trim() : '',
      displayIcon: i >= 0 ? line.slice(i + 1).trim() : line,
    };
  });
}

// Contenido de service.conf / user.conf / system.conf de AnyDesk:
// ad.anynet.id=<9-10 dígitos> y ad.anynet.alias=<nombre>@<espacio>.
// Devuelve { id, alias } con '' en lo que no aparezca.
function parseAnydeskConf(text) {
  const s = String(text || '');
  const idMatch = s.match(/^ad\.anynet\.id\s*=\s*(\d{9,10})\s*$/im);
  const aliasMatch = s.match(/^ad\.anynet\.alias\s*=\s*(\S+)\s*$/im);
  const alias = aliasMatch ? aliasMatch[1].trim() : '';
  return {
    id: idMatch ? idMatch[1] : '',
    alias: /^\S+@\S+$/.test(alias) ? alias : '',
  };
}

// DisplayIcon suele venir como 'C:\...\AnyDesk.exe,0': quita comillas y
// el sufijo ',N' para quedarse con la ruta del exe.
function cleanDisplayIcon(v) {
  let s = str(v).trim().replace(/^"(.*)"$/, '$1');
  s = s.replace(/,\d+$/, '');
  return s;
}

// ospp.vbs /dstatus: activado solo si aparece "LICENSE STATUS: ---LICENSED---".
function parseOsppLicensed(output) {
  return /LICENSE STATUS:\s*---LICENSED---/i.test(String(output || ''));
}

// --- Ejecución real (PowerShell / cscript) ---

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: CHECK_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(String(stdout || '')))
    );
  });
}

function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { timeout: CHECK_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(String(stdout || '')))
    );
  });
}

// --- Contraseña del usuario local de Windows (257) ---
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
  fs.writeFileSync(tmp, script + "\n", 'utf8');
  try {
    const out = await new Promise((resolve, reject) => {
      execFile('powershell',
        ['-NoProfile', '-NonInteractive', '-Command',
         "$p = Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','" + tmp.replace(/'/g, "''") + "' -Wait -PassThru; 'PS-EXIT:' + $p.ExitCode"],
        { timeout: ELEVATED_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 },
        (err, stdout) => (err ? reject(err) : resolve(String(stdout || ''))));
    });
    const m = /PS-EXIT:(-?\d+)/.exec(out);
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

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// overrides (gancho de pruebas; en producción se llama sin argumentos):
// {
//   platform, now, serial,
//   runPs: async (script) => stdout, runCmd: async (cmd, args) => stdout,
//   fileExists: (p) => bool, listDir: (dir) => [nombres],
//   readFileBin: (p) => Buffer (Registry.pol y el .inf de secedit),
//   battery: {...} | async () => {...},
//   programFiles: [rutas], userDesktop, publicDesktop,
//   desktopDirs: [rutas de Escritorio a escanear], oneDriveDesktop,
//   userProfile, startMenuDirs: [rutas de Menú Inicio a escanear],
//   osInfo: {...} | async () => {...} (respaldo de versiones.so en Windows)
// }
// En las pruebas runPs también puede simular Get-Service *invgate*,
// Get-ComputerInfo, la desinstalación con versión (DisplayVersion) y la
// versión de archivo de chrome.exe; detectChecks distingue cada script
// por su contenido (ver scripts/test-detect-checks.js).
async function detectChecks(overrides = {}) {
  try {
    const platform = overrides.platform || process.platform;
    const isWin = platform === 'win32';
    const now = overrides.now || Date.now();
    const runPs = overrides.runPs || runPowerShell;
    const runCmd = overrides.runCmd || runCommand;
    const fileExists = overrides.fileExists || fs.existsSync;
    const listDir = overrides.listDir || ((dir) => {
      try {
        return fs.readdirSync(dir);
      } catch (e) {
        return [];
      }
    });
    const readFileBin = overrides.readFileBin || ((p) => fs.readFileSync(p));
    // Rutas Windows con path.win32 aunque la prueba corra en Linux.
    const pth = isWin ? path.win32 : path;
    const programFiles =
      overrides.programFiles ||
      (isWin
        ? [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean)
        : []);
    const userProfile =
      overrides.userProfile ||
      (isWin && process.env.USERPROFILE ? process.env.USERPROFILE : '');
    const userDesktop =
      overrides.userDesktop ||
      (userProfile ? pth.join(userProfile, 'Desktop') : '');
    const publicDesktop =
      overrides.publicDesktop ||
      (isWin && process.env.PUBLIC ? pth.join(process.env.PUBLIC, 'Desktop') : '');
    const readFile =
      overrides.readFile ||
      ((p) => fs.readFileSync(p, 'utf8'));
    const programData =
      overrides.programData ||
      (isWin && process.env.ProgramData ? process.env.ProgramData : '');
    const appData =
      overrides.appData ||
      (isWin && process.env.APPDATA ? process.env.APPDATA : '');
    // Escritorio de OneDrive (respaldo cuando el Escritorio está
    // redirigido, habitual en equipos corporativos).
    const oneDriveDesktop =
      overrides.oneDriveDesktop ||
      (isWin && process.env.USERPROFILE
        ? pth.join(process.env.USERPROFILE, 'OneDrive', 'Desktop')
        : '');
    // Variables para expandir el valor del registro User Shell Folders
    // (2.3.5): el registro suele traer %USERPROFILE%\OneDrive -
    // <Empresa>\Desktop sin expandir.
    const envVars = {
      USERPROFILE: userProfile,
      APPDATA: appData,
      PROGRAMDATA: programData,
      PUBLIC: publicDesktop
        ? publicDesktop.replace(/\\Desktop$/i, '')
        : isWin && process.env.PUBLIC
          ? process.env.PUBLIC
          : '',
    };

    const checks = {};
    const detalles = {};
    const versiones = {};
    // anydeskInfo: { id, alias } solo si se pudieron determinar.
    const anydeskInfo = {};
    const mark = (id, value) => {
      if (ALLOWED_CHECK_IDS.has(id)) checks[id] = value === undefined ? true : value;
    };
    const exeInProgramFiles = (rel) =>
      programFiles.some((pf) => {
        try {
          return fileExists(pth.join(pf, rel));
        } catch (e) {
          return false;
        }
      });

    // Listas compartidas: una sola llamada a PowerShell cada una, aunque
    // varios chequeos las usen.
    let uninstallPromise = null;
    const getUninstallNames = () => {
      if (!uninstallPromise) {
        uninstallPromise = withTimeout(runPs(PS_UNINSTALL), CHECK_TIMEOUT_MS).then(
          parseUninstallNames,
          () => []
        );
      }
      return uninstallPromise;
    };
    // Desinstalación con versión (una sola llamada aunque varios chequeos
    // la usen: versiones de antivirus y Chrome, detalles.invgate).
    let uninstallVersionsPromise = null;
    const getUninstallVersions = () => {
      if (!uninstallVersionsPromise) {
        uninstallVersionsPromise = withTimeout(runPs(PS_UNINSTALL_VERSIONS), CHECK_TIMEOUT_MS).then(
          parseUninstallVersions,
          () => []
        );
      }
      return uninstallVersionsPromise;
    };
    let processesPromise = null;
    const getProcessNames = () => {
      if (!processesPromise) {
        processesPromise = withTimeout(runPs(PS_PROCESSES), CHECK_TIMEOUT_MS).then(
          splitLines,
          () => []
        );
      }
      return processesPromise;
    };
    // Impresoras (nombres tal cual, incluidas las virtuales): una sola
    // llamada aunque la usen t9 y t23.
    let printersPromise = null;
    const getPrinterNames = () => {
      if (!printersPromise) {
        printersPromise = withTimeout(runPs(PS_PRINTERS), CHECK_TIMEOUT_MS).then(
          splitLines,
          () => []
        );
      }
      return printersPromise;
    };
    // Accesos directos del Escritorio (2.3.3, ampliado en 2.3.5): una
    // sola exploración aunque la usen t22, t23 y t24. Rutas de Escritorio,
    // TODAS las que existan (no solo la primera): (a) las que devuelve
    // PowerShell ([Environment]::GetFolderPath('Desktop') y
    // CommonDesktopDirectory), (b) el registro User Shell
    // Folders\Desktop (PS_DESKTOP_REGISTRY, expandiendo %USERPROFILE%),
    // (c) glob de carpetas '%USERPROFILE%\OneDrive*\Desktop' (en equipos
    // corporativos OneDrive es 'OneDrive - <Empresa>'), (d)
    // %USERPROFILE%\Desktop y (e) Escritorio público.
    // overrides.desktopDirs las sustituye en pruebas (entonces no se
    // consultan PowerShell, registro ni glob). Además se escanea el
    // Menú Inicio (%APPDATA%\Microsoft\Windows\Start Menu\Programs, un
    // nivel de subcarpetas; overrides.startMenuDirs lo sustituye) para
    // t22, t23 y t24. Se escanean .lnk Y .url; el destino se lee del
    // .url (URL=) y, si se puede, de las cadenas del .lnk. Si una ruta
    // no existe o un archivo no se puede leer, se ignora sin romper.
    // Diagnóstico en detalles (2.3.5): escritorioRutas = rutas de
    // Escritorio realmente escaneadas (las que existen); atajosVistos =
    // nº de .lnk/.url revisados (Escritorio + Menú Inicio). Solo van
    // cuando se escaneó al menos una ruta (escritorioRutas solo si se
    // escaneó al menos una ruta de Escritorio); en Linux/Mac no van
    // porque este escaneo no corre.
    let desktopScanPromise = null;
    const getDesktopScan = () => {
      if (!desktopScanPromise) {
        desktopScanPromise = (async () => {
          try {
            const dirs = [];
            const addDir = (d) => {
              const s = str(d).trim();
              if (s && !dirs.some((x) => x.toLowerCase() === s.toLowerCase())) dirs.push(s);
            };
            if (Array.isArray(overrides.desktopDirs)) {
              overrides.desktopDirs.forEach(addDir);
            } else {
              try {
                const out = await withTimeout(runPs(PS_DESKTOP_PATHS), CHECK_TIMEOUT_MS);
                splitLines(out).forEach(addDir);
              } catch (e) {
                /* respaldo con las rutas conocidas */
              }
              try {
                const regOut = await withTimeout(runPs(PS_DESKTOP_REGISTRY), CHECK_TIMEOUT_MS);
                splitLines(regOut)
                  .map((p) => expandEnvVars(p, envVars))
                  .forEach(addDir);
              } catch (e) {
                /* respaldo con las rutas conocidas */
              }
              [userDesktop, publicDesktop, oneDriveDesktop].forEach(addDir);
              if (userProfile) {
                let profileEntries = [];
                try {
                  profileEntries = listDir(userProfile);
                } catch (e) {
                  profileEntries = [];
                }
                for (const name of profileEntries) {
                  if (/^onedrive/i.test(str(name))) {
                    addDir(pth.join(userProfile, name, 'Desktop'));
                  }
                }
              }
            }
            const startMenuDirs = [];
            const addStartMenuDir = (d) => {
              const s = str(d).trim();
              if (s && !startMenuDirs.some((x) => x.toLowerCase() === s.toLowerCase())) startMenuDirs.push(s);
            };
            if (Array.isArray(overrides.startMenuDirs)) {
              overrides.startMenuDirs.forEach(addStartMenuDir);
            } else if (appData) {
              addStartMenuDir(pth.join(appData, 'Microsoft\\Windows\\Start Menu\\Programs'));
            }
            const dirExists = (d) => {
              try {
                return !!fileExists(d);
              } catch (e) {
                return false;
              }
            };
            const listNames = (d) => {
              try {
                return listDir(d);
              } catch (e) {
                return [];
              }
            };
            const readShortcut = (dir, name) => {
              let target = '';
              try {
                const content = readFile(pth.join(dir, name));
                if (/\.url$/i.test(name)) target = parseUrlFile(content);
                else target = extractLnkTargets(content).join(' ');
              } catch (e) {
                /* solo vale el nombre del archivo */
              }
              return { name, target };
            };
            const entries = [];
            const scannedDesktopDirs = [];
            let shortcutCount = 0;
            for (const dir of dirs) {
              if (!dirExists(dir)) continue;
              scannedDesktopDirs.push(dir);
              for (const name of listNames(dir)) {
                if (!/\.(lnk|url)$/i.test(name)) continue;
                shortcutCount++;
                entries.push(readShortcut(dir, name));
              }
            }
            let scannedStartMenuDirs = 0;
            for (const dir of startMenuDirs) {
              if (!dirExists(dir)) continue;
              scannedStartMenuDirs++;
              for (const name of listNames(dir)) {
                if (/\.(lnk|url)$/i.test(name)) {
                  shortcutCount++;
                  entries.push(readShortcut(dir, name));
                  continue;
                }
                // Subcarpeta del Menú Inicio (un nivel): p. ej. los
                // accesos suelen estar en 'Programs\<App>\'.
                const sub = pth.join(dir, name);
                if (!dirExists(sub)) continue;
                for (const subName of listNames(sub)) {
                  if (!/\.(lnk|url)$/i.test(subName)) continue;
                  shortcutCount++;
                  entries.push(readShortcut(sub, subName));
                }
              }
            }
            if (scannedDesktopDirs.length) {
              detalles.escritorioRutas = scannedDesktopDirs;
            }
            if (scannedDesktopDirs.length || scannedStartMenuDirs) {
              detalles.atajosVistos = shortcutCount;
            }
            return scanDesktopEntries(entries);
          } catch (e) {
            return { historia: false, gabinete: false, alfaweb: false, alfaprinter: false };
          }
        })();
      }
      return desktopScanPromise;
    };
    const hasName = (names, re) => names.some((n) => re.test(n));

    const tasks = [];

    // t3 — Batería y cargador: solo laptop con batería presente y
    // (cargando o >= 50%). En escritorio sin batería NO se marca.
    tasks.push(
      (async () => {
        try {
          const batt =
            typeof overrides.battery === 'function'
              ? await overrides.battery()
              : overrides.battery ||
                (await safe(() => si.battery(), null));
          if (!batt || !batt.hasBattery) return;
          if (typeof batt.percent === 'number') detalles.bateriaPorcentaje = batt.percent;
          if (batt.isCharging || batt.percent >= 50) mark('t3');
        } catch (e) {
          /* sin marcar */
        }
      })()
    );

    // t4 — Serie registrada: serie real (no de relleno) detectada.
    tasks.push(
      (async () => {
        try {
          const rawSerial =
            overrides.serial !== undefined
              ? overrides.serial
              : (await safe(() => si.system(), {})).serial;
          if (cleanSerial(rawSerial)) mark('t4');
        } catch (e) {
          /* sin marcar */
        }
      })()
    );

    // versiones.so en Linux/Mac: distro + release de systeminformation.
    // En Windows la da Get-ComputerInfo (tarea dentro de isWin); si esa
    // falla, versiones.so se omite en vez de poner un valor distinto.
    if (!isWin) {
      tasks.push(
        (async () => {
          try {
            const info = await safe(() => si.osInfo(), {});
            const soVer = [str(info.distro), str(info.release)].filter(Boolean).join(' ');
            if (soVer) {
              versiones.so = soVer;
              detalles.osFuente = 'si';
            }
          } catch (e) {
            /* sin versión */
          }
        })()
      );
    }

    if (isWin) {
      // versiones.so (Windows, 2.3.6): registro primero (rápido, con
      // UBR) -> 'Windows 11 Pro 26H2 (compilación 26200.6899)'; si el
      // registro viene vacío, CimInstance; si también falla,
      // Get-ComputerInfo; si también falla, si.osInfo() con la
      // corrección por build (>= 22000 -> Windows 11). El mismo origen
      // que detectMachine().so (resolveWindowsOsNameDetailed) y la
      // fuente queda en detalles.osFuente.
      tasks.push(
        (async () => {
          try {
            const res = await resolveWindowsOsNameDetailed(runPs, async () => {
              if (overrides.osInfo !== undefined) {
                return typeof overrides.osInfo === 'function'
                  ? await overrides.osInfo()
                  : overrides.osInfo;
              }
              return safe(() => si.osInfo(), {});
            });
            if (res.nombre) {
              versiones.so = res.nombre;
              if (res.fuente) detalles.osFuente = res.fuente;
            }
          } catch (e) {
            /* sin versión */
          }
        })()
      );

      // t18 — Google Chrome (y versiones.chrome).
      tasks.push(
        (async () => {
          try {
            const names = await getUninstallNames();
            if (
              hasName(names, /google chrome/i) ||
              exeInProgramFiles('Google\\Chrome\\Application\\chrome.exe')
            ) mark('t18');
            // Versión: DisplayVersion de la clave de desinstalación; si
            // no hay, versión del archivo chrome.exe.
            let chromeVersion = '';
            try {
              const entries = await getUninstallVersions();
              const entry = entries.find((e) => /google chrome/i.test(String(e.name || '')));
              chromeVersion = entry ? str(entry.version).trim() : '';
            } catch (e) {
              /* seguir al respaldo por archivo */
            }
            if (!chromeVersion) {
              for (const pf of programFiles) {
                const exe = pth.join(pf, 'Google\\Chrome\\Application\\chrome.exe');
                try {
                  if (fileExists(exe)) {
                    const out = await withTimeout(
                      runPs(`(Get-Item '${exe.replace(/'/g, "''")}').VersionInfo.FileVersion`),
                      CHECK_TIMEOUT_MS
                    );
                    chromeVersion = parseFileVersion(out);
                    if (chromeVersion) break;
                  }
                } catch (e) {
                  /* sin versión */
                }
              }
            }
            if (chromeVersion) versiones.chrome = chromeVersion;
          } catch (e) {
            /* sin marcar */
          }
        })()
      );

      // t19 — Adobe Reader o Adobe Acrobat (cualquier edición: DC/Pro/
      // Standard). detalles.adobe guarda 'Acrobat' o 'Reader'.
      // OJO: 'Adobe Acrobat Reader DC' contiene 'Adobe Acrobat', así que
      // Acrobat por nombre exige que NO diga Reader.
      tasks.push(
        (async () => {
          try {
            const names = await getUninstallNames();
            const acrobatByName = names.some(
              (n) => /adobe acrobat/i.test(n) && !/reader/i.test(n)
            );
            const readerByName = hasName(names, /adobe (acrobat )?reader/i);
            const acrobatByExe =
              exeInProgramFiles('Adobe\\Acrobat DC\\Acrobat\\Acrobat.exe') ||
              exeInProgramFiles('Adobe\\Acrobat\\Acrobat.exe');
            const readerByExe =
              exeInProgramFiles('Adobe\\Acrobat Reader DC\\Reader\\AcroRd32.exe') ||
              exeInProgramFiles('Adobe\\Reader 11.0\\Reader\\AcroRd32.exe');
            if (acrobatByName || acrobatByExe) {
              detalles.adobe = 'Acrobat';
              mark('t19');
            } else if (readerByName || readerByExe) {
              detalles.adobe = 'Reader';
              mark('t19');
            }
          } catch (e) {
            /* sin marcar */
          }
        })()
      );

      // t20 — WinRAR.
      tasks.push(
        (async () => {
          try {
            const names = await getUninstallNames();
            if (
              hasName(names, /winrar/i) ||
              exeInProgramFiles('WinRAR\\WinRAR.exe')
            ) mark('t20');
          } catch (e) {
            /* sin marcar */
          }
        })()
      );

      // t25 — AnyDesk (la variante Gris no se distingue; presencia basta).
      // Si está instalado, además se lee su ID (9-10 dígitos) y su alias:
      // primero `AnyDesk.exe --get-id` / `--get-alias`; si el CLI falla o
      // no devuelve nada, respaldo en service.conf / user.conf (también
      // system.conf) buscando ad.anynet.id / ad.anynet.alias. Si nada
      // funciona, anydeskId/anydeskAlias quedan sin determinar: nunca se
      // inventa un número.
      tasks.push(
        (async () => {
          try {
            const names = await getUninstallNames();
            const installed =
              hasName(names, /anydesk/i) ||
              exeInProgramFiles('AnyDesk\\AnyDesk.exe');
            if (!installed) return;
            mark('t25');
            // Localizar el exe: InstallLocation/DisplayIcon de su clave
            // de desinstalación, o las rutas comunes de Program Files.
            let exe = '';
            try {
              const out = await withTimeout(runPs(PS_ANYDESK_LOCATION), CHECK_TIMEOUT_MS);
              const locs = parseAnydeskLocations(out);
              const candidates = [];
              for (const loc of locs) {
                if (loc.installLocation) {
                  candidates.push(pth.join(loc.installLocation, 'AnyDesk.exe'));
                }
                if (loc.displayIcon) {
                  const iconExe = cleanDisplayIcon(loc.displayIcon);
                  if (/\.exe$/i.test(iconExe)) candidates.push(iconExe);
                }
              }
              for (const pf of programFiles) {
                candidates.push(pth.join(pf, 'AnyDesk\\AnyDesk.exe'));
              }
              for (const c of candidates) {
                try {
                  if (fileExists(c)) {
                    exe = c;
                    break;
                  }
                } catch (e) {
                  /* seguir buscando */
                }
              }
            } catch (e) {
              /* sin exe por registro: probar rutas comunes */
              for (const pf of programFiles) {
                const c = pth.join(pf, 'AnyDesk\\AnyDesk.exe');
                try {
                  if (fileExists(c)) {
                    exe = c;
                    break;
                  }
                } catch (e2) {
                  /* seguir */
                }
              }
            }
            let id = '';
            let alias = '';
            if (exe) {
              try {
                const out = await withTimeout(
                  runCmd(exe, ['--get-id']),
                  CHECK_TIMEOUT_MS
                );
                id = parseAnydeskId(out);
              } catch (e) {
                /* respaldo en .conf */
              }
              try {
                const out = await withTimeout(
                  runCmd(exe, ['--get-alias']),
                  CHECK_TIMEOUT_MS
                );
                alias = parseAnydeskAlias(out);
              } catch (e) {
                /* respaldo en .conf */
              }
            }
            // Respaldo: archivos de configuración de AnyDesk.
            if (!id || !alias) {
              const confDirs = [programData, appData].filter(Boolean);
              const confNames = ['service.conf', 'system.conf', 'user.conf'];
              for (const dir of confDirs) {
                if (id && alias) break;
                for (const name of confNames) {
                  if (id && alias) break;
                  try {
                    const parsed = parseAnydeskConf(
                      readFile(pth.join(dir, 'AnyDesk', name))
                    );
                    if (!id && parsed.id) id = parsed.id;
                    if (!alias && parsed.alias) alias = parsed.alias;
                  } catch (e) {
                    /* archivo ausente o ilegible: probar el siguiente */
                  }
                }
              }
            }
            if (id) anydeskInfo.id = id;
            if (alias) anydeskInfo.alias = alias;
          } catch (e) {
            /* sin marcar */
          }
        })()
      );

      // t8 — Office instalado y activado. LibreOffice basta por sí solo;
      // Office 365 solo si la activación se confirma con ospp.vbs.
      // Si Office está pero no se confirma activación, NO se marca t8 y
      // queda la pista en detalles.officeDetectado.
      tasks.push(
        (async () => {
          try {
            const names = await getUninstallNames();
            const hasLibre =
              hasName(names, /libreoffice/i) ||
              exeInProgramFiles('LibreOffice\\program\\soffice.exe');
            const officeFound =
              hasName(names, /microsoft\s+(office|365)/i) ||
              exeInProgramFiles('Microsoft Office\\root\\Office16\\WINWORD.EXE') ||
              exeInProgramFiles('Microsoft Office\\Office16\\WINWORD.EXE') ||
              exeInProgramFiles('Microsoft Office\\root\\Office15\\WINWORD.EXE') ||
              exeInProgramFiles('Microsoft Office\\Office15\\WINWORD.EXE');
            if (hasLibre) {
              mark('t8', 'LibreOffice');
              return;
            }
            if (!officeFound) return;
            detalles.officeDetectado = 'Office 365';
            const osppCandidates = [
              'Microsoft Office\\root\\Office16\\OSPP.VBS',
              'Microsoft Office\\Office16\\OSPP.VBS',
              'Microsoft Office\\root\\Office15\\OSPP.VBS',
              'Microsoft Office\\Office15\\OSPP.VBS',
            ];
            let osppPath = '';
            for (const pf of programFiles) {
              for (const rel of osppCandidates) {
                const full = pth.join(pf, rel);
                try {
                  if (fileExists(full)) {
                    osppPath = full;
                    break;
                  }
                } catch (e) {
                  /* seguir buscando */
                }
              }
              if (osppPath) break;
            }
            // Sin ospp.vbs localizable no se puede confirmar activación.
            if (!osppPath) return;
            const out = await withTimeout(
              runCmd('cscript', ['//Nologo', osppPath, '/dstatus']),
              CHECK_TIMEOUT_MS
            );
            if (parseOsppLicensed(out)) mark('t8', 'Office 365');
          } catch (e) {
            /* sin marcar */
          }
        })()
      );

      // t6 — SO actualizado: último hotfix dentro de 90 días.
      tasks.push(
        (async () => {
          try {
            const out = await withTimeout(runPs(PS_HOTFIX), CHECK_TIMEOUT_MS);
            const fecha = parseHotfixDate(out);
            if (fecha) {
              detalles.ultimoHotfix = fecha;
              if (isHotfixRecent(fecha, now, HOTFIX_MAX_DAYS)) mark('t6');
            }
          } catch (e) {
            /* sin marcar */
          }
        })()
      );

      // t7 — Antivirus instalado y actualizado (SecurityCenter2).
      // Si SecurityCenter2 lista varios, se prefiere el habilitado y al
      // día y nunca Windows Defender cuando hay otro activo. La versión
      // se busca por nombre normalizado + publisher en desinstalación;
      // para ESET, la fuente fiable es su registro (ProductVersion) y,
      // si no, la versión de egui.exe/ekrn.exe, ANTES que la de
      // desinstalación (que no siempre es la del producto). La fuente
      // queda en detalles.antivirusFuente; si ninguna fuente da una
      // versión segura, versiones.antivirus lleva solo el nombre.
      tasks.push(
        (async () => {
          try {
            const out = await withTimeout(runPs(PS_ANTIVIRUS), CHECK_TIMEOUT_MS);
            const products = parseAntivirusProducts(out);
            const selected = selectAntivirusProduct(products);
            if (!selected) return;
            let avVersion = '';
            let avFuente = '';
            // ESET: registro primero (fuente del producto).
            if (/eset/i.test(selected.name)) {
              try {
                const regOut = await withTimeout(runPs(PS_ESET_VERSION), CHECK_TIMEOUT_MS);
                const regVersion = parseEsetRegistryVersion(regOut);
                if (regVersion) {
                  avVersion = regVersion;
                  avFuente =
                    'registro ESET (HKLM\\SOFTWARE\\ESET\\ESET Security\\CurrentVersion\\Info\\ProductVersion)';
                }
              } catch (e) {
                /* respaldo por archivo / desinstalación */
              }
              // Respaldo por archivo: egui.exe / ekrn.exe.
              if (!avVersion) {
                const esetExes = [
                  'ESET\\ESET Security\\egui.exe',
                  'ESET\\ESET Security\\ekrn.exe',
                  'ESET\\ESET NOD32 Antivirus\\egui.exe',
                  'ESET\\ESET NOD32 Antivirus\\ekrn.exe',
                ];
                for (const pf of programFiles) {
                  if (avVersion) break;
                  for (const rel of esetExes) {
                    const exe = pth.join(pf, rel);
                    try {
                      if (fileExists(exe)) {
                        const fvOut = await withTimeout(
                          runPs(`(Get-Item '${exe.replace(/'/g, "''")}').VersionInfo.FileVersion`),
                          CHECK_TIMEOUT_MS
                        );
                        const fv = parseFileVersion(fvOut);
                        if (fv) {
                          avVersion = fv;
                          avFuente = 'archivo ' + rel.split('\\').pop();
                          break;
                        }
                      }
                    } catch (e) {
                      /* siguiente exe */
                    }
                  }
                }
              }
            }
            // Desinstalación (nombre normalizado + publisher).
            if (!avVersion) {
              try {
                const found = findAntivirusVersion(selected.name, await getUninstallVersions());
                avVersion = found.version;
                avFuente = found.source;
              } catch (e) {
                /* sin versión */
              }
            }
            versiones.antivirus = avVersion
              ? selected.name + ' ' + avVersion
              : selected.name;
            if (avVersion && avFuente) detalles.antivirusFuente = avFuente;
            if (selected.enabled && selected.upToDate) {
              detalles.antivirus = selected.name;
              mark('t7');
            }
          } catch (e) {
            /* sin marcar */
          }
        })()
      );

      // Agente ESET Management Agent (2.3.8): NO es antivirus y NO
      // afecta a t7. Se detecta por su clave de desinstalación
      // (DisplayName 'ESET Management Agent', DisplayVersion), con
      // respaldo en la versión de archivo de ERAAgent.exe; el servicio
      // EraAgentSvc o el proceso ERAAgent.exe confirman que el agente
      // está presente. versiones.esetAgent lleva solo la versión
      // ('11.1.1234.0'); si no está instalado, no va nada (nunca se
      // inventa una versión). La fuente queda en
      // detalles.esetAgentFuente. La desinstalación o el exe ya
      // acreditan que está instalado; la confirmación por
      // servicio/proceso solo se registra, no condiciona la versión.
      tasks.push(
        (async () => {
          try {
            let agentVersion = '';
            let agentFuente = '';
            // 1) Desinstalación: DisplayName + DisplayVersion.
            try {
              const v = findEsetAgentVersion(await getUninstallVersions());
              if (v) {
                agentVersion = v;
                agentFuente = 'desinstalación';
              }
            } catch (e) {
              /* respaldo por archivo */
            }
            // 2) Respaldo por archivo: ERAAgent.exe (FileVersion).
            if (!agentVersion) {
              for (const pf of programFiles) {
                if (agentVersion) break;
                const exe = pth.join(pf, 'ESET\\ESET Management Agent\\ERAAgent.exe');
                try {
                  if (fileExists(exe)) {
                    const fvOut = await withTimeout(
                      runPs(`(Get-Item '${exe.replace(/'/g, "''")}').VersionInfo.FileVersion`),
                      CHECK_TIMEOUT_MS
                    );
                    const fv = parseFileVersion(fvOut);
                    if (fv) {
                      agentVersion = fv;
                      agentFuente = 'archivo ERAAgent.exe';
                      break;
                    }
                  }
                } catch (e) {
                  /* siguiente ruta */
                }
              }
            }
            if (!agentVersion) return;
            // 3) Confirmación: servicio EraAgentSvc o proceso ERAAgent.exe.
            let confirmed = false;
            try {
              const svcOut = await withTimeout(runPs(PS_SERVICES_ESET_AGENT), CHECK_TIMEOUT_MS);
              if (/EraAgentSvc/i.test(svcOut)) confirmed = true;
            } catch (e) {
              /* sin servicios */
            }
            if (!confirmed) {
              try {
                const procs = await getProcessNames();
                if (procs.some((n) => /eraagent/i.test(n))) confirmed = true;
              } catch (e) {
                /* sin procesos */
              }
            }
            versiones.esetAgent = agentVersion;
            detalles.esetAgentFuente =
              agentFuente + (confirmed ? ' (confirmado por servicio/proceso)' : '');
          } catch (e) {
            /* sin agente */
          }
        })()
      );

      // t11 — Inicio rápido desactivado (HiberbootEnabled == 0).
      tasks.push(
        (async () => {
          try {
            const out = await withTimeout(runPs(PS_HIBERBOOT), CHECK_TIMEOUT_MS);
            if (parseHiberbootEnabled(out) === true) mark('t11');
          } catch (e) {
            /* sin marcar */
          }
        })()
      );

      // t9 — Impresoras configuradas (al menos una real, sin virtuales).
      tasks.push(
        (async () => {
          try {
            // getPrinterNames() ya devuelve un array: se filtra directo
            // (parsePrinters() espera texto y haría String(array)).
            const real = (await getPrinterNames()).filter((n) => !isVirtualPrinter(n));
            if (real.length) {
              detalles.impresoras = real.length;
              // 2.5.0: el nombre de la primera impresora real (la app
              // del teléfono lo lee en d.impresora/detalles.impresora
              // para el mantenimiento).
              detalles.impresora = real[0];
              mark('t9');
            }
          } catch (e) {
            /* sin marcar */
          }
        })()
      );

      // t10 — VPN configurada (cliente conocido o adaptador VPN/TAP).
      tasks.push(
        (async () => {
          try {
            const names = await getUninstallNames();
            if (hasName(names, VPN_CLIENT_RE)) {
              mark('t10');
              return;
            }
            const out = await withTimeout(runPs(PS_VPN_ADAPTERS), CHECK_TIMEOUT_MS);
            if (parseVpnAdapters(out).length) mark('t10');
          } catch (e) {
            /* sin marcar */
          }
        })()
      );

      // t21/t22/t23 — Lapi Fox / Alfaweb / Alfaprinter: desinstalación,
      // procesos o carpetas de Program Files. Alfaweb (2.3.5) acepta las
      // variantes 'Alfa Web', 'AlfaLab' y 'Alfa Lab' (ALFAWEB_RE), pero
      // NUNCA un nombre que case con /print/i: un 'Alfaprinter' no es
      // Alfaweb. Alfaweb ADEMÁS se busca como acceso directo (.lnk o
      // .url, por nombre o destino) en el Escritorio real (PowerShell +
      // registro + OneDrive con empresa + público) y en el Menú Inicio:
      // en los equipos de Gerardo se accede por icono, no está instalado.
      // Alfaprinter ADEMÁS cuenta como impresora instalada (Get-Printer,
      // /alfa/i).
      tasks.push(
        (async () => {
          try {
            const [names, procs, scan] = await Promise.all([
              getUninstallNames(),
              getProcessNames(),
              getDesktopScan(),
            ]);
            const pfEntries = programFiles.flatMap((pf) => listDir(pf));
            const found = (re) =>
              hasName(names, re) || hasName(procs, re) || hasName(pfEntries, re);
            // Alfaweb por nombre en desinstalación/procesos/carpetas,
            // con las variantes y sin los nombres de impresora.
            const foundAlfaweb = (arr) =>
              arr.some((n) => ALFAWEB_RE.test(n) && !/print/i.test(n));
            if (found(/lapi/i)) mark('t21');
            if (
              foundAlfaweb(names) ||
              foundAlfaweb(procs) ||
              foundAlfaweb(pfEntries) ||
              scan.alfaweb
            ) mark('t22');
            let printerAlfa = false;
            try {
              const printers = await getPrinterNames();
              printerAlfa = printers.some((n) => /alfa/i.test(n));
            } catch (e) {
              /* sin impresoras */
            }
            if (found(/alfaprinter/i) || scan.alfaprinter || printerAlfa) mark('t23');
          } catch (e) {
            /* sin marcar */
          }
        })()
      );

      // t12 — Invgate Insight (agente): servicio de Windows
      // (Get-Service *invgate*), proceso, clave de desinstalación que
      // coincida con /invgate/i, o carpeta en Program Files. Si se
      // encuentra, detalles.invgate guarda el nombre y la versión del
      // agente cuando se conocen (ej. 'Invgate Insight Agent 2.5.1');
      // si solo se conoce el nombre, solo el nombre.
      tasks.push(
        (async () => {
          try {
            const [names, procs] = await Promise.all([
              getUninstallNames(),
              getProcessNames(),
            ]);
            const pfEntries = programFiles.flatMap((pf) => listDir(pf));
            let services = [];
            try {
              const out = await withTimeout(runPs(PS_SERVICES_INVGATE), CHECK_TIMEOUT_MS);
              services = parseInvgateServices(out);
            } catch (e) {
              /* sin servicios */
            }
            let invgateVersion = '';
            try {
              const entries = await getUninstallVersions();
              const invgateEntry =
                entries.find((e) => /invgate/i.test(String(e.name || ''))) || null;
              invgateVersion = invgateEntry ? str(invgateEntry.version).trim() : '';
            } catch (e) {
              /* sin versión */
            }
            const uninstallEntry = names.find((n) => /invgate/i.test(n));
            const serviceEntry = services.length ? services[0] : null;
            const procEntry = procs.find((n) => /invgate/i.test(n));
            const folderEntry = pfEntries.find((n) => /invgate/i.test(n));
            const foundName =
              uninstallEntry ||
              (serviceEntry && (serviceEntry.displayName || serviceEntry.name)) ||
              procEntry ||
              folderEntry ||
              '';
            if (foundName) {
              detalles.invgate = invgateVersion
                ? (uninstallEntry || foundName) + ' ' + invgateVersion
                : foundName;
              mark('t12');
            }
          } catch (e) {
            /* sin marcar */
          }
        })()
      );

      // t24 — Accesos directos de historia clínica Y estudios de gabinete
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

      // Políticas de seguridad (2.5.0, Mantenimientos Preventivos;
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
              const windir = process.env.SystemRoot || 'C:\\Windows';
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
              const tmpDir = process.env.TEMP || process.env.TMP || 'C:\\Windows\\Temp';
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

      // Usuario 'sistemas' (2.5.0, Mantenimientos Preventivos): cuenta
      // local Get-LocalUser 'sistemas' o perfil C:\Users\sistemas
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
              if (perfil) fuentes.push('perfil C:\\Users\\sistemas');
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
    }

    await Promise.allSettled(tasks);
    // anydeskId / anydeskAlias solo van si se determinaron; si AnyDesk
    // no está instalado o no se pudo leer el ID, no van (nunca inventado).
    return {
      checks,
      detalles,
      versiones,
      ...(anydeskInfo.id ? { anydeskId: anydeskInfo.id } : {}),
      ...(anydeskInfo.alias ? { anydeskAlias: anydeskInfo.alias } : {}),
    };
  } catch (e) {
    return { checks: {}, detalles: {}, versiones: {} };
  }
}

module.exports = {
  detectMachine,
  detectChecks,
  cleanSerial,
  discoTipoFromDisk,
  ramGBFromMem,
  isUsableIpv4,
  selectPrimaryInterface,
  ipTipoFromDhcp,
  parseIpDhcp,
  parseNetIpDhcp,
  listNetworks,
  parseAnydeskId,
  parseAnydeskAlias,
  parseAnydeskLocations,
  parseAnydeskConf,
  cleanDisplayIcon,
  parseUninstallNames,
  parseUninstallVersions,
  findUninstallVersion,
  parseInvgateServices,
  parseOsVersion,
  parseOsVersionDetailed,
  windowsBuildFromOsInfo,
  fixWindowsOsName,
  resolveWindowsOsName,
  resolveWindowsOsNameDetailed,
  parseFileVersion,
  decodeProductState,
  parseAntivirusProducts,
  parseHotfixDate,
  isHotfixRecent,
  parseHiberbootEnabled,
  parseNetAccounts,
  parseInactivityTimeout,
  parseScreenSave,
  parseLocalUserSistemas,
  politicasCumple,
  parseRegistryPol,
  parseSeceditInf,
  psEscape,
  buildVerificarPasswordScript,
  parseVerificarPasswordOutput,
  verificarPasswordSistemas,
  buildCambiarPasswordScript,
  runElevatedPsFile,
  cambiarPasswordSistemas,
  PS_IS_ADMIN,
  ELEVATED_TIMEOUT_MS,
  registryPolValue,
  isVirtualPrinter,
  parsePrinters,
  parseVpnAdapters,
  parseDesktopShortcuts,
  parseOsppLicensed,
  getMachineId,
  normalizeName,
  selectAntivirusProduct,
  findAntivirusVersion,
  parseUrlFile,
  extractLnkTargets,
  scanDesktopEntries,
  parseEsetRegistryVersion,
  findEsetAgentVersion,
  expandEnvVars,
  ALLOWED_CHECK_IDS: Array.from(ALLOWED_CHECK_IDS),
  CHECK_TIMEOUT_MS,
  HOTFIX_MAX_DAYS,
};
