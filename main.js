// Checklist de Soporte 2.4.0 — app de escritorio (Electron).
// Carga el mismo www/index.html de checklist-cloud (copiado a ./www
// por scripts/copy-www.js; el original nunca se modifica) y expone
// window.Desktop.detect() al renderer mediante el preload.
'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { detectMachine, detectChecks, getMachineId } = require('./detect');

const isSmoke = !!process.env.CHECKLIST_DESKTOP_SMOKE;

// En este entorno la app corre como root: Chromium se niega a arrancar
// sin --no-sandbox. Solo se añade en ese caso; en un PC normal no aplica.
if (typeof process.getuid === 'function' && process.getuid() === 0) {
  app.commandLine.appendSwitch('no-sandbox');
}
// /dev/shm pequeño en VMs: que Chromium use /tmp en vez de fallar.
app.commandLine.appendSwitch('disable-dev-shm-usage');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Checklist de Soporte',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Seguridad: la app web no debe abrir ventanas nuevas por su cuenta.
  // Los enlaces http(s) se abren en el navegador del sistema; el resto se deniega.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });

  // Descargas (respaldo de escritorio del "Abrir" de Excel): se guardan en
  // Descargas con su nombre, sin preguntar, para no bloquear el flujo.
  win.webContents.session.on('will-download', (event, item) => {
    const filename = item.getFilename() || 'checklist-descarga';
    const downloads = app.getPath('downloads');
    let savePath = path.join(downloads, filename);
    try {
      if (fs.existsSync(savePath)) {
        const ext = path.extname(filename);
        const base = path.basename(filename, ext);
        savePath = path.join(downloads, base + '-' + Date.now() + ext);
      }
    } catch (e) { /* se usa el nombre tal cual */ }
    item.setSavePath(savePath);
    item.once('done', (e, state) => {
      console.log('[Checklist Desktop] descarga ' + state + ': ' + savePath);
    });
  });

  win.webContents.on('render-process-gone', (event, details) => {
    console.error('[Checklist Desktop] el proceso del renderer terminó:', details.reason);
  });

  win.loadFile(path.join(__dirname, 'www', 'index.html'));

  if (isSmoke) {
    // Prueba de arranque (solo con CHECKLIST_DESKTOP_SMOKE=1): tras cargar,
    // comprueba que el login existe y es visible, que window.Desktop está
    // presente, toma una captura y cierra con código 0.
    win.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const info = await win.webContents.executeJavaScript(
            '(' +
              function () {
                var loginView = document.getElementById('loginView');
                var loginForm = document.getElementById('loginForm');
                return {
                  title: document.title,
                  hasDesktop: !!window.Desktop,
                  hasDesktopDetect: !!(window.Desktop && window.Desktop.detect),
                  hasCapacitor: !!window.Capacitor,
                  loginViewHidden: loginView ? loginView.hidden : null,
                  loginFormPresent: !!loginForm,
                  loginEmailPresent: !!document.getElementById('loginEmail'),
                  splashPresent: !!document.getElementById('splash'),
                  bodyTextStart: (document.body.innerText || '').slice(0, 120),
                };
              }.toString() +
              ')()',
            true
          );
          console.log('[Checklist Desktop] SMOKE ' + JSON.stringify(info));
          const shotPath = process.env.CHECKLIST_DESKTOP_SMOKE_SHOT || '/tmp/checklist-desktop-smoke.png';
          const image = await win.webContents.capturePage();
          fs.writeFileSync(shotPath, image.toPNG());
          console.log('[Checklist Desktop] SMOKE captura guardada en ' + shotPath);
          app.exit(0);
        } catch (e) {
          console.error('[Checklist Desktop] SMOKE falló:', e && e.message ? e.message : e);
          app.exit(2);
        }
      }, 8000);
    });
  }

  return win;
}

ipcMain.handle('desktop-detect', async () => {
  const machine = await detectMachine();
  const { checks, detalles, versiones, anydeskId, anydeskAlias } = await detectChecks({ serial: machine.serie });
  // Objeto plano: la app web hace Object.assign({}, info) y pasa todo a
  // Cloud.reportDetected, así que checks, detalles y versiones van como
  // propiedades junto a los campos del equipo (no como objeto anidado
  // aparte). discoTipo, ip e ipTipo ya vienen dentro de `machine` (nivel
  // superior, junto a cpu/ramGB/discoGB); discoTipo se repite explícito
  // aquí para dejar claro en el contrato que va al nivel superior.
  // anydeskId / anydeskAlias también van al nivel superior, junto a la
  // información de la máquina, solo cuando se determinaron (si AnyDesk
  // no está instalado o no se pudo leer el ID, no van).
  return {
    ...machine,
    checks,
    detalles,
    versiones,
    discoTipo: machine.discoTipo,
    ...(anydeskId ? { anydeskId } : {}),
    ...(anydeskAlias ? { anydeskAlias } : {}),
  };
});

// machineId determinista (2.3.3): el teléfono lo usa para el bloqueo del
// botón "Detectar este equipo" por máquina. Contrato exacto:
// window.Desktop.getMachineId() -> Promise<string>.
ipcMain.handle('desktop-get-machine-id', async () => getMachineId());

ipcMain.handle('desktop-open-external', async (event, url) => {
  const u = String(url || '');
  if (!/^https?:\/\//i.test(u)) throw new Error('URL no permitida');
  await shell.openExternal(u);
  return true;
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
