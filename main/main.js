const { app, systemPreferences, dialog } = require('electron');
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
      const { shell } = require('electron');
      const choice = dialog.showMessageBoxSync({
        type: 'warning',
        title: 'SnapPin 需要屏幕录制权限',
        message: `屏幕录制权限未授权（状态：${status}）\n\n需要在系统设置中手动添加此程序。`,
        buttons: ['打开设置', '忽略'],
        defaultId: 0
      });
      if (choice === 0) {
        shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
      }
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
