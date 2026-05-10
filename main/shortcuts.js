const { globalShortcut } = require('electron');
const config = require('../configs/default.json');

let registered = [];

function registerShortcuts(wm) {
  const keys = config.shortcuts;
  if (keys.screenshot) {
    globalShortcut.register(keys.screenshot, () => wm.startSnapCapture());
    registered.push(keys.screenshot);
  }
  if (keys.newNote) {
    globalShortcut.register(keys.newNote, () => wm.showQuickInput());
    registered.push(keys.newNote);
  }
}

function unregisterAll() {
  globalShortcut.unregisterAll();
  registered = [];
}

module.exports = { registerShortcuts, unregisterAll };
