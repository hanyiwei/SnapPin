const Store = require('electron-store');

const store = new Store({
  name: 'snappin-data',
  defaults: {
    shortcuts: {
      screenshot: 'CommandOrControl+Shift+A',
      newNote: 'CommandOrControl+Shift+T',
      toggleDock: 'CommandOrControl+Shift+B'
    },
    windows: [],      // 持久化的浮窗列表
    autoPin: true,
    maxImageWidth: 600
  }
});

module.exports = store;
