'use strict';

const { ipcRenderer, remote } = require('electron');
const { shell, app, dialog } = remote;

const async = require('async');
const { randomBytes } = require('crypto');
const config = require('../bin/_config');
const bunyan = require('bunyan');
const httpServer = require('http-server');
const { Tunnel } = require('../lib');
const Vue = require('vue/dist/vue');


const tunnel = Vue.component('tunnel', {
  data: function() {
    return {
      isShutdown: false,
      loading: false,
      tunnelEstablished: false,
      tunnelUrls: [],
      error: '',
      localServerPort: 0,
    };
  },
  methods: {
    setupWebServer: function(cb) {
      this.server = httpServer.createServer({
        root: this.rootdir
      });

      this.server.listen(0, () => {
        this.localServerPort = this.server.server.address().port;
        cb && cb();
      });
    },
    establishTunnel: function(cb) {
      this.tunnelUrls = [];
      this.logger = bunyan.createLogger({ name: 'digletapp' });
      this.tunnel = new Tunnel({
        localAddress: '127.0.0.1',
        localPort: this.localServerPort,
        remoteAddress: config.Hostname,
        remotePort: parseInt(config.TunnelPort),
        logger: this.logger,
        privateKey: randomBytes(32),
      });

      this.tunnel.once('connected', () => {
        this.tunnelUrls.push(this.tunnel.url);
        this.tunnel.queryProxyInfoFromServer({ rejectUnauthorized: false })
          .then(info => {
            this.tunnelUrls.push(this.tunnel.aliasUrl(info.alias));
            cb && cb();
          })
          .catch(cb);
      });

      this.tunnel.once('error', e => {
        this.error = e.message;
      });

      this.tunnel.open();
    },
    init: function() {
      this.loading = true;
      async.series([
        (cb) => this.setupWebServer(cb),
        (cb) => this.establishTunnel(cb)
      ], err => {
        this.loading = false;
        this.error = err ? err.message : '';
        this.tunnelEstablished = !!err;
      });
    },
    openLink: function(url) {
      shell.openExternal(url);
    },
    shutdown: function() {
      this.server.server.close();
      this.tunnel.close();
      this.isShutdown = true;
    }
  },
  props: {
    rootdir: {
      type: String,
      default: ''
    }
  },
  mounted: function() {
    this.init();
  },
  template: `
    <div class="tunnel">
      <ul v-if="!isShutdown">
        <li><i class="fas fa-folder"></i> {{rootdir}}</li>
        <li v-for="url in tunnelUrls"><i class="fas fa-link"></i> <a href="#" v-on:click="openLink(url)">{{url}}</a></li>
        <li v-if="loading" class="loading"><i class="fas fa-link"></i> Establishing...</li>
        <li class="success" v-if="!error && !loading"><i class="fas fa-check-circle"></i> Online</li>
        <li class="error" v-if="error"><i class="fas fa-exclamation-circle"></i> Offline ({{error}})</li>
        <li><button v-on:click="shutdown"><i class="fas fa-window-close"></i> Shutdown</button></li>
      </ul>
    </div>
  `
});

const diglet = new Vue({
  el: '#app',
  data: {
    tunnels: []
  },
  methods: {
    addFiles: function() {
      remote.dialog.showOpenDialog({
        title: 'Select Directory',
        buttonLabel: 'Establish Tunnel',
        properties: ['openDirectory']
      }).then(result => {
        if (result.filePaths.length) {
          this.tunnels.push({ rootdir: result.filePaths.join(',') });
        }
      });
    }
  },
  mounted: function() {
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    });
    document.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  }
});
