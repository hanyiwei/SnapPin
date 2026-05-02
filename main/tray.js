const { Tray, Menu, nativeImage, BrowserWindow, app } = require('electron');
const path = require('path');
const wm = require('./windowManager');

let tray = null;
let dockWin = null;

function createTray() {
  // 使用内置图标，如果自定义图标不存在则用空白
  let icon;
  try {
    icon = nativeImage.createFromPath(path.join(__dirname, '../assets/icon.png'));
    icon = icon.resize({ width: 16, height: 16 });
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('SnapPin');

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示便签坞', click: () => toggleDock() },
    { type: 'separator' },
    { label: '隐藏全部贴子', click: () => wm.windows.forEach(({ win }) => !win.isDestroyed() && win.hide()) },
    { label: '恢复全部贴子', click: () => wm.windows.forEach(({ win }) => !win.isDestroyed() && win.show()) },
    { type: 'separator' },
    { label: '创建文本贴', click: () => wm.createQuickInputWindow() },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => toggleDock());
}

function toggleDock() {
  if (dockWin && !dockWin.isDestroyed()) {
    if (dockWin.isVisible()) {
      dockWin.hide();
    } else {
      dockWin.show();
      dockWin.webContents.send('refresh-list');
    }
    return;
  }

  dockWin = new BrowserWindow({
    width: 320,
    height: 480,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true
    }
  });

  dockWin.loadFile(path.join(__dirname, '../renderer/tray-panel.html'));
  dockWin.once('ready-to-show', () => {
    dockWin.show();
    dockWin.webContents.send('refresh-list');
  });

  dockWin.on('blur', () => dockWin && !dockWin.isDestroyed() && dockWin.hide());
  dockWin.on('closed', () => { dockWin = null; });
}

module.exports = { createTray, toggleDock };
