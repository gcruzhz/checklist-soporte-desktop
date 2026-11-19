# Changelog — Checklist de Soporte (escritorio)

Cambios de la app de escritorio (Electron) por versión, 2.3.0 → 2.5.12.
La web que carga es la misma del repo cloud (`www/index.html`); los
cambios de la app en sí (checklist, renta, mantenimientos) están en el
`docs/CHANGELOG.md` del repo cloud. Fuentes: el historial registrado
del proyecto (memoria 2026-11-13 a 2026-11-17).


## 2.5.12 — 2026-11-19

- **Vista «Responsiva»: botón «💾 Guardar y cerrar» con borrador
  local.** Guarda los 6 campos en localStorage
  (`checklist-soporte-resp-borrador-v1`) aunque el formulario esté
  incompleto y vuelve a Inicio; al abrir Responsiva el borrador se
  restaura. Al enviar por WhatsApp el borrador se borra y el
  formulario queda vacío para la próxima; «Limpiar» también borra el
  borrador. El número de WhatsApp guardado sigue en su propia clave
  y no se toca al guardar el borrador. Misma web que el teléfono
  2.5.12 (bundle Firebase `57fa245b…` sin cambios).
- Tests del teléfono 861 true / 0 false; smoke-262 VEREDICTO OK
  (guardado a medias y restauración al reabrir; envío wa.me con el
  número normalizado con 52 y los 6 datos y la fecha; tras enviar el
  formulario queda vacío y el borrador borrado; Limpiar borra el
  borrador; el número se conserva en los tres casos).
- AppImage 123 318 014 B, md5 `672a0a9c6557cfcf91321a16a0a3aa98`;
  .deb 97 111 436 B, md5 `dc5dd024286085cd7433b3c99593c2cf`;
  portable `.exe` 99 143 033 B, md5 `6a8a50a865af2442b5e1de8d6034ca90`
  en ZIP 99 143 193 B, md5 `ae385f79eb2441413fe7375b6579a2a8`;
  app.asar md5 `b4a34621103d58c77641a72a1b181f9d` en AppImage y portable.

## 2.5.11 — 2026-11-19

- **Vista «Responsiva» en la web compartida.** Quinto botón
  «📋 Responsiva» en el selector de Inicio: formulario con Nombre
  Completo, Número de colaborador, Sucursal, Puesto, Jefe Directo y
  Área que se envía por WhatsApp al número configurado (guardado solo
  en el teléfono, en localStorage); sin número abre `wa.me/?text=`
  para elegir el contacto. El envío no guarda nada en la nube. Misma
  web que el teléfono 2.5.11 (bundle Firebase `57fa245b…` sin cambios).
- Tests del detector 473 pasaron / 0 fallaron; smoke-261 VEREDICTO OK
  (wa.me con el número normalizado con 52 y el texto con los 6 datos
  y la fecha; Limpiar conserva el número; sin número abre wa.me/?text=
  y avisa).
- Solo código, tests, smoke y docs en este cambio: los instaladores de
  escritorio 2.5.11 se construyen aparte.

## 2.5.10 — 2026-11-17

- **Compartir un equipo detectado: WhatsApp recortado hasta Impresora,
  correo completo.** El botón «📲 Compartir por WhatsApp» manda el
  texto corto (hasta «Impresora: ...»); «✉️ Compartir por correo»
  sigue mandando el texto completo con políticas, usuario sistemas y
  fecha/quién detectó. Implementado con `detShareText(d, corto)` en la
  web compartida; el panel en pantalla no cambió. Misma web que el
  teléfono 2.5.10 (bundle Firebase `57fa245b…` sin cambios).
- Tests del detector 473 pasaron / 0 fallaron; smoke-260 VEREDICTO OK
  (WhatsApp termina en Impresora, correo con Políticas).
- AppImage 123 313 662 B, md5 `b4687af2358e393c2d86d46562fb46bf`;
  .deb 97 110 312 B, md5 `154d14511a3090e3d781c259a72eb641`;
  portable `.exe` 99 140 236 B, md5 `b59701f8ee2e3f2ab529033ca277e63f`
  en ZIP 99 140 396 B, md5 `8597a02a00ddd5c9e3c3f8f56144592f`;
  app.asar md5 `6c4e9e270c042864102d7e09909d371a` en AppImage y portable.

## 2.5.9 — 2026-11-17

- **Compartir un equipo detectado por WhatsApp y por correo**: cada
  tarjeta de «Equipos detectados» (Por preparar y Mantenimientos) trae
  «📲 Compartir por WhatsApp» (`wa.me/?text=`, sin número fijo) y «✉️
  Compartir por correo» (`mailto:`, asunto «Equipo detectado:
  \<hostname o modelo\>»). El texto reúne las características
  detectadas (hardware, redes, AnyDesk, versiones, políticas,
  impresora, fecha y quién detectó); los campos vacíos se omiten.
  Compartir no marca el equipo como usado ni llama a la nube.
- En escritorio el wa.me lo abre el navegador del sistema: `main.js`
  ya intercepta `window.open` a http(s) con `setWindowOpenHandler`
  (el wrapper de `window.open` del preload corre en su mundo aislado y
  no afecta a la página; el mecanismo real es el handler de `main.js`).
- Misma web que el teléfono 2.5.9 (bundle Firebase `57fa245b…` sin
  cambios).
- Tests del detector 473 pasaron / 0 fallaron; smoke-259 VEREDICTO OK.
- AppImage 123 314 065 B, md5 `e0077f2fb7afc3ed199312b749efbc9f`;
  .deb 97 110 760 B, md5 `40b3d87107c169deaf1427c5d777f477`;
  portable `.exe` 99 125 738 B, md5 `0110d6f474ee16059b67b8ea1f2eb701`
  en ZIP 99 125 896 B, md5 `c8128ac383740027937a5d3e0dfc732c`;
  app.asar md5 `e5125ec60296a3fa413fced8de277533` (igual en AppImage y
  portable).

## 2.5.8 — 2026-11-17

- **Actualizaciones de Windows**: nuevo botón en Por preparar (solo
  escritorio). IPC nuevo en `preload.js` / `main.js`:
  `buscarActualizaciones` (WUA `CreateUpdateSearcher`, sin
  elevación, timeout 15 min) e `instalarActualizaciones` (WUA
  `CreateUpdateInstaller` + `Install()`, conteo por `ResultCode 2`,
  timeout 120 min; con elevación directo, sin ella un `.ps1`
  temporal con UAC cuya salida se captura por archivo temporal y se
  borra al terminar). `runPowerShellLong` (timeout configurable) y
  `runElevatedPsFileOutput` nuevos en `detect.js`. La app nunca
  reinicia sola: solo avisa si `RebootRequired`.
- Misma web que el teléfono 2.5.8 (bundle Firebase `57fa245b…` sin
  cambios).
- Tests del detector 473 pasaron / 0 fallaron; smoke-258 VEREDICTO OK.
- AppImage 123 314 078 B, md5 `ceadd3e11d62b1a717832955d2cd2612`;
  .deb 97 109 416 B, md5 `d5c218ac730cc80ade849fc0e62bc0d1`;
  portable `.exe` 99 128 241 B, md5
  `3100de41b83d34263d052ded99e06de0`, en ZIP
  (`Checklist de Soporte 2.5.8.zip`, 99 128 399 B, md5
  `b6233fe3314f093c3fd768f5ed5f9b6b`). `app.asar` md5
  `79b4ce0a1b7d0cac5764a013e96a2158` (igual en AppImage y portable).

## 2.5.7 — 2026-11-17

- **Contraseña del usuario local Windows «sistemas»**: nuevo botón en
  Por preparar (solo escritorio). IPC nuevo en `preload.js` /
  `main.js`: `verificarPasswordSistemas` (PowerShell
  `ValidateCredentials`) y `cambiarPasswordSistemas`
  (`Set-LocalUser`; con elevación directo, sin ella un `.ps1`
  temporal con UAC que se borra al terminar). Escape PowerShell de
  comillas simples (se duplican) en usuario y contraseñas; la
  contraseña nunca se imprime en stdout/stderr/logs.
- Misma web que el teléfono 2.5.7 (`index.html` md5
  `470df09b8cbb8d0eda96a7bffaf5862b`, bundle Firebase `57fa245b…`).
- Tests del detector 440 pasaron / 0 fallaron; smoke-257 VEREDICTO OK.
- AppImage 123 309 644 B, md5 `a739797c5861e9a6e7cdc02acd69e563`;
  .deb 97 103 784 B, md5 `dd7d7d5ac110522a91fb591feb2f4688`;
  portable `.exe` 99 127 084 B, md5
  `16e409dca0f5000bb7a60d603d4ae717`, en ZIP
  (`Checklist de Soporte 2.5.7.zip`, 99 127 242 B, md5
  `91784c2b59273361add7b8a95eb071f3`). `app.asar` md5
  `c5dcbca71d20a6ed689e801db24eda6d` (igual en AppImage y portable).

## 2.5.6 — 2026-11-17

- Misma web que el teléfono 2.5.6 (`index.html` md5
  `d8ee4bc00e5e4ae547c5420161950e34`, bundle Firebase `57fa245b…`).
  El PDF de mantenimiento quedó en 1 página carta, sin datos
  duplicados y sin hora en la conformidad.
- AppImage 123 301 227 B, md5 `7b929edecf4a3667ac2a73ca57d0a6cc`;
  .deb 97 100 832 B, md5 `f72b23bddf4727fec55044074b60298d`;
  portable `.exe` 99 121 814 B, md5
  `62287f8a2310832a2172f523c3e3731c`, en ZIP
  (`Checklist de Soporte 2.5.6.zip`, md5
  `68690cdd274123fa678cc5077ce3a7c9`). `app.asar` md5
  `1696fa00ac6d6f38cfab925ad808a001` (igual en AppImage y portable).

## 2.5.5 — 2026-11-17

- **Detector: políticas desde gpedit.msc**: lee `Registry.pol`
  (binario PReg, Machine + User) para inactividad y salvapantallas, y
  `secedit /export` para cuentas (con fallback a `net accounts` si
  secedit falla; necesita admin). Cada valor lleva su fuente.
- AppImage 123 301 548 B, md5 `21ff7e6c1d643d54475a2c6bf977c040`;
  .deb 97 100 568 B, md5 `3a037abd79070b499d8d2c8ade5793ab`;
  portable `.exe` 99 122 080 B, md5
  `82319e781eb145999aa8bf3645abc705`. `app.asar` md5
  `0aa5c03c58ffe8456d3b745cb65ae236`.
- El portable de Windows se entrega también en ZIP (preferencia de
  Gerardo desde esta versión).

## 2.5.4 — 2026-11-17

- **Lección del bundle**: la primera compilación de escritorio de
  2.5.4 llevó el bundle Firebase viejo (sin `setMantBloqueado`) y se
  tuvo que reconstruir. Orden correcto desde entonces: parchear
  `firebase.js` → `pnpm build:cloud` (esbuild) → `npx cap sync` →
  compilar; verificar siempre el md5 del bundle en APK y escritorio.
- AppImage 123 297 676 B, md5 `7091d3b943352c99d6f956e21aa89920`;
  .deb 97 095 432 B, md5 `71b27f172912855c6b6682935020a1bf`;
  portable `.exe` 99 117 405 B, md5
  `63f73eaff7769c479b62640a649ec78a`. `app.asar` md5
  `f303ebc08eff88d084b338aca62da686` (bundle `57fa245b…` dentro).

## 2.5.3 — 2026-11-16

- **Primer portable `.exe` único de Windows** (99 113 373 B, md5
  `567e8ab7a0859f8161a458d94b082c4a`): `electron-builder --win
  portable` genera un solo .exe autoextraíble (NSIS SFX con un 7z
  dentro); no necesita Wine ni makensis, a diferencia del instalador
  NSIS, que sigue roto. Al abrirlo se descomprime a una carpeta
  temporal y corre; la primera vez tarda más.
- AppImage 123 293 462 B, md5 `2187a33dc09d4e81443cb18fa2c5d8a6`;
  .deb 97 090 744 B, md5 `d4c05aa780e2913cf394c39be60755ae`;
  ZIP Windows md5 `511647e16c0a0f3c4ad81b810fcbc586` (77 entradas,
  exe 210 165 248 B). `app.asar` md5
  `570a2a39c2e6c2d15f6ed1a1e2e05b70` (igual en Linux y Windows).
- Pendiente de probar: correr el portable en una PC real con Windows.

## 2.5.2 — 2026-11-16

- Botón **«Detectar equipo» en Mantenimientos** (solo escritorio):
  abre solo el panel de equipos detectados; el botón por equipo pasa a
  «Dar mantenimiento a este equipo» y abre el formulario prellenado.
- AppImage 123 293 358 B, md5 `4624f291982ccef8293dbd39033846ad`;
  .deb 97 090 676 B, md5 `c5097462d25f21caf9d57c43bbe3ede4`;
  ZIP Windows 143 165 338 B, md5
  `73df35ee07a63ed0e2a4e7da7f313df9`. `app.asar` md5
  `777082583d85ff5bede1e73f5d8a096b`.

## 2.5.1 — 2026-11-16

- 13 cambios de Mantenimientos en la web (empresa, tipos por defecto,
  diagonales, título+año, firmas en Liberación, admin borra órdenes,
  botón Cerrar en `firma.html`, conformidad al final a la derecha).
- AppImage 123 293 419 B; .deb 97 090 488 B, md5
  `abc37938b751b9e871ad1ee326309e56`; ZIP Windows 143 164 657 B,
  md5 `65123479326ed3d7a65408d40349bb5e`. `app.asar` md5
  `42d4c414e01784e34a932fa7c8987eb8`.
- El «Checklist de Soporte Setup 2.5.1.exe» de 242 KB es el instalador
  NSIS ROTO: nunca compartirlo ni ejecutarlo.

## 2.5.0 — 2026-11-16

- **Mantenimientos Preventivos** en escritorio: el detector reporta
  políticas (`net accounts` + registro), si existe la cuenta/perfil
  Windows «sistemas» y el primer nombre real de impresora.
- AppImage 123 289 414 B, md5 `9d5aed6095c3e87536003a92acbb90db`;
  .deb 97 087 372 B, md5 `daadd05eae389fe7e4575eab4762b3af`;
  ZIP Windows 143 161 170 B, md5
  `d31f8a070377a7ee40e1ca3ee0ba7956` (exe 210 165 248 B).
  `app.asar` md5 `1116e84df55d2b0bd2d01222479675d2`.
- Reglas de Firestore para `mantenimientos` + `config/folios`
  publicadas; `firma.html` desplegado en Hosting.

## 2.4.0 — 2026-11-15

- **Cero diálogos nativos** en toda la app (71 alert → toast, 11
  confirm → modal, 1 prompt → modal); el bug del teclado que moría
  tras «Usar este equipo» se ataca con esto. Línea de diagnóstico de
  foco en Acerca de.
- AppImage 123 264 440 B, md5 `7ae3b2c375e7d5ee7200032db093c2d6`;
  .deb 97 079 904 B, md5 `0e4184e1bd718887053108180d55f6bb`;
  ZIP Windows 143 139 468 B, md5
  `db631a1a313ae63eb93e2a4c68cff603`.
- Pendiente: la prueba de aceptación en una PC real.

## 2.3.9 — 2026-11-15

- Botón «💾 Guardar avance» en las tarjetas propias.
- AppImage md5 `3099a67f04dea5f704b916c8a13a7cf6`; .deb md5
  `a561c3491e75e8bad4ecc3c186bb65a2`; ZIP Windows 143 138 629 B,
  md5 `80b366d0ce64e474a7f7bf28d553d783`.

## 2.3.8 — 2026-11-15

- Detector: Windows 11 por número de build, RAM por módulos
  instalados (`memLayout`), ambas instancias de ESET (Endpoint +
  Management Agent, versión en `versiones.esetAgent`).
- AppImage 123 260 730 B, md5 `d10c806195572b50da43c1ee8c7a365b`;
  .deb 97 068 464 B, md5 `e8552df2127d9dc3da85ed7bbba95422`;
  ZIP Windows 143 138 764 B, md5
  `1e27182465e5fb4ab353c1ae5c961b59`.

## 2.3.7 — 2026-11-14

- Permisos por analista (equipos propios vs. ajenos de solo lectura);
  pestañas Nuevo / Reasignado / Devuelto.

## 2.3.6 — 2026-11-14

- Detector: nombre del SO endurecido, redes con IP por adaptador.
  N/A y quitar por punto; Compartir avance y No listo; entrega con
  < 100 % con panel de Reabrir.

## 2.3.5 — 2026-11-14

- Atajos de escritorio rehechos (registro User Shell Folders, glob
  `OneDrive*`, Escritorio público, Menú Inicio; exclusión `/print/i`).

## 2.3.4 — 2026-11-14

- RAM en GiB corregida; resolver de nombre del SO de Windows.

## 2.3.3 — 2026-11-14

- `machineId` como id del documento en `detectados`; cada detección
  pone `usado=false`; bloqueo por máquina; versión del Agente ESET.

## 2.3.2 — 2026-11-14

- Detector corregido (Invgate, Adobe Acrobat, Alfaweb, atajos hcweb
  y gabinete; versiones de SO/antivirus/Chrome; hardware, IP y
  AnyDesk). **El .exe de escritorio pide login cada vez que se abre**,
  sin sesión recordada ni huella en escritorio.

## 2.3.1 — 2026-11-13

- El detector llena el checklist (`detectChecks()`).

## 2.3.0 — 2026-11-13

- Primera versión de escritorio con detector: lee las características
  reales del equipo (hardware, SO, software, red, AnyDesk) y las manda
  a la nube (colección `detectados`); el teléfono muestra el panel
  «Equipos detectados».
- Windows entregado como ZIP (77 entradas, exe 210 MB). El instalador
  NSIS no funciona (Wine no corre el stub); Mac y iPhone pendientes
  porque necesitan una Mac.
- **Bloqueador resuelto**: electron-builder 26 descarga siempre
  `SHASUMS256.txt` para validar el zip de Electron aunque esté en
  caché, y esa descarga muere por el proxy del sandbox. Con
  `"electronDownload": {"isVerifyChecksum": false}` en `package.json`
  el build no descarga nada (Electron, appimagetool y fpm ya están en
  caché). No quitar esa línea.
