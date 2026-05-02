const { app, ipcMain, systemPreferences, dialog } = require('electron');
const wm = require('./windowManager');
const { createTray } = require('./tray');
const { registerShortcuts, unregisterAll } = require('./shortcuts');

// macOS：声明为 accessory 类 app（等同 Alfred/Bartender 等工具）
// 效果：不出现在 Dock / Cmd+Tab，窗口始终出现在用户当前 Space，
//       不触发 Space 切换动画，这是解决截图跳桌面的根本修复
if (process.platform === 'darwin') {
  app.setActivationPolicy('accessory');
}

app.whenReady().then(async () => {
  // 检查并请求屏幕录制权限（macOS 10.15+）
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('screen');
    console.log('[SnapPin] Screen recording permission:', status);
    if (status !== 'granted') {
      const { shell } = require('electron');
      const electronPath = process.execPath;
      const choice = dialog.showMessageBoxSync({
        type: 'warning',
        title: 'SnapPin 需要屏幕录制权限',
        message: `屏幕录制权限未授权（状态：${status}）\n\n需要在系统设置中手动添加以下程序：\n${electronPath}\n\n点击「打开设置」，在屏幕录制列表中找到或添加上述程序，勾选后重启应用。`,
        buttons: ['打开设置', '忽略'],
        defaultId: 0
      });
      if (choice === 0) {
        shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
      }
    }
  }
  wm.setupIPC();
  createTray();
  registerShortcuts(wm);
  wm.restoreWindows();
});

app.on('window-all-closed', () => {
  // 保持后台运行，不退出
});

app.on('will-quit', () => {
  unregisterAll();
});
