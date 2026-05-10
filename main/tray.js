const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');

let tray = null;

function createTray(wm) {
  let icon;
  try {
    icon = nativeImage.createFromPath(path.join(__dirname, '../assets/icon.png'));
    if (process.platform === 'darwin') {
      icon = icon.resize({ width: 22, height: 22 });
      icon.setTemplateImage(true);
    } else {
      // 不 resize，系统自行处理高分屏缩放
    }
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('SnapPin');

  const menu = Menu.buildFromTemplate([
    {
      label: '全部隐藏', click: () => wm.hideAll()
    },
    {
      label: '全部显示', click: () => wm.showAll()
    },
    { type: 'separator' },
    {
      label: '新建文本贴', click: () => wm.showQuickInput()
    },
    {
      label: '新建截图贴', click: () => wm.startSnapCapture()
    },
    { type: 'separator' },
    {
      label: '退出', click: () => { require('electron').app.quit(); }
    }
  ]);

  tray.setContextMenu(menu);
}

module.exports = { createTray };
