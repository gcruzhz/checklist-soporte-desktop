# Checklist de Soporte — app de escritorio (2.5.6)

App de escritorio para Windows, Mac y Linux (Electron) de **Checklist de
Soporte**. Carga la misma app web que el teléfono
(`../checklist-cloud/www/index.html`, versión 2.5.6) y le añade el
detector de características del equipo, que alimenta la colección
Firestore `detectados` que los teléfonos ya leen.

> El original de `checklist-cloud` nunca se modifica:
> `scripts/copy-www.js` copia su `www/` a `./www` en cada build y cada
> arranque (`prestart` / `prebuild`). Si la web cambia, basta reconstruir.
> `www/` es una copia generada: **no se versiona** (ver `.gitignore`) y
> no se edita a mano.

Repositorio público: `github.com/gcruzhz/checklist-soporte-desktop`.
Repo hermano (la app web): `github.com/gcruzhz/checklist-soporte-cloud`.

> **Últimos cambios (2.5.15):** misma web que el teléfono 2.5.15;
> «Enviar formulario en blanco» manda el enlace al número de WhatsApp
> configurado en la vista (sin número, elige contacto); bundle de
> Firebase sin cambio; AppImage, .deb y portable `.exe` en ZIP.
> Historial completo en [docs/CHANGELOG.md](docs/CHANGELOG.md).

## Qué es cada parte

| Archivo | Papel |
|---|---|
| `main.js` | Ventana de Electron (1200×800, título `Checklist de Soporte`), IPC, descargas y modo smoke. Carga `www/index.html`. |
| `preload.js` | Expone `window.Desktop` a la app web con `contextBridge` (sin acceso a Node) y parcha `window.open` (ver abajo). |
| `detect.js` | `detectMachine()` y `detectChecks()`: leen el equipo con `systeminformation`, PowerShell y el registro de Windows. |
| `scripts/copy-www.js` | Copia `../checklist-cloud/www` a `./www` (borra antes el destino). |
| `scripts/verify-detect.js` | Imprime los valores reales del detector en esta máquina. |
| `scripts/test-detect-checks.js` | Pruebas unitarias de `detectChecks()` con salidas simuladas. |
| `scripts/smoke-*.js` | Pruebas de humo de la app real en Electron (ver Testing). |
| `build/icon.png` / `build/icon.ico` | Icono de la app (Linux/Mac y Windows). |

## Cómo se comunica con la web

`preload.js` expone `window.Desktop`:

| Miembro | Qué hace |
|---|---|
| `isDesktop` | `true` (la web lo usa para mostrar controles solo de escritorio). |
| `platform` | `process.platform` (`win32`, `linux`, `darwin`). |
| `detect()` | `ipcRenderer.invoke('desktop-detect')` → `main.js` corre `detectMachine()` + `detectChecks()` y devuelve el objeto plano del contrato `detectados` (la web hace `Object.assign` y lo pasa a `Cloud.reportDetected`). |
| `getMachineId()` | `ipcRenderer.invoke('desktop-get-machine-id')` → id determinista del equipo (serie o hostname + MAC); la web lo usa para el bloqueo del botón «Detectar este equipo» por máquina. |
| `openExternal(url)` | `ipcRenderer.invoke('desktop-open-external', url)`; solo se permiten URLs `http(s)`. |

`main.js` además:

- Niega la apertura de ventanas nuevas (`setWindowOpenHandler`): los
  enlaces `http(s)` se abren en el navegador del sistema.
- Las descargas (respaldo de escritorio del «Abrir» de Excel) se guardan
  en `Descargas` con su nombre, sin preguntar; si el nombre ya existe se
  añade un sufijo con la hora.
- Si la app corre como root añade `--no-sandbox` (Chromium se niega a
  arrancar sin él); siempre añade `--disable-dev-shm-usage`.
- El parche de `window.open` en `preload.js`: un `blob:` (Excel u otro
  archivo) se descarga como `checklist.xlsx` en `Descargas`; una URL
  `http(s)` (por ejemplo `wa.me/...` de WhatsApp) se abre en el navegador
  del sistema.

En la web, el botón **🖥️ Detectar este equipo** solo se muestra si
`window.Desktop` existe (es decir, solo en escritorio) y el panel
**🖥️ Equipos detectados** lista los documentos de `detectados` no usados.
El botón **Detectar equipo** de Mantenimientos hace lo mismo desde esa
sección y abre el formulario prellenado.

### Login en escritorio

La app de escritorio **pide login siempre**: no hay sesión recordada ni
huella en el `.exe`. Es comportamiento de la app web cuando existe
`window.Desktop` (en la copia de `www/index.html`: `remember` se fuerza
a `false`, se oculta la fila «recordar sesión» y no se ofrece la huella,
que es solo del teléfono). En el teléfono todo sigue como siempre.

## Qué hace el detector

`detectMachine()` devuelve el objeto del contrato de `detectados`. Si
algún dato no se puede leer, se pone `''` o `0`: `detect()` nunca rompe.

| Campo | Origen |
|---|---|
| `id` | `machineId` (ver abajo); si no hay ninguno, el timestamp `detectadoEn`. |
| `machineId` | La serie real si existe; si no, `hostname + '-' + MAC` (sin `:` ni `-`); sin serie ni MAC, solo el hostname. Es estable entre detecciones: el mismo equipo no crea un documento nuevo cada vez. |
| `hostname` | `osInfo.hostname` (systeminformation). |
| `marca` | `system.manufacturer`. |
| `modelo` | `system.model`. |
| `serie` | `system.serial`, limpia de series «de relleno» (`-`, `None`, `To be filled by O.E.M.`, `Default string`, …), que se tratan como ausentes para que esos equipos no colisionen todos en el mismo documento. |
| `cpu` | `cpu.brand`. |
| `ramGB` | **RAM instalada, no visible**: suma de los módulos de `memLayout()` en GiB; si viene vacío, `mem.total` redondeado al tamaño estándar más cercano (4, 8, 12, 16, 24, 32, 48, 64, 96, 128). |
| `discoGB` | `Math.round(diskLayout[0].size / 1e9)`; `0` si no hay disco. Sigue en decimal, como la etiqueta del fabricante. |
| `discoTipo` | `diskLayout[0]`: `NVMe` si el tipo o la interfaz contiene NVMe, `SSD` si el tipo es SSD, `HDD` en los demás casos con disco, `''` sin disco. |
| `so` | En Windows: registro → CIM (`Win32_OperatingSystem`) → `Get-ComputerInfo` → `si.osInfo()` (ver «Sistema operativo»); en Linux/Mac: `distro + ' ' + release`. |
| `tipo` | `chassis.type` es `laptop`/`notebook` (sin importar mayúsculas) → `Laptop`; si no, `Desktop`. |
| `mac` | Primera interfaz de red no interna. |
| `ip` / `ipTipo` | IPv4 de la interfaz principal (la marcada `default`, si no la primera no interna con IPv4 usable): `dhcp true` → `Dinámica`, `false` → `Estática`. En Windows, si falta el campo `dhcp`, respaldo con PowerShell (`Get-NetIPAddress` + `Get-NetIPInterface`). Si el tipo no se puede determinar, solo va `ip`; si no hay IPv4, no van ni `ip` ni `ipTipo`. |
| `redes` | Todas las interfaces con IPv4 no interna: `[{ nombre, ip, ipTipo }]` (`ipTipo` es `''` si no se determina; en Windows con respaldo PowerShell por `InterfaceAlias`). |
| `detalles.osFuente` | Fuente que dio el nombre del SO: `registro` \| `cim` \| `computerinfo` \| `si`. |
| `detectadoEn` | `Date.now()` (ms). |
| `detectadoPor` | `''` aquí: lo rellena la app web con el técnico que inició sesión antes de llamar a `Cloud.reportDetected()`. |
| `usado` | `false`. |

### Sistema operativo (Windows 10 vs 11)

`si.osInfo()` miente: el kernel es 10.0 y sin manifiesto reporta
Windows 10 en un equipo con Windows 11. Por eso el nombre viene de las
fuentes PowerShell/registro, en este orden (las rápidas primero, porque
`Get-ComputerInfo` es notoriamente lento y puede morir por el timeout de
15 s):

1. Registro directo (`HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion`:
   `ProductName`, `DisplayVersion`, `CurrentBuildNumber`, `UBR`).
2. `(Get-CimInstance Win32_OperatingSystem).Caption` + `BuildNumber`.
3. `Get-ComputerInfo` + `DisplayVersion` del registro.
4. `si.osInfo()` con corrección por build.

Y **todas** las fuentes se normalizan 10 vs 11 **por build**: build
≥ 22000 → Windows 11, build < 22000 → Windows 10 (se conservan edición,
`DisplayVersion` y compilación). El registro también miente: en la PC
real (ROBIT5) decía `Windows 10 Pro` con `DisplayVersion 26H2` y build
26300, que es Windows 11. La fuente que dio el nombre queda en
`detalles.osFuente`, igual en `detectMachine().so` y en `versiones.so`.

### Puntos del checklist que marca el detector

`detectChecks()` marca solo puntos que se pueden comprobar
automáticamente en el equipo. Cada chequeo tiene timeout de 15 s, corre
en paralelo con los demás y falla en silencio: si algo no se puede
determinar, el punto queda **sin marcar** (mejor no marcar que marcar
mal). Solo pueden salir los ids de la lista blanca `ALLOWED_CHECK_IDS`:
`t3, t4, t6–t12, t18–t25` (17 ids). En Linux/Mac solo corren la parte
multiplataforma (`t3` por batería, `t4` por serie, `versiones.so` por
distro + release); los chequeos de Windows quedan sin determinar.

| Punto | Se marca cuando… (Windows, salvo `t3`/`t4`) |
|---|---|
| `t3` Batería y cargador | Hay batería y está cargando o tiene ≥ 50 %. En escritorio sin batería no se marca. |
| `t4` Serie registrada | La serie es real (no de relleno). |
| `t6` SO actualizado | El último hotfix (`Get-HotFix`) tiene ≤ 90 días. |
| `t7` Antivirus instalado y actualizado | `SecurityCenter2` (`AntiVirusProduct.productState`) dice habilitado y al día. Si hay varios, se prefiere el habilitado y al día, y nunca Windows Defender cuando hay otro activo. |
| `t8` Office instalado y activado | LibreOffice basta por sí solo; Office 365 solo si `ospp.vbs /dstatus` confirma `LICENSE STATUS: ---LICENSED---`. El valor es la cadena elegida: `'Office 365'` o `'LibreOffice'`. Si Office está pero no se confirma activación, **no** se marca. |
| `t9` Impresoras configuradas | Al menos una impresora real (`Get-Printer`); las virtuales no cuentan (Microsoft Print to PDF, XPS Document Writer, OneNote, Fax). |
| `t10` VPN configurada | Cliente VPN conocido en desinstalación (Cisco AnyConnect, FortiClient, OpenVPN, WireGuard, GlobalProtect…) o adaptador VPN/TAP. Los `WAN Miniport` del sistema no cuentan. |
| `t11` Inicio rápido desactivado | `HiberbootEnabled` es `0` en el registro. |
| `t12` Invgate | Servicio `*invgate*`, proceso, clave de desinstalación o carpeta en Program Files. |
| `t18` Google Chrome | Clave de desinstalación o `chrome.exe` en Program Files. |
| `t19` Adobe Reader / Acrobat | Clave de desinstalación o exe (`AcroRd32.exe` / `Acrobat.exe`). Gana Acrobat; `Adobe Acrobat Reader DC` cuenta como Reader, no como Acrobat. |
| `t20` WinRAR | Clave de desinstalación o `WinRAR.exe`. |
| `t21` Sistema Lapi Fox | Clave de desinstalación, proceso o carpeta en Program Files. |
| `t22` Alfaweb | Desinstalación, proceso, carpeta o acceso directo, con las variantes `Alfaweb`, `Alfa Web`, `AlfaLab`, `Alfa Lab`. **Nunca** un nombre que case con `/print/i`: un `Alfaprinter.lnk` no es Alfaweb. |
| `t23` Alfaprinter | Desinstalación, carpeta, acceso directo o impresora instalada (`Get-Printer`, `/alfa/i`). |
| `t24` Accesos historia clínica y gabinete | Hacen falta **los dos** (pueden ser archivos distintos): historia acepta `hcweb`, `HC Web` (con espacio) e `historia (clínica)`; gabinete exige `gabinete`. Se buscan `.lnk` y `.url` por nombre **y** por destino (línea `URL=` del `.url`, cadenas del `.lnk`) en el Escritorio real (PowerShell + registro `User Shell Folders` + glob `OneDrive*\Desktop`, p. ej. `OneDrive - Grupo Lapi`, + Escritorio público) y en el Menú Inicio (un nivel de subcarpetas). |
| `t25` AnyDesk | Instalado (clave de desinstalación o `AnyDesk.exe`). La variante Gris no se distingue; basta la presencia. |

**NUNCA se auto-marcan:** `t1` (equipo enciende y sin daños físicos),
`t2` (teclado, pantalla y puertos funcionando), `t5`, `t13–t17` (datos
del usuario) ni `t26` (limpieza física del equipo). Son comprobaciones
físicas o datos de la persona: hay que ver el equipo y teclearlos a mano.
`mark()` descarta cualquier otro id aunque un chequeo lo intentara.

Datos de respaldo que acompañan a los puntos (en `detalles` y
`versiones`, solo con lo que se pudo determinar):

| Dato | Origen |
|---|---|
| `detalles.ultimoHotfix` | Fecha del último hotfix (`yyyy-MM-dd`). |
| `detalles.antivirus` / `detalles.antivirusFuente` | Nombre del antivirus elegido y de dónde salió su versión (registro ESET, archivo `egui.exe`/`ekrn.exe` o desinstalación, emparejada por nombre normalizado + publisher). |
| `detalles.officeDetectado` | `Office 365` aunque no se confirme activación (pista, sin marcar `t8`). |
| `detalles.adobe` | `Acrobat` o `Reader`. |
| `detalles.invgate` | Nombre del agente, con versión si se conoce. |
| `detalles.impresoras` / `detalles.impresora` | Nº de impresoras reales y nombre de la primera (la app del teléfono lo lee para el mantenimiento). |
| `detalles.bateriaPorcentaje` | Porcentaje de batería, cuando hay. |
| `detalles.osFuente` | Fuente del nombre del SO (igual que en `detectMachine`). |
| `detalles.escritorioRutas` / `detalles.atajosVistos` | Rutas de Escritorio realmente escaneadas y nº de `.lnk`/`.url` revisados (Escritorio + Menú Inicio). |
| `versiones.so` | Nombre del SO (mismo que `detectMachine().so`). |
| `versiones.antivirus` | Nombre + versión cuando se conoce con seguridad; si no, solo el nombre. |
| `versiones.chrome` | `DisplayVersion` de la clave de desinstalación o, si no trae, versión del archivo `chrome.exe`. |
| `versiones.esetAgent` | Versión del ESET Management Agent (por desinstalación, con respaldo en `ERAAgent.exe` y confirmación por servicio `EraAgentSvc` o proceso). No es antivirus y **no** afecta a `t7`; si no está instalado, no va nada. |
| `anydeskId` / `anydeskAlias` | ID de AnyDesk (9–10 dígitos) y alias (`nombre@ad`): primero `AnyDesk.exe --get-id` / `--get-alias`; si el CLI falla o no devuelve nada, respaldo en `service.conf` / `user.conf` / `system.conf` (`ad.anynet.id`, `ad.anynet.alias`). Solo van si se determinaron; nunca se inventa un número. Van al nivel superior del objeto, junto a los campos del equipo. |

### Políticas de seguridad y usuario `sistemas` (Mantenimientos)

No son puntos del checklist: no marcan ningún `t*`. Van en
`detalles.politicas`, `detalles.politicasFuente`,
`detalles.usuarioSistemas` y `detalles.usuarioSistemasFuente`. Solo se
escriben si al menos un valor se pudo leer; sin dato no se escribe nada,
nunca se inventa. Nada de esto lee contraseñas ni secretos: son valores
de configuración del equipo.

**Cadena de fuentes (en orden, la primera que trae el dato manda):**

1. **Directiva local de gpedit.msc** — el almacén es
   `C:\Windows\System32\GroupPolicy\Machine\Registry.pol` (equipo) y
   `...\User\Registry.pol` (usuario), formato binario PReg (cabecera
   `PReg`). Solo se leen `InactivityTimeoutSecs`, `ScreenSaveTimeOut` y
   `ScreenSaveActive` (tipos `REG_DWORD`, `REG_SZ`, `REG_QWORD`).
   Fuente: `gpedit (Registry.pol)`.
2. **Directivas de cuenta** — `secedit /export` a
   `checklist-soporte-secedit.inf` en `%TEMP%`, archivo `.inf` UTF-16LE
   con `[System Access]`: `MaximumPasswordAge` (días; `-1` = nunca
   caduca → sin dato), `MinimumPasswordLength`, `PasswordComplexity`,
   `LockoutBadCount`, `LockoutDuration` (minutos → segundos) y
   `ResetLockoutCount` (minutos → segundos). `LockoutDuration 0` =
   bloqueo hasta desbloqueo manual. Fuente: `directiva (secedit)`.
   `secedit` pide administrador: si falla, se cae a `net accounts`.
3. **Respaldo `net accounts`** — política del dominio o local, en español
   o inglés (duración máxima, longitud mínima, umbral de bloqueo).
   Fuente: `net accounts`.
4. **Respaldo registro actual** (solo inactividad/protector) — directiva
   de grupo `InactivityTimeoutSecs`
   (`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System`) o
   protector de pantalla (`HKCU\Control Panel\Desktop`:
   `ScreenSaveTimeOut`, solo si `ScreenSaveActive` es `1`).
   Fuente: `registro`.

El **bloqueo efectivo** (`bloqueoSegundos`) es el menor de los valores
presentes y mayores que 0 (el que se dispara primero). `detalles.politicas`
lleva los valores crudos más los campos `cumple*`, con los mismos
umbrales que `mantPoliticasCumple()` en la app del teléfono (que los
recalcula desde los valores crudos: el detector mide, la app decide):

| Valor | Cumple si… |
|---|---|
| Cambio de contraseña (`cambioDias`) | ≤ 90 días |
| Longitud mínima (`minLongitud`) | ≥ 10 |
| Bloqueo tras (`bloqueoIntentos`) | ≤ 5 intentos |
| Bloqueo por inactividad (`bloqueoSegundos`) | ≥ 350 s (0 = bloqueo manual, cumple) |

`cumple` es `true` solo si todos los valores conocidos cumplen, `false`
si alguno no cumple y `null` si no hay ningún valor. Además
`lockoutSegundos` (duración del bloqueo de cuenta, distinta del bloqueo
por inactividad) y `complejidad` solo van cuando `secedit` los dio.

**Usuario `sistemas`:** `Get-LocalUser 'sistemas'` o perfil
`C:\Users\sistemas`. `detalles.usuarioSistemas` es booleano y solo se
escribe si al menos una de las dos pruebas se pudo correr (si PowerShell
está roto, sin dato, no un falso «No»).

## Stack

- **Electron 38.8.6** (devDependency), **electron-builder 26.18.0**,
  **systeminformation 5.33.20** (única dependencia de producción).
- `appId`: `mx.gerardo.checklistsoporte.desktop`;
  `productName`: `Checklist de Soporte`;
  `homepage`: `https://checklist-soporte.web.app`.
- `pnpm-workspace.yaml` permite el build script solo de `electron`
  (descarga su binario); `electron-winstaller` queda bloqueado a
  propósito (solo lo usa el target Squirrel.Windows, que no se usa).

## Inicio rápido

Requisitos: Node 20+ y pnpm. Los dos repos deben clonarse **al lado**,
en la misma carpeta, con el repo web en una carpeta llamada
`checklist-cloud` (así lo exige `copy-www.js`, que usa la ruta relativa
`../checklist-cloud/www`):

```sh
cd ~/workspace/android
git clone https://github.com/gcruzhz/checklist-soporte-cloud.git checklist-cloud
git clone https://github.com/gcruzhz/checklist-soporte-desktop.git checklist-desktop
cd checklist-desktop
pnpm install            # solo electron tiene permitido su build script
node scripts/copy-www.js  # copia ../checklist-cloud/www -> ./www
pnpm start              # arranca en desarrollo (copia www/ antes, por prestart)
```

En este sandbox, `npm install` falla con `EPERM chown` al extraer
paquetes (el sandbox bloquea `chown` aunque el proceso sea root): usar
pnpm standalone (`~/.local/share/pnpm/bin/pnpm`).

## Compilar

```sh
pnpm build:linux        # AppImage + .deb  -> dist/
npx electron-builder --win portable   # Windows: un solo .exe autoextraíble -> dist/
pnpm build:mac          # dmg — solo se compila en macOS
```

El `.exe` portable de Windows se mete después en un ZIP para compartirlo
(ver la tabla de artefactos abajo).

> ⚠️ **No usar `pnpm build` ni `pnpm build:win` tal como están**: en
> `package.json` el target de Windows sigue siendo `nsis` (también en el
> script `build`), y el instalador NSIS está **roto**: Wine no corre
> `makensis` en este Linux, así que el build NSIS falla y solo deja un
> instalador parcial de ~242 KB (`Checklist de Soporte Setup X.exe`) que
> **no debe compartirse ni ejecutarse**. El camino Windows es
> `--win portable`, que no necesita Wine ni `makensis`. Queda pendiente
> corregir los scripts `build`/`build:win` en `package.json` o quitar el
> target `nsis`.

> **Verificación de checksum desactivada:** `package.json` lleva
> `"electronDownload": { "isVerifyChecksum": false }`. electron-builder 26
> descarga `SHASUMS256.txt` para validar el zip de Electron aunque ya esté
> en caché, y desde 2026-11-16 esa descarga falla en este sandbox (las
> peticiones HTTPS de Node por el proxy mueren con «Proxy connection ended
> before receiving CONNECT response», mientras curl sí llega a github.com).
> Con la verificación desactivada el build no descarga nada: Electron ya
> está en `~/.cache/electron/` y se verifica a mano con `unzip -t`.

Instaladores generados en `dist/` (2.5.6, 2026-11-17; `dist/` no se
versiona):

| Archivo | Tamaño | md5 |
|---|---|---|
| `Checklist de Soporte-2.5.6.AppImage` | 123 301 227 bytes | `7b929edecf4a3667ac2a73ca57d0a6cc` |
| `checklist-soporte-desktop_2.5.6_amd64.deb` | 97 100 832 bytes | `f72b23bddf4727fec55044074b60298d` |
| `Checklist de Soporte 2.5.6.exe` (portable) | 99 121 814 bytes | `62287f8a2310832a2172f523c3e3731c` |
| `Checklist de Soporte 2.5.6.zip` (el .exe dentro) | 99 121 972 bytes | `68690cdd274123fa678cc5077ce3a7c9` |

Notas:

- El AppImage no corre directo en esta VM porque falta FUSE
  (`libfuse.so.2`); se prueba el AppImage extraído
  (`--appimage-extract`). En un PC Linux normal corre directo.
- macOS no se compila aquí: la configuración `dmg` está en
  `package.json`, pero electron-builder no puede producir un `.dmg` de
  macOS en Linux; hay que compilarlo en un Mac.
- electron-builder 26.18.0 muestra un aviso de `desktopName` al compilar
  Linux; esa opción ya no existe en su esquema y el aviso es solo
  cosmético (no afecta al `.desktop` generado).

## Correr el detector contra la máquina real

```sh
pnpm verify-detect      # node scripts/verify-detect.js
```

Imprime los valores reales de `systeminformation` en esta máquina
(hostname, marca, modelo, serie, CPU, RAM, discos, chasis, SO, interfaces
de red, batería), el objeto completo de `detectMachine()` y el resultado
real de `detectChecks()`. En Linux solo `t3`/`t4` son determinables; el
resto de chequeos son de Windows y quedan sin marcar.

## Testing

### Pruebas unitarias del detector

```sh
pnpm test-detect-checks  # node scripts/test-detect-checks.js
```

`detectChecks()` y `detectMachine()` con salidas **simuladas** de
PowerShell/registro (en esta VM Linux no hay PC Windows real: todo
Windows se verifica con salidas falsas; lo real en Linux se verifica con
`verify-detect.js`). Cubre cada punto (incluido el escenario «todo
positivo» que marca los 17 ids permitidos y el que ningún id prohibido
—`t1, t2, t5, t13–t17, t26`— se cuela), los parsers (`parseRegistryPol`,
`parseSeceditInf`, `parseNetAccounts`, `parseOsVersionDetailed`,
`scanDesktopEntries`, versiones de antivirus/Chrome/ESET, AnyDesk,
RAM, disco, IP) y las integraciones de políticas (gpedit manda;
`secedit` sin permisos cae a `net accounts`; `LockoutDuration 0` →
bloqueo manual). Sale con código 0 si todos los casos pasan.

Última corrida verificada (2026-11-17): **410 pasaron, 0 fallaron**.

### Smoke tests (app real en Electron)

Corren con el Electron de `node_modules`, bajo X virtual (sin escritorio
físico):

```sh
xvfb-run -a ./node_modules/.bin/electron --no-sandbox scripts/smoke-256-orden.js
```

Los smokes copian `./www` a una carpeta temporal y sustituyen
`firebase-config.js` por un placeholder (modo local sin nube): el login
real con Firebase **no** se ejerce; la sesión y los datos se siembran por
`executeJavaScript` y los botones se pulsan con clics reales de ratón
(`sendInputEvent`) y tecleo real a nivel de SO (XTEST). Los logs y
capturas van a `docs/smoke*-*.png|log`, que son evidencia de pruebas y
**no** se versionan (ver `.gitignore`).

| Script | Qué verifica |
|---|---|
| `smoke-240-detect.js` | Detectar → «Usar este equipo» → tecleo en el formulario; no debe aparecer ninguna ventana de diálogo nativa. |
| `smoke-263-pass.js` | Responsiva en blanco: «Enviar formulario en blanco» → wa.me con `responsiva.html?id=…`; pendiente con «Copiar enlace»; llenada con los 6 datos y botones de WhatsApp, correo y Excel. |
| `smoke-250-mant.js` / `smoke-251-mant.js` | Mantenimientos Preventivos: Inicio → Mantenimientos → equipo detectado (políticas + usuario sistemas + impresora) → «Usar este equipo» → formulario → tecleo (XTEST) → firma del técnico en canvas → «Crear orden de servicio» → folio 00001 y vista de la orden. |
| `smoke-252-mant.js` | Botón «Detectar equipo» en Mantenimientos: abre solo el panel con el equipo detectado → «Dar mantenimiento a este equipo» → formulario prellenado (serie/hostname/modelo). |
| `smoke-253-orden.js` | En Entregados el recién entregado aparece hasta arriba (`deliveredAt` descendente); no-admin ve los propios primero, admin plano; En preparación y Listos conservan `createdAt` ascendente; la búsqueda sigue filtrando. |
| `smoke-254-orden.js` / `smoke-255-orden.js` / `smoke-256-orden.js` | Botón «Actualizar» re-renderiza la orden firmada («sí ✓ (Ana López)», toast «El usuario ya firmó ✓»); «Generar PDF» escribe de verdad el PDF de la orden (formato de papel F0.S1.01 Rev0, tamaño carta, 1 página, 2 firmas) y también descarga por `<a>` sin Capacitor. 2.5.5/2.5.6 añaden: crear orden sin responsable ni área (folio 00002, «Pendiente de firma»), campo obligatorio faltante en rojo sin crear la orden, y en renta el botón «Exportar a Excel» con checkbox por equipo entregado y «Seleccionar todos». |
| `smoke-write-2.3.4.js`, `smoke-usar-equipo-2.3.5*.js`, `smoke-edit-2.3.8*.js` | Diagnóstico histórico de escritura real en los formularios (tecleo con eventos reales, render en mitad del tecleo). |

Además `main.js` trae un modo smoke de arranque: con
`CHECKLIST_DESKTOP_SMOKE=1` comprueba tras cargar que el login existe y
es visible, que `window.Desktop` y `window.Desktop.detect` están
presentes, guarda una captura en `CHECKLIST_DESKTOP_SMOKE_SHOT` (o
`/tmp/checklist-desktop-smoke.png`) e imprime un JSON `SMOKE` y cierra
con código 0 (2 si falla). La espera es de 8 s tras `did-finish-load`.

## Respaldos de escritorio (plugins Capacitor)

La web carga sus stubs `cap-plugins/*`, así que `window.Capacitor`
existe también en Electron, pero sin puente nativo. Cada uso está revisado:

| Plugin / función | En escritorio |
|---|---|
| **Cámara** (`pickPhoto`) | La implementación web abre el selector de archivos del sistema; además la web ya cae al `<input type=file>` si el plugin no está. Funciona. |
| **Excel → Abrir** (`Filesystem` + `FileOpener`) | `FileOpener` no tiene implementación web → la web cae a `window.open(blob)`. El preload convierte ese `window.open` en descarga a `Descargas` como `checklist.xlsx` (el `will-download` de `main.js` pone la ruta). Funciona. |
| **Excel → Compartir / correo** (`Filesystem` + `Share`) | `Share` web usa `navigator.share`, que no existe en Electron → la web muestra el aviso de que no se pudo compartir. El camino que funciona es **Abrir → descarga** y adjuntar a mano. |
| **WhatsApp texto** (`shareText`) | `navigator.share` no existe → la web ya cae a `wa.me/?text=...` por `window.open`; el preload lo abre en el navegador del sistema. Funciona. |
| **Biometría** (`NativeBiometric`) | No hay huella en el `.exe` (la web la desactiva cuando existe `window.Desktop`): se entra con contraseña. |
| **OCR serie** (Tesseract local) | Archivos locales `ocr/*`, sin plugin: funciona igual que en web. No probado de extremo a extremo (necesita foto + login). |
| **IA Gemini/DeepSeek** | `fetch()` directo a Google/DeepSeek, sin plugin: funciona con red normal. |
| **Firebase Auth/Firestore** | Bundle JS local + red: funciona con red normal. En este sandbox el proxy hace MITM TLS, que Chromium no confía (se vieron `SSL handshake failed, net_error -202` al intentar conectar con Firebase); en un PC normal no hay ese proxy. No se metió la CA del sandbox en la app: sería un apaño solo para este entorno. |

## Estructura

```
checklist-desktop/
  package.json          # electron-builder: appId mx.gerardo.checklistsoporte.desktop
  pnpm-lock.yaml / pnpm-workspace.yaml
  main.js               # BrowserWindow, IPC detect/open-external, descargas, smoke test
  preload.js            # window.Desktop + parches de window.open (blob -> descarga, http -> navegador)
  detect.js             # detectMachine() / detectChecks(): systeminformation + PowerShell + registro
  scripts/copy-www.js   # copia ../checklist-cloud/www -> ./www (sin modificar el original)
  scripts/verify-detect.js
  scripts/test-detect-checks.js
  scripts/smoke-*.js    # pruebas de humo en Electron (ver Testing)
  scripts/xclick.py / scripts/xtest-type.py / scripts/xwin.py   # ayuda XTEST para los smokes
  build/icon.png        # icono 1024x1024 (de checklist-cloud/assets)
  build/icon.ico        # icono Windows generado desde el png
  www/                  # copia generada (no se versiona, no se edita a mano)
  dist/                 # instaladores generados (no se versiona)
  docs/                 # solo capturas y logs de smoke (evidencia, no se versiona)
```

Notas:

- Los archivos `*.bak` de la raíz (`detect-2.3.x.js.bak`, `main-*.bak`,
  `preload-*.bak`) y de `tests/` son respaldos locales de versiones
  anteriores; no se versionan (`*.bak` en `.gitignore`).
- `homepage` en `package.json` es `https://checklist-soporte.web.app`
  (metadato que exige el `.deb`; no hay web pública del proyecto).
- La app corre como root en este sandbox: `main.js` añade `--no-sandbox`
  solo en ese caso, y siempre `--disable-dev-shm-usage`.
