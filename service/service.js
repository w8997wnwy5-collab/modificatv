/* CleanFrame's helper on the TV: asks LG's remote-control API on 127.0.0.1:3000 for the installed
   apps, which current firmware refuses to the web page's own origin. The TV asks its owner once;
   the client key it returns stays with the app. Only the app list is requested or returned.
   Approach from Free My TV (MIT): https://github.com/simbasjungles/free-my-tv */
var crypto = require('crypto');
var net = require('net');
var Service = require('webos-service');

var service = new Service(require('./package.json').name);
var PORT = 3000, TIMEOUT = 90000;   // Time for the owner to answer the TV's prompt.
var MANIFEST = { manifestVersion: 1, appVersion: '1.0', permissions: ['READ_INSTALLED_APPS'] };

function bytes(value) { return Buffer.from ? Buffer.from(value) : new Buffer(value); }

// Client frames must be masked.
function frame(opcode, data) {
  var n = data.length, mask = crypto.randomBytes(4), head, i;
  if (n < 126) head = bytes([0x80 | opcode, 0x80 | n]);
  else if (n < 65536) head = bytes([0x80 | opcode, 0xfe, n >> 8, n & 0xff]);
  else throw new Error('Request too large');
  data = bytes(data);
  for (i = 0; i < n; i++) data[i] ^= mask[i % 4];
  return Buffer.concat([head, mask, data]);
}

function launchPoints(clientKey, done) {
  var socket = net.connect(PORT, '127.0.0.1'), buffer = bytes([]), parts = [], open = false, finished = false;
  var timer = setTimeout(function () { finish({ returnValue: false, errorText: 'The TV did not answer.' }); }, TIMEOUT);
  function finish(result) {
    if (finished) return;
    finished = true; clearTimeout(timer); socket.destroy();
    done(result);
  }
  function send(message) { socket.write(frame(1, bytes(JSON.stringify(message)))); }
  function received(message) {
    if (message.type === 'registered') {
      clientKey = message.payload && message.payload['client-key'] || clientKey;
      send({ type: 'request', id: 'list', uri: 'ssap://com.webos.applicationManager/listLaunchPoints' });
    } else if (message.id === 'register' && message.type === 'error') {
      finish({ returnValue: false, refused: true, errorText: message.error || 'Not allowed on the TV.' });
    } else if (message.id === 'list') {
      var points = message.type !== 'error' && message.payload && message.payload.launchPoints;
      if (!points) { finish({ returnValue: false, errorText: message.error || 'No app list.' }); return; }
      finish({ returnValue: true, clientKey: clientKey, launchPoints: points.map(function (p) {
        return { id: p.id, title: p.title, icon: p.icon, largeIcon: p.largeIcon };
      }) });
    }
  }
  socket.on('connect', function () {
    socket.write('GET / HTTP/1.1\r\nHost: 127.0.0.1:' + PORT + '\r\nOrigin: file://\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
      + 'Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ' + crypto.randomBytes(16).toString('base64') + '\r\n\r\n');
  });
  socket.on('data', function (chunk) {
    var end, payload, fin, opcode, n, at, data, message;
    buffer = Buffer.concat([buffer, chunk]);
    if (!open) {
      end = buffer.toString('binary').indexOf('\r\n\r\n');
      if (end < 0) return;
      if (!/^HTTP\/1\.1 101/.test(buffer.toString('binary', 0, 12))) { finish({ returnValue: false, errorText: 'The remote-control API is off.' }); return; }
      open = true; buffer = buffer.slice(end + 4);
      payload = { forcePairing: false, pairingType: 'PROMPT', manifest: MANIFEST };
      if (clientKey) payload['client-key'] = clientKey;
      send({ type: 'register', id: 'register', payload: payload });
    }
    // Server frames are unmasked; a message may continue across frames until FIN.
    while (buffer.length >= 2) {
      fin = buffer[0] & 0x80; opcode = buffer[0] & 0x0f; n = buffer[1] & 0x7f; at = 2;
      if (n === 126) { if (buffer.length < 4) return; n = buffer.readUInt16BE(2); at = 4; }
      else if (n === 127) { if (buffer.length < 10) return; n = buffer.readUInt32BE(6); at = 10; }
      if (buffer.length < at + n) return;
      data = buffer.slice(at, at + n); buffer = buffer.slice(at + n);
      if (opcode === 8) { finish({ returnValue: false, errorText: 'The TV closed the connection.' }); return; }
      if (opcode === 9) { socket.write(frame(10, data)); continue; }
      if (opcode !== 0 && opcode !== 1) continue;
      parts.push(data);
      if (!fin) continue;
      message = null;
      try { message = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch (err) { message = null; }
      parts = [];
      if (message) received(message);
    }
  });
  socket.on('error', function () { finish({ returnValue: false, errorText: 'The remote-control API is unavailable.' }); });
  socket.on('close', function () { finish({ returnValue: false, errorText: 'The TV closed the connection.' }); });
}

service.register('launchPoints', function (message) {
  var key = message.payload && typeof message.payload.clientKey === 'string' ? message.payload.clientKey : '';
  launchPoints(key, function (result) { message.respond(result); });
});
