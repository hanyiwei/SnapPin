const Store = require('electron-store');
module.exports = new Store({ name: 'snappin-data', defaults: { windows: [] } });
