![Diglet](https://raw.githubusercontent.com/bookchin/diglet/master/static/diglet.png)
========

[![Build Status](https://img.shields.io/travis/bookchin/diglet.svg?style=flat-square)](https://travis-ci.org/bookchin/diglet)
[![Coverage Status](https://img.shields.io/coveralls/bookchin/diglet.svg?style=flat-square)](https://coveralls.io/r/bookchin/diglet)
[![NPM](https://img.shields.io/npm/v/diglet.svg?style=flat-square)](https://www.npmjs.com/package/diglet)
[![License](https://img.shields.io/badge/license-AGPL3.0-blue.svg?style=flat-square)](https://raw.githubusercontent.com/bookchin/diglet/master/LICENSE)

Simple HTTP tunneling. Expose a local server behind NAT or firewall to the 
internet. [Read the documentation here](http://bookch.in/diglet).

> Diglet is basically just a [localtunnel](https://localtunnel.github.io/www/) 
> bikeshed that aims to provide a more flexible programmatic interface.

```bash
npm install -g diglet
```

Basic Usage
-----------

Diglet can be used out of the box with zero configuration to tunnel a local 
server through to the internet with the `diglet` command line program. This 
works by establishing a connection with a diglet server that is already on 
the internet. A diglet client running on your computer is used to open this 
connection along with a connection to your local server. Requests received
by the remote diglet server are proxied through you your connected diglet 
client which then proxies the connection to your local server and back.

Start a diglet server on the remote host simply with:

```bash
diglet server
```

Expose a service on port 8080 from your local computer with:

```
diglet client 8080
```

Config
------

Diglet loads configuration from a `.digletrc` file. This file can be in either 
INI or JSON format. The file may be placed in any of the following locations, 
in order of load preference:

* `$HOME/.digletrc`
* `$HOME/.diglet/config`
* `$HOME/.config/diglet`
* `$HOME/.config/diglet/config`
* `/etc/digletrc`
* `/etc/diglet/config`

A `.digletrc` file may contain any of the following:

```ini
; Configuration for running a remote diglet server

[server]
  ; Server hostname for parsing subdomains as proxy IDs
  serverHost = diglet.me
  ; Server port to listen on
  serverPort = 80
  ; Maximum number of tunnel connections from client per-proxy
  proxyMaxConnections = 12
  ; Maximum number of proxies the server will establish
  maxProxiesAllowed = 24
  ; Time to wait for client to connect before destroying proxy
  proxyIdleTimeout = 5000
  ; Time to wait before giving up on a proxied socket agent
  proxySocketTimeout = 5000

[server.proxyPortRange]
  ; Starting port for opening client proxies
  min = 12000
  ; Ending port for opening client proxies
  max = 12023

; Configuration for running a local diglet client

[client]
  ; Hostname for the local server (or any server on network)
  localAddress = localhost
  ; Default port for the local server (or any server on network)
  localPort = 8080
  ; Diglet server hostname to use
  remoteAddress = diglet.me
  ; Diglet server port to use
  remotePort = 80
  ; Number of tunnel connections to maintain to proxy
  maxConnections = 12
```

Programmatic Usage
------------------

While diglet may be used as a standalone tunnel server/client, it's primary 
objective is to be used as a library for implementing your own tunneling 
system - which is useful for distributed applications/networks.

Diglet exposes a simple interface for accomplishing this; there are only a 
few components:

1. `diglet.Server`
2. `diglet.Proxy`
3. `diglet.Tunnel`

### `diglet.Server`

The server component is used to manage a collection of `diglet.Proxy` 
instances. It is not a traditional server in that it does not need to be bound 
to a port itself, so it can be used simply as a management interface within 
your own server.

You create a `diglet.Server` with some options dictating how it should open 
client tunnels and expose them to the world, then your application may choose 
how to route requests to those tunnels.

```js
const diglet = require('diglet');
const server = new diglet.Server({
  proxyPortRange: { min: 9000, max: 9009 },
  maxProxiesAllowed: 10,
  proxyMaxConnections: 6,
  proxyIdleTimeout: 2000,
  logger: console
});
```

Once you have created a `diglet.Server`, you can use it to create proxies and 
route requests to them. For example, you might implement an API endpoint that 
your users hit to create a proxy for them:

```js
const app = require('express')();

app.get('/proxy', (req, res, next) => {
  server.addProxy(req.query.proxyId, (err, proxy) => {
    if (err) {
      return next(err);
    }

    res.json({
      publicUrl: 'https://mydomain.tld/proxy/' + proxy.getProxyId(),
      tunnelHost: 'mydomain.tld',
      tunnelPort: proxy.getProxyPort()
    });
  });
});
```

The result of this API request provides a client with enough information to 
establish a tunnel connection using a `diglet.Tunnel`. You also need a way to 
route incoming requests to your own server down through your client's tunnel.

```js
app.use('/proxy/:proxyId', (req, res, next) => {
  server.routeHttpRequest(req.params.proxyId, req, res, (didRoute) => {
    console.info('The request was routed to tunnel? ', didRoute);
  });
});
```

### `diglet.Tunnel`

The last piece to this puzzle is establishing a tunnel to the "back-side" of 
the proxy. A tunnel consists of a pool of TCP sockets to the proxy with each 
bearing a corresponding TCP socket to a local address and port (the service 
the client wishes to expose).

> In the example above, the proxy server is routing to tunnels based on the URL 
> path, so we will need to account for that in our tunnel by transforming the 
> request path before passing the request back to our local server.

```js
const pathTransformer = getTransformStreamToRewriteHttpPath();
const tunnel = new diglet.Tunnel({
  maxConnections: 6,
  logger: console,
  localAddress: 'localhost',
  localPort: 8080,
  remoteAddress: 'mydomain.tld',
  remotePort: 12000, // result from proxy.getProxyPort()
  transform: pathTransformer
});

tunnel.once('established', function() {
  console.info('tunnel is established!');
});

tunnel.open();
```

License
-------

Diglet - Simple HTTP Tunneling  
Copyright (C) 2016 Gordon Hall

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see http://www.gnu.org/licenses/.


