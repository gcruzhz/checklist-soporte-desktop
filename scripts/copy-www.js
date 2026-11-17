// Copia www/ de checklist-cloud a ./www del proyecto de escritorio.
// El original NUNCA se modifica ni se mueve: solo se copia en cada
// build/arranque, así la app de escritorio siempre lleva la misma
// versión web que el teléfono (2.5.1, versionCode 55).
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..', '..', 'checklist-cloud', 'www');
const DST = path.resolve(__dirname, '..', 'www');

if (!fs.existsSync(SRC)) {
  console.error('[copy-www] no existe el origen: ' + SRC);
  process.exit(1);
}

fs.rmSync(DST, { recursive: true, force: true });
fs.cpSync(SRC, DST, { recursive: true });
console.log('[copy-www] copiado ' + SRC + ' -> ' + DST);
