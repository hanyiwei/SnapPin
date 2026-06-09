const { BrowserWindow, screen, ipcMain, clipboard, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const store = require('./store');
const { execFileSync } = require('child_process');

const SNAP = 8;
const windows = new Map();
const movingWindows = new Set();
let winIdCounter = Date.now();

function nextId() { return ++winIdCounter; }

function applyMagneticSnap(movingId, x, y, w, h) {
  const display = screen.getDisplayNearestPoint({ x, y });
  const wa = display.workArea;
  let sx = x, sy = y;

  if (Math.abs(sx - wa.x) < SNAP) sx = wa.x;
  if (Math.abs(sy - wa.y) < SNAP) sy = wa.y;
  if (Math.abs(sx + w - wa.x - wa.width) < SNAP) sx = wa.x + wa.width - w;
  if (Math.abs(sy + h - wa.y - wa.height) < SNAP) sy = wa.y + wa.height - h;

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

function resolveOverlap(movingId, mx, my, mw, mh) {
  for (const [id, entry] of windows) {
    if (id === movingId) continue;
    if (entry.win.isDestroyed()) continue;
    const [ox, oy] = entry.win.getPosition();
    const [ow, oh] = entry.win.getSize();

    const overlapX = Math.max(0, Math.min(mx + mw, ox + ow) - Math.max(mx, ox));
    const overlapY = Math.max(0, Math.min(my + mh, oy + oh) - Math.max(my, oy));
    if (overlapX <= 0 || overlapY <= 0) continue;

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

    const d = screen.getDisplayNearestPoint({ x: snapped.x, y: snapped.y });
    const wa = d.workArea;
    const cx = Math.max(wa.x, Math.min(snapped.x, wa.x + wa.width - ow));
    const cy = Math.max(wa.y, Math.min(snapped.y, wa.y + wa.height - oh));

    entry.win.setPosition(Math.round(cx), Math.round(cy));
  }
}

function bringToTop(winId) {
  const entry = windows.get(winId);
  if (!entry || entry.win.isDestroyed()) return;
  entry.win.setAlwaysOnTop(true);
  entry.win.moveTop();
}

// ─── 截图选区 ──────────────────────────────────────────────────
let captureInProgress = false;

function startSnapCapture() {
  if (captureInProgress) return;
  captureInProgress = true;

  const visibleWins = [];
  for (const [, entry] of windows) {
    if (!entry.win.isDestroyed() && entry.win.isVisible()) {
      entry.win.hide();
      visibleWins.push(entry.win);
    }
  }

  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);
  const { width, height, x: dx, y: dy } = display.bounds;
  const sf = display.scaleFactor;

  const win = new BrowserWindow({
    x: dx, y: dy, width, height,
    frame: false, transparent: true,
    alwaysOnTop: true, skipTaskbar: true,
    resizable: false, movable: false,
    icon: path.join(__dirname, '../assets/icon.png'),
    show: false,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      sandbox: false
    }
  });

  if (process.platform === 'darwin') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setAlwaysOnTop(true, 'screen-saver');
  }

  win.loadFile(path.join(__dirname, '../renderer/snap/capture.html'));

  const restoreWins = () => visibleWins.forEach(w => { if (!w.isDestroyed()) w.show(); });

  const cleanup = () => {
    captureInProgress = false;
    ipcMain.removeListener('capture:ready', onReady);
    ipcMain.removeListener('capture:done', onDone);
    ipcMain.removeListener('capture:cancel', onCancel);
  };

  win.on('closed', cleanup); // safety: unstuck if window closed unexpectedly

  const onReady = () => {
    if (!win.isDestroyed()) { win.show(); win.focus(); }
  };
  ipcMain.once('capture:ready', onReady);

  const onDone = async (_e, { rect }) => {
    try {
      cleanup();
      win.destroy();
      restoreWins();

      const dpr = sf;
      const outPath = path.join(os.tmpdir(), `snappin-${Date.now()}.png`);

      if (process.platform === 'win32') {
        const srcX = Math.round((display.bounds.x + rect.x) * dpr);
        const srcY = Math.round((display.bounds.y + rect.y) * dpr);
        const srcW = Math.round(rect.width * dpr);
        const srcH = Math.round(rect.height * dpr);
        const psScript = `Add-Type -AssemblyName System.Drawing;$b=New-Object System.Drawing.Bitmap(${srcW},${srcH});$g=[System.Drawing.Graphics]::FromImage($b);$g.CopyFromScreen(${srcX},${srcY},0,0,$b.Size);$b.Save('${outPath.replace(/'/g, "''")}');$g.Dispose();$b.Dispose()`;
        execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript], { timeout: 8000 });
        if (fs.existsSync(outPath)) {
          const img = nativeImage.createFromPath(outPath);
          try { clipboard.writeImage(img); } catch (_) {}
        }
      } else {
        const tmpFile = path.join(os.tmpdir(), `snappin-full-${Date.now()}.png`);
        const { execSync } = require('child_process');
        execSync(`screencapture -x "${tmpFile}"`);
        const fullImg = nativeImage.createFromPath(tmpFile);
        const cropped = fullImg.crop({
          x: Math.round(rect.x * dpr),
          y: Math.round(rect.y * dpr),
          width: Math.round(rect.width * dpr),
          height: Math.round(rect.height * dpr)
        });
        fs.writeFileSync(outPath, cropped.toPNG());
        fs.unlinkSync(tmpFile);
        try { clipboard.writeImage(cropped); } catch (_) {}
      }

      if (!fs.existsSync(outPath)) {
        console.error('[SnapPin] screenshot file not created');
        return;
      }

      createSnapWindow(outPath, {
        x: rect.x + display.bounds.x,
        y: rect.y + display.bounds.y,
        width: rect.width,
        height: rect.height
      });
    } catch (e) {
      console.error('[SnapPin] capture:done error:', e);
    }
  };
  ipcMain.on('capture:done', onDone);

  const onCancel = () => {
    cleanup();
    win.destroy();
    restoreWins();
  };
  ipcMain.on('capture:cancel', onCancel);
}

// ─── 截图贴窗口 ────────────────────────────────────────────────
function createSnapWindow(imgPath, rect) {
  const id = nextId();
  const MIN_W = 100, MIN_H = 100;
  let w = rect ? Math.round(rect.width) : 400;
  let h = rect ? Math.round(rect.height) : 300;
  let px = rect ? Math.round(rect.x) : 200;
  let py = rect ? Math.round(rect.y) : 200;

  // 选区过小时等比放大到最小尺寸
  if (w < MIN_W || h < MIN_H) {
    const scale = Math.max(MIN_W / w, MIN_H / h);
    const nw = Math.round(w * scale);
    const nh = Math.round(h * scale);
    px = Math.round(px - (nw - w) / 2);
    py = Math.round(py - (nh - h) / 2);
    w = nw;
    h = nh;
  }

  const win = new BrowserWindow({
    x: px, y: py, width: w, height: h,
    frame: false, transparent: true,
    hasShadow: false, alwaysOnTop: true,
    skipTaskbar: true, resizable: true,
    minWidth: 100, minHeight: 100,
    maxWidth: 1600, maxHeight: 1200,
    icon: path.join(__dirname, '../assets/icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true
    }
  });

  // 通过 query 传图片路径，页面加载时就开始加载图片
  win.loadFile(path.join(__dirname, '../renderer/snap/snap.html'), {
    query: { id: String(id), img: imgPath }
  });

  let snapAspectRatio = w / h;

  const onAspectRatio = (_e, { id: msgId, ratio }) => {
    if (msgId !== id) return;
    snapAspectRatio = parseFloat(ratio);
    const e = windows.get(id);
    if (e) e._aspectRatio = snapAspectRatio;
  };
  const onSnapReady = (_e, msgId) => {
    if (msgId !== id) return;
    if (!win.isDestroyed()) win.show();
  };
  ipcMain.on('snap:aspect-ratio', onAspectRatio);
  ipcMain.on('snap:ready', onSnapReady);

  // resize 时保持等比；拖拽中主动恢复原始尺寸
  win.on('resize', () => {
    const [rw, rh] = win.getSize();
    const entry = windows.get(id);

    // 拖拽中：DWM 可能改尺寸 → 立刻恢复
    if (entry && entry._dragSize) {
      const [dw, dh] = entry._dragSize;
      if (rw !== dw || rh !== dh) {
        win.setSize(dw, dh);
      }
      return;
    }

    if (movingWindows.has(id)) return;
    const e = windows.get(id);
    const ar = (e && e._aspectRatio) || snapAspectRatio;
    const expectedH = Math.round(rw / ar);
    if (Math.abs(rh - expectedH) > 1) {
      win.setSize(rw, expectedH);
    }
    const list = store.get('windows', []);
    const item = list.find(w => w.id === id);
    if (item) { item.width = rw; item.height = expectedH; store.set('windows', list); }
  });

  win.on('closed', () => {
    ipcMain.removeListener('snap:aspect-ratio', onAspectRatio);
    ipcMain.removeListener('snap:ready', onSnapReady);
    windows.delete(id);
    store.set('windows', store.get('windows', []).filter(w => w.id !== id));
    try { fs.unlinkSync(imgPath); } catch (_) {}
  });

  windows.set(id, { id, type: 'snap', win, _aspectRatio: snapAspectRatio });
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
    skipTaskbar: true, resizable: true,
    minWidth: 100, minHeight: 100,
    maxWidth: 1200, maxHeight: 900,
    icon: path.join(__dirname, '../assets/icon.png'),
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

  // resize 时仅持久化，不做等比约束；拖拽中 DWM 可能改尺寸，立刻恢复
  win.on('resize', () => {
    const [rw, rh] = win.getSize();
    const entry = windows.get(id);

    if (entry && entry._dragSize) {
      const [dw, dh] = entry._dragSize;
      if (rw !== dw || rh !== dh) {
        win.setSize(dw, dh);
      }
      return;
    }

    if (movingWindows.has(id)) return;
    const list = store.get('windows', []);
    const item = list.find(w => w.id === id);
    if (item) { item.width = rw; item.height = rh; store.set('windows', list); }
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

// ─── 快捷输入窗口 ───────────────────────────────────────────────
let quickInputActive = false;
function showQuickInput() {
  if (quickInputActive) return;
  quickInputActive = true;
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  const win = new BrowserWindow({
    width: 400, height: 80,
    x: Math.round((width - 400) / 2),
    y: Math.round((height - 80) / 2),
    frame: false, transparent: true,
    alwaysOnTop: true, skipTaskbar: true,
    resizable: false, icon: path.join(__dirname, '../assets/icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true
    }
  });

  win.loadFile(path.join(__dirname, '../renderer/note/quickinput.html'));
  win.once('ready-to-show', () => win.show());

  let quickInputHandled = false;
  ipcMain.once('quickinput:confirm', (_e, text) => {
    if (quickInputHandled) return;
    quickInputHandled = true;
    const [ix, iy] = win.isDestroyed() ? [0, 0] : win.getPosition();
    if (!win.isDestroyed()) win.close();
    if (text && text.trim()) {
      createNoteWindow(text.trim(), ix, iy);
    }
    quickInputActive = false;
  });
  ipcMain.once('quickinput:cancel', () => {
    if (quickInputHandled) return;
    quickInputHandled = true;
    if (!win.isDestroyed()) win.close();
    quickInputActive = false;
  });
}

// ─── IPC ───────────────────────────────────────────────────────
function setupIPC() {
  ipcMain.on('note:content-change', (_e, { id, text }) => {
    const list = store.get('windows', []);
    const entry = list.find(w => w.id === id);
    if (entry) { entry.text = text; store.set('windows', list); }
  });

  ipcMain.on('win:move', (_e, { id, dx, dy }) => {
    const entry = windows.get(id);
    if (!entry || entry.win.isDestroyed()) return;
    const [x, y] = entry.win.getPosition();
    const [w, h] = entry.win.getSize();
    // use locked size during drag, fallback to current size
    const [lw, lh] = entry._dragSize || [w, h];
    const nx = x + dx;
    const ny = y + dy;

    movingWindows.add(id);
    clearTimeout(entry._moveTimer);
    entry._moveTimer = setTimeout(() => movingWindows.delete(id), 5000);

    const snapped = applyMagneticSnap(id, nx, ny, lw, lh);
    entry.win.setBounds({ x: Math.round(snapped.x), y: Math.round(snapped.y), width: lw, height: lh });

    const [sx2, sy2] = entry.win.getPosition();
    resolveOverlap(id, sx2, sy2, lw, lh);

    const [fx, fy] = entry.win.getPosition();
    const list = store.get('windows', []);
    const item = list.find(wi => wi.id === id);
    if (item) { item.x = fx; item.y = fy; store.set('windows', list); }
  });

  ipcMain.on('win:bring-to-top', (_e, id) => bringToTop(id));

  ipcMain.on('drag:start', (_e, id) => {
    const entry = windows.get(id);
    if (!entry) return;
    movingWindows.add(id);
    clearTimeout(entry._moveTimer);
    // safety: restore everything after 5s if drag:end never arrives
    entry._moveTimer = setTimeout(() => {
      if (entry._dragSize && !entry.win.isDestroyed()) {
        entry.win.setResizable(true);
        delete entry._dragSize;
      }
      movingWindows.delete(id);
    }, 5000);
    const [w, h] = entry.win.getSize();
    entry._dragSize = [w, h];
    entry.win.setResizable(false);
  });
  ipcMain.on('drag:end', (_e, id) => {
    const entry = windows.get(id);
    if (!entry) return;
    entry.win.setResizable(true);
    // restore size if DWM changed it during drag
    if (entry._dragSize) {
      const [w, h] = entry.win.getSize();
      const [dw, dh] = entry._dragSize;
      if (w !== dw || h !== dh) {
        entry.win.setSize(dw, dh);
      }
      delete entry._dragSize;
    }
    // persist final position
    const [fx, fy] = entry.win.getPosition();
    const list = store.get("windows", []);
    const item = list.find(wi => wi.id === id);
    if (item) { item.x = fx; item.y = fy; store.set("windows", list); }
    // delayed guard removal — catch any queued resize events
    clearTimeout(entry._moveTimer);
    entry._moveTimer = setTimeout(() => movingWindows.delete(id), 300);
  });

  ipcMain.on('win:close', (_e, id) => {
    const entry = windows.get(id);
    if (entry && !entry.win.isDestroyed()) entry.win.close();
  });

  // 设置窗口
  const configPath = path.join(__dirname, '../configs/default.json');
  ipcMain.handle('settings:get', () => {
    try { return JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch (_) { return { shortcuts: {} }; }
  });
  ipcMain.handle('settings:save', (_e, shortcuts) => {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      cfg.shortcuts = shortcuts;
      fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
      const { registerShortcuts, unregisterAll } = require('./shortcuts');
      unregisterAll();
      registerShortcuts(module.exports);
      return true;
    } catch (e) { console.error('[SnapPin] settings save error:', e); return false; }
  });
}

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
function closeAll() {
  for (const [, entry] of windows) {
    if (!entry.win.isDestroyed()) entry.win.close();
  }
}

function restoreWindows() {
  const list = store.get('windows', []);
  const validPaths = new Set();
  const restored = [];

  for (const entry of list) {
    if (entry.type === 'snap' && entry.imgPath && fs.existsSync(entry.imgPath)) {
      validPaths.add(entry.imgPath);
      restored.push(entry);
      createSnapWindow(entry.imgPath, {
        x: entry.x || 200, y: entry.y || 200,
        width: entry.width || 400, height: entry.height || 300
      });
    } else if (entry.type === 'note') {
      restored.push(entry);
      createNoteWindow(entry.text || '', entry.x, entry.y);
    }
  }

  // 清理失效的截图条目
  if (restored.length !== list.length) {
    store.set('windows', restored);
  }

  // 清理孤儿临时文件（无对应 store 条目的 snappin-*.png）
  try {
    const tmpDir = os.tmpdir();
    const orphans = fs.readdirSync(tmpDir).filter(f =>
      f.startsWith('snappin-') && f.endsWith('.png') && !validPaths.has(path.join(tmpDir, f))
    );
    for (const f of orphans) {
      try { fs.unlinkSync(path.join(tmpDir, f)); } catch (_) {}
    }
  } catch (_) {}
}

function showSettings() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: 380, height: 260,
    x: Math.round((sw - 380) / 2),
    y: Math.round((sh - 260) / 2),
    icon: path.join(__dirname, '../assets/icon.png'),
    frame: false, transparent: true, resizable: false,
    show: false,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      sandbox: false
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '../renderer/settings.html'));
  win.once('ready-to-show', () => win.show());
}

module.exports = {
  setupIPC, startSnapCapture, createSnapWindow,
  createNoteWindow, showQuickInput, showSettings, restoreWindows,
  hideAll, showAll, closeAll, windows
};
