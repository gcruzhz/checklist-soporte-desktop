// Prueba de detectChecks() y detectMachine() con salidas SIMULADAS de
// PowerShell/registro (no hay PC Windows real en esta VM Linux: todo
// Windows se verifica aquí con salidas falsas; lo real en Linux se
// verifica en verify-detect.js).
// 2.3.2 añade: t12 Invgate, t19 Adobe Acrobat, t22 Alfaweb por .lnk,
// t24 con 'hcweb'/'gabinete', versiones {so, antivirus, chrome},
// discoTipo, ip/ipTipo y anydeskId/anydeskAlias.
// 2.3.3 añade: machineId determinista (getMachineId, serie o
// hostname+MAC, id estable del documento), Escritorio robusto
// (PowerShell + OneDrive, .lnk Y .url por nombre y destino),
// Alfaprinter como impresora, y versión de antivirus correcta
// (selección entre varios, emparejamiento normalizado + publisher,
// ESET por registro o por egui.exe/ekrn.exe, con antivirusFuente).
// 2.3.4 añade: RAM en GiB (16 GiB -> 16, no 17; disco sigue decimal),
// SO Windows por Get-ComputerInfo con respaldo en el registro y, en
// último caso, si.osInfo() con la corrección por build
// (>= 22000 -> Windows 11), igual en detectMachine().so y en
// versiones.so de detectChecks().
// 2.3.5 añade: Escritorio por registro User Shell Folders (con
// %USERPROFILE% sin expandir) y glob OneDrive*\Desktop ('OneDrive -
// Grupo Lapi'); patrones 'HC Web' (con espacio), 'AlfaLab'/'Alfa Lab'/
// 'Alfa Web' para t22 con exclusión de /print/i (Alfaprinter no marca
// t22); escaneo del Menú Inicio para t22/t23/t24; diagnóstico en
// detalles.escritorioRutas y detalles.atajosVistos.
// 2.3.6 añade: SO Windows con las fuentes RÁPIDAS primero (registro con
// UBR -> CimInstance Win32_OperatingSystem -> Get-ComputerInfo ->
// si.osInfo() con la corrección por build) y detalles.osFuente
// ('registro' | 'cim' | 'computerinfo' | 'si') igual en
// detectMachine().so y en versiones.so; redes: todas las interfaces con
// IPv4 no interna [{ nombre, ip, ipTipo }] en detectMachine(), con
// respaldo PowerShell por InterfaceAlias en Windows; ip/ipTipo del
// adaptador principal sin cambio.
// 2.3.8 añade: normalización 10 vs 11 POR BUILD en TODAS las fuentes
// del SO (antes solo la rama si.osInfo() se corregía; el registro, el
// CIM y Get-ComputerInfo devolvían el nombre tal cual). Caso real de
// Gerardo (ROBIT5, Dell Pro 14, 2026-11-15): el registro decía
// ProductName 'Windows 10 Pro' con DisplayVersion '26H2',
// CurrentBuildNumber 26300 y UBR 9711 — eso es Windows 11 — y la
// tarjeta mostraba 'Windows 10 Pro 26H2 (compilación 26300.9711)' con
// fuente 'registro'. Ahora ese registro produce 'Windows 11 Pro 26H2
// (compilación 26300.9711)'; build >= 22000 -> Windows 11 y
// build < 22000 -> Windows 10, en registro, CIM, Get-ComputerInfo y
// si.osInfo(); si una fuente viene sin build, se contrasta con el
// build de si.osInfo(). RAM instalada, no visible: en ROBIT5 (16 GB
// instalados) mem.total da ~15.4 GiB visibles y la tarjeta decía 15 GB;
// ahora se suman los módulos de si.memLayout() y, si viene vacío,
// mem.total se redondea al tamaño estándar más cercano
// (4, 8, 12, 16, 24, 32, 48, 64, 96, 128). El disco no cambia.
// Agente ESET Management Agent: se detecta por desinstalación
// (DisplayVersion), con respaldo en ERAAgent.exe y confirmación por el
// servicio EraAgentSvc o el proceso ERAAgent.exe; su versión va en
// versiones.esetAgent y NO afecta a t7.
// 2.5.0 añade: políticas de seguridad (net accounts + bloqueo por
// inactividad: directiva de grupo InactivityTimeoutSecs o protector
// de pantalla) y usuario 'sistemas' (Get-LocalUser o perfil
// C:\Users\sistemas) en detalles.politicas /
// detalles.usuarioSistemas; t9 guarda además detalles.impresora con
// el nombre de la primera impresora real.
// 2.5.7 añade: contraseña del usuario local de Windows 'sistemas'
// (verificar con ValidateCredentials, cambiar con Set-LocalUser; sin
// elevación se usa un .ps1 temporal con UAC); escape PowerShell de
// comillas simples en usuario y contraseñas.
// Uso: node scripts/test-detect-checks.js  (o: pnpm test-detect-checks)
// Sale con código 0 si todos los casos pasan e imprime un resumen legible.
'use strict';

const {
  detectMachine,
  detectChecks,
  getMachineId,
  decodeProductState,
  parseHiberbootEnabled,
  parseNetAccounts,
  parseInactivityTimeout,
  parseScreenSave,
  parseLocalUserSistemas,
  politicasCumple,
  parseRegistryPol,
  parseSeceditInf,
  parseDesktopShortcuts,
  parseOsVersion,
  parseOsVersionDetailed,
  windowsBuildFromOsInfo,
  fixWindowsOsName,
  resolveWindowsOsName,
  resolveWindowsOsNameDetailed,
  parseUninstallVersions,
  findUninstallVersion,
  parseInvgateServices,
  discoTipoFromDisk,
  ramGBFromMem,
  parseIpDhcp,
  parseNetIpDhcp,
  listNetworks,
  selectPrimaryInterface,
  ipTipoFromDhcp,
  parseAnydeskId,
  parseAnydeskAlias,
  parseAnydeskConf,
  selectAntivirusProduct,
  findAntivirusVersion,
  scanDesktopEntries,
  parseUrlFile,
  parseEsetRegistryVersion,
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
} = require('../detect');

const NOW = Date.parse('2026-11-13T12:00:00Z'); // "hoy" fijo para t6
const PF = 'C:\\Program Files';
const PF86 = 'C:\\Program Files (x86)';
const USER_DESK = 'C:\\Users\\prueba\\Desktop';
const PUB_DESK = 'C:\\Users\\Public\\Desktop';

// Entorno Windows falso: runPs responde según el script, runCmd simula
// cscript ospp.vbs, fileExists/listDir según `files` y `dirs`.
function makeOverrides(s = {}) {
  const files = new Set((s.files || []).map((f) => String(f).toLowerCase()));
  const dirs = {};
  for (const [k, v] of Object.entries(s.dirs || {})) dirs[k.toLowerCase()] = v;
  let psCalls = 0;
  const o = {
    platform: s.platform || 'win32',
    now: NOW,
    serial: s.serial !== undefined ? s.serial : 'ABC123',
    battery: s.battery || { hasBattery: false, isCharging: false, percent: 0 },
    programFiles: [PF, PF86],
    userDesktop: USER_DESK,
    publicDesktop: PUB_DESK,
    userProfile: s.userProfile || 'C:\\Users\\prueba',
    desktopDirs: s.desktopDirs,
    startMenuDirs: s.startMenuDirs,
    oneDriveDesktop: s.oneDriveDesktop || 'C:\\Users\\prueba\\OneDrive\\Desktop',
    // Overrides de si.* para detectMachine()/detectChecks() (2.3.4):
    // osInfo simula un si.osInfo() que miente (Windows 10 en un equipo
    // con Windows 11); mem/disks simulan RAM y disco con tamaños exactos.
    ...(s.osInfo !== undefined ? { osInfo: s.osInfo } : {}),
    ...(s.mem !== undefined ? { mem: s.mem } : {}),
    ...(s.memLayout !== undefined ? { memLayout: s.memLayout } : {}),
    ...(s.disks !== undefined ? { disks: s.disks } : {}),
    ...(s.ifaces !== undefined ? { ifaces: s.ifaces } : {}),
    runPs: async (script) => {
      psCalls++;
      if (script.includes('InactivityTimeoutSecs')) return s.inactivityTimeout !== undefined ? String(s.inactivityTimeout) : '';
      if (script.includes('ScreenSaveTimeOut')) return s.screenSave || '';
      if (script.includes('Get-LocalUser')) return s.localUserSistemas || '';
      if (script.includes("GetFolderPath('Desktop')")) return (s.desktopPaths || []).join('\r\n');
      if (script.includes('User Shell Folders')) return s.desktopRegistry || '';
      if (script.includes('ESET') && script.includes('ProductVersion')) return s.esetRegVersion || '';
      if (script.includes('Win32_OperatingSystem')) return s.osCim || '';
      if (script.includes('Get-ComputerInfo')) return s.osVersion || '';
      if (script.includes('CurrentBuildNumber')) return s.osRegistry || '';
      if (script.includes('InstallLocation')) return (s.anydeskLocations || []).join('\r\n');
      if (script.includes('DisplayVersion')) return (s.uninstallVersions || []).join('\r\n');
      if (script.includes('EraAgentSvc')) return (s.esetAgentServices || []).join('\r\n');
      if (script.includes('Get-Service')) return (s.services || []).join('\r\n');
      if (script.includes('ERAAgent')) return s.esetAgentFileVersion || '';
      if (script.includes('VersionInfo')) return script.includes('ESET') ? (s.esetFileVersion || '') : (s.chromeFileVersion || '');
      if (script.includes('InterfaceAlias')) return s.netIpDhcp || '';
      if (script.includes('Get-NetIPAddress')) return s.ipDhcp || '';
      if (script.includes('Uninstall')) return (s.uninstall || []).join('\r\n');
      if (script.includes('Get-HotFix')) return s.hotfix || '';
      if (script.includes('SecurityCenter2')) return (s.antivirus || []).join('\r\n');
      if (script.includes('HiberbootEnabled')) return s.hiberboot !== undefined ? String(s.hiberboot) : '';
      if (script.includes('Get-Printer')) return (s.printers || []).join('\r\n');
      if (script.includes('Get-NetAdapter')) return (s.adapters || []).join('\r\n');
      if (script.includes('Get-Process')) return (s.processes || []).join('\r\n');
      throw new Error('script no simulado: ' + script.slice(0, 60));
    },
    runCmd: async (cmd, args) => {
      if (/^net$/i.test(cmd)) return s.netAccounts || '';
      if (/^secedit$/i.test(cmd)) {
        if (s.seceditFails) throw new Error('secedit sin permisos');
        return 'ok';
      }
      if (/cscript/i.test(cmd)) return s.ospp || '';
      if (/anydesk/i.test(cmd)) {
        if (s.anydeskCliFails) throw new Error('anydesk cli roto');
        if ((args || []).includes('--get-id')) return s.anydeskIdOutput !== undefined ? s.anydeskIdOutput : '';
        if ((args || []).includes('--get-alias')) return s.anydeskAliasOutput !== undefined ? s.anydeskAliasOutput : '';
        return '';
      }
      throw new Error('comando no simulado: ' + cmd);
    },
    fileExists: (p) => files.has(String(p).toLowerCase()) || Object.prototype.hasOwnProperty.call(dirs, String(p).toLowerCase()),
    listDir: (dir) => dirs[String(dir).toLowerCase()] || [],
    readFile: (p) => {
      const v = (s.confFiles || {})[String(p).toLowerCase()];
      if (v === undefined) throw new Error('archivo no existe: ' + p);
      return v;
    },
    readFileBin: (p) => {
      const key = String(p).toLowerCase();
      if (key.indexOf('secedit.inf') >= 0) {
        if (s.seceditInf === undefined) throw new Error('sin inf de secedit');
        return s.seceditInf;
      }
      if (key.indexOf('registry.pol') >= 0) {
        if (key.indexOf('machine') >= 0) {
          if (s.polMachine === undefined) throw new Error('sin Registry.pol de equipo');
          return s.polMachine;
        }
        if (s.polUser === undefined) throw new Error('sin Registry.pol de usuario');
        return s.polUser;
      }
      throw new Error('archivo binario no simulado: ' + p);
    },
    programData: s.programData || 'C:\\ProgramData',
    appData: s.appData || 'C:\\Users\\prueba\\AppData\\Roaming',
    _psCalls: () => psCalls,
  };
  return o;
}

let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log('  ok  ' + name);
  } else {
    fail++;
    failures.push(name);
    console.log('  FALLO  ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''));
  }
}
function eq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

(async () => {
  console.log('== detectChecks: salidas simuladas (Windows) ==\n');

  // --- t18/t19/t20/t25: por clave de desinstalación ---
  console.log('-- programas por nombre en desinstalación --');
  let r = await detectChecks(makeOverrides({
    uninstall: ['Google Chrome', 'Adobe Acrobat Reader DC', 'WinRAR 7.00 (64-bit)', 'AnyDesk'],
  }));
  check('t18 Chrome por clave', r.checks.t18 === true, r.checks);
  check('t19 Adobe Reader por clave', r.checks.t19 === true, r.checks);
  check('t20 WinRAR por clave', r.checks.t20 === true, r.checks);
  check('t25 AnyDesk por clave', r.checks.t25 === true, r.checks);

  // --- por exe en Program Files (sin clave) ---
  console.log('-- programas por exe en Program Files --');
  r = await detectChecks(makeOverrides({
    files: [
      PF + '\\Google\\Chrome\\Application\\chrome.exe',
      PF + '\\Adobe\\Acrobat Reader DC\\Reader\\AcroRd32.exe',
      PF + '\\WinRAR\\WinRAR.exe',
      PF + '\\AnyDesk\\AnyDesk.exe',
    ],
  }));
  check('t18 Chrome por chrome.exe', r.checks.t18 === true, r.checks);
  check('t19 Reader por AcroRd32.exe', r.checks.t19 === true, r.checks);
  check('t20 WinRAR por WinRAR.exe', r.checks.t20 === true, r.checks);
  check('t25 AnyDesk por AnyDesk.exe', r.checks.t25 === true, r.checks);

  // --- t8 Office ---
  console.log('-- t8 Office --');
  r = await detectChecks(makeOverrides({
    uninstall: ['Microsoft Office 365 - es-es'],
    files: [PF + '\\Microsoft Office\\root\\Office16\\OSPP.VBS'],
    ospp: 'LICENSE STATUS: ---LICENSED---\r\nLAST 5 CHARACTERS OF INSTALLED PRODUCT KEY: ABCDE',
  }));
  check('t8 Office 365 con activación confirmada', r.checks.t8 === 'Office 365', r.checks);
  check('t8 Office activado: officeDetectado guardado', r.detalles.officeDetectado === 'Office 365', r.detalles);

  r = await detectChecks(makeOverrides({
    uninstall: ['Microsoft Office Professional Plus 2021'],
    files: [PF + '\\Microsoft Office\\root\\Office16\\OSPP.VBS'],
    ospp: 'LICENSE STATUS: ---UNLICENSED---',
  }));
  check('t8 Office SIN activar: no se marca', r.checks.t8 === undefined, r.checks);
  check('t8 Office sin activar: officeDetectado guardado', r.detalles.officeDetectado === 'Office 365', r.detalles);

  r = await detectChecks(makeOverrides({
    uninstall: ['Microsoft 365 Apps para empresa'],
    files: [PF + '\\Microsoft Office\\root\\Office16\\OSPP.VBS'],
    ospp: '', // ospp.vbs no devuelve nada: activación no confirmada
  }));
  check('t8 Office sin salida ospp: no se marca', r.checks.t8 === undefined, r.checks);

  r = await detectChecks(makeOverrides({ uninstall: ['LibreOffice 7.6'] }));
  check('t8 LibreOffice por clave', r.checks.t8 === 'LibreOffice', r.checks);
  r = await detectChecks(makeOverrides({
    files: [PF + '\\LibreOffice\\program\\soffice.exe'],
  }));
  check('t8 LibreOffice por soffice.exe', r.checks.t8 === 'LibreOffice', r.checks);
  r = await detectChecks(makeOverrides({}));
  check('t8 sin Office ni LibreOffice: no se marca', r.checks.t8 === undefined, r.checks);

  // --- t6 hotfix ---
  console.log('-- t6 SO actualizado --');
  r = await detectChecks(makeOverrides({ hotfix: '2026-11-05' }));
  check('t6 hotfix hace 8 días: se marca', r.checks.t6 === true, r.checks);
  check('t6 guarda ultimoHotfix', r.detalles.ultimoHotfix === '2026-11-05', r.detalles);
  r = await detectChecks(makeOverrides({ hotfix: '2026-07-01' }));
  check('t6 hotfix hace >90 días: no se marca', r.checks.t6 === undefined, r.checks);
  check('t6 viejo: ultimoHotfix igual se guarda', r.detalles.ultimoHotfix === '2026-07-01', r.detalles);
  r = await detectChecks(makeOverrides({ hotfix: '' }));
  check('t6 sin hotfix: no se marca', r.checks.t6 === undefined, r.checks);

  // --- t7 antivirus: decodificación de productState ---
  console.log('-- t7 antivirus / productState --');
  const avCases = [
    [262144, false, 'desactivado y al día'],
    [266240, true, 'activado y al día'],
    [397312, true, 'MSE/Defender activado y al día'],
    [393216, false, 'desactivado y al día'],
    [397568, true, 'Defender activado y al día'],
    [397584, false, 'activado pero definiciones viejas (061010)'],
    [331776, true, 'Sophos 051000 activado y al día'],
  ];
  for (const [state, want, label] of avCases) {
    const d = decodeProductState(state);
    check(`productState ${state} (${label}) -> ${want}`, (d.enabled && d.upToDate) === want, d);
  }
  r = await detectChecks(makeOverrides({ antivirus: ['Windows Defender|397312'] }));
  check('t7 Defender activado y al día', r.checks.t7 === true, r.checks);
  check('t7 guarda nombre del antivirus', r.detalles.antivirus === 'Windows Defender', r.detalles);
  r = await detectChecks(makeOverrides({ antivirus: ['AVG Internet Security|262144'] }));
  check('t7 antivirus desactivado: no se marca', r.checks.t7 === undefined, r.checks);
  r = await detectChecks(makeOverrides({ antivirus: [] }));
  check('t7 sin antivirus: no se marca', r.checks.t7 === undefined, r.checks);

  // --- t11 inicio rápido ---
  console.log('-- t11 inicio rápido --');
  check('HiberbootEnabled 0 -> desactivado', parseHiberbootEnabled('0') === true);
  check('HiberbootEnabled 1 -> activado', parseHiberbootEnabled('1') === false);
  check('HiberbootEnabled ausente -> null', parseHiberbootEnabled('') === null);
  r = await detectChecks(makeOverrides({ hiberboot: '0' }));
  check('t11 HiberbootEnabled 0: se marca', r.checks.t11 === true, r.checks);
  r = await detectChecks(makeOverrides({ hiberboot: '1' }));
  check('t11 HiberbootEnabled 1: no se marca', r.checks.t11 === undefined, r.checks);

  // --- t9 impresoras ---
  console.log('-- t9 impresoras --');
  r = await detectChecks(makeOverrides({
    printers: ['Microsoft Print to PDF', 'Microsoft XPS Document Writer', 'OneNote for Windows 10', 'Fax'],
  }));
  check('t9 solo impresoras virtuales: no se marca', r.checks.t9 === undefined, r.checks);
  r = await detectChecks(makeOverrides({
    printers: ['Microsoft Print to PDF', 'HP LaserJet Pro M404', 'Fax'],
  }));
  check('t9 una impresora real entre virtuales: se marca', r.checks.t9 === true, r.checks);
  check('t9 guarda nº de impresoras reales', r.detalles.impresoras === 1, r.detalles);

  // --- t10 VPN ---
  console.log('-- t10 VPN --');
  r = await detectChecks(makeOverrides({ uninstall: ['FortiClient VPN'] }));
  check('t10 FortiClient por clave: se marca', r.checks.t10 === true, r.checks);
  r = await detectChecks(makeOverrides({ uninstall: ['Cisco AnyConnect Secure Mobility Client'] }));
  check('t10 AnyConnect por clave: se marca', r.checks.t10 === true, r.checks);
  r = await detectChecks(makeOverrides({ adapters: ['TAP-Windows Adapter V9', 'Ethernet0'] }));
  check('t10 adaptador TAP: se marca', r.checks.t10 === true, r.checks);
  r = await detectChecks(makeOverrides({ adapters: ['WireGuard Tunnel', 'Wi-Fi'] }));
  check('t10 adaptador WireGuard: se marca', r.checks.t10 === true, r.checks);
  r = await detectChecks(makeOverrides({ adapters: ['WAN Miniport (IKEv2)', 'WAN Miniport (SSTP)', 'Ethernet0'] }));
  check('t10 solo WAN Miniport: NO se marca', r.checks.t10 === undefined, r.checks);
  r = await detectChecks(makeOverrides({ adapters: ['Ethernet0', 'Wi-Fi'] }));
  check('t10 sin VPN: no se marca', r.checks.t10 === undefined, r.checks);

  // --- t21/t22/t23 Lapi / Alfaweb / Alfaprinter ---
  console.log('-- t21/t22/t23 Lapi/Alfaweb/Alfaprinter --');
  r = await detectChecks(makeOverrides({ uninstall: ['Sistema Lapi Fox 2.0'] }));
  check('t21 Lapi Fox por clave: se marca', r.checks.t21 === true, r.checks);
  r = await detectChecks(makeOverrides({ processes: ['alfaweb', 'explorer'] }));
  check('t22 Alfaweb por proceso: se marca', r.checks.t22 === true, r.checks);
  r = await detectChecks(makeOverrides({ dirs: { [PF]: ['Alfaprinter', 'Google'] } }));
  check('t23 Alfaprinter por carpeta en Program Files: se marca', r.checks.t23 === true, r.checks);
  r = await detectChecks(makeOverrides({}));
  check('t21/t22/t23 sin nada: no se marcan', r.checks.t21 === undefined && r.checks.t22 === undefined && r.checks.t23 === undefined, r.checks);

  // --- t24 accesos directos ---
  console.log('-- t24 accesos directos --');
  check('parseDesktopShortcuts: ambos', eq(parseDesktopShortcuts(['Historia clínica.lnk', 'Estudios de gabinete.lnk']), { historia: true, gabinete: true }));
  check('parseDesktopShortcuts: solo historia', eq(parseDesktopShortcuts(['Historia clínica.lnk']), { historia: true, gabinete: false }));
  check('parseDesktopShortcuts: solo gabinete', eq(parseDesktopShortcuts(['Estudios de gabinete.lnk']), { historia: false, gabinete: true }));
  check('parseDesktopShortcuts: ninguno', eq(parseDesktopShortcuts(['Chrome.lnk']), { historia: false, gabinete: false }));
  r = await detectChecks(makeOverrides({
    dirs: { [USER_DESK]: ['Historia clínica.lnk', 'Estudios de gabinete.lnk'] },
  }));
  check('t24 ambos accesos en Escritorio: se marca', r.checks.t24 === true, r.checks);
  r = await detectChecks(makeOverrides({
    dirs: { [USER_DESK]: ['Historia clínica.lnk'], [PUB_DESK]: ['Estudios de gabinete.lnk'] },
  }));
  check('t24 uno en cada Escritorio (usuario + público): se marca', r.checks.t24 === true, r.checks);
  r = await detectChecks(makeOverrides({
    dirs: { [USER_DESK]: ['Historia clínica.lnk'] },
  }));
  check('t24 solo historia: no se marca', r.checks.t24 === undefined, r.checks);
  r = await detectChecks(makeOverrides({
    dirs: { [USER_DESK]: ['Estudios de gabinete.lnk'] },
  }));
  check('t24 solo gabinete: no se marca', r.checks.t24 === undefined, r.checks);

  // --- t12 Invgate (2.3.2: nuevo detectable) ---
  console.log('-- t12 Invgate --');
  check('parseInvgateServices: Name|DisplayName|Status', eq(parseInvgateServices(['InvgateAgent|Invgate Insight Agent|Running']), [{ name: 'InvgateAgent', displayName: 'Invgate Insight Agent', status: 'Running' }]));
  r = await detectChecks(makeOverrides({ services: ['InvgateAgent|Invgate Insight Agent|Running'] }));
  check('t12 Invgate por servicio: se marca', r.checks.t12 === true, r.checks);
  check('t12 por servicio: detalles.invgate guarda el nombre', r.detalles.invgate === 'Invgate Insight Agent', r.detalles);
  r = await detectChecks(makeOverrides({ processes: ['InvgateAgent', 'explorer'] }));
  check('t12 Invgate por proceso: se marca', r.checks.t12 === true, r.checks);
  r = await detectChecks(makeOverrides({
    uninstall: ['Invgate Insight Agent'],
    uninstallVersions: ['Invgate Insight Agent|2.5.1'],
  }));
  check('t12 Invgate por clave: se marca', r.checks.t12 === true, r.checks);
  check('t12 por clave: detalles.invgate con versión', r.detalles.invgate === 'Invgate Insight Agent 2.5.1', r.detalles);
  r = await detectChecks(makeOverrides({ dirs: { [PF]: ['Invgate', 'Google'] } }));
  check('t12 Invgate por carpeta en Program Files: se marca', r.checks.t12 === true, r.checks);
  r = await detectChecks(makeOverrides({}));
  check('t12 sin Invgate: no se marca', r.checks.t12 === undefined, r.checks);

  // --- t19 Adobe Acrobat (2.3.2: además de Reader) ---
  console.log('-- t19 Adobe Acrobat --');
  r = await detectChecks(makeOverrides({ uninstall: ['Adobe Acrobat Pro DC'] }));
  check('t19 Acrobat Pro por clave: se marca', r.checks.t19 === true, r.checks);
  check('t19 Acrobat: detalles.adobe es Acrobat', r.detalles.adobe === 'Acrobat', r.detalles);
  r = await detectChecks(makeOverrides({
    files: [PF + '\\Adobe\\Acrobat DC\\Acrobat\\Acrobat.exe'],
  }));
  check('t19 Acrobat por Acrobat.exe: se marca', r.checks.t19 === true, r.checks);
  check('t19 Acrobat por exe: detalles.adobe es Acrobat', r.detalles.adobe === 'Acrobat', r.detalles);
  r = await detectChecks(makeOverrides({ uninstall: ['Adobe Acrobat Reader DC'] }));
  check('t19 Reader por clave: se marca', r.checks.t19 === true, r.checks);
  check('t19 Reader: detalles.adobe es Reader', r.detalles.adobe === 'Reader', r.detalles);
  r = await detectChecks(makeOverrides({ uninstall: ['Adobe Acrobat Reader DC', 'Adobe Acrobat Standard'] }));
  check('t19 Acrobat y Reader: gana Acrobat', r.checks.t19 === true && r.detalles.adobe === 'Acrobat', r.detalles);
  r = await detectChecks(makeOverrides({ uninstall: ['Adobe Acrobat Reader DC'] }));
  check('t19 "Adobe Acrobat Reader" NO se confunde con Acrobat', r.detalles.adobe === 'Reader', r.detalles);

  // --- t22 Alfaweb por acceso directo .lnk (2.3.2) ---
  console.log('-- t22 Alfaweb por acceso directo --');
  r = await detectChecks(makeOverrides({
    dirs: { [USER_DESK]: ['Alfaweb.lnk', 'Chrome.lnk'] },
  }));
  check('t22 Alfaweb por .lnk en Escritorio: se marca', r.checks.t22 === true, r.checks);
  r = await detectChecks(makeOverrides({
    dirs: { [PUB_DESK]: ['ALFAWEB - Acceso.lnk'] },
  }));
  check('t22 Alfaweb por .lnk en Escritorio público: se marca', r.checks.t22 === true, r.checks);

  // --- t24 accesos hcweb / gabinete (2.3.2) ---
  console.log('-- t24 accesos hcweb/gabinete --');
  check('parseDesktopShortcuts: hcweb+gabinete', eq(parseDesktopShortcuts(['hcweb.lnk', 'gabinete.lnk']), { historia: true, gabinete: true }));
  check('parseDesktopShortcuts: historia clínica antigua sigue valiendo', eq(parseDesktopShortcuts(['Historia clínica.lnk', 'gabinete.lnk']), { historia: true, gabinete: true }));
  check('parseDesktopShortcuts: hcweb sin .lnk no cuenta', eq(parseDesktopShortcuts(['hcweb', 'gabinete.lnk']), { historia: false, gabinete: true }));
  r = await detectChecks(makeOverrides({
    dirs: { [USER_DESK]: ['hcweb.lnk', 'gabinete.lnk'] },
  }));
  check('t24 hcweb+gabinete: se marca', r.checks.t24 === true, r.checks);
  r = await detectChecks(makeOverrides({
    dirs: { [USER_DESK]: ['hcweb.lnk'], [PUB_DESK]: ['gabinete.lnk'] },
  }));
  check('t24 hcweb en usuario + gabinete en público: se marca', r.checks.t24 === true, r.checks);
  r = await detectChecks(makeOverrides({
    dirs: { [USER_DESK]: ['hcweb.lnk'] },
  }));
  check('t24 solo hcweb: no se marca', r.checks.t24 === undefined, r.checks);
  r = await detectChecks(makeOverrides({
    dirs: { [USER_DESK]: ['gabinete.lnk'] },
  }));
  check('t24 solo gabinete: no se marca', r.checks.t24 === undefined, r.checks);

  // --- versiones {so, antivirus, chrome} (2.3.2) ---
  console.log('-- versiones --');
  check('parseOsVersion: ejemplo completo', parseOsVersion('Windows 11 Pro|26H2|26200') === 'Windows 11 Pro 26H2 (compilación 26200)');
  check('parseOsVersion: sin DisplayVersion', parseOsVersion('Windows 10 Pro||19045') === 'Windows 10 Pro (compilación 19045)');
  check('parseOsVersion: vacío', parseOsVersion('') === '');
  check('parseUninstallVersions: nombre|versión', eq(parseUninstallVersions('ESET NOD32 Antivirus|18.0.12\r\nGoogle Chrome|141.0.7390.65'), [{ name: 'ESET NOD32 Antivirus', version: '18.0.12', publisher: '' }, { name: 'Google Chrome', version: '141.0.7390.65', publisher: '' }]));
  check('findUninstallVersion: exacta', findUninstallVersion('ESET NOD32 Antivirus', [{ name: 'ESET NOD32 Antivirus', version: '18.0.12' }]) === '18.0.12');
  check('findUninstallVersion: sin entrada', findUninstallVersion('ESET NOD32 Antivirus', [{ name: 'Google Chrome', version: '141.0.7390.65' }]) === '');
  r = await detectChecks(makeOverrides({
    osVersion: 'Windows 11 Pro|26H2|26200',
    antivirus: ['ESET NOD32 Antivirus|266240'],
    uninstall: ['ESET NOD32 Antivirus', 'Google Chrome'],
    uninstallVersions: ['ESET NOD32 Antivirus|18.0.12', 'Google Chrome|141.0.7390.65'],
  }));
  check('versiones.so de Get-ComputerInfo', r.versiones.so === 'Windows 11 Pro 26H2 (compilación 26200)', r.versiones);
  check('versiones.antivirus con versión', r.versiones.antivirus === 'ESET NOD32 Antivirus 18.0.12', r.versiones);
  check('versiones.chrome de desinstalación', r.versiones.chrome === '141.0.7390.65', r.versiones);
  r = await detectChecks(makeOverrides({ antivirus: ['Windows Defender|397312'] }));
  check('versiones.antivirus sin versión: solo nombre', r.versiones.antivirus === 'Windows Defender', r.versiones);
  r = await detectChecks(makeOverrides({
    uninstall: ['Google Chrome'],
    uninstallVersions: ['Google Chrome|'],
    files: [PF + '\\Google\\Chrome\\Application\\chrome.exe'],
    chromeFileVersion: '141.0.7390.65',
  }));
  check('versiones.chrome por archivo cuando la clave no trae versión', r.versiones.chrome === '141.0.7390.65', r.versiones);
  // 2.3.4: con el respaldo por build, versiones.so solo queda vacío
  // cuando TAMPOCO si.osInfo() da nada (osInfo: {} lo simula); con
  // makeOverrides({}) el respaldo usaría el si.osInfo() real de esta VM.
  r = await detectChecks(makeOverrides({ osInfo: {} }));
  check('versiones vacío sin datos (ni PowerShell ni si.osInfo)', eq(r.versiones, {}), r.versiones);

  // --- discoTipo (2.3.2) ---
  console.log('-- discoTipo --');
  check('discoTipo NVMe por interfaceType', discoTipoFromDisk({ type: 'HD', interfaceType: 'NVMe' }) === 'NVMe');
  check('discoTipo NVMe por tipo', discoTipoFromDisk({ type: 'NVMe SSD', interfaceType: 'PCIe' }) === 'NVMe');
  check('discoTipo SSD', discoTipoFromDisk({ type: 'SSD', interfaceType: 'SATA' }) === 'SSD');
  check('discoTipo HDD', discoTipoFromDisk({ type: 'HD', interfaceType: 'SATA' }) === 'HDD');
  check('discoTipo HDD con tipo vacío', discoTipoFromDisk({ type: '', interfaceType: 'VIRTIO' }) === 'HDD');
  check('discoTipo sin disco', discoTipoFromDisk(null) === '');

  // --- ip / ipTipo (2.3.2) ---
  console.log('-- ip / ipTipo (detectMachine) --');
  check('parseIpDhcp: Enabled/Disabled', eq(parseIpDhcp('192.168.1.20|Enabled\r\n10.0.0.5|Disabled'), [{ ip: '192.168.1.20', dhcp: true }, { ip: '10.0.0.5', dhcp: false }]));
  const IFACES = [
    { iface: 'Ethernet0', ip4: '10.0.0.5', dhcp: false, internal: false, default: false, mac: 'AA:BB:CC:DD:EE:01' },
    { iface: 'Wi-Fi', ip4: '192.168.1.20', dhcp: true, internal: false, default: true, mac: 'AA:BB:CC:DD:EE:02' },
    { iface: 'lo', ip4: '127.0.0.1', dhcp: false, internal: true, default: false, mac: '00:00:00:00:00:00' },
  ];
  check('selectPrimaryInterface elige la default aunque no sea la primera', selectPrimaryInterface(IFACES).iface === 'Wi-Fi');
  check('selectPrimaryInterface sin default: primera no interna', selectPrimaryInterface(IFACES.map((f) => ({ ...f, default: false }))).iface === 'Ethernet0');
  check('selectPrimaryInterface sin IPv4 usable: null', selectPrimaryInterface([{ iface: 'lo', ip4: '127.0.0.1', internal: true }]) === null);
  check('ipTipoFromDhcp true/false/otro', ipTipoFromDhcp(true) === 'Dinámica' && ipTipoFromDhcp(false) === 'Estática' && ipTipoFromDhcp(undefined) === '');
  let m = await detectMachine({ platform: 'linux', ifaces: IFACES });
  check('detectMachine: IP dinámica de la default', m.ip === '192.168.1.20' && m.ipTipo === 'Dinámica', { ip: m.ip, ipTipo: m.ipTipo });
  m = await detectMachine({ platform: 'linux', ifaces: [{ iface: 'Ethernet0', ip4: '10.0.0.5', dhcp: false, internal: false, default: true, mac: 'AA:BB:CC:DD:EE:01' }] });
  check('detectMachine: IP estática con dhcp false', m.ip === '10.0.0.5' && m.ipTipo === 'Estática', { ip: m.ip, ipTipo: m.ipTipo });
  m = await detectMachine({ platform: 'linux', ifaces: [{ iface: 'lo', ip4: '127.0.0.1', internal: true, dhcp: false }] });
  check('detectMachine: sin IPv4 omite ip e ipTipo', m.ip === undefined && m.ipTipo === undefined, m);
  m = await detectMachine({
    platform: 'win32',
    ifaces: [{ iface: 'Wi-Fi', ip4: '192.168.1.20', internal: false, default: true, mac: 'AA:BB:CC:DD:EE:02' }],
    runPs: async () => '192.168.1.20|Enabled\r\n10.0.0.5|Disabled',
  });
  check('detectMachine Windows: respaldo PowerShell Enabled -> Dinámica', m.ip === '192.168.1.20' && m.ipTipo === 'Dinámica', { ip: m.ip, ipTipo: m.ipTipo });
  m = await detectMachine({
    platform: 'win32',
    ifaces: [{ iface: 'Ethernet0', ip4: '10.0.0.5', internal: false, default: true, mac: 'AA:BB:CC:DD:EE:01' }],
    runPs: async () => '192.168.1.20|Enabled\r\n10.0.0.5|Disabled',
  });
  check('detectMachine Windows: respaldo PowerShell Disabled -> Estática', m.ip === '10.0.0.5' && m.ipTipo === 'Estática', { ip: m.ip, ipTipo: m.ipTipo });
  m = await detectMachine({
    platform: 'win32',
    ifaces: [{ iface: 'Wi-Fi', ip4: '192.168.1.20', internal: false, default: true, mac: 'AA:BB:CC:DD:EE:02' }],
    runPs: async () => '10.0.0.5|Disabled',
  });
  check('detectMachine Windows: sin coincidencia en PowerShell -> solo ip', m.ip === '192.168.1.20' && m.ipTipo === undefined, { ip: m.ip, ipTipo: m.ipTipo });

  // --- anydeskId / anydeskAlias (2.3.2) ---
  console.log('-- anydeskId / anydeskAlias --');
  check('parseAnydeskId: 9 dígitos', parseAnydeskId('123456789\n') === '123456789');
  check('parseAnydeskId: 10 dígitos', parseAnydeskId('1928424441') === '1928424441');
  check('parseAnydeskId: con texto alrededor', parseAnydeskId('ID: 123456789') === '123456789');
  check('parseAnydeskId: sin dígitos -> vacío', parseAnydeskId('no hay id') === '');
  check('parseAnydeskAlias: nombre@ad', parseAnydeskAlias('equipo-prueba@ad\n') === 'equipo-prueba@ad');
  check('parseAnydeskAlias: vacío -> vacío', parseAnydeskAlias('') === '');
  check('parseAnydeskConf: id y alias', eq(parseAnydeskConf('ad.anynet.id=987654321\nad.anynet.alias=equipo-prueba@ad\n'), { id: '987654321', alias: 'equipo-prueba@ad' }));
  check('parseAnydeskConf: sin campos', eq(parseAnydeskConf('ad.anynet.pwd_hash=abc\n'), { id: '', alias: '' }));
  r = await detectChecks(makeOverrides({
    uninstall: ['AnyDesk'],
    files: [PF + '\\AnyDesk\\AnyDesk.exe'],
    anydeskIdOutput: '123456789\n',
    anydeskAliasOutput: 'equipo-prueba@ad\n',
  }));
  check('anydeskId por --get-id', r.anydeskId === '123456789', r);
  check('anydeskAlias por --get-alias', r.anydeskAlias === 'equipo-prueba@ad', r);
  check('t25 marcado con AnyDesk', r.checks.t25 === true, r.checks);
  r = await detectChecks(makeOverrides({
    uninstall: ['AnyDesk'],
    files: [PF + '\\AnyDesk\\AnyDesk.exe'],
    anydeskCliFails: true,
    confFiles: { 'c:\\programdata\\anydesk\\service.conf': 'ad.anynet.id=987654321\nad.anynet.alias=equipo-conf@ad\n' },
  }));
  check('anydeskId por service.conf cuando el CLI falla', r.anydeskId === '987654321', r);
  check('anydeskAlias por service.conf cuando el CLI falla', r.anydeskAlias === 'equipo-conf@ad', r);
  r = await detectChecks(makeOverrides({
    uninstall: ['AnyDesk'],
    anydeskLocations: ['C:\\Program Files\\AnyDesk\\|C:\\Program Files\\AnyDesk\\AnyDesk.exe,0'],
    files: [PF + '\\AnyDesk\\AnyDesk.exe'],
    anydeskIdOutput: '555666777',
  }));
  check('anydeskId con exe localizado por InstallLocation/DisplayIcon', r.anydeskId === '555666777', r);
  r = await detectChecks(makeOverrides({
    uninstall: ['AnyDesk'],
    files: [PF + '\\AnyDesk\\AnyDesk.exe'],
    anydeskIdOutput: '',
    anydeskAliasOutput: '',
  }));
  check('CLI vacío y sin .conf: anydeskId ausente (no se inventa)', r.anydeskId === undefined, r);
  r = await detectChecks(makeOverrides({}));
  check('sin AnyDesk: sin anydeskId ni t25', r.anydeskId === undefined && r.checks.t25 === undefined, r);

  // --- t3/t4 multiplataforma ---
  console.log('-- t3/t4 --');
  r = await detectChecks(makeOverrides({ battery: { hasBattery: true, isCharging: true, percent: 20 }, serial: 'ABC123' }));
  check('t3 laptop cargando (20%): se marca', r.checks.t3 === true, r.checks);
  r = await detectChecks(makeOverrides({ battery: { hasBattery: true, isCharging: false, percent: 80 } }));
  check('t3 laptop 80% sin cargar: se marca', r.checks.t3 === true, r.checks);
  r = await detectChecks(makeOverrides({ battery: { hasBattery: true, isCharging: false, percent: 30 } }));
  check('t3 laptop 30% sin cargar: no se marca', r.checks.t3 === undefined, r.checks);
  r = await detectChecks(makeOverrides({ battery: { hasBattery: false, isCharging: false, percent: 0 } }));
  check('t3 escritorio sin batería: no se marca', r.checks.t3 === undefined, r.checks);
  r = await detectChecks(makeOverrides({ serial: 'ABC123' }));
  check('t4 serie real: se marca', r.checks.t4 === true, r.checks);
  r = await detectChecks(makeOverrides({ serial: '-' }));
  check('t4 serie de relleno "-": no se marca', r.checks.t4 === undefined, r.checks);
  r = await detectChecks(makeOverrides({ serial: '' }));
  check('t4 sin serie: no se marca', r.checks.t4 === undefined, r.checks);

  // --- NUNCA se auto-marcan ---
  console.log('-- nunca auto-marcar --');
  r = await detectChecks(makeOverrides({
    uninstall: ['Google Chrome', 'Adobe Acrobat Reader DC', 'WinRAR 7.00', 'AnyDesk', 'LibreOffice 7.6', 'FortiClient VPN', 'Sistema Lapi Fox'],
    hotfix: '2026-11-12',
    antivirus: ['Windows Defender|397312'],
    hiberboot: '0',
    printers: ['HP LaserJet Pro M404'],
    adapters: ['TAP-Windows Adapter V9'],
    processes: ['alfaweb'],
    services: ['InvgateAgent|Invgate Insight Agent|Running'],
    dirs: {
      [PF]: ['Alfaprinter'],
      [USER_DESK]: ['Historia clínica.lnk', 'Estudios de gabinete.lnk'],
    },
    battery: { hasBattery: true, isCharging: true, percent: 90 },
    serial: 'ABC123',
  }));
  const never = ['t1', 't2', 't5', 't13', 't14', 't15', 't16', 't17', 't26'];
  const leaked = never.filter((id) => r.checks[id] !== undefined);
  check('ningún id prohibido en checks (todo positivo)', leaked.length === 0, { leaked, checks: r.checks });
  const expected = ['t3', 't4', 't6', 't7', 't8', 't9', 't10', 't11', 't12', 't18', 't19', 't20', 't21', 't22', 't23', 't24', 't25'];
  const missing = expected.filter((id) => r.checks[id] === undefined);
  check('escenario todo positivo marca los 17 ids permitidos', missing.length === 0, { missing, checks: r.checks });
  check('t8 en escenario todo positivo es LibreOffice', r.checks.t8 === 'LibreOffice', r.checks);
  check('todo positivo: detalles.invgate', r.detalles.invgate === 'Invgate Insight Agent', r.detalles);
  check('todo positivo: detalles.adobe es Reader', r.detalles.adobe === 'Reader', r.detalles);
  check('todo positivo: versiones.antivirus solo nombre (sin clave con versión)', r.versiones.antivirus === 'Windows Defender', r.versiones);
  check('todo positivo: sin exe ni .conf no hay anydeskId', r.anydeskId === undefined, r);

  // --- 2.3.3 machineId determinista ---
  console.log('-- 2.3.3 machineId --');
  check('getMachineId: serie real', (await getMachineId({ serial: 'ABC123', hostname: 'PC-1', ifaces: [] })) === 'ABC123');
  check('getMachineId: serie de relleno -> hostname+MAC', (await getMachineId({ serial: 'To be filled by O.E.M.', hostname: 'PC-GERARDO', ifaces: [{ mac: 'AA:BB:CC:DD:EE:02', internal: false }] })) === 'PC-GERARDO-AABBCCDDEE02');
  check('getMachineId: sin serie, MAC con guiones se limpia', (await getMachineId({ serial: '', hostname: 'PC-GERARDO', mac: 'AA-BB-CC-DD-EE-02' })) === 'PC-GERARDO-AABBCCDDEE02');
  check('getMachineId: sin serie ni MAC -> solo hostname', (await getMachineId({ serial: '-', hostname: 'PC-SOLO', ifaces: [] })) === 'PC-SOLO');
  m = await detectMachine({ platform: 'linux', ifaces: IFACES });
  const m2 = await detectMachine({ platform: 'linux', ifaces: IFACES });
  check('detectMachine: incluye machineId', typeof m.machineId === 'string' && m.machineId.length > 0, m);
  check('detectMachine: id es el machineId', m.id === m.machineId, { id: m.id, machineId: m.machineId });
  check('detectMachine: dos detecciones dan el mismo id (no desaparece del panel)', m.id === m2.id, { id1: m.id, id2: m2.id });

  // --- 2.3.3 Escritorio robusto: OneDrive, .url, destino ---
  console.log('-- 2.3.3 Escritorio robusto (OneDrive, .url) --');
  const ONEDRIVE_DESK = 'C:\\Users\\prueba\\OneDrive\\Desktop';
  r = await detectChecks(makeOverrides({
    desktopPaths: [ONEDRIVE_DESK],
    dirs: { [ONEDRIVE_DESK]: ['hcweb.url', 'gabinete.url', 'Alfaweb.url', 'Alfaprinter.url'] },
    confFiles: {
      'c:\\users\\prueba\\onedrive\\desktop\\hcweb.url': '[InternetShortcut]\r\nURL=https://hcweb.lapi.local\r\n',
      'c:\\users\\prueba\\onedrive\\desktop\\gabinete.url': '[InternetShortcut]\r\nURL=https://gabinete.lapi.local\r\n',
      'c:\\users\\prueba\\onedrive\\desktop\\alfaweb.url': '[InternetShortcut]\r\nURL=https://alfaweb.lapi.local\r\n',
      'c:\\users\\prueba\\onedrive\\desktop\\alfaprinter.url': '[InternetShortcut]\r\nURL=https://alfaprinter.lapi.local\r\n',
    },
  }));
  check('caso Gerardo: t24 hcweb+gabinete .url en OneDrive', r.checks.t24 === true, r.checks);
  check('caso Gerardo: t22 Alfaweb .url en OneDrive', r.checks.t22 === true, r.checks);
  check('caso Gerardo: t23 Alfaprinter .url en OneDrive', r.checks.t23 === true, r.checks);
  r = await detectChecks(makeOverrides({
    desktopPaths: [ONEDRIVE_DESK],
    dirs: { [ONEDRIVE_DESK]: ['acceso.url', 'historia.url'] },
    confFiles: {
      'c:\\users\\prueba\\onedrive\\desktop\\acceso.url': '[InternetShortcut]\r\nURL=https://alfaweb.lapi.local/inicio\r\n',
      'c:\\users\\prueba\\onedrive\\desktop\\historia.url': '[InternetShortcut]\r\nURL=https://hcweb.lapi.local\r\n',
    },
  }));
  check('t22 por DESTINO del .url aunque el nombre no diga Alfaweb', r.checks.t22 === true, r.checks);
  check('t24 no se marca con solo historia por destino (falta gabinete)', r.checks.t24 === undefined, r.checks);
  r = await detectChecks(makeOverrides({
    desktopPaths: [ONEDRIVE_DESK],
    dirs: { [ONEDRIVE_DESK]: ['acceso.lnk', 'gabinete.lnk'] },
    confFiles: { 'c:\\users\\prueba\\onedrive\\desktop\\acceso.lnk': 'x\x00https://hcweb.lapi.local\x00y' },
  }));
  check('t24 por destino dentro del .lnk (historia) + gabinete.lnk', r.checks.t24 === true, r.checks);
  r = await detectChecks(makeOverrides({
    desktopPaths: [],
    dirs: { [ONEDRIVE_DESK]: ['hcweb.lnk', 'gabinete.lnk'] },
  }));
  check('t24 con Escritorio redirigido: respaldo OneDrive sin PowerShell', r.checks.t24 === true, r.checks);
  check('parseUrlFile: línea URL=', parseUrlFile('[InternetShortcut]\r\nURL=https://hcweb.lapi.local\r\n') === 'https://hcweb.lapi.local');
  check('parseUrlFile: sin URL= -> vacío', parseUrlFile('[InternetShortcut]\r\nIconFile=x.ico') === '');
  check('scanDesktopEntries: .url por destino', eq(scanDesktopEntries([{ name: 'acceso.url', target: 'https://alfaweb.lapi.local' }]), { historia: false, gabinete: false, alfaweb: true, alfaprinter: false }));
  check('scanDesktopEntries: .txt no cuenta aunque se llame hcweb', eq(scanDesktopEntries([{ name: 'hcweb.txt', target: '' }]), { historia: false, gabinete: false, alfaweb: false, alfaprinter: false }));

  // --- 2.3.3 Alfaprinter como impresora ---
  console.log('-- 2.3.3 Alfaprinter como impresora --');
  r = await detectChecks(makeOverrides({ printers: ['Alfaprinter HP LaserJet', 'Microsoft Print to PDF'] }));
  check('t23 Alfaprinter por impresora instalada', r.checks.t23 === true, r.checks);
  check('t9 sigue marcando con impresora real', r.checks.t9 === true, r.checks);
  r = await detectChecks(makeOverrides({ printers: ['Microsoft Print to PDF', 'Fax'] }));
  check('t23 sin Alfaprinter: no se marca', r.checks.t23 === undefined, r.checks);

  // --- 2.3.5 Escritorio corporativo: OneDrive - <Empresa>, 'HC Web',
  // AlfaLab, destino por URL y Menú Inicio ---
  console.log('-- 2.3.5 Escritorio corporativo (OneDrive - Empresa, HC Web, AlfaLab, Menú Inicio) --');
  const LAPI_DESK = 'C:\\Users\\prueba\\OneDrive - Grupo Lapi\\Desktop';
  const START_MENU = 'C:\\Users\\prueba\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs';
  // (a) Registro User Shell Folders con %USERPROFILE% sin expandir:
  // el caso de Gerardo (OneDrive - Grupo Lapi, no 'OneDrive' a secas).
  r = await detectChecks(makeOverrides({
    desktopPaths: [],
    desktopRegistry: '%USERPROFILE%\\OneDrive - Grupo Lapi\\Desktop',
    dirs: {
      'C:\\Users\\prueba': ['OneDrive - Grupo Lapi', 'Desktop', 'Documents'],
      [LAPI_DESK]: ['hcweb.url', 'gabinete.url', 'Alfaweb.url'],
    },
    confFiles: {
      'c:\\users\\prueba\\onedrive - grupo lapi\\desktop\\hcweb.url': '[InternetShortcut]\r\nURL=https://hcweb.lapi.local\r\n',
      'c:\\users\\prueba\\onedrive - grupo lapi\\desktop\\gabinete.url': '[InternetShortcut]\r\nURL=https://gabinete.lapi.local\r\n',
      'c:\\users\\prueba\\onedrive - grupo lapi\\desktop\\alfaweb.url': '[InternetShortcut]\r\nURL=https://alfaweb.lapi.local\r\n',
    },
  }));
  check('2.3.5 caso Gerardo: t24 hcweb+gabinete .url en OneDrive - Grupo Lapi (registro)', r.checks.t24 === true, r.checks);
  check('2.3.5 caso Gerardo: t22 Alfaweb .url en OneDrive - Grupo Lapi (registro)', r.checks.t22 === true, r.checks);
  check('2.3.5 escritorioRutas trae la ruta real con empresa', eq(r.detalles.escritorioRutas, [LAPI_DESK]), r.detalles);
  check('2.3.5 atajosVistos cuenta los 3 .url', r.detalles.atajosVistos === 3, r.detalles);
  // (c) Glob OneDrive*\Desktop cuando el registro no devuelve nada.
  r = await detectChecks(makeOverrides({
    desktopPaths: [],
    desktopRegistry: '',
    dirs: {
      'C:\\Users\\prueba': ['OneDrive - Grupo Lapi', 'Desktop'],
      [LAPI_DESK]: ['HC Web.url', 'gabinete.lnk'],
    },
    confFiles: {
      'c:\\users\\prueba\\onedrive - grupo lapi\\desktop\\hc web.url': '[InternetShortcut]\r\nURL=https://hcweb.lapi.local\r\n',
    },
  }));
  check('2.3.5 glob OneDrive* sin registro: t24 con HC Web (con espacio) + gabinete', r.checks.t24 === true, r.checks);
  check('2.3.5 glob OneDrive*: escritorioRutas trae la ruta con empresa', eq(r.detalles.escritorioRutas, [LAPI_DESK]), r.detalles);
  check('2.3.5 glob OneDrive*: atajosVistos cuenta los 2 atajos', r.detalles.atajosVistos === 2, r.detalles);
  // 'HC Web' con espacio, solo por nombre, en el Escritorio normal.
  r = await detectChecks(makeOverrides({
    dirs: { [USER_DESK]: ['HC Web.url', 'gabinete.lnk'] },
  }));
  check('2.3.5 t24 HC Web con espacio (solo por nombre) + gabinete', r.checks.t24 === true, r.checks);
  check('2.3.5 Escritorio normal: escritorioRutas es [USER_DESK]', eq(r.detalles.escritorioRutas, [USER_DESK]), r.detalles);
  check('2.3.5 Escritorio normal: atajosVistos cuenta los 2 atajos', r.detalles.atajosVistos === 2, r.detalles);
  // Variantes de Alfaweb / AlfaLab.
  r = await detectChecks(makeOverrides({
    dirs: { [USER_DESK]: ['AlfaLab.lnk'] },
  }));
  check('2.3.5 t22 AlfaLab.lnk (sin espacio, sin "web")', r.checks.t22 === true, r.checks);
  r = await detectChecks(makeOverrides({
    dirs: { [USER_DESK]: ['Alfa Lab - Acceso.lnk'] },
  }));
  check('2.3.5 t22 Alfa Lab con espacio', r.checks.t22 === true, r.checks);
  r = await detectChecks(makeOverrides({
    dirs: { [USER_DESK]: ['Alfa Web.lnk'] },
  }));
  check('2.3.5 t22 Alfa Web con espacio', r.checks.t22 === true, r.checks);
  // Exclusión /print/i: Alfaprinter no marca t22 (pero sí t23).
  r = await detectChecks(makeOverrides({
    dirs: { [USER_DESK]: ['Alfaprinter.lnk'] },
  }));
  check('2.3.5 Alfaprinter.lnk NO marca t22', r.checks.t22 === undefined, r.checks);
  check('2.3.5 Alfaprinter.lnk sí marca t23', r.checks.t23 === true, r.checks);
  r = await detectChecks(makeOverrides({
    dirs: { [USER_DESK]: ['Alfaweb Printer.lnk'] },
  }));
  check('2.3.5 Alfaweb Printer.lnk NO marca t22 (nombre con print)', r.checks.t22 === undefined, r.checks);
  r = await detectChecks(makeOverrides({ uninstall: ['Alfaprinter'] }));
  check('2.3.5 Alfaprinter por clave NO marca t22', r.checks.t22 === undefined, r.checks);
  check('2.3.5 Alfaprinter por clave sí marca t23', r.checks.t23 === true, r.checks);
  // .url cuyo NOMBRE no casa pero cuya URL sí contiene hcweb.
  r = await detectChecks(makeOverrides({
    dirs: { [USER_DESK]: ['Acceso.url', 'gabinete.lnk'] },
    confFiles: {
      'c:\\users\\prueba\\desktop\\acceso.url': '[InternetShortcut]\r\nURL=https://hcweb.lapi.local/panel\r\n',
    },
  }));
  check('2.3.5 t24 por DESTINO hcweb del .url (nombre Acceso no casa) + gabinete', r.checks.t24 === true, r.checks);
  // Menú Inicio: los atajos no están en el Escritorio sino anclados.
  r = await detectChecks(makeOverrides({
    dirs: { [START_MENU]: ['HC Web.url', 'gabinete.lnk'] },
    confFiles: {
      'c:\\users\\prueba\\appdata\\roaming\\microsoft\\windows\\start menu\\programs\\hc web.url': '[InternetShortcut]\r\nURL=https://hcweb.lapi.local\r\n',
    },
  }));
  check('2.3.5 t24 con atajos solo en Menú Inicio (Escritorio vacío)', r.checks.t24 === true, r.checks);
  check('2.3.5 Menú Inicio: atajosVistos cuenta los 2', r.detalles.atajosVistos === 2, r.detalles);
  check('2.3.5 Menú Inicio: escritorioRutas ausente (ninguna ruta de Escritorio existía)', r.detalles.escritorioRutas === undefined, r.detalles);
  r = await detectChecks(makeOverrides({
    dirs: {
      [START_MENU]: ['Lapi'],
      [START_MENU + '\\Lapi']: ['AlfaLab.lnk'],
    },
  }));
  check('2.3.5 t22 AlfaLab.lnk en subcarpeta del Menú Inicio', r.checks.t22 === true, r.checks);
  // Unitarios de los parsers 2.3.5.
  check('2.3.5 parseDesktopShortcuts: HC Web con espacio', eq(parseDesktopShortcuts(['HC Web.lnk', 'gabinete.lnk']), { historia: true, gabinete: true }));
  check('2.3.5 scanDesktopEntries: AlfaLab por nombre', eq(scanDesktopEntries([{ name: 'AlfaLab.lnk', target: '' }]), { historia: false, gabinete: false, alfaweb: true, alfaprinter: false }));
  check('2.3.5 scanDesktopEntries: Alfaprinter no marca alfaweb', eq(scanDesktopEntries([{ name: 'Alfaprinter.lnk', target: '' }]), { historia: false, gabinete: false, alfaweb: false, alfaprinter: true }));
  check('2.3.5 scanDesktopEntries: destino con print no marca alfaweb', eq(scanDesktopEntries([{ name: 'Alfaweb.lnk', target: 'https://impresora/print' }]), { historia: false, gabinete: false, alfaweb: false, alfaprinter: false }));
  check('2.3.5 expandEnvVars: %USERPROFILE% sin expandir', expandEnvVars('%USERPROFILE%\\OneDrive - Grupo Lapi\\Desktop', { USERPROFILE: 'C:\\Users\\prueba' }) === 'C:\\Users\\prueba\\OneDrive - Grupo Lapi\\Desktop');
  check('2.3.5 expandEnvVars: variable desconocida se deja tal cual', expandEnvVars('%DESCONOCIDA%\\Desktop', { USERPROFILE: 'C:\\Users\\prueba' }) === '%DESCONOCIDA%\\Desktop');

  // --- 2.3.3 antivirus: selección y versión ESET ---
  console.log('-- 2.3.3 antivirus (selección y versión ESET) --');
  check('selectAntivirusProduct: ESET activo antes que Defender', selectAntivirusProduct([{ name: 'Windows Defender', productState: '397312', enabled: true, upToDate: true }, { name: 'ESET Security', productState: '266240', enabled: true, upToDate: true }]).name === 'ESET Security');
  check('selectAntivirusProduct: solo Defender -> Defender', selectAntivirusProduct([{ name: 'Windows Defender', productState: '397312', enabled: true, upToDate: true }]).name === 'Windows Defender');
  check('selectAntivirusProduct: ESET desactivado + Defender activo -> Defender', selectAntivirusProduct([{ name: 'ESET Security', productState: '262144', enabled: false, upToDate: true }, { name: 'Windows Defender', productState: '397312', enabled: true, upToDate: true }]).name === 'Windows Defender');
  check('findAntivirusVersion: ESET Security <-> ESET NOD32 Antivirus', findAntivirusVersion('ESET Security', [{ name: 'ESET NOD32 Antivirus', version: '18.0.12', publisher: 'ESET, spol. s r.o.' }]).version === '18.0.12');
  check('findAntivirusVersion: sin emparejamiento -> vacío', findAntivirusVersion('ESET Security', [{ name: 'Google Chrome', version: '141.0.7390.65', publisher: 'Google LLC' }]).version === '');
  check('parseEsetRegistryVersion: versión con 4 partes', parseEsetRegistryVersion('18.0.12.0\r\n') === '18.0.12.0');
  check('parseEsetRegistryVersion: basura -> vacío', parseEsetRegistryVersion('no hay versión') === '');
  r = await detectChecks(makeOverrides({
    antivirus: ['Windows Defender|397312', 'ESET Security|266240'],
    uninstall: ['ESET NOD32 Antivirus', 'Windows Defender'],
    uninstallVersions: ['ESET NOD32 Antivirus|17.0.0|ESET, spol. s r.o.', 'Windows Defender||Microsoft Corporation'],
    esetRegVersion: '18.0.12.0',
  }));
  check('ESET+Defender activos: detalles.antivirus es ESET, no Defender', r.detalles.antivirus === 'ESET Security', r.detalles);
  check('ESET+Defender: versiones.antivirus con versión del registro', r.versiones.antivirus === 'ESET Security 18.0.12.0', r.versiones);
  check('ESET+Defender: antivirusFuente es el registro ESET', (r.detalles.antivirusFuente || '').includes('registro ESET'), r.detalles);
  check('ESET+Defender: t7 se marca', r.checks.t7 === true, r.checks);
  r = await detectChecks(makeOverrides({
    antivirus: ['ESET Security|266240'],
    uninstall: ['ESET NOD32 Antivirus'],
    uninstallVersions: ['ESET NOD32 Antivirus|18.0.12|ESET, spol. s r.o.'],
    esetFileVersion: '18.0.12.0',
    files: [PF + '\\ESET\\ESET Security\\egui.exe'],
  }));
  check('ESET sin registro: versión por egui.exe', r.versiones.antivirus === 'ESET Security 18.0.12.0', r.versiones);
  check('ESET sin registro: antivirusFuente es el archivo', (r.detalles.antivirusFuente || '').includes('egui.exe'), r.detalles);
  r = await detectChecks(makeOverrides({
    antivirus: ['ESET Security|266240'],
    uninstall: ['ESET NOD32 Antivirus'],
    uninstallVersions: ['ESET NOD32 Antivirus|18.0.12|ESET, spol. s r.o.'],
  }));
  check('ESET sin registro ni archivo: versión por desinstalación', r.versiones.antivirus === 'ESET Security 18.0.12', r.versiones);
  check('ESET sin registro ni archivo: antivirusFuente es desinstalación', r.detalles.antivirusFuente === 'desinstalación', r.detalles);
  r = await detectChecks(makeOverrides({
    antivirus: ['ESET Security|266240'],
    uninstall: ['Otro Programa'],
    uninstallVersions: ['Otro Programa|1.0|Otro'],
  }));
  check('ESET sin versión determinable: solo el nombre, sin inventar', r.versiones.antivirus === 'ESET Security', r.versiones);
  check('ESET sin versión: sin antivirusFuente', r.detalles.antivirusFuente === undefined, r.detalles);
  check('ESET sin versión: t7 se marca igual (está activo y al día)', r.checks.t7 === true, r.checks);

  // --- 2.3.4 RAM en GiB y SO Windows (Get-ComputerInfo / registro / build) ---
  console.log('-- 2.3.4 RAM en GiB --');
  // 16 GiB reales = 17179869184 bytes: con /1e9 daba 17 (el bug de Gerardo).
  let o = makeOverrides({ platform: 'linux', mem: { total: 17179869184 }, disks: [{ size: 512000000000, type: 'SSD', interfaceType: 'SATA' }] });
  o.ifaces = [];
  m = await detectMachine(o);
  check('RAM 16 GiB -> 16 (no 17)', m.ramGB === 16, { ramGB: m.ramGB });
  check('disco sigue decimal: 512 GB -> 512', m.discoGB === 512, { discoGB: m.discoGB });
  check('Linux: SO sigue siendo el de si.osInfo (Ubuntu)', m.so.startsWith('Ubuntu'), { so: m.so });
  o = makeOverrides({ platform: 'linux', mem: { total: 8589934592 }, disks: [{ size: 256000000000, type: 'SSD', interfaceType: 'SATA' }] });
  o.ifaces = [];
  m = await detectMachine(o);
  check('RAM 8 GiB -> 8', m.ramGB === 8, { ramGB: m.ramGB });
  check('disco 256 GB -> 256', m.discoGB === 256, { discoGB: m.discoGB });
  o = makeOverrides({ platform: 'linux', mem: { total: 34359738368 }, disks: [{ size: 1000000000000, type: 'NVMe SSD', interfaceType: 'NVMe' }] });
  o.ifaces = [];
  m = await detectMachine(o);
  check('RAM 32 GiB -> 32', m.ramGB === 32, { ramGB: m.ramGB });
  check('disco 1 TB decimal -> 1000', m.discoGB === 1000, { discoGB: m.discoGB });
  check('disco NVMe sigue detectándose', m.discoTipo === 'NVMe', { discoTipo: m.discoTipo });

  console.log('-- 2.3.4 SO Windows --');
  check('windowsBuildFromOsInfo: campo build', windowsBuildFromOsInfo({ build: '26200' }) === 26200);
  check('windowsBuildFromOsInfo: desde release 10.0.19045', windowsBuildFromOsInfo({ release: '10.0.19045' }) === 19045);
  check('windowsBuildFromOsInfo: sin datos -> 0', windowsBuildFromOsInfo({}) === 0);
  check('fixWindowsOsName: build 26200 corrige Windows 10 -> 11', fixWindowsOsName('Microsoft Windows 10 Pro', 26200) === 'Microsoft Windows 11 Pro');
  check('fixWindowsOsName: build 19045 no toca Windows 10', fixWindowsOsName('Microsoft Windows 10 Pro', 19045) === 'Microsoft Windows 10 Pro');
  check('fixWindowsOsName: sin build no toca nada', fixWindowsOsName('Microsoft Windows 10 Pro', 0) === 'Microsoft Windows 10 Pro');
  check('fixWindowsOsName: Windows 11 queda igual', fixWindowsOsName('Windows 11 Pro', 26200) === 'Windows 11 Pro');
  // si.osInfo() mintiendo: dice Windows 10 en un equipo con Windows 11.
  const WIN11_LYING = { distro: 'Microsoft Windows 10 Pro', release: '10.0.26200', build: '26200', hostname: 'PC-GERARDO' };
  const WIN10_REAL = { distro: 'Microsoft Windows 10 Pro', release: '10.0.19045', build: '19045', hostname: 'PC-GERARDO' };
  // 1) Get-ComputerInfo solo cuando registro y CIM vienen vacíos
  // (2.3.6: ya no gana al registro; el registro es la primera fuente).
  o = makeOverrides({ osVersion: 'Windows 11 Pro|26H2|26200', osRegistry: '', osCim: '', osInfo: WIN11_LYING });
  o.ifaces = [];
  m = await detectMachine(o);
  check('detectMachine.so Windows 11 por Get-ComputerInfo (registro y CIM vacíos)', m.so === 'Windows 11 Pro 26H2 (compilación 26200)', { so: m.so });
  r = await detectChecks(makeOverrides({ osVersion: 'Windows 11 Pro|26H2|26200', osRegistry: '', osCim: '', osInfo: WIN11_LYING }));
  check('versiones.so Windows 11 por Get-ComputerInfo', r.versiones.so === 'Windows 11 Pro 26H2 (compilación 26200)', r.versiones);
  // 1b) El registro gana a Get-ComputerInfo aunque discrepen (2.3.6).
  o = makeOverrides({ osVersion: 'Windows 11 Pro|26H2|26200', osRegistry: 'Windows 10 Pro|22H2|19045', osInfo: WIN11_LYING });
  o.ifaces = [];
  m = await detectMachine(o);
  check('detectMachine.so: el registro gana a Get-ComputerInfo', m.so === 'Windows 10 Pro 22H2 (compilación 19045)', { so: m.so });
  r = await detectChecks(makeOverrides({ osVersion: 'Windows 11 Pro|26H2|26200', osRegistry: 'Windows 10 Pro|22H2|19045', osInfo: WIN11_LYING }));
  check('versiones.so: el registro gana a Get-ComputerInfo', r.versiones.so === 'Windows 10 Pro 22H2 (compilación 19045)', r.versiones);
  // 2) Registro directo cuando Get-ComputerInfo no devuelve nada.
  o = makeOverrides({ osVersion: '', osRegistry: 'Windows 11 Pro|26H2|26100', osInfo: WIN11_LYING });
  o.ifaces = [];
  m = await detectMachine(o);
  check('detectMachine.so Windows 11 por registro (build 26100)', m.so === 'Windows 11 Pro 26H2 (compilación 26100)', { so: m.so });
  r = await detectChecks(makeOverrides({ osVersion: '', osRegistry: 'Windows 11 Pro|26H2|26200', osInfo: WIN11_LYING }));
  check('versiones.so Windows 11 por registro (build 26200)', r.versiones.so === 'Windows 11 Pro 26H2 (compilación 26200)', r.versiones);
  // 3) Windows 10 real sigue diciendo Windows 10.
  o = makeOverrides({ osVersion: 'Windows 10 Pro|22H2|19045', osInfo: WIN10_REAL });
  o.ifaces = [];
  m = await detectMachine(o);
  check('detectMachine.so Windows 10 por Get-ComputerInfo', m.so === 'Windows 10 Pro 22H2 (compilación 19045)', { so: m.so });
  r = await detectChecks(makeOverrides({ osVersion: '', osRegistry: 'Windows 10 Pro|22H2|19045', osInfo: WIN10_REAL }));
  check('versiones.so Windows 10 por registro', r.versiones.so === 'Windows 10 Pro 22H2 (compilación 19045)', r.versiones);
  // 4) Respaldo por build cuando Get-ComputerInfo Y registro fallan.
  o = makeOverrides({ osVersion: '', osRegistry: '', osInfo: WIN11_LYING });
  o.ifaces = [];
  m = await detectMachine(o);
  check('detectMachine.so respaldo por build: Windows 10 -> 11', m.so === 'Microsoft Windows 11 Pro 10.0.26200', { so: m.so });
  r = await detectChecks(makeOverrides({ osVersion: '', osRegistry: '', osInfo: WIN11_LYING }));
  check('versiones.so respaldo por build: Windows 10 -> 11', r.versiones.so === 'Microsoft Windows 11 Pro 10.0.26200', r.versiones);
  o = makeOverrides({ osVersion: '', osRegistry: '', osInfo: WIN10_REAL });
  o.ifaces = [];
  m = await detectMachine(o);
  check('detectMachine.so respaldo por build: Windows 10 con build 19045 se queda en 10', m.so === 'Microsoft Windows 10 Pro 10.0.19045', { so: m.so });
  check('resolveWindowsOsName: PowerShell roto -> respaldo por build', (await resolveWindowsOsName(async () => { throw new Error('powershell roto'); }, WIN11_LYING)) === 'Microsoft Windows 11 Pro 10.0.26200');

  // --- 2.3.6 SO por registro/CIM/Get-ComputerInfo/si + redes ---
  console.log('-- 2.3.6 SO Windows (registro > CIM > Get-ComputerInfo > si) --');
  check('parseOsVersion: con UBR', parseOsVersion('Windows 11 Pro|26H2|26200|6899') === 'Windows 11 Pro 26H2 (compilación 26200.6899)');
  check('parseOsVersion: UBR 0 no se añade', parseOsVersion('Windows 11 Pro|26H2|26200|0') === 'Windows 11 Pro 26H2 (compilación 26200)');
  check('parseOsVersion: sin UBR sigue igual', parseOsVersion('Windows 11 Pro|26H2|26200') === 'Windows 11 Pro 26H2 (compilación 26200)');
  // resolveWindowsOsNameDetailed con un runPs que despacha por contenido.
  const psOs = (reg, cim, ci) => async (script) => {
    if (script.includes('Win32_OperatingSystem')) return cim;
    if (script.includes('Get-ComputerInfo')) return ci;
    if (script.includes('CurrentBuildNumber')) return reg;
    throw new Error('script no simulado');
  };
  let osd = await resolveWindowsOsNameDetailed(psOs('Windows 11 Pro|26H2|26200|6899', 'Microsoft Windows 11 Pro||26200', 'Windows 10 Pro|22H2|19045'), WIN11_LYING);
  check('resolveWindowsOsNameDetailed: registro gana (con UBR)', eq(osd, { nombre: 'Windows 11 Pro 26H2 (compilación 26200.6899)', fuente: 'registro' }), osd);
  osd = await resolveWindowsOsNameDetailed(psOs('', 'Microsoft Windows 11 Pro||26200', 'Windows 10 Pro|22H2|19045'), WIN11_LYING);
  check('resolveWindowsOsNameDetailed: registro vacío -> CIM', eq(osd, { nombre: 'Microsoft Windows 11 Pro (compilación 26200)', fuente: 'cim' }), osd);
  osd = await resolveWindowsOsNameDetailed(psOs('', '', 'Windows 11 Pro|26H2|26200'), WIN11_LYING);
  check('resolveWindowsOsNameDetailed: registro y CIM vacíos -> Get-ComputerInfo', eq(osd, { nombre: 'Windows 11 Pro 26H2 (compilación 26200)', fuente: 'computerinfo' }), osd);
  osd = await resolveWindowsOsNameDetailed(psOs('', '', ''), WIN11_LYING);
  check('resolveWindowsOsNameDetailed: todo vacío -> si con corrección a 11', eq(osd, { nombre: 'Microsoft Windows 11 Pro 10.0.26200', fuente: 'si' }), osd);
  osd = await resolveWindowsOsNameDetailed(psOs('', '', ''), WIN10_REAL);
  check('resolveWindowsOsNameDetailed: build 19045 se queda en 10', eq(osd, { nombre: 'Microsoft Windows 10 Pro 10.0.19045', fuente: 'si' }), osd);
  osd = await resolveWindowsOsNameDetailed(async () => { throw new Error('powershell roto'); }, WIN11_LYING);
  check('resolveWindowsOsNameDetailed: PowerShell roto -> si', eq(osd, { nombre: 'Microsoft Windows 11 Pro 10.0.26200', fuente: 'si' }), osd);
  check('resolveWindowsOsName (envoltorio) sigue devolviendo solo el nombre', (await resolveWindowsOsName(psOs('Windows 11 Pro|26H2|26200|6899', '', ''), WIN11_LYING)) === 'Windows 11 Pro 26H2 (compilación 26200.6899)');
  // Integración: detectMachine().so + detalles.osFuente y versiones.so.
  o = makeOverrides({ osVersion: 'Windows 10 Pro|22H2|19045', osRegistry: 'Windows 11 Pro|26H2|26200|6899', osCim: 'Microsoft Windows 11 Pro||26200', osInfo: WIN11_LYING, ifaces: [] });
  m = await detectMachine(o);
  check('2.3.6 detectMachine.so por registro con UBR (gana a CIM y a Get-ComputerInfo)', m.so === 'Windows 11 Pro 26H2 (compilación 26200.6899)', { so: m.so });
  check('2.3.6 detectMachine detalles.osFuente es registro', m.detalles && m.detalles.osFuente === 'registro', m.detalles);
  r = await detectChecks(makeOverrides({ osVersion: 'Windows 10 Pro|22H2|19045', osRegistry: 'Windows 11 Pro|26H2|26200|6899', osCim: 'Microsoft Windows 11 Pro||26200', osInfo: WIN11_LYING }));
  check('2.3.6 versiones.so por registro con UBR', r.versiones.so === 'Windows 11 Pro 26H2 (compilación 26200.6899)', r.versiones);
  check('2.3.6 detectChecks detalles.osFuente es registro', r.detalles.osFuente === 'registro', r.detalles);
  o = makeOverrides({ osVersion: 'Windows 10 Pro|22H2|19045', osRegistry: '', osCim: 'Microsoft Windows 11 Pro||26200', osInfo: WIN11_LYING, ifaces: [] });
  m = await detectMachine(o);
  check('2.3.6 detectMachine.so por CIM (registro vacío)', m.so === 'Microsoft Windows 11 Pro (compilación 26200)', { so: m.so });
  check('2.3.6 detectMachine detalles.osFuente es cim', m.detalles && m.detalles.osFuente === 'cim', m.detalles);
  r = await detectChecks(makeOverrides({ osVersion: 'Windows 10 Pro|22H2|19045', osRegistry: '', osCim: 'Microsoft Windows 11 Pro||26200', osInfo: WIN11_LYING }));
  check('2.3.6 versiones.so por CIM', r.versiones.so === 'Microsoft Windows 11 Pro (compilación 26200)', r.versiones);
  check('2.3.6 detectChecks detalles.osFuente es cim', r.detalles.osFuente === 'cim', r.detalles);
  o = makeOverrides({ osVersion: 'Windows 11 Pro|26H2|26200', osRegistry: '', osCim: '', osInfo: WIN11_LYING, ifaces: [] });
  m = await detectMachine(o);
  check('2.3.6 detectMachine.so por Get-ComputerInfo (registro y CIM vacíos)', m.so === 'Windows 11 Pro 26H2 (compilación 26200)', { so: m.so });
  check('2.3.6 detectMachine detalles.osFuente es computerinfo', m.detalles && m.detalles.osFuente === 'computerinfo', m.detalles);
  r = await detectChecks(makeOverrides({ osVersion: 'Windows 11 Pro|26H2|26200', osRegistry: '', osCim: '', osInfo: WIN11_LYING }));
  check('2.3.6 detectChecks detalles.osFuente es computerinfo', r.detalles.osFuente === 'computerinfo', r.detalles);
  // si.osInfo() con build 26100 diciendo Windows 10 -> se corrige a 11.
  const WIN11_26100 = { distro: 'Microsoft Windows 10 Pro', release: '10.0.26100', build: '26100', hostname: 'PC-GERARDO' };
  o = makeOverrides({ osVersion: '', osRegistry: '', osCim: '', osInfo: WIN11_26100, ifaces: [] });
  m = await detectMachine(o);
  check('2.3.6 si.osInfo build 26100: Windows 10 -> 11', m.so === 'Microsoft Windows 11 Pro 10.0.26100', { so: m.so });
  check('2.3.6 si.osInfo build 26100: osFuente es si', m.detalles && m.detalles.osFuente === 'si', m.detalles);
  r = await detectChecks(makeOverrides({ osVersion: '', osRegistry: '', osCim: '', osInfo: WIN11_26100 }));
  check('2.3.6 versiones.so build 26100: Windows 10 -> 11', r.versiones.so === 'Microsoft Windows 11 Pro 10.0.26100', r.versiones);
  check('2.3.6 detectChecks osFuente es si (build 26100)', r.detalles.osFuente === 'si', r.detalles);
  o = makeOverrides({ osVersion: '', osRegistry: '', osCim: '', osInfo: WIN10_REAL, ifaces: [] });
  m = await detectMachine(o);
  check('2.3.6 si.osInfo build 19045: se queda en Windows 10', m.so === 'Microsoft Windows 10 Pro 10.0.19045', { so: m.so });
  check('2.3.6 si.osInfo build 19045: osFuente es si', m.detalles && m.detalles.osFuente === 'si', m.detalles);

  // --- 2.3.8 SO Windows: normalización 10 vs 11 por build en TODAS las fuentes ---
  console.log('-- 2.3.8 SO Windows: normalización por build --');
  // Caso real de Gerardo (ROBIT5, Dell Pro 14, 2026-11-15): el registro
  // decía ProductName 'Windows 10 Pro' con DisplayVersion '26H2',
  // CurrentBuildNumber 26300 y UBR 9711 — eso es Windows 11 (Windows 10
  // nunca pasó de la 19045 ni tiene 26H2). La tarjeta mostraba
  // 'Windows 10 Pro 26H2 (compilación 26300.9711)' con fuente 'registro'.
  check('parseOsVersion: registro caso Gerardo -> Windows 11 Pro 26H2 (compilación 26300.9711)', parseOsVersion('Windows 10 Pro|26H2|26300|9711') === 'Windows 11 Pro 26H2 (compilación 26300.9711)');
  check('parseOsVersionDetailed: caso Gerardo con build', eq(parseOsVersionDetailed('Windows 10 Pro|26H2|26300|9711'), { nombre: 'Windows 11 Pro 26H2 (compilación 26300.9711)', build: 26300 }));
  check('parseOsVersion: Windows 11 con build 19045 baja a 10', parseOsVersion('Windows 11 Pro|22H2|19045') === 'Windows 10 Pro 22H2 (compilación 19045)');
  check('parseOsVersion: Windows 10 real (19045) se queda en 10', parseOsVersion('Windows 10 Pro|22H2|19045') === 'Windows 10 Pro 22H2 (compilación 19045)');
  check('parseOsVersion: CIM miente Windows 10 con build 26100 -> 11', parseOsVersion('Microsoft Windows 10 Pro||26100') === 'Microsoft Windows 11 Pro (compilación 26100)');
  check('parseOsVersion: sin build no se normaliza', parseOsVersion('Windows 10 Pro|26H2|') === 'Windows 10 Pro 26H2');
  check('fixWindowsOsName: Windows 11 con build 19045 baja a 10', fixWindowsOsName('Windows 11 Pro', 19045) === 'Windows 10 Pro');
  check('fixWindowsOsName: Windows 11 con build 0 queda igual', fixWindowsOsName('Windows 11 Pro', 0) === 'Windows 11 Pro');
  // resolveWindowsOsNameDetailed: cada fuente mintiendo con build >= 22000.
  osd = await resolveWindowsOsNameDetailed(psOs('Windows 10 Pro|26H2|26300|9711', 'Microsoft Windows 10 Pro||26300', 'Windows 10 Pro|26H2|26300'), WIN11_LYING);
  check('2.3.8 resolve: registro caso Gerardo -> Windows 11, fuente registro', eq(osd, { nombre: 'Windows 11 Pro 26H2 (compilación 26300.9711)', fuente: 'registro' }), osd);
  osd = await resolveWindowsOsNameDetailed(psOs('', 'Microsoft Windows 10 Pro||26100', 'Windows 10 Pro|26H2|26100'), WIN11_LYING);
  check('2.3.8 resolve: CIM miente Windows 10 build 26100 -> 11, fuente cim', eq(osd, { nombre: 'Microsoft Windows 11 Pro (compilación 26100)', fuente: 'cim' }), osd);
  osd = await resolveWindowsOsNameDetailed(psOs('', '', 'Windows 10 Pro|26H2|26100'), WIN11_LYING);
  check('2.3.8 resolve: Get-ComputerInfo miente Windows 10 build 26100 -> 11, fuente computerinfo', eq(osd, { nombre: 'Windows 11 Pro 26H2 (compilación 26100)', fuente: 'computerinfo' }), osd);
  // si.osInfo con nombre 'Windows 10' y build 26100 -> 'Windows 11'.
  const WIN10_NAME_26100 = { distro: 'Windows 10', release: '10.0.26100', build: '26100', hostname: 'PC-GERARDO' };
  osd = await resolveWindowsOsNameDetailed(psOs('', '', ''), WIN10_NAME_26100);
  check('2.3.8 resolve: si.osInfo Windows 10 build 26100 -> Windows 11', osd.nombre === 'Windows 11 10.0.26100' && osd.fuente === 'si', osd);
  // Windows 10 real (build 19045) sigue diciendo Windows 10 en cada fuente.
  osd = await resolveWindowsOsNameDetailed(psOs('Windows 10 Pro|22H2|19045', '', ''), WIN10_REAL);
  check('2.3.8 resolve: registro Windows 10 real build 19045 se queda en 10', eq(osd, { nombre: 'Windows 10 Pro 22H2 (compilación 19045)', fuente: 'registro' }), osd);
  osd = await resolveWindowsOsNameDetailed(psOs('', '', ''), WIN10_REAL);
  check('2.3.8 resolve: si.osInfo Windows 10 real build 19045 se queda en 10', eq(osd, { nombre: 'Microsoft Windows 10 Pro 10.0.19045', fuente: 'si' }), osd);
  // Fuente sin build: se contrasta con el build de si.osInfo().
  osd = await resolveWindowsOsNameDetailed(psOs('Windows 10 Pro|26H2|', '', ''), WIN11_LYING);
  check('2.3.8 resolve: registro sin build + si.osInfo build 26200 -> 11', eq(osd, { nombre: 'Windows 11 Pro 26H2', fuente: 'registro' }), osd);
  // Integración: detectMachine().so + detalles.osFuente, caso Gerardo.
  o = makeOverrides({ osVersion: 'Windows 10 Pro|26H2|26300', osRegistry: 'Windows 10 Pro|26H2|26300|9711', osCim: 'Microsoft Windows 10 Pro||26300', osInfo: WIN11_LYING, ifaces: [] });
  m = await detectMachine(o);
  check('2.3.8 detectMachine.so caso Gerardo: Windows 11 Pro 26H2 (compilación 26300.9711)', m.so === 'Windows 11 Pro 26H2 (compilación 26300.9711)', { so: m.so });
  check('2.3.8 detectMachine detalles.osFuente es registro', m.detalles && m.detalles.osFuente === 'registro', m.detalles);
  r = await detectChecks(makeOverrides({ osVersion: 'Windows 10 Pro|26H2|26300', osRegistry: 'Windows 10 Pro|26H2|26300|9711', osCim: 'Microsoft Windows 10 Pro||26300', osInfo: WIN11_LYING }));
  check('2.3.8 versiones.so caso Gerardo', r.versiones.so === 'Windows 11 Pro 26H2 (compilación 26300.9711)', r.versiones);
  check('2.3.8 detectChecks detalles.osFuente es registro', r.detalles.osFuente === 'registro', r.detalles);

  // --- 2.3.8 RAM instalada (memLayout) + redondeo a tamaño estándar ---
  console.log('-- 2.3.8 RAM instalada --');
  // ROBIT5: 16 GB instalados (2x8 GiB) pero mem.total visible 15.4 GiB.
  check('ramGBFromMem: memLayout 2x8 GiB con total visible 15.4 -> 16', ramGBFromMem({ total: 16535624090 }, [{ size: 8589934592 }, { size: 8589934592 }]) === 16);
  check('ramGBFromMem: sin memLayout, 15.4 GiB visibles -> 16', ramGBFromMem({ total: 16535624090 }, []) === 16);
  check('ramGBFromMem: sin memLayout, 7.7 GiB visibles -> 8', ramGBFromMem({ total: 8267812045 }, []) === 8);
  check('ramGBFromMem: 8 GiB exactos -> 8', ramGBFromMem({ total: 8589934592 }, []) === 8);
  check('ramGBFromMem: 16 GiB exactos -> 16 (caso 2.3.4)', ramGBFromMem({ total: 17179869184 }, []) === 16);
  check('ramGBFromMem: 32 GiB exactos -> 32', ramGBFromMem({ total: 34359738368 }, []) === 32);
  check('ramGBFromMem: sin datos -> 0', ramGBFromMem({}, []) === 0);
  check('ramGBFromMem: memLayout vacío y sin total -> 0', ramGBFromMem({}, null) === 0);
  o = makeOverrides({ platform: 'linux', mem: { total: 16535624090 }, memLayout: [{ size: 8589934592 }, { size: 8589934592 }], disks: [{ size: 512000000000, type: 'SSD', interfaceType: 'SATA' }] });
  o.ifaces = [];
  m = await detectMachine(o);
  check('detectMachine.ramGB ROBIT5: memLayout 2x8 GiB -> 16 (no 15)', m.ramGB === 16, { ramGB: m.ramGB });
  o = makeOverrides({ platform: 'linux', mem: { total: 16535624090 }, memLayout: [], disks: [{ size: 512000000000, type: 'SSD', interfaceType: 'SATA' }] });
  o.ifaces = [];
  m = await detectMachine(o);
  check('detectMachine.ramGB sin memLayout: 15.4 GiB visibles -> 16', m.ramGB === 16, { ramGB: m.ramGB });
  o = makeOverrides({ platform: 'linux', mem: { total: 8267812045 }, memLayout: [], disks: [{ size: 256000000000, type: 'SSD', interfaceType: 'SATA' }] });
  o.ifaces = [];
  m = await detectMachine(o);
  check('detectMachine.ramGB equipo 8 GB: 7.7 GiB visibles -> 8', m.ramGB === 8, { ramGB: m.ramGB });

  // --- 2.3.8 ESET Management Agent (no afecta a t7: no es antivirus) ---
  console.log('-- 2.3.8 agente ESET --');
  check('findEsetAgentVersion: desinstalación con agente', findEsetAgentVersion(parseUninstallVersions('ESET Endpoint Security|13.1.2036.0|ESET, spol. s r.o.\nESET Management Agent|11.1.1234.0|ESET, spol. s r.o.')) === '11.1.1234.0');
  check('findEsetAgentVersion: sin agente -> vacío', findEsetAgentVersion(parseUninstallVersions('ESET Endpoint Security|13.1.2036.0|ESET, spol. s r.o.')) === '');
  check('findEsetAgentVersion: versión sin forma -> vacío', findEsetAgentVersion([{ name: 'ESET Management Agent', version: 'abc', publisher: '' }]) === '');
  // PC con agente + antivirus ESET: ambas versiones presentes.
  r = await detectChecks(makeOverrides({
    antivirus: ['ESET Security|266240'],
    esetRegVersion: '13.1.2036.0',
    uninstallVersions: ['ESET Endpoint Security|13.1.2036.0|ESET, spol. s r.o.', 'ESET Management Agent|11.1.1234.0|ESET, spol. s r.o.'],
    esetAgentServices: ['EraAgentSvc|ESET Management Agent|Running'],
  }));
  check('2.3.8 agente ESET: versiones.esetAgent 11.1.1234.0', r.versiones.esetAgent === '11.1.1234.0', r.versiones);
  check('2.3.8 agente ESET: antivirus sigue ESET Security 13.1.2036.0', r.versiones.antivirus === 'ESET Security 13.1.2036.0', r.versiones);
  check('2.3.8 agente ESET: t7 sigue marcado (el agente no afecta)', r.checks.t7 === true, r.checks);
  check('2.3.8 agente ESET: fuente desinstalación', typeof r.detalles.esetAgentFuente === 'string' && r.detalles.esetAgentFuente.indexOf('desinstalación') === 0, r.detalles);
  // PC sin agente: solo antivirus, nada de esetAgent.
  r = await detectChecks(makeOverrides({
    antivirus: ['ESET Security|266240'],
    esetRegVersion: '13.1.2036.0',
    uninstallVersions: ['ESET Endpoint Security|13.1.2036.0|ESET, spol. s r.o.'],
    esetAgentServices: [],
  }));
  check('2.3.8 sin agente: versiones.esetAgent ausente', r.versiones.esetAgent === undefined, r.versiones);
  check('2.3.8 sin agente: antivirus sigue presente', r.versiones.antivirus === 'ESET Security 13.1.2036.0', r.versiones);
  check('2.3.8 sin agente: t7 sigue marcado', r.checks.t7 === true, r.checks);
  // PC sin ESET: nada de ESET.
  r = await detectChecks(makeOverrides({
    antivirus: ['Windows Defender|266240'],
    uninstallVersions: ['Google Chrome|130.0.0.0|Google LLC'],
    esetAgentServices: [],
  }));
  check('2.3.8 sin ESET: versiones.esetAgent ausente', r.versiones.esetAgent === undefined, r.versiones);
  check('2.3.8 sin ESET: antivirus es Defender', r.versiones.antivirus === 'Windows Defender', r.versiones);
  // Respaldo por archivo: sin clave de desinstalación, ERAAgent.exe + proceso.
  r = await detectChecks(makeOverrides({
    antivirus: ['ESET Security|266240'],
    esetRegVersion: '13.1.2036.0',
    uninstallVersions: ['ESET Endpoint Security|13.1.2036.0|ESET, spol. s r.o.'],
    files: ['C:\\Program Files\\ESET\\ESET Management Agent\\ERAAgent.exe'],
    esetAgentFileVersion: '11.0.1234.0',
    esetAgentServices: [],
    processes: ['ERAAgent'],
  }));
  check('2.3.8 agente ESET por archivo: versiones.esetAgent 11.0.1234.0', r.versiones.esetAgent === '11.0.1234.0', r.versiones);
  check('2.3.8 agente ESET por archivo: fuente archivo ERAAgent.exe', typeof r.detalles.esetAgentFuente === 'string' && r.detalles.esetAgentFuente.indexOf('archivo ERAAgent.exe') === 0, r.detalles);
  check('2.3.8 agente ESET por archivo: antivirus intacto', r.versiones.antivirus === 'ESET Security 13.1.2036.0', r.versiones);

  console.log('-- 2.3.6 redes (todas las interfaces con IPv4) --');
  check('listNetworks: Ethernet estática + Wi-Fi dinámica', eq(listNetworks(IFACES), [
    { nombre: 'Ethernet0', ip: '10.0.0.5', ipTipo: 'Estática' },
    { nombre: 'Wi-Fi', ip: '192.168.1.20', ipTipo: 'Dinámica' },
  ]));
  check('listNetworks: solo Wi-Fi', eq(listNetworks([{ iface: 'Wi-Fi', ip4: '192.168.1.20', dhcp: true, internal: false }]), [
    { nombre: 'Wi-Fi', ip: '192.168.1.20', ipTipo: 'Dinámica' },
  ]));
  check('listNetworks: sin IPv4 usable -> []', eq(listNetworks([{ iface: 'lo', ip4: '127.0.0.1', internal: true }, { iface: 'Ethernet0', ip4: '', internal: false }]), []));
  check('listNetworks: sin dhcp -> ipTipo vacío', eq(listNetworks([{ iface: 'Ethernet0', ip4: '10.0.0.5', internal: false }]), [
    { nombre: 'Ethernet0', ip: '10.0.0.5', ipTipo: '' },
  ]));
  check('listNetworks: no es array -> []', eq(listNetworks(null), []));
  check('parseNetIpDhcp: alias|ip|dhcp', eq(parseNetIpDhcp('Ethernet0|10.0.0.5|Disabled\nWi-Fi|192.168.1.20|Enabled'), [
    { alias: 'Ethernet0', ip: '10.0.0.5', dhcp: false },
    { alias: 'Wi-Fi', ip: '192.168.1.20', dhcp: true },
  ]));
  check('parseNetIpDhcp: líneas viejas de 2 campos se descartan', eq(parseNetIpDhcp('192.168.1.20|Enabled\n10.0.0.5|Disabled'), []));
  check('parseNetIpDhcp: IP no usable se descarta', eq(parseNetIpDhcp('Ethernet0|127.0.0.1|Enabled'), []));
  check('parseNetIpDhcp: Dhcp desconocido -> null', eq(parseNetIpDhcp('Ethernet0|10.0.0.5|Nada'), [{ alias: 'Ethernet0', ip: '10.0.0.5', dhcp: null }]));
  // detectMachine: redes + ip/ipTipo principal sin cambio.
  m = await detectMachine({ platform: 'linux', ifaces: IFACES });
  check('detectMachine redes: Ethernet + Wi-Fi', eq(m.redes, [
    { nombre: 'Ethernet0', ip: '10.0.0.5', ipTipo: 'Estática' },
    { nombre: 'Wi-Fi', ip: '192.168.1.20', ipTipo: 'Dinámica' },
  ]), m.redes);
  check('detectMachine: ip/ipTipo principal sin cambio (default Wi-Fi dinámica)', m.ip === '192.168.1.20' && m.ipTipo === 'Dinámica', { ip: m.ip, ipTipo: m.ipTipo });
  m = await detectMachine({ platform: 'linux', ifaces: [{ iface: 'Wi-Fi', ip4: '192.168.1.20', dhcp: true, internal: false, default: true, mac: 'AA:BB:CC:DD:EE:02' }] });
  check('detectMachine redes: solo Wi-Fi', eq(m.redes, [{ nombre: 'Wi-Fi', ip: '192.168.1.20', ipTipo: 'Dinámica' }]), m.redes);
  check('detectMachine solo Wi-Fi: ip/ipTipo principal sin cambio', m.ip === '192.168.1.20' && m.ipTipo === 'Dinámica', { ip: m.ip, ipTipo: m.ipTipo });
  m = await detectMachine({ platform: 'linux', ifaces: [{ iface: 'lo', ip4: '127.0.0.1', internal: true, dhcp: false }] });
  check('detectMachine redes: sin IPv4 -> []', eq(m.redes, []), m.redes);
  check('detectMachine sin IPv4: ip/ipTipo siguen omitiéndose', m.ip === undefined && m.ipTipo === undefined, m);
  // Windows sin dhcp en si: respaldo PowerShell por InterfaceAlias.
  m = await detectMachine(makeOverrides({
    platform: 'win32',
    ifaces: [
      { iface: 'Ethernet0', ip4: '10.0.0.5', internal: false, default: false, mac: 'AA:BB:CC:DD:EE:01' },
      { iface: 'Wi-Fi', ip4: '192.168.1.20', internal: false, default: true, mac: 'AA:BB:CC:DD:EE:02' },
    ],
    netIpDhcp: 'Ethernet0|10.0.0.5|Disabled\nWi-Fi|192.168.1.20|Enabled',
    ipDhcp: '10.0.0.5|Disabled\n192.168.1.20|Enabled',
  }));
  check('detectMachine Windows redes por alias: Ethernet estática + Wi-Fi dinámica', eq(m.redes, [
    { nombre: 'Ethernet0', ip: '10.0.0.5', ipTipo: 'Estática' },
    { nombre: 'Wi-Fi', ip: '192.168.1.20', ipTipo: 'Dinámica' },
  ]), m.redes);
  check('detectMachine Windows redes por alias: ip/ipTipo principal sin cambio', m.ip === '192.168.1.20' && m.ipTipo === 'Dinámica', { ip: m.ip, ipTipo: m.ipTipo });
  // Windows: si el respaldo de redes no trae nada, ipTipo queda '' en
  // redes, pero el ip/ipTipo principal sigue su propio respaldo por IP.
  m = await detectMachine(makeOverrides({
    platform: 'win32',
    ifaces: [{ iface: 'Wi-Fi', ip4: '192.168.1.20', internal: false, default: true, mac: 'AA:BB:CC:DD:EE:02' }],
    netIpDhcp: '',
    ipDhcp: '192.168.1.20|Enabled',
  }));
  check('detectMachine Windows sin respaldo de redes: ipTipo vacío en redes', eq(m.redes, [{ nombre: 'Wi-Fi', ip: '192.168.1.20', ipTipo: '' }]), m.redes);
  check('detectMachine Windows sin respaldo de redes: principal sí resuelve por IP', m.ip === '192.168.1.20' && m.ipTipo === 'Dinámica', { ip: m.ip, ipTipo: m.ipTipo });

  // --- Linux/Mac: los chequeos Windows no se intentan ---
  console.log('-- plataforma no-Windows --');
  const lin = makeOverrides({
    platform: 'linux',
    uninstall: ['Google Chrome'],
    hotfix: '2026-11-12',
    battery: { hasBattery: false, isCharging: false, percent: 0 },
    serial: 'ABC123',
  });
  r = await detectChecks(lin);
  check('Linux: no se llama a PowerShell', lin._psCalls() === 0, { llamadas: lin._psCalls() });
  check('Linux: t18 sin determinar', r.checks.t18 === undefined, r.checks);
  check('Linux: t6 sin determinar', r.checks.t6 === undefined, r.checks);
  check('Linux: t12 sin determinar', r.checks.t12 === undefined, r.checks);
  check('Linux: t4 sí (multiplataforma)', r.checks.t4 === true, r.checks);
  check('Linux: t3 sin batería no se marca', r.checks.t3 === undefined, r.checks);
  check('Linux: versiones.so real (distro+release)', typeof r.versiones.so === 'string' && r.versiones.so.length > 0, r.versiones);
  check('Linux: sin anydeskId', r.anydeskId === undefined, r);

  // --- Fallo total de PowerShell: no rompe, solo t3/t4 ---
  console.log('-- fallo silencioso --');
  r = await detectChecks({
    platform: 'win32',
    now: NOW,
    serial: 'ABC123',
    battery: { hasBattery: false, isCharging: false, percent: 0 },
    runPs: async () => { throw new Error('powershell roto'); },
    runCmd: async () => { throw new Error('cscript roto'); },
    fileExists: () => false,
    listDir: () => [],
  });
  check('PowerShell roto: detectChecks no lanza', true);
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
  ].join('\r\n');
  const NET_EN = [
    'Force user logoff how long after time expires?:       Never',
    'Minimum password age (days):                         0',
    'Maximum password age (days):                         42',
    'Minimum password length:                             12',
    'Length of password history maintained:                24',
    'Lockout threshold:                                    3',
    'Lockout duration (minutes):                           30',
    'Lockout observation window (minutes):                 30',
  ].join('\r\n');
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
    files: ['C:\\Users\\sistemas'],
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
  check('2.5.0 integración: politicasFuente menciona net accounts y registro', typeof r.detalles.politicasFuente === 'string' && r.detalles.politicasFuente.indexOf('net accounts') >= 0 && r.detalles.politicasFuente.indexOf('registro') >= 0, r.detalles);
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
    files: ['C:\\Users\\sistemas'],
    printers: [],
    uninstall: [],
    hotfix: '2026-11-12',
    battery: { hasBattery: false, isCharging: false, percent: 0 },
    serial: 'ABC123',
  }));
  check('2.5.0 solo perfil: usuarioSistemas true', r.detalles.usuarioSistemas === true, r.detalles);
  check('2.5.0 solo perfil: fuente dice perfil', typeof r.detalles.usuarioSistemasFuente === 'string' && r.detalles.usuarioSistemasFuente.indexOf('perfil') >= 0, r.detalles);
  check('2.5.0 solo protector: bloqueoSegundos 350', r.detalles.politicas && r.detalles.politicas.bloqueoSegundos === 350, r.detalles.politicas);

  // --- 2.5.5: directiva local gpedit.msc (Registry.pol + secedit) ---
  function buildRegistryPol(entries) {
    const parts = [Buffer.from('PReg', 'ascii')];
    const ver = Buffer.alloc(4); ver.writeUInt32LE(1, 0); parts.push(ver);
    for (const e of entries) {
      parts.push(Buffer.from('[', 'ascii'));
      parts.push(Buffer.from(e.key + '\0', 'utf16le'));
      parts.push(Buffer.from(';', 'ascii'));
      parts.push(Buffer.from(e.name + '\0', 'utf16le'));
      parts.push(Buffer.from(';', 'ascii'));
      const tb = Buffer.alloc(4); tb.writeUInt32LE(e.type, 0); parts.push(tb);
      let data;
      if (Buffer.isBuffer(e.data)) data = e.data;
      else if (typeof e.data === 'number') { data = Buffer.alloc(4); data.writeUInt32LE(e.data, 0); }
      else data = Buffer.from(String(e.data) + '\0', 'utf16le');
      const sb = Buffer.alloc(4); sb.writeUInt32LE(data.length, 0); parts.push(sb);
      parts.push(data);
      parts.push(Buffer.from(']', 'ascii'));
    }
    return Buffer.concat(parts);
  }
  function seceditInf(lines) {
    return Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(lines.join('\r\n') + '\r\n', 'utf16le')]);
  }
  const POL_M = buildRegistryPol([
    { key: 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System', name: 'InactivityTimeoutSecs', type: 4, data: 900 },
    { key: 'SOFTWARE\\Policies\\Microsoft\\Windows\\Something', name: 'NoSeUsa', type: 4, data: 1 },
  ]);
  const POL_U = buildRegistryPol([
    { key: 'Software\\Policies\\Microsoft\\Windows\\Control Panel\\Desktop', name: 'ScreenSaveTimeOut', type: 1, data: '600' },
    { key: 'Software\\Policies\\Microsoft\\Windows\\Control Panel\\Desktop', name: 'ScreenSaveActive', type: 1, data: '1' },
  ]);
  const SEC_OK = seceditInf([
    '[Unicode]', 'Unicode=yes', '[System Access]',
    'MinimumPasswordAge = 0', 'MaximumPasswordAge = 60',
    'MinimumPasswordLength = 12', 'PasswordComplexity = 1',
    'LockoutBadCount = 3', 'LockoutDuration = 30', 'ResetLockoutCount = 30',
  ]);
  const SEC_MANUAL = seceditInf([
    '[System Access]', 'MaximumPasswordAge = 90',
    'MinimumPasswordLength = 10', 'PasswordComplexity = 0',
    'LockoutBadCount = 5', 'LockoutDuration = 0', 'ResetLockoutCount = 0',
  ]);

  // Parser Registry.pol.
  check('2.5.5 Registry.pol Machine: InactivityTimeoutSecs 900', parseRegistryPol(POL_M).InactivityTimeoutSecs === 900, parseRegistryPol(POL_M));
  check('2.5.5 Registry.pol ignora valores que no le importan', parseRegistryPol(POL_M).NoSeUsa === undefined, parseRegistryPol(POL_M));
  check('2.5.5 Registry.pol User: ScreenSaveTimeOut 600 (REG_SZ)', parseRegistryPol(POL_U).ScreenSaveTimeOut === 600, parseRegistryPol(POL_U));
  check('2.5.5 Registry.pol User: ScreenSaveActive 1', parseRegistryPol(POL_U).ScreenSaveActive === 1, parseRegistryPol(POL_U));
  check('2.5.5 Registry.pol cabecera mala: {}', eq(parseRegistryPol(Buffer.from('XXXX1234')), {}), parseRegistryPol(Buffer.from('XXXX1234')));
  check('2.5.5 Registry.pol truncado: no rompe', JSON.stringify(parseRegistryPol(POL_M.slice(0, 20))) === '{}', parseRegistryPol(POL_M.slice(0, 20)));

  // Parser secedit.
  check('2.5.5 secedit: cambioDias 60', parseSeceditInf(SEC_OK).cambioDias === 60, parseSeceditInf(SEC_OK));
  check('2.5.5 secedit: minLongitud 12', parseSeceditInf(SEC_OK).minLongitud === 12, parseSeceditInf(SEC_OK));
  check('2.5.5 secedit: complejidad 1', parseSeceditInf(SEC_OK).complejidad === 1, parseSeceditInf(SEC_OK));
  check('2.5.5 secedit: bloqueoIntentos 3', parseSeceditInf(SEC_OK).bloqueoIntentos === 3, parseSeceditInf(SEC_OK));
  check('2.5.5 secedit: LockoutDuration 30 min -> 1800 s', parseSeceditInf(SEC_OK).lockoutSegundos === 1800, parseSeceditInf(SEC_OK));
  check('2.5.5 secedit: ResetLockoutCount 30 min -> 1800 s', parseSeceditInf(SEC_OK).resetLockoutSegundos === 1800, parseSeceditInf(SEC_OK));
  check('2.5.5 secedit: LockoutDuration 30 no es manual', parseSeceditInf(SEC_OK).bloqueoManual === false, parseSeceditInf(SEC_OK));
  check('2.5.5 secedit: LockoutDuration 0 -> bloqueoManual true', parseSeceditInf(SEC_MANUAL).bloqueoManual === true && parseSeceditInf(SEC_MANUAL).lockoutSegundos === 0, parseSeceditInf(SEC_MANUAL));
  check('2.5.5 secedit: MaximumPasswordAge -1 -> cambio null', parseSeceditInf(seceditInf(['[System Access]', 'MaximumPasswordAge = -1'])).cambioDias === null, parseSeceditInf(seceditInf(['[System Access]', 'MaximumPasswordAge = -1'])));
  check('2.5.5 secedit: texto plano (no Buffer) tambien parsea', parseSeceditInf('[System Access]\r\nMaximumPasswordAge = 42\r\n').cambioDias === 42, parseSeceditInf('[System Access]\r\nMaximumPasswordAge = 42\r\n'));
  check('2.5.5 secedit vacio: todo null, no manual', eq(parseSeceditInf(''), { cambioDias: null, minLongitud: null, complejidad: null, bloqueoIntentos: null, lockoutSegundos: null, bloqueoManual: false, resetLockoutSegundos: null }), parseSeceditInf(''));

  // politicasCumple con bloqueo manual.
  check('2.5.5 politicasCumple manual: cumpleBloqueo true con 0 s', politicasCumple({ cambioDias: 90, minLongitud: 10, bloqueoIntentos: 5, bloqueoSegundos: 0, bloqueoManual: true }).cumpleBloqueo === true, politicasCumple({ cambioDias: 90, minLongitud: 10, bloqueoIntentos: 5, bloqueoSegundos: 0, bloqueoManual: true }));
  check('2.5.5 politicasCumple manual: cumple true', politicasCumple({ cambioDias: 90, minLongitud: 10, bloqueoIntentos: 5, bloqueoSegundos: 0, bloqueoManual: true }).cumple === true, politicasCumple({ cambioDias: 90, minLongitud: 10, bloqueoIntentos: 5, bloqueoSegundos: 0, bloqueoManual: true }));
  check('2.5.5 politicasCumple 0 s sin manual: cumpleBloqueo false', politicasCumple({ cambioDias: 90, minLongitud: 10, bloqueoIntentos: 5, bloqueoSegundos: 0 }).cumpleBloqueo === false, politicasCumple({ cambioDias: 90, minLongitud: 10, bloqueoIntentos: 5, bloqueoSegundos: 0 }));

  // Integración: gpedit manda (Registry.pol + secedit).
  r = await detectChecks(makeOverrides({
    netAccounts: NET_ES,
    inactivityTimeout: '350',
    screenSave: '1|600',
    polMachine: POL_M,
    polUser: POL_U,
    seceditInf: SEC_OK,
    localUserSistemas: 'sistemas|True',
    files: ['C:\\Users\\sistemas'],
    printers: ['HP LaserJet Pro'],
    uninstall: ['Google Chrome'],
    hotfix: '2026-11-12',
    battery: { hasBattery: false, isCharging: false, percent: 0 },
    serial: 'ABC123',
  }));
  check('2.5.5 integración gpedit: cambioDias 60 (secedit, no net accounts)', r.detalles.politicas && r.detalles.politicas.cambioDias === 60, r.detalles.politicas);
  check('2.5.5 integración gpedit: minLongitud 12 (secedit)', r.detalles.politicas && r.detalles.politicas.minLongitud === 12, r.detalles.politicas);
  check('2.5.5 integración gpedit: bloqueoIntentos 3 (secedit)', r.detalles.politicas && r.detalles.politicas.bloqueoIntentos === 3, r.detalles.politicas);
  check('2.5.5 integración gpedit: bloqueoSegundos 600 (mínimo de pol 900 y 600)', r.detalles.politicas && r.detalles.politicas.bloqueoSegundos === 600, r.detalles.politicas);
  check('2.5.5 integración gpedit: cumple true', r.detalles.politicas && r.detalles.politicas.cumple === true, r.detalles.politicas);
  check('2.5.5 integración gpedit: fuente gpedit (Registry.pol) + directiva (secedit)', typeof r.detalles.politicasFuente === 'string' && r.detalles.politicasFuente.indexOf('gpedit (Registry.pol)') >= 0 && r.detalles.politicasFuente.indexOf('directiva (secedit)') >= 0, r.detalles);
  check('2.5.5 integración gpedit: fuente sin net accounts ni registro', typeof r.detalles.politicasFuente === 'string' && r.detalles.politicasFuente.indexOf('net accounts') < 0 && r.detalles.politicasFuente.indexOf('registro') < 0, r.detalles);

  // Integración: secedit sin permisos -> cae a net accounts.
  r = await detectChecks(makeOverrides({
    netAccounts: NET_ES,
    inactivityTimeout: '350',
    screenSave: '1|600',
    seceditFails: true,
    localUserSistemas: '',
    printers: [],
    uninstall: [],
    hotfix: '2026-11-12',
    battery: { hasBattery: false, isCharging: false, percent: 0 },
    serial: 'ABC123',
  }));
  check('2.5.5 secedit roto: cambioDias 90 (net accounts)', r.detalles.politicas && r.detalles.politicas.cambioDias === 90, r.detalles.politicas);
  check('2.5.5 secedit roto: fuente net accounts + registro', typeof r.detalles.politicasFuente === 'string' && r.detalles.politicasFuente.indexOf('net accounts') >= 0 && r.detalles.politicasFuente.indexOf('registro') >= 0, r.detalles);
  check('2.5.5 secedit roto: fuente sin directiva (secedit)', typeof r.detalles.politicasFuente === 'string' && r.detalles.politicasFuente.indexOf('directiva (secedit)') < 0, r.detalles);

  // Integración: secedit con LockoutDuration 0 -> bloqueo manual.
  r = await detectChecks(makeOverrides({
    netAccounts: NET_ES,
    inactivityTimeout: '',
    screenSave: '',
    seceditInf: SEC_MANUAL,
    localUserSistemas: '',
    printers: [],
    uninstall: [],
    hotfix: '2026-11-12',
    battery: { hasBattery: false, isCharging: false, percent: 0 },
    serial: 'ABC123',
  }));
  check('2.5.5 manual: bloqueoManual true', r.detalles.politicas && r.detalles.politicas.bloqueoManual === true, r.detalles.politicas);
  check('2.5.5 manual: cumpleBloqueo true', r.detalles.politicas && r.detalles.politicas.cumpleBloqueo === true, r.detalles.politicas);
  check('2.5.5 manual: bloqueoSegundos null (sin inactividad)', r.detalles.politicas && r.detalles.politicas.bloqueoSegundos === null, r.detalles.politicas);
  check('2.5.5 manual: fuente directiva (secedit)', typeof r.detalles.politicasFuente === 'string' && r.detalles.politicasFuente.indexOf('directiva (secedit)') >= 0, r.detalles);



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
  check('257 script cambiar lleva nueva escapada', scrC.indexOf("'Nueva$456 \"x\"'") !== -1);
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

  console.log('\n== resumen: ' + pass + ' pasaron, ' + fail + ' fallaron ==');
  if (fail) {
    console.log('Fallos: ' + failures.join(', '));
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => {
  console.error('La prueba rompió:', e);
  process.exit(1);
});
