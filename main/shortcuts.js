const { globalShortcut } = require('electron');
const store = require('./store');

function registerShortcuts(wm) {
  const shortcuts = store.get('shortcuts');

  // 截图
  globalShortcut.register(shortcuts.screenshot, () => {
    wm.createCaptureWindow((err, imgPath, rect) => {
      if (!err) wm.createScreenshotWindow(imgPath, rect);
    });
  });

  // 新建文本便签
  globalShortcut.register(shortcuts.newNote, () => {
    wm.createQuickInputWindow();
  });

  // 打开/关闭便签坞
  globalShortcut.register(shortcuts.toggleDock, () => {
    const { toggleDock } = require('./tray');
    toggleDock();
  });
}

function unregisterAll() {
  globalShortcut.unregisterAll();
}

module.exports = { registerShortcuts, unregisterAll };
