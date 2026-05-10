const { BrowserWindow, screen, ipcMain, clipboard, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const store = require('./store');

const SNAP = 8; // 磁力吸附阈值（像素）
const windows = new Map();
let winIdCounter = Date.now();

function nextId() { return ++winIdCounter; }

// ─── 磁力吸附算法 ──────────────────────────────────────────────
function applyMagneticSnap(movingId, x, y, w, h) {
  const display = screen.getDisplayNearestPoint({ x, y });
  const wa = display.workArea;
  let sx = x, sy = y;

  // 屏幕边缘吸附
  if (Math.abs(sx - wa.x) < SNAP) sx = wa.x;
  if (Math.abs(sy - wa.y) < SNAP) sy = wa.y;
  if (Math.abs(sx + w - wa.x - wa.width) < SNAP) sx = wa.x + wa.width - w;
  if (Math.abs(sy + h - wa.y - wa.height) < SNAP) sy = wa.y + wa.height - h;

  // 与其他贴子边缘吸附
  for (const [id, entry] of windows) {
    if (id === movingId) continue;
    if (entry.win.isDestroyed()) continue;
    const [ox, oy] = entry.win.getPosition();
    const [ow, oh] = entry.win.getSize();

    const edges = [
      { test: Math.abs(sx - ox),              val: ox },
      { test: Math.abs(sx - (ox + ow)),       val: ox + ow },
      { test: Math.abs(sx + w - ox),          val: ox - w },
      { test: Math.abs(sx + w - (ox + ow)),   val: ox + ow - w },
    ];
    for (const e of edges) {
      if (e.test < SNAP) sx = e.val;
    }

    const yEdges = [
      { test: Math.abs(sy - oy),              val: oy },
      { test: Math.abs(sy - (oy + oh)),       val: oy + oh },
      { test: Math.abs(sy + h - oy),          val: oy - h },
      { test: Math.abs(sy + h - (oy + oh)),   val: oy + oh - h },
    ];
    for (const e of yEdges) {
      if (e.test < SNAP) sy = e.val;
    }
  }

  return { x: sx, y: sy };
}

// ─── 重叠推开排斥 ──────────────────────────────────────────────
function resolveOverlap(movingId, mx, my, mw, mh) {
  // 收集所有需要检查的窗口
  for (const [id, entry] of windows) {
    if (id === movingId) continue;
    if (entry.win.isDestroyed()) continue;
    const [ox, oy] = entry.win.getPosition();
    const [ow, oh] = entry.win.getSize();

    // 检测是否重叠
    const overlapX = Math.max(0, Math.min(mx + mw, ox + ow) - Math.max(mx, ox));
    const overlapY = Math.max(0, Math.min(my + mh, oy + oh) - Math.max(my, oy));
    if (overlapX <= 0 || overlapY <= 0) continue;

    // 计算推开方向：选择重叠最小的方向推开其他窗口
    const gapLeft   = (ox + ow) - mx;
    const gapRight  = (mx + mw) - ox;
    const gapTop    = (oy + oh) - my;
    const gapBottom = (my + mh) - oy;

    const minGap = Math.min(gapLeft, gapRight, gapTop, gapBottom);
    let pushX = 0, pushY = 0;

    if (minGap === gapLeft)       pushX = -(overlapX + 1);
    else if (minGap === gapRight)  pushX =  (overlapX + 1);
    else if (minGap === gapTop)    pushY = -(overlapY + 1);
    else                           pushY =  (overlapY + 1);

    const newOX = ox + pushX;
    const newOY = oy + pushY;
    const snapped = applyMagneticSnap(id, newOX, newOY, ow, oh);

    // 约束在屏幕内
    const display = screen.getDisplayNearestPoint({ x: snapped.x, y: snapped.y });
    const wa = display.workArea;
    const cx = Math.max(wa.x, Math.min(snapped.x, wa.x + wa.width - ow));
    const cy = Math.max(wa.y, Math.min(snapped.y, wa.y + wa.height - oh));

    entry.win.setPosition(Math.round(cx), Math.round(cy));
  }
}

// ─── 层级管理：将窗口提升到最上层 ──────────────────────────────
function bringToTop(winId) {
  const entry = windows.get(winId);
  if (!entry || entry.win.isDestroyed()) return;
  entry.win.setAlwaysOnTop(true);
}

// ─── 截图选区窗口 ──────────────────────────────────────────────
function startSnapCapture() {
  // 隐藏所有 SnapPin 贴子
  const visibleWins = [];
  for (const [, entry] of windows) {
    if (!entry.win.isDestroyed() && entry.win.isVisible()) {
      entry.win.hide();
      visibleWins.push(entry.win);
    }
  }

  setTimeout(() => {
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

    if (process.platform === 'darwin') {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      win.setAlwaysOnTop(true, 'screen-saver');
    }

    win.loadFile(path.join(__dirname, '../renderer/snap/capture.html'));

    win.webContents.once('did-finish-load', () => {
      win.webContents.send('capture:display-info', {
        displayId: String(display.id),
        width: Math.round(width * sf),
        height: Math.round(height * sf)
      });
    });

    const onReady = () => { if (!win.isDestroyed()) win.showInactive(); };
    ipcMain.once('capture:ready', onReady);

    const restoreWins = () => visibleWins.forEach(w => { if (!w.isDestroyed()) w.show(); });

    ipcMain.once('capture:done', (event, { rect, imgDataUrl }) => {
      ipcMain.removeListener('capture:ready', onReady);
      win.destroy();
      restoreWins();

      const base64 = imgDataUrl.split(',')[1];
      const outPath = path.join(os.tmpdir(), `snappin-${Date.now()}.png`);
      fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));

      // 写入系统剪贴板
      try {
        clipboard.writeImage(nativeImage.createFromDataURL(imgDataUrl));
      } catch (_) {}

      const globalRect = {
        x: rect.x + display.bounds.x,
        y: rect.y + display.bounds.y,
        width: rect.width,
        height: rect.height
      };
      createSnapWindow(outPath, globalRect);
    });

    ipcMain.once('capture:cancel', () => {
      ipcMain.removeListener('capture:ready', onReady);
      win.destroy();
      restoreWins();
    });
  }, 150);
}

// ─── 截图贴窗口 ────────────────────────────────────────────────
function createSnapWindow(imgPath, rect) {
  const id = nextId();
  const w = rect ? Math.round(rect.width) : 400;
  const h = rect ? Math.round(rect.height) : 300;
  const px = rect ? Math.round(rect.x) : 200;
  const py = rect ? Math.round(rect.y) : 200;

  const win = new BrowserWindow({
    x: px, y: py, width: w, height: h,
    frame: false, transparent: true,
    hasShadow: false, alwaysOnTop: true,
    skipTaskbar: false, resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true
    }
  });

  win.loadFile(path.join(__dirname, '../renderer/snap/snap.html'));

  win.once('ready-to-show', () => {
    win.show();
    win.webContents.send('snap:init', { id, imgPath });
  });

  win.on('closed', () => {
    windows.delete(id);
    store.set('windows', store.get('windows', []).filter(w => w.id !== id));
  });

  windows.set(id, { id, type: 'snap', win });
  persistSnap(id, imgPath, px, py, w, h);
  return id;
}

function persistSnap(id, imgPath, x, y, width, height) {
  const list = store.get('windows', []).filter(w => w.id !== id);
  list.push({ id, type: 'snap', imgPath, x, y, width, height });
  store.set('windows', list);
}

// ─── 文本贴窗口 ────────────────────────────────────────────────
function createNoteWindow(initialText, posX, posY) {
  const id = nextId();
  const text = initialText || '';
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const { width: nw, height: nh } = calcNoteSize(text);

  // 位置优先使用传入坐标，其次从 store 恢复时居中，快捷键创建时跟随鼠标
  let px, py;
  if (posX != null && posY != null) {
    px = posX;
    py = posY;
  } else {
    const cursor = screen.getCursorScreenPoint();
    px = Math.round(cursor.x - nw / 2);
    py = Math.round(cursor.y - 20);
  }

  const win = new BrowserWindow({
    x: px, y: py, width: nw, height: nh,
    frame: false, transparent: true,
    hasShadow: false, alwaysOnTop: true,
    skipTaskbar: false, resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true
    }
  });

  win.loadFile(path.join(__dirname, '../renderer/note/note.html'));

  win.once('ready-to-show', () => {
    win.show();
    win.webContents.send('note:init', { id, text });
  });

  win.on('closed', () => {
    windows.delete(id);
    store.set('windows', store.get('windows', []).filter(w => w.id !== id));
  });

  windows.set(id, { id, type: 'note', win });
  persistNote(id, text, px, py, nw, nh);
  return id;
}

function calcNoteSize(text) {
  const W = 260;
  const DRAG_H = 20;
  const charsPerLine = 18;
  const lineH = 24;
  const lines = (text || '').split('\n');
  let total = 0;
  for (const line of lines) {
    total += Math.max(1, Math.ceil(Math.max(line.length, 1) / charsPerLine));
  }
  const contentH = total * lineH + 12;
  return { width: W, height: Math.max(120, Math.min(440, DRAG_H + contentH)) };
}

function persistNote(id, text, x, y, width, height) {
  const list = store.get('windows', []).filter(w => w.id !== id);
  list.push({ id, type: 'note', text, x, y, width, height });
  store.set('windows', list);
}

// ─── 快捷输入窗口（新建文本贴用）────────────────────────────────
function showQuickInput() {
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

  win.loadFile(path.join(__dirname, '../renderer/note/quickinput.html'));
  win.once('ready-to-show', () => win.show());

  ipcMain.once('quickinput:confirm', (_e, text) => {
    win.close();
    if (text && text.trim()) {
      const cursor = screen.getCursorScreenPoint();
      createNoteWindow(text.trim(), Math.round(cursor.x - 130), Math.round(cursor.y - 60));
    }
  });
  ipcMain.once('quickinput:cancel', () => win.close());
}

// ─── IPC 注册 ──────────────────────────────────────────────────
function setupIPC() {
  // 内容变更（文本贴编辑自动保存）
  ipcMain.on('note:content-change', (_e, { id, text }) => {
    const list = store.get('windows', []);
    const entry = list.find(w => w.id === id);
    if (entry) { entry.text = text; store.set('windows', list); }
  });

  // 拖拽移动：增量位移 + 吸附 + 推开
  ipcMain.on('win:move', (_e, { id, dx, dy }) => {
    const entry = windows.get(id);
    if (!entry || entry.win.isDestroyed()) return;
    const [x, y] = entry.win.getPosition();
    const [w, h] = entry.win.getSize();
    const nx = x + dx;
    const ny = y + dy;

    // 先移动
    entry.win.setPosition(Math.round(nx), Math.round(ny));

    // 磁力吸附
    const snapped = applyMagneticSnap(id, nx, ny, w, h);
    entry.win.setPosition(Math.round(snapped.x), Math.round(snapped.y));

    // 推开重叠
    const [sx2, sy2] = entry.win.getPosition();
    resolveOverlap(id, sx2, sy2, w, h);

    // 持久化
    const [fx, fy] = entry.win.getPosition();
    const list = store.get('windows', []);
    const item = list.find(wi => wi.id === id);
    if (item) { item.x = fx; item.y = fy; store.set('windows', list); }
  });

  // 提升层级
  ipcMain.on('win:bring-to-top', (_e, id) => bringToTop(id));

  // 关闭
  ipcMain.on('win:close', (_e, id) => {
    const entry = windows.get(id);
    if (entry && !entry.win.isDestroyed()) entry.win.close();
  });

  // 便签坞 / 托盘
  ipcMain.handle('dock:get-windows', () =>
    [...windows.values()]
      .filter(e => !e.win.isDestroyed())
      .map(({ id, type }) => ({ id, type }))
  );
  ipcMain.on('dock:hide-all', () => hideAll());
  ipcMain.on('dock:show-all', () => showAll());
  ipcMain.on('dock:show-win', (_e, id) => {
    const entry = windows.get(id);
    if (entry && !entry.win.isDestroyed()) entry.win.show();
  });
  ipcMain.on('dock:hide-win', (_e, id) => {
    const entry = windows.get(id);
    if (entry && !entry.win.isDestroyed()) entry.win.hide();
  });

  // 新建文本贴（从便签坞面板触发）
  ipcMain.on('note:create', () => showQuickInput());

  // 启动截图（从便签坞面板触发）
  ipcMain.on('snap:start-capture', () => startSnapCapture());
}

// ─── 全部显示/隐藏 ─────────────────────────────────────────────
function hideAll() {
  for (const [, entry] of windows) {
    if (!entry.win.isDestroyed()) entry.win.hide();
  }
}
function showAll() {
  for (const [, entry] of windows) {
    if (!entry.win.isDestroyed()) entry.win.show();
  }
}

// ─── 恢复上次会话 ──────────────────────────────────────────────
function restoreWindows() {
  const list = store.get('windows', []);
  for (const entry of list) {
    if (entry.type === 'snap' && entry.imgPath && fs.existsSync(entry.imgPath)) {
      createSnapWindow(entry.imgPath, {
        x: entry.x || 200, y: entry.y || 200,
        width: entry.width || 400, height: entry.height || 300
      });
    } else if (entry.type === 'note') {
      createNoteWindow(entry.text || '', entry.x, entry.y);
    }
  }
}

module.exports = {
  setupIPC, startSnapCapture, createSnapWindow,
  createNoteWindow, showQuickInput, restoreWindows,
  hideAll, showAll, windows
};
