const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('snappin', {
  // ── 截图选区 ──────────────────────────────────────────────
  onCaptureDisplayInfo: (cb) => ipcRenderer.on('capture:display-info', (_e, info) => cb(info)),
  captureDone: (data) => ipcRenderer.send('capture:done', data),
  captureCancel: () => ipcRenderer.send('capture:cancel'),
  captureReady: () => ipcRenderer.send('capture:ready'),

  // ── 截图贴 ────────────────────────────────────────────────
  snapReady: () => ipcRenderer.send('snap:ready'),
  snapAspectRatio: (ratio) => ipcRenderer.send('snap:aspect-ratio', ratio),

  // ── 文本贴 ────────────────────────────────────────────────
  onNoteInit: (cb) => ipcRenderer.on('note:init', (_e, data) => cb(data)),
  contentChange: (id, text) => ipcRenderer.send('note:content-change', { id, text }),

  // ── 快捷输入 ──────────────────────────────────────────────
  quickInputConfirm: (text) => ipcRenderer.send('quickinput:confirm', text),
  quickInputCancel: () => ipcRenderer.send('quickinput:cancel'),

  // ── 通用窗口操作 ──────────────────────────────────────────
  moveWindow: (id, dx, dy) => ipcRenderer.send('win:move', { id, dx, dy }),
  bringToTop: (id) => ipcRenderer.send('win:bring-to-top', id),
  closeWindow: (id) => ipcRenderer.send('win:close', id),

  // ── 便签坞 ────────────────────────────────────────────────
  getWindowsList: () => ipcRenderer.invoke('dock:get-windows'),
  hideAllWindows: () => ipcRenderer.send('dock:hide-all'),
  showAllWindows: () => ipcRenderer.send('dock:show-all'),
  dockShowWin: (id) => ipcRenderer.send('dock:show-win', id),
  dockHideWin: (id) => ipcRenderer.send('dock:hide-win', id),

  // ── 新建（从便签坞触发）───────────────────────────────────
  createNote: () => ipcRenderer.send('note:create'),
  startSnapCapture: () => ipcRenderer.send('snap:start-capture')
});
