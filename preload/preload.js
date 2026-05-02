const { contextBridge, ipcRenderer, desktopCapturer } = require('electron');

contextBridge.exposeInMainWorld('snappin', {
  // ─── 截图相关 ───────────────────────────────────────────────
  startCapture: () => ipcRenderer.send('start-capture'),
  onInitScreenshot: (cb) => ipcRenderer.on('init-screenshot', (e, data) => cb(data)),

  // 渲染进程负责截屏（可正确触发 macOS 权限弹框）
  captureScreenForDisplay: async (displayId, w, h) => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: w, height: h }
    });
    const source = sources.find(s => s.display_id === String(displayId)) || sources[0];
    return source ? source.thumbnail.toDataURL() : null;
  },
  // 接收主进程发来的 display 信息
  onCaptureDisplayInfo: (cb) => ipcRenderer.on('capture-display-info', (e, info) => cb(info)),
  // 选区截图窗口事件
  captureDone: (rect) => ipcRenderer.send('capture-done', rect),
  captureDoneWithImage: (data) => ipcRenderer.send('capture-done-with-image', data),
  captureCancel: () => ipcRenderer.send('capture-cancel'),

  // ─── 文本便签相关 ────────────────────────────────────────────
  onInitNote: (cb) => ipcRenderer.on('init-note', (e, data) => cb(data)),
  contentChange: (id, text) => ipcRenderer.send('content-change', { id, text }),

  // ─── 快速输入 ────────────────────────────────────────────────
  quickInputConfirm: (text) => ipcRenderer.send('quick-input-confirm', text),
  quickInputCancel: () => ipcRenderer.send('quick-input-cancel'),

  // ─── 浮窗通用操作 ────────────────────────────────────────────
  togglePin: (id) => ipcRenderer.send('toggle-pin', id),
  onPinState: (cb) => ipcRenderer.on('pin-state', (e, state) => cb(state)),
  minimizeWin: (id) => ipcRenderer.send('minimize-win', id),
  closeWin: (id) => ipcRenderer.send('close-win', id),
  setTitle: (id, title) => ipcRenderer.send('set-title', { id, title }),

  // 选区截图窗口：接收背景截图路径（保留兼容）
  onSetScreenshot: (cb) => ipcRenderer.on('set-screenshot', (e, dataUrl) => cb(dataUrl)),
  // 截图背景图已渲染完毕，通知主进程可以安全 show 窗口了
  captureReady: () => ipcRenderer.send('capture-ready'),

  // ─── 截图浮窗专属交互 ───────────────────────────────────────
  nudgeWin:       (id, dx, dy) => ipcRenderer.send('nudge-win', { id, dx, dy }),
  zoomWin:        (id, delta)  => ipcRenderer.send('zoom-win', { id, delta }),
  expandTextArea: (id, delta)  => ipcRenderer.send('expand-text-area', { id, delta }),

  // ─── 便签坞 ─────────────────────────────────────────────────
  getWindowsList: () => ipcRenderer.invoke('get-windows-list'),
  onRefreshList: (cb) => ipcRenderer.on('refresh-list', () => cb()),
  hideAllWindows: () => ipcRenderer.send('hide-all-windows'),
  showAllWindows: () => ipcRenderer.send('show-all-windows'),
  dockShow: (id) => ipcRenderer.send('dock-show-win', id),
  dockHide: (id) => ipcRenderer.send('dock-hide-win', id),
  dockClose: (id) => ipcRenderer.send('dock-close-win', id)
});
