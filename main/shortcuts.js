const { globalShortcut } = require('electron');

let loadedConfig;
function loadConfig() {
  delete require.cache[require.resolve('../configs/default.json')];
  loadedConfig = require('../configs/default.json');
  return loadedConfig;
}

function registerShortcuts(wm) {
  const cfg = loadConfig();
  const keys = cfg.shortcuts;
  if (keys.screenshot) {
    const ok = globalShortcut.register(keys.screenshot, () => wm.startSnapCapture());
    if (!ok) console.error('[SnapPin] shortcut registration failed:', keys.screenshot);
  }
  if (keys.newNote) {
    const ok = globalShortcut.register(keys.newNote, () => wm.showQuickInput());
    if (!ok) console.error('[SnapPin] shortcut registration failed:', keys.newNote);
  }
}

function unregisterAll() {
  globalShortcut.unregisterAll();
}

module.exports = { registerShortcuts, unregisterAll };
