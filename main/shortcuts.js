const { globalShortcut } = require('electron');
const config = require('../configs/default.json');

function registerShortcuts(wm) {
  const keys = config.shortcuts;
  if (keys.screenshot) {
    globalShortcut.register(keys.screenshot, () => wm.startSnapCapture());
  }
  if (keys.newNote) {
    globalShortcut.register(keys.newNote, () => wm.showQuickInput());
  }
}

function unregisterAll() {
  globalShortcut.unregisterAll();
}

module.exports = { registerShortcuts, unregisterAll };
