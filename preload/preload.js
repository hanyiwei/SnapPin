const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('snappin', {
  // ── 截图选区 ──────────────────────────────────────────────
  captureDone: (data) => ipcRenderer.send('capture:done', data),
  captureCancel: () => ipcRenderer.send('capture:cancel'),
  captureReady: () => ipcRenderer.send('capture:ready'),

  // ── 截图贴 ────────────────────────────────────────────────
  snapReady: (id) => ipcRenderer.send('snap:ready', id),
  snapAspectRatio: (id, ratio) => ipcRenderer.send('snap:aspect-ratio', { id, ratio }),

  // ── 文本贴 ────────────────────────────────────────────────
  onNoteInit: (cb) => ipcRenderer.on('note:init', (_e, data) => cb(data)),
  contentChange: (id, text) => ipcRenderer.send('note:content-change', { id, text }),

  // ── 快捷输入 ──────────────────────────────────────────────
  quickInputConfirm: (text) => ipcRenderer.send('quickinput:confirm', text),
  quickInputCancel: () => ipcRenderer.send('quickinput:cancel'),

  // ── 通用窗口操作 ──────────────────────────────────────────
  dragStart: (id) => ipcRenderer.send('drag:start', id),
  dragEnd: (id) => ipcRenderer.send('drag:end', id),
  moveWindow: (id, dx, dy) => ipcRenderer.send('win:move', { id, dx, dy }),
  bringToTop: (id) => ipcRenderer.send('win:bring-to-top', id),
  closeWindow: (id) => ipcRenderer.send('win:close', id),
});
