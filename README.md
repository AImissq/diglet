Diglet
======

[![Build Status](https://img.shields.io/travis/bookchin/diglet.svg?style=flat-square)](https://travis-ci.org/Storj/diglet)
[![Coverage Status](https://img.shields.io/coveralls/bookchin/diglet.svg?style=flat-square)](https://coveralls.io/r/bookchin/diglet)
[![NPM](https://img.shields.io/npm/v/diglet.svg?style=flat-square)](https://www.npmjs.com/package/diglet)
[![License](https://img.shields.io/badge/license-AGPL3.0-blue.svg?style=flat-square)](https://raw.githubusercontent.com/bookchin/diglet/master/LICENSE)

Simple HTTP tunneling. Expose a local server behind NAT or firewall to the 
internet. [Read the documentation here](http://bookch.in/diglet).

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
diglet server --host diglet.me --port 80
```

Expose a service on port 8080 from your local computer with:

```
diglet client --local 8080 --remote diglet.me
```

Programmatic Usage
------------------

```
// TODO
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
along with this program.  If not, see <http://www.gnu.org/licenses/>.


