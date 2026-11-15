// Sandboxed preload: the only bridge the local loading/error pages need.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('webcamoDesktop', {
  retry: () => ipcRenderer.send('webcamo:retry'),
  openLog: () => ipcRenderer.send('webcamo:open-log'),
});
