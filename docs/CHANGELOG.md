# Changelog — Checklist de Soporte (escritorio)

Cambios de la app de escritorio (Electron) por versión, 2.3.0 → 2.5.21.
La web que carga es la misma del repo cloud (`www/index.html`); los
cambios de la app en sí (checklist, renta, mantenimientos) están en el
`docs/CHANGELOG.md` del repo cloud. Fuentes: el historial registrado
del proyecto (memoria 2026-11-13 a 2026-11-17).


## 2.5.21 — 2026-11-26

- **Botón «🖨️ Imprimir» arreglado de raíz en el teléfono (Carta y
  Acuse)** (misma web del repo cloud): en Android/iOS nativo ya NO
  usa iframe + `window.print()` (el WebView lo ignora); guarda el PDF
  en CACHE con Filesystem y lo imprime con el plugin nuevo
  `@capgo/capacitor-printer` 8.1.11 (`Printer.printPdf`, diálogo de
  impresión del sistema), con fallback FileOpener → Share → toast. En
  escritorio (Electron) se conserva el iframe oculto + `window.print()`,
  que ahí sí funciona. La impresión en una impresora física real sigue
  pendiente de prueba por Gerardo.
- Humo nuevo `scripts/smoke-271-formatos.js` (patrón de la 2.5.20):
  versión 2.5.21, Acuse sin folio de extremo a extremo, Carta con
  folio 00001, Imprimir crea el iframe oculto y la llamada a print()
  se cuenta (1 en Acuse, 2 en Carta). **VEREDICTO OK.** Humo no-root
  (AppImage extraído, corrido como `nobody` con `APPDIR` explícito y
  el árbol en `/tmp`): proceso Electron + renderer vivos a los 20 s
  cargando `app.asar`, sin errores de acceso (el error `synapse is not
  defined` en consola es preexistente desde 2.4.0; los avisos dbus son
  del sandbox, sin bus). Nota de método: correr el AppRun extraído
  bajo `/home/hatch` como `nobody` NO prueba la app — `/home/hatch`
  es 2770 y `readlink -f` falla, así que el AppRun gira en bucle
  infinito sin lanzar el binario (eso era el "vivo 33 s" de la 2.5.20);
  hay que copiar el árbol a `/tmp` y pasar `APPDIR`.
- Versión 2.5.21. La web es la misma del repo cloud (bundle de
  Firebase md5 `c4fb1cce63c0d71ae96b1aee931ee740`, `www/index.html`
  md5 `0f748b69b4dbe2113e304efc9d340c41`).
  AppImage 123,363,053 B md5 `a0c04cfafb37794aefeb183f54cc276e`;
  .deb 97,151,652 B md5 `08f7d7a55e5fb3e9561c8e5c0067d35e`;
  .rpm 86,229,705 B md5 `190e33478841749b85e804cad1de3190`;
  Windows portable .exe 99,177,940 B md5
  `0da90d0ba960d2e20addc4420a172ebc` (NSIS portable, app.asar md5
  `baa33d23aacef3daf6e109d25ab492d5`, igual que en Linux) y su
  ZIP 99,172,650 B md5 `c13eb2f88abcd576d4994c7ee810d1f0`.
  app.asar 644 en los tres paquetes Linux (verificado en .deb,
  .rpm y AppImage extraído).



## 2.5.20 — 2026-11-26

- **Sin duplicados en «Cartas/Acuses guardados» + Acuse SIN folio +
  botón «🖨️ Imprimir»** (misma web del repo cloud): `dedupeDocs()`
  por id y por folio y guarda en curso que bloquea el doble toque;
  el Acuse ya no lleva folio en formulario, PDF, tarjeta ni textos
  (la Carta sí lo conserva en todos lados); Imprimir abre el PDF en
  un iframe oculto y llama a `print()` (diálogo del sistema).
- Humo nuevo `scripts/smoke-270-formatos.js` (patrón de la 2.5.19):
  versión 2.5.20, Acuse sin folio de extremo a extremo, Carta con
  folio 00001, Imprimir crea el iframe oculto y la llamada a print()
  se cuenta (1 en Acuse, 2 en Carta). **VEREDICTO OK.** Corrección
  del humo en esta versión: el primer intento se colgó en 5c porque
  el `print()` real abre el diálogo nativo de Electron y bloquea el
  renderer; ahora el humo stubbea el `print()` del iframe al
  crearlo (defecto del humo, no de la app). Humo no-root: AppImage
  extraído corrido como `nobody` se mantuvo vivo 33 s sin errores
  de acceso a app.asar (el error `synapse is not defined` en consola
  es preexistente desde 2.4.0).
- Versión 2.5.20. La web es la misma del repo cloud (bundle de
  Firebase md5 `c4fb1cce63c0d71ae96b1aee931ee740`, `www/index.html`
  md5 `d0ae3c865687cd54bc33cd62410ebf31`).
  AppImage 123,362,968 B md5 `bab27815ce68af02beba344e55dce80e`;
  .deb 97,158,716 B md5 `45ac0511c8d10261eface4e3625d45c0`;
  .rpm 86,226,153 B md5 `254e0eee30374ae9a7e71a553adc2639`;
  Windows portable .exe 99,177,929 B md5
  `367e3ad518206ab99274ed21281bf1bd` (NSIS portable, app.asar md5
  `54722be8af69d643769b8cabb986ea7f`, igual que en Linux) y su
  ZIP 99,173,499 B md5 `ac3e0f7b8f8706a9f572001f4e1c0ba8`.
  app.asar 644 en los tres paquetes Linux (verificado en .deb,
  .rpm y AppImage extraído).

## 2.5.19 — 2026-11-25

- **PDF de la Carta con Área y Jefe Directo en cajas separadas**
  (misma web del repo cloud): antes iban juntos en una sola celda
  «Área: Jefe Directo:» con el valor unido; ahora son DOS cajas
  apiladas con borde, cada una con su etiqueta y su valor («Área:
  Sistemas», «Jefe Directo: María García»), como las demás del
  formato FO-SI-10.
- **Aviso de guardado según la causa real + respaldo local con
  reintento:** si la nube falla, la carta/acuse queda guardada en el
  teléfono marcada «⏳ Pendiente de sincronizar», con botón
  «🔄 Reintentar» y reintento automático al abrir la vista; el
  mensaje dice si faltan las reglas, si no hay conexión o el código
  del error. En modo local (sin nube) el guardado no marca pendiente.
- **Barra superior solo con Inicio y Equipo:** las pestañas del medio
  ya no existen; Usuarios (solo admin) se abre desde el botón
  «👥 Usuarios» de la barra de sesión.
- Humo nuevo `scripts/smoke-269-formatos.js` (patrón de la 2.5.18):
  versión 2.5.19, barra solo Inicio/Equipo con botón Usuarios oculto
  en modo local, PDF de la Carta con dos rectángulos 410/166/22
  (Área y Jefe Directo separados, sin «Área: Jefe Directo:» ni
  «Sistemas - María García»), `mensajeErrorNube` con las 3 causas y
  marcas de pendiente/reintento en el código. **VEREDICTO OK.**
  Humo no-root: AppImage extraído corrido como `nobody` se mantuvo
  vivo 30 s sin errores de acceso a app.asar.
- Versión 2.5.19. La web es la misma del repo cloud (bundle de
  Firebase md5 `9d4f0a81f3108d0f92f50f08fc48c752`, `www/index.html`
  md5 `97917c56481ed4a7d913505195a5ac0a`).
  AppImage 123,363,092 B md5 `664ec5573f74f1acb5737d4ac7976254`;
  .deb 97,156,812 B md5 `e35981cc3649cdf52ac7ba66df752175`;
  .rpm 86,220,697 B md5 `8e082ca0cc836929ff84eb4deb6755b3`;
  Windows portable .exe 99,175,886 B md5
  `b62f177679407a72730cd2025240103f` (NSIS portable, app.asar
  md5 `3cb435c866099427189cd331654a2c8b`, igual que en Linux) y su
  ZIP 99,168,580 B md5 `6d683fbd1513e0e86fd461a6ec3ca733`.
  app.asar 644 en los tres paquetes Linux (verificado en .deb,
  .rpm y AppImage extraído).

## 2.5.18 — 2026-11-25

- **PDF de la Carta con cajas con borde visible y folio al abrir**
  (misma web del repo cloud): campos del solicitante en celdas con
  borde (Nombre, Número, Sucursal, Puesto; Ip de Red; «Área: Jefe
  Directo»; Observaciones de ancho completo), tabla «Exclusivo de
  Sistemas» verde #9BBB59 verificada contra la imagen de
  referencia; Acuse con folio nuevo arriba a la derecha (secuencia
  `config/foliosAcuse`, independiente de la de cartas) y Carta con
  folio asignado al abrir. Comparación visual del PDF generado
  contra la imagen de referencia: coincide.
- Humo nuevo `scripts/smoke-268-formatos.js`: folio al abrir en
  ambas formas (Acuse 00001 → Limpiar 00002; Carta 00001 → Limpiar
  00002), guardado con folio, PDF con FOLIO y con las cajas con
  borde, WhatsApp/correo con folio. **VEREDICTO OK.** Corrección
  del humo heredada de 267: al limpiar la Carta la fecha no se
  resetea (el prefill solo llena si está vacía), así que el humo
  ahora espera la fecha fijada en el paso 10 y no la de hoy.
  Humo no-root: AppImage extraído corrido como `nobody` se mantuvo
  vivo 25 s sin errores de acceso a app.asar.
- Versión 2.5.18. La web es la misma del repo cloud (bundle de
  Firebase md5 `9d4f0a81f3108d0f92f50f08fc48c752`).
  AppImage 123,359,213 B md5 `a749e12ce6ae6148b932aee0f79aa8b2`;
  .deb 97,156,580 B md5 `36159c6f629a05f0b98b5f30f97a9485`;
  .rpm 86,211,841 B md5 `f856d7e5f47353e060ba2ffdc5fa8b78`;
  Windows portable .exe 99,177,953 B md5
  `91ace2523772dd5d693c7e793a091062` (NSIS portable, app.asar
  md5 `3e16562e24dcb5dff5ee5b89db9221f7`, igual que en Linux) y su
  ZIP 99,170,416 B md5 `95c2b1c1b16cc18152f459f661fcfb3f`.
  app.asar 644 en los tres paquetes Linux (verificado en .deb,
  .rpm y AppImage extraído).

## 2.5.17 — 2026-11-25

- **PDF del Acuse Sistemas corregido para verse IGUAL que el formato
  real** (misma web del repo cloud): logo Lapi real arriba a la
  izquierda, título «ACUSE DE RECIBO» en rectángulo gris claro,
  línea naranja de 2.5 pt, fecha en español largo («30 de Octubre de
  2026»), PARA / DE en negrita cursiva 24 pt con valores desde ~28%
  del ancho, ANEXO con valor negrita cursiva subrayado y tabla
  RECIBE gris con 3 filas altas para llenar a mano. Comparación
  visual del PDF generado contra la captura del formato real:
  coincide. **Carta Responsiva re-verificada y corregida:** logo en
  imagen, tabla Código con rejilla y negritas, encabezado «Exclusivo
  de Sistemas» en verde #9BBB59 y campo nuevo «Área»; PDF de 2
  páginas carta verificado contra el docx original.
- Humo nuevo `scripts/smoke-267-formatos.js` (patrón de la 2.5.16):
  versión 2.5.17, fecha en español largo, logo Lapi, título y tabla
  RECIBE en el PDF del Acuse; verde y Área en la Carta.
- Versión 2.5.17. La web es la misma del repo cloud (bundle de
  Firebase sin cambio, md5 `d8ad9d102d13ef69925d7bdab65b9e33`).

## 2.5.16 — 2026-11-25

- **Dos formularios nuevos con PDF: «Acuse Sistemas» y «Carta
  Responsiva» (FO-SI-10).** Dos botones en Inicio («📄 Acuse
  Sistemas», «📑 Carta Responsiva») y dos vistas nuevas (`viewAcuse`,
  `viewCarta`) con formulario + lista de guardados (PDF / WhatsApp /
  Correo / Eliminar + reabrir tocando la tarjeta). Acuse: Fecha (hoy
  por defecto), Para*, De*, Anexo opcional; empieza vacío; PDF de 1
  página carta con la fecha en formato largo («Septiembre 01, 2026»),
  tabla PARA / DE / ANEXO y bloque RECIBE para llenar a mano. Carta:
  Fecha de solicitud, folio (solo lectura, «Se asigna al guardar»),
  Nombre del colaborador*, Número de colaborador, Sucursal, Puesto,
  Jefe Directo, Ip de Red y Observaciones, más tabla de equipo con
  filas que se agregan/quitan (Modelo, Marca, Número de serie,
  Concepto); folio de 5 dígitos asignado al guardar (en local,
  contador en localStorage desde 00001); PDF de 2 páginas carta como
  el original (encabezado FO-SI-10, DATOS DEL SOLICITANTE, tabla
  «Exclusivo de Sistemas», NOMBRE Y FIRMA DEL USUARIO y las
  RESPONSABILIDADES VERBATIM en la p2). Sin nube los guardados van a
  localStorage; con nube a Firestore (`acuses`, `cartas`,
  `config/foliosCarta`). ⚠️ Las reglas nuevas de Firestore NO se
  publicaron por CLI desde el sandbox (firebaserules.googleapis.com
  inalcanzable): hay que pegarlas en la consola de Firebase antes de
  que los acuses/cartas se puedan guardar en la nube (sin eso darán
  permiso denegado).
- Tests del teléfono 926 true / 0 false (903 de 2.5.15 + 23 nuevas de
  la serie 266); detector sin cambios; smoke-266 VEREDICTO OK como
  root y como `nobody` (clics reales: Inicio con los 2 botones nuevos
  y versión 2.5.16; acuse vacío por defecto, validación de Para/De,
  guardar con fecha «Septiembre 01, 2026», PDF con PARA/DE/ANEXO/
  RECIBE, WhatsApp, correo con asunto «Acuse Sistemas — Checklist de
  Soporte», reabrir, limpiar, eliminar con confirmación; carta con
  folio «Se asigna al guardar», validación, 2 filas de equipo
  (agregar/quitar), guardar con folio 00001, PDF FO-SI-10 de 2
  páginas con encabezado, folio, equipos y responsabilidades
  VERBATIM, WhatsApp, correo con asunto «Carta Responsiva folio
  00001 — Checklist de Soporte», reabrir con las 2 filas, limpiar,
  eliminar; cero errores JS nuevos). Capturas en
  `docs/smoke266-*.png`.
- **Permisos: el primer build salió con archivos 660/640 fuera del
  asar** (`.desktop` 640 en AppImage, `apparmor-profile` y
  `package-type` 660 en .deb/.rpm, directorios 770 en AppImage):
  `fix-permissions.js` solo cubre `linux-unpacked` y esos archivos
  los crean los targets DESPUÉS del hook, con la umask 0007 del
  shell. Se reconstruyó todo con `umask 022` y quedó limpio — de
  ahora en adelante los builds Linux/Windows se corren con
  `umask 022` (lección en `~/AGENTS.md`).
- AppImage 123 326 252 B, md5 `3ee491f2cd4886f3e214bdafd498c0d7`;
  .deb 97 128 012 B, md5 `e5a17ca49c25050e8b5c69e02b55942c`;
  .rpm 86 201 489 B, md5 `e4f95402520eb230897bc5287463a5f4`;
  portable `.exe` 99 153 469 B, md5 `9111233e898e14d4dbcdad1e8050bddb`
  en ZIP 99 149 133 B, md5 `3026cd56aba3099e5cab59e7faaf49b4`;
  app.asar md5 `ee17b7dd43dd0ab017840b3cdd996815` en AppImage, .deb,
  .rpm y portable (verificado por extracción en los 4; bundle nuevo
  `d8ad9d10…`, 508 719 B, dentro, `www/index.html` md5
  `91f9aa7b287cbccd1af6e42ba65ed545`, igual que en la APK).
  Permisos verificados: app.asar 644 y cero archivos 660/640 y
  directorios 755 en los 3 de Linux.

## 2.5.15 — 2026-11-19

- **Vista «Responsiva»: «Enviar formulario en blanco» al número de
  WhatsApp configurado.** Misma web que el teléfono 2.5.15 (bundle
  Firebase SIN cambio `f9c4918d…`, 506 932 B). El botón lee el número
  del campo `#fResp-wa` al pulsar: con número válido abre
  `wa.me/<número>?text=` con la invitación y el enlace; vacío o
  inválido abre `wa.me/?text=` para elegir contacto con el aviso.
  El envío directo del técnico y el flujo de archivar/ver anteriores
  siguen intactos.
- Tests del teléfono 903 true / 0 false (896 de 2.5.14 + 7 nuevas de
  la serie 265); detector tests 473/0; smoke-265 VEREDICTO OK
  (clics reales: con número wa.me/525512345678 con invitación y
  enlace; sin número el chooser con el toast; el resto del flujo de
  Responsiva — pendiente, llenada, WhatsApp, correo, Excel, archivar,
  ver anteriores — sigue igual).
- AppImage 123 321 923 B, md5 `c524e48982007f6d4d6f0d19252faced`;
  .deb 97 113 268 B, md5 `94ae9e7842738d018646be10adeacfa0`;
  portable `.exe` 99 144 904 B, md5 `1c058fc1a9e26e3f0c67b740e4d87e2f`
  en ZIP 99 145 064 B, md5 `1b2122d89d1fe4f817dbd43669bf05f5`;
  app.asar md5 `32eaa9babdb27d1c4241ed7f636b8a14` en AppImage, .deb y
  portable (bundle sin cambio `f9c4918d…` dentro, `www/index.html` md5
  `db7493b921db8d49d2e60e0bf87319c7`, igual que en la APK).

## 2.5.14 — 2026-11-19

- **Vista «Responsiva»: texto de invitación, Archivar y «Ver
  responsivas anteriores».** Misma web que el teléfono 2.5.14 (bundle
  Firebase nuevo `f9c4918d…`, 506 932 B). El texto «Por favor llena
  tus datos para crear tu responsiva» aparece en la vista, en el
  mensaje de WhatsApp del enlace en blanco (antes del enlace) y en
  `responsiva.html`; cada tarjeta de «Responsivas enviadas» trae
  «📥 Archivar» (con confirmación; archivar no borra) y el botón
  «📂 Ver responsivas anteriores» muestra las archivadas con su botón
  «↩️ Restaurar». El formulario directo del técnico sigue intacto.
- Tests del teléfono 896 true / 0 false (876 de 2.5.13 + 20 nuevas de
  la serie 264); detector tests 473/0; smoke-264 VEREDICTO OK
  (texto de invitación en vista y en el wa.me del enlace en blanco;
  pendiente y llenada con Archivar; archivar con confirmación sale de
  la principal y entra en archivadas; ver anteriores muestra la
  tarjeta con «Archivada» y Restaurar; restaurar la devuelve; sin
  archivadas el mensaje vacío; WhatsApp con los 6 datos; correo con
  asunto «Responsiva: Juan Pérez López»; Excel con el nombre
  `responsiva-juan-p-rez-l-pez.xlsx`).
- AppImage 123 321 815 B, md5 `83d51d1bbe2cc9d1e400909bdbd6f0ae`;
  .deb 97 114 304 B, md5 `52107b4bc5cbe467f1ed500e34ffc8c3`;
  portable `.exe` 99 146 226 B, md5 `6e1292eefd3f16a4ecfd25897db5e902`
  en ZIP 99 140 535 B, md5 `41563e1570e5bbd970d0f20fd7c56c7b`;
  app.asar md5 `6aa7ff493320be9ea9fb1662cc684fe4` en AppImage, .deb y
  portable (bundle nuevo `f9c4918d…` dentro, `www/index.html` md5
  `e64acbbba466759205431be5f47c63b9`, igual que en la APK).

## 2.5.13 — 2026-11-19

- **Vista «Responsiva»: enviar el formulario en blanco por WhatsApp
  y lista «Responsivas enviadas» en vivo.** Misma web que el teléfono
  2.5.13 (bundle Firebase nuevo `de3d2dce…`, 506 783 B). El botón
  «📤 Enviar formulario en blanco» crea la responsiva y abre
  `wa.me/?text=` con el enlace `responsiva.html?id=…` para elegir
  contacto; la lista muestra pendientes («🔗 Copiar enlace») y
  llenadas con los 6 datos y los botones de WhatsApp, correo y
  «💾 Guardar en Excel». El formulario directo del técnico sigue
  intacto.
- Tests del teléfono 876 true / 0 false; smoke-263 VEREDICTO OK
  (envío en blanco con wa.me y el enlace; pendiente con Copiar
  enlace; llenada con los 6 datos y los 3 botones; WhatsApp con los
  6 datos; correo con asunto «Responsiva: Juan Pérez López»; Excel
  con el nombre `responsiva-juan-p-rez-l-pez.xlsx`).
- AppImage 123 322 249 B, md5 `5d0dfc7347d401ab3f6005b2e5f56cf7`;
  .deb 97 111 996 B, md5 `308d82332ce9a335b71571229b59ba44`;
  portable `.exe` 99 141 847 B, md5 `cc68d54f3d1abd7e54236581448e55e4`
  en ZIP 99 135 942 B, md5 `54e317e68a335725864fbc197be11ae8`;
  app.asar md5 `f5a9b548adeb0c77bc294ee53b7e204b` en AppImage, .deb y
  portable (bundle nuevo `de3d2dce…` dentro).

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
