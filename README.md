![Diglet](https://raw.githubusercontent.com/bookchin/diglet/master/static/diglet.png)
========

[![NPM](https://img.shields.io/npm/v/diglet.svg?style=flat-square)](https://www.npmjs.com/package/diglet)
[![License](https://img.shields.io/badge/license-AGPL3.0-blue.svg?style=flat-square)](https://gitlab.com/bookchin/diglet/raw/master/LICENSE)

Diglet is an *end-to-end encrypted* reverse HTTPS tunnel server and client. It 
enables you to securely make any HTTP(S) server running behind a restrictive 
NAT or firewall to the internet.

Installation
------------

Diglet depends on Node.js LTS and the appropriate packages for building native 
modules for your platform.

```bash
# install nodejs via node version manager
# skip this step on windows and just install the package from nodejs.org
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.11/install.sh | bash

# source node version manager
source ~/.bashrc

# install nodejs lts release
nvm install --lts

# install build dependencies (debian based)
#   apt install build-essential 
# 
# install build dependencies (macos / osx)
#   xcode-select --install
# 
# install build dependencies (windows)
#   npm install -g windows-build-tools

# install diglet using node package manager
npm install -g diglet
```

Client Tunneling
----------------

Once you have the `diglet` package installed, you can use it to establish a 
reverse tunnel from a local HTTP(S) server to a diglet server on the internet.
By default, diglet is configured to use a test server `tunnel.bookch.in`. Don't
depend on it, but if it's online you can feel free to test with it. It is 
recommended to run your own diglet server, which is described in detail in the 
next section.

Setting up a tunnel is easy. Let's say you have a website running at 
`localhost:8080`:

```bash
diglet tunnel --port 8080
```

Diglet will establish a tunnel and print your unique public URL to the console. 
If you would like more verbose logging, which can be useful for debugging, add 
the `--debug` flag to the above command. Your unique URL includes a subdomain 
that is a 160 bit hash of your public key. The private portion of this key is 
generated automatically every time you run diglet. 

If you want to re-use the same URL every time you create a tunnel, pass the 
`--save` flag and it will be saved to `$HOME/.diglet.prv` and that key will be 
used going forward when called with the `--load` option. Note that if you use a 
saved key, you must not load the same key when running multiple tunnels on the 
same host or you will get unexpected results. 

After setting up your own server, create a configuration file to reflect this 
at the path `$HOME/.digletrc`:

```
Hostname=mydomain.tld
TunnelPort=8443
```

Server Setup
------------

This guide make a few assumptions about the providers you will use for your 
server and for your domains, however this should translate to any number of 
other providers.

### Step 1: Create a VPS on Digital Ocean

* Login or create an account at [Digital Ocean](https://digitalocean.com), then 
navigate to *Droplets > Create*. Under *Distributions*, select *Debian*.
* Diglet does not require very many resources, so you may safely select the 
cheapest option with *1 vCPU + 1GB Memory*.
* Be sure to add your SSH public key to the droplet so we are able to log into 
it when we are ready.
* Name your droplet something memorable like "diglet-server" and create it.
* When your droplet is finished being created, take note of its IP address, 
because we'll need it for the next step.

### Step 2: Setup DNS A Records on Namecheap

* Login or create an account at [Namecheap](https://namecheap.com), then either 
purchase a new domain or navigate to your existing domain list.
* Navigate to *Advanced DNS* and create a two new A records:
  * `@ -> <droplet ip address>`
  * `* -> <droplet ip address>`
* You'll want to set the TTL to the lowest available option, because we want 
this to propagate as quickly as possible so we can generate our SSL 
certificate.

### Step 3: Generate Wildcard SSL with LetsEncrypt

SSH into your droplet with `ssh root@<your droplet ip address>` and install 
LetsEncrypt's `certbot-auto` program. The version that is in the Debian 
repositories does not support wildcard certs, so you must install with:

```bash
# download the certbot program
wget https://dl.eff.org/certbot-auto

# make it executable
chmod +x certbot-auto

# request certificates for your domain and wildcard subdomain
./certbot-auto certonly --manual -d *.mydomainname.tld \ 
--agree-tos \
--no-bootstrap --manual-public-ip-logging-ok --preferred-challenges dns-01 \
-m your-email-address  \
--server https://acme-v02.api.letsencrypt.org/directory
```

Certbot will do some work and respond with something similar to:

```
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
Please deploy a DNS TXT record under the name
_acme-challenge.tunnel.bookch.in with the following value:

20BbljVikhE2Hc4O6LsFoBuxUNSycRkioV2sezLnVLA

Before continuing, verify the record is deployed.
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
Press Enter to Continue

```

Log back into Namecheap and navigate back to *Domain List > Domain > Advanced 
DNS* and create a new TXT record according to the instructions provided by 
certbot. Set TTL to 1 minute and save. Come back to your SSH session where 
certbot is waiting and press enter. Certbot will verify the TXT record and 
issue you a wildcard subdomain certificate and private key will be placed in 
`/etc/letsencrypt/live/mydomain.tld/`. Note that path, because you'll need it 
in the next step where we will configure our Diglet server.

### Step 4: Configure Diglet Server



How It Works
------------



Programmatic Usage
------------------

You can establish a reverse tunnel programmatically from other Node.js 
programs easily. Just install diglet as a dependency of your project:

```bash
npm install diglet --save
```

Import the module and use the `Tunnel` class:

```js
const { Tunnel } = require('diglet');
const options = {
  localAddress: '127.0.0.1',
  localPort: 8080,
  remoteAddress: 'mydigletserver.tld',
  remotePort: 8443,
  logger: console, // optional
  privateKey: require('crypto').randomBytes(32) // optional
};
const tunnel = new Tunnel(options);

tunnel.once('established', function() {
  console.log(tunnel.url);
});

tunnel.once('error', function(err) {
  console.error(err);
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


