// Preload de Checklist de Soporte 2.4.0 (Electron).
// Expone window.Desktop a la app web (www/index.html) sin darle acceso a
// Node: contextBridge + ipcRenderer. La app web ya sabe usarlo:
//  - btnDetectar llama a window.Desktop.detect()
//  - btnDetectar solo se muestra si window.Desktop existe
// Además deja respaldos de escritorio para los plugins Capacitor, que no
// existen en Electron (la app web ya trae sus propios respaldos web;
// estos parches solo hacen que esos respaldos funcionen bien aquí):
//  - window.open('blob:...') (respaldo de "Abrir" Excel) -> descarga del
//    archivo en vez de abrir una ventana en blanco.
//  - window.open('https://wa.me/...') (respaldo de WhatsApp) -> se abre
//    en el navegador del sistema.
//  - navigator.share no existe en Electron: la app web ya cae a wa.me.
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('Desktop', {
  isDesktop: true,
  platform: process.platform,
  detect: () => ipcRenderer.invoke('desktop-detect'),
  // machineId determinista (2.3.3) -> Promise<string>. Lo usa el teléfono
  // para el bloqueo del botón "Detectar este equipo" por máquina.
  getMachineId: () => ipcRenderer.invoke('desktop-get-machine-id'),
  openExternal: (url) => ipcRenderer.invoke('desktop-open-external', url),
});

// Parche de window.open: corre antes que los scripts de la página.
const originalOpen = window.open.bind(window);
window.open = function (url, target, features) {
  try {
    const u = String(url || '');
    if (u.startsWith('blob:')) {
      // Excel (u otro blob): descargar con nombre .xlsx en Descargas.
      const a = document.createElement('a');
      a.href = u;
      a.download = 'checklist.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      return null;
    }
    if (/^https?:\/\//i.test(u)) {
      // wa.me y demás enlaces externos: navegador del sistema.
      ipcRenderer.invoke('desktop-open-external', u).catch(() => {});
      return null;
    }
  } catch (e) {
    /* si algo falla, se intenta el comportamiento normal */
  }
  return originalOpen(url, target, features);
};
