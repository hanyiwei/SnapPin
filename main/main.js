const { app, systemPreferences, dialog, shell } = require('electron');
const wm = require('./windowManager');
const { createTray } = require('./tray');
const { registerShortcuts, unregisterAll } = require('./shortcuts');

if (process.platform === 'darwin') {
  app.setActivationPolicy('accessory');
}

app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('screen');
    if (status !== 'granted') {
      dialog.showMessageBoxSync({
        type: 'warning',
        title: '需要屏幕录制权限',
        message: 'SnapPin 的核心功能依赖屏幕录制权限。\n\n请在系统设置中授权后重新打开 SnapPin。',
        buttons: ['打开设置并退出']
      });
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
      app.quit();
      return;
    }
  }
  wm.setupIPC();
  createTray(wm);
  registerShortcuts(wm);
  wm.restoreWindows();
});

app.on('window-all-closed', () => {});

app.on('will-quit', () => {
  unregisterAll();
});
