const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', Object.freeze({
  call: (method, args = {}) => ipcRenderer.invoke('desktop:call', method, args),
  onState: callback => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('desktop:state', handler);
    return () => ipcRenderer.removeListener('desktop:state', handler);
  }
}));
