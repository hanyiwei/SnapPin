const { Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const config = require('../configs/default.json');

const VERSION = require('../package.json').version;

let tray = null;
let allVisible = true;

function buildMenu(wm) {
  const sc = config.shortcuts;
  return Menu.buildFromTemplate([
    {
      label: '全部关闭', click: () => {
        wm.closeAll();
        allVisible = false;
        tray.setContextMenu(buildMenu(wm));
      }
    },
    {
      label: allVisible ? '全部隐藏' : '全部显示',
      click: () => {
        if (allVisible) {
          wm.hideAll();
          allVisible = false;
        } else {
          wm.showAll();
          allVisible = true;
        }
        tray.setContextMenu(buildMenu(wm));
      }
    },
    { type: 'separator' },
    {
      label: `新建文本贴    ${sc.newNote}`, click: () => wm.showQuickInput()
    },
    {
      label: `新建截图贴    ${sc.screenshot}`, click: () => wm.startSnapCapture()
    },
    { type: 'separator' },
    {
      label: '设置', click: () => wm.showSettings()
    },
    {
      label: `检查更新    v${VERSION}`, click: () => {
        shell.openExternal('https://github.com/hanyiwei/SnapPin/releases');
      }
    },
    { type: 'separator' },
    {
      label: '退出', click: () => { require('electron').app.quit(); }
    }
  ]);
}

function createTray(wm) {
  let icon;
  try {
    icon = nativeImage.createFromPath(path.join(__dirname, '../assets/icon.png'));
    if (process.platform === 'darwin') {
      icon = icon.resize({ width: 22, height: 22 });
      icon.setTemplateImage(true);
    }
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('SnapPin');
  tray.setContextMenu(buildMenu(wm));
}

module.exports = { createTray };
