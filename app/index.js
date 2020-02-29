const { app, Menu, BrowserWindow } = require('electron');
const path = require('path');

if (require('electron-squirrel-startup')) { // eslint-disable-line global-require
  app.quit();
}

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 600,
    minWidth: 600,
    maxWidth: 600,
    height: 600,
    minHeight: 600,
    show: false,
    icon: path.join(__dirname, 'assets/img/logo-app-icon.png'),
    webPreferences: {
      nodeIntegration: true
    }
  });

  win.toggleDevTools()
  Menu.setApplicationMenu(null);
  win.loadURL(`file://${__dirname}/index.html`);
  win.on('closed', () => win = null);
  win.once('ready-to-show', () => win.show());
};

app.on('ready', () => createWindow());
app.on('window-all-closed', () => app.quit());

