const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const store = require('./store');
const fs = require('fs');
const os = require('os');

const windows = new Map();
// 每个截图窗口的缩放状态：{ aspectRatio, imgW, imgH, textAreaH }
const winStates = new Map();
let winIdCounter = Date.now();

function nextId() { return ++winIdCounter; }

// ─── 选区截图窗口 ────────────────────────────────────────────
async function createCaptureWindow(callback) {
  // 截图前隐藏所有 SnapPin 窗口，避免它们出现在截图背景里
  const visibleWins = [];
  for (const entry of windows.values()) {
    if (!entry.win.isDestroyed() && entry.win.isVisible()) {
      entry.win.hide();
      visibleWins.push(entry.win);
    }
  }
  // 等待窗口真正从屏幕消失（macOS 需要一点合成时间）
  await new Promise(r => setTimeout(r, 150));

  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);
  const { width, height, x: dx, y: dy } = display.bounds;
  const sf = display.scaleFactor;

  const win = new BrowserWindow({
    x: dx, y: dy, width, height,
    frame: false, transparent: true,
    alwaysOnTop: true, skipTaskbar: true,
    resizable: false, movable: false, show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true
    }
  });

  // macOS：让遮罩出现在用户当前所在的 Space
  if (process.platform === 'darwin') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setAlwaysOnTop(true, 'screen-saver');
  }

  win.loadFile(path.join(__dirname, '../renderer/capture.html'));

  // 渲染进程加载完毕后发送 display 信息，由渲染进程调用 desktopCapturer
  win.webContents.once('did-finish-load', () => {
    win.webContents.send('capture-display-info', {
      displayId: String(display.id),
      width: Math.round(width * sf),
      height: Math.round(height * sf)
    });
  });

  // 渲染进程截图背景加载完毕后再 show，避免透明闪烁露出桌面
  const onReady = () => {
    if (!win.isDestroyed()) win.showInactive();
  };
  ipcMain.once('capture-ready', onReady);

  const restoreWins = () => visibleWins.forEach(w => { if (!w.isDestroyed()) w.show(); });

  // 渲染进程完成选区并裁剪好图片后，通过此 IPC 返回
  ipcMain.once('capture-done-with-image', (event, { rect, imgDataUrl }) => {
    ipcMain.removeListener('capture-ready', onReady);
    win.destroy();
    restoreWins();
    try {
      const base64 = imgDataUrl.split(',')[1];
      const outPath = path.join(os.tmpdir(), `snappin-${Date.now()}.png`);
      fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));
      const globalRect = {
        x: rect.x + display.bounds.x,
        y: rect.y + display.bounds.y,
        width: rect.width,
        height: rect.height
      };
      callback(null, outPath, globalRect);
    } catch (err) {
      callback(err);
    }
  });

  ipcMain.once('capture-cancel', () => {
    ipcMain.removeListener('capture-ready', onReady);
    win.destroy();
    restoreWins();
  });
}

// ─── 截图浮窗（纯图片 pin，无 UI 元素）───────────────────────
function createScreenshotWindow(imgPath, rect) {
  const id = nextId();
  // rect 可能来自新截图或 store 恢复
  const initW = rect ? Math.round(rect.width)  : 400;
  const initH = rect ? Math.round(rect.height) : 300;
  const posX  = rect ? Math.round(rect.x)      : 200;
  const posY  = rect ? Math.round(rect.y)      : 200;

  winStates.set(id, {
    aspectRatio: initW / initH,
    imgW: initW,
    imgH: initH,
    textAreaH: 0
  });

  const win = new BrowserWindow({
    x: posX, y: posY,
    width: initW, height: initH,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true
    }
  });

  win.loadFile(path.join(__dirname, '../renderer/screenshot.html'));

  win.once('ready-to-show', () => {
    win.show();
    win.webContents.send('init-screenshot', { id, imgPath });
  });

  function persist() {
    const state = winStates.get(id);
    const [x, y] = win.getPosition();
    const list = store.get('windows', []).filter(w => w.id !== id);
    list.push({
      id, type: 'screenshot', imgPath, x, y,
      width: state ? state.imgW : initW,
      height: state ? state.imgH : initH
    });
    store.set('windows', list);
  }

  win.on('moved', persist);

  win.on('closed', () => {
    windows.delete(id);
    winStates.delete(id);
    store.set('windows', store.get('windows', []).filter(w => w.id !== id));
  });

  windows.set(id, { id, type: 'screenshot', win });
  persist();
  return id;
}

// 根据文字量估算窗口尺寸
function calcNoteSize(text) {
  const W = 260;
  const DRAG_H = 20;       // 顶部拖拽条高度
  const charsPerLine = 18; // 260px 宽 / 14px 中文 ≈ 18 字一行
  const lineH = 24;        // 14px * 1.72
  const lines = (text || '').split('\n');
  let total = 0;
  for (const line of lines) {
    total += Math.max(1, Math.ceil((line.length || 1) / charsPerLine));
  }
  const contentH = total * lineH + 12; // 2+10 上下 padding
  return { width: W, height: Math.max(120, Math.min(440, DRAG_H + contentH)) };
}

// ─── 文本便签窗口 ────────────────────────────────────────────
function createNoteWindow(initialText = '') {
  const id = nextId();
  const { width: initW, height: initH } = calcNoteSize(initialText);
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  const win = new BrowserWindow({
    width: initW,
    height: initH,
    x: Math.round((sw - initW) / 2),
    y: Math.round((sh - initH) / 2),
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true
    }
  });

  win.loadFile(path.join(__dirname, '../renderer/note.html'));
  win.once('ready-to-show', () => {
    win.show();
    win.webContents.send('init-note', { id, text: initialText });
  });

  function persist() {
    const list = store.get('windows', []).filter(w => w.id !== id);
    const [x, y] = win.getPosition();
    const [w, h] = win.getSize();
    list.push({ id, type: 'note', text: initialText, x, y, width: w, height: h });
    store.set('windows', list);
  }

  win.on('moved', persist);
  win.on('closed', () => {
    windows.delete(id);
    store.set('windows', store.get('windows', []).filter(w => w.id !== id));
  });

  windows.set(id, { id, type: 'note', win });
  persist();
  return id;
}

// ─── 快速文本输入窗口 ─────────────────────────────────────────
function createQuickInputWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  const win = new BrowserWindow({
    width: 400, height: 80,
    x: Math.round((width - 400) / 2),
    y: Math.round((height - 80) / 2),
    frame: false, transparent: true,
    alwaysOnTop: true, skipTaskbar: true,
    resizable: false, show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true
    }
  });

  win.loadFile(path.join(__dirname, '../renderer/quickinput.html'));
  win.once('ready-to-show', () => win.show());

  ipcMain.once('quick-input-confirm', (event, text) => {
    win.close();
    if (text && text.trim()) createNoteWindow(text.trim());
  });
  ipcMain.once('quick-input-cancel', () => win.close());
}

// ─── IPC 处理 ─────────────────────────────────────────────────
function setupIPC() {
  // 文本便签内容变化
  ipcMain.on('content-change', (event, { id, text }) => {
    const list = store.get('windows', []);
    const entry = list.find(w => w.id === id);
    if (entry) { entry.text = text; store.set('windows', list); }
  });

  // 置顶切换
  ipcMain.on('toggle-pin', (event, id) => {
    const entry = windows.get(id);
    if (entry) {
      const next = !entry.win.isAlwaysOnTop();
      entry.win.setAlwaysOnTop(next);
      event.reply('pin-state', next);
    }
  });

  // 最小化 / 关闭
  ipcMain.on('minimize-win', (event, id) => {
    const entry = windows.get(id);
    if (entry) entry.win.minimize();
  });
  ipcMain.on('close-win', (event, id) => {
    const entry = windows.get(id);
    if (entry) entry.win.close();
  });

  // ── 截图浮窗专属交互 ────────────────────────────────────────

  // 拖动：增量移动
  ipcMain.on('nudge-win', (event, { id, dx, dy }) => {
    const entry = windows.get(id);
    if (!entry || entry.win.isDestroyed()) return;
    const [x, y] = entry.win.getPosition();
    entry.win.setPosition(Math.round(x + dx), Math.round(y + dy));
  });

  // 滚轮等比缩放
  ipcMain.on('zoom-win', (event, { id, delta }) => {
    const entry = windows.get(id);
    const state = winStates.get(id);
    if (!entry || !state || entry.win.isDestroyed()) return;
    state.imgW = Math.max(80, Math.min(2000, state.imgW + delta));
    state.imgH = Math.round(state.imgW / state.aspectRatio);
    entry.win.setSize(state.imgW, state.imgH + state.textAreaH);
  });

  // 展开 / 收起文字区域
  ipcMain.on('expand-text-area', (event, { id, delta }) => {
    const entry = windows.get(id);
    const state = winStates.get(id);
    if (!entry || !state || entry.win.isDestroyed()) return;
    state.textAreaH = Math.max(0, state.textAreaH + delta);
    entry.win.setSize(state.imgW, state.imgH + state.textAreaH);
  });

  // 便签坞
  ipcMain.handle('get-windows-list', () =>
    [...windows.values()].map(({ id, type }) => ({ id, type }))
  );
  ipcMain.on('hide-all-windows', () => {
    windows.forEach(({ win }) => { if (!win.isDestroyed()) win.hide(); });
  });
  ipcMain.on('show-all-windows', () => {
    windows.forEach(({ win }) => { if (!win.isDestroyed()) win.show(); });
  });
  ipcMain.on('dock-show-win',  (e, id) => { const w = windows.get(id); if (w && !w.win.isDestroyed()) w.win.show(); });
  ipcMain.on('dock-hide-win',  (e, id) => { const w = windows.get(id); if (w && !w.win.isDestroyed()) w.win.hide(); });
  ipcMain.on('dock-close-win', (e, id) => { const w = windows.get(id); if (w && !w.win.isDestroyed()) w.win.close(); });

  // 截图触发（来自渲染进程）
  ipcMain.on('start-capture', () => {
    createCaptureWindow((err, imgPath, rect) => {
      if (!err) createScreenshotWindow(imgPath, rect);
    });
  });
}

// ─── 恢复上次会话 ─────────────────────────────────────────────
function restoreWindows() {
  const list = store.get('windows', []);
  for (const entry of list) {
    if (entry.type === 'screenshot' && entry.imgPath && fs.existsSync(entry.imgPath)) {
      createScreenshotWindow(entry.imgPath, {
        x: entry.x || 200, y: entry.y || 200,
        width: entry.width || 400, height: entry.height || 300
      });
    } else if (entry.type === 'note') {
      createNoteWindow(entry.text || '');
    }
  }
}

module.exports = { setupIPC, createCaptureWindow, createScreenshotWindow, createNoteWindow, createQuickInputWindow, restoreWindows, windows };
