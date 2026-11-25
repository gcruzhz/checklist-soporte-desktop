// afterPack de electron-builder: fija permisos legibles por cualquier
// usuario en el árbol empaquetado (dist/linux-unpacked).
//
// Los builds corren como root con umask restrictiva (0007/0027): sin
// esto app.asar sale 660 root:root y un usuario normal no puede abrir
// la app instalada (Electron: FILE_ERROR_ACCESS_DENIED al abrir el
// asar, la app se cierra con código 1 sin ventana). Las pruebas de
// humo en el sandbox pasaban porque todo corre como root.
//
// Corre después de crear el asar y antes de generar AppImage/deb/rpm,
// así que el arreglo llega a los tres instaladores. No quita bits
// setuid/setgid (chrome-sandbox los conserva) y no toca el contenido
// del asar, solo los modos en disco.
'use strict';
const fs = require('fs');
const path = require('path');

function fixTree(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      fs.chmodSync(p, (st.mode & 0o7000) | 0o755);
      fixTree(p);
    } else if (st.isFile()) {
      const exec = (st.mode & 0o111) !== 0;
      fs.chmodSync(p, (st.mode & 0o7000) | (exec ? 0o755 : 0o644));
    }
  }
}

async function afterPack(context) {
  const dir = context.appOutDir;
  const st = fs.statSync(dir);
  fs.chmodSync(dir, (st.mode & 0o7000) | 0o755);
  fixTree(dir);
  const asar = path.join(dir, 'resources', 'app.asar');
  if (!fs.existsSync(asar)) {
    throw new Error('[fix-permissions] app.asar no existe en ' + dir + ' al correr afterPack');
  }
  const m = fs.statSync(asar).mode & 0o777;
  console.log('[fix-permissions] app.asar mode: ' + m.toString(8) + ' (esperado 644)');
  if (m !== 0o644) {
    throw new Error('[fix-permissions] app.asar quedó con modo ' + m.toString(8) + ', no 644');
  }
  const sandbox = path.join(dir, 'chrome-sandbox');
  if (fs.existsSync(sandbox)) {
    console.log('[fix-permissions] chrome-sandbox mode: ' + (fs.statSync(sandbox).mode & 0o7777).toString(8));
  }
}

module.exports = afterPack;
module.exports.default = afterPack;
module.exports.afterPack = afterPack;
