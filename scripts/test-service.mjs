// Test the TV-side service against a synthetic remote-control API on loopback. No TV access.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import { once } from 'node:events';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../service/service.js', import.meta.url), 'utf8');
const SERVICE = JSON.parse(readFileSync(new URL('../service/package.json', import.meta.url), 'utf8')).name;

// Runs service.js as the TV would, with its TCP connection redirected to `port`.
function load(port) {
  const handlers = {}, connected = [];
  function Service(name) { assert.equal(name, SERVICE); }
  Service.prototype.register = (method, handler) => { handlers[method] = handler; };
  const modules = {
    crypto, 'webos-service': Service, './package.json': { name: SERVICE },
    net: { connect(to, host) { connected.push({ to, host }); return net.connect(port, '127.0.0.1'); } }
  };
  vm.runInNewContext(source, { require: name => modules[name], Buffer, setTimeout, clearTimeout });
  return {
    connected,
    call: (method, payload) => new Promise(resolve => handlers[method]({ payload, respond: resolve }))
  };
}

function serverFrame(opcode, data, fin = true) {
  const n = data.length, head = n < 126 ? Buffer.from([(fin ? 0x80 : 0) | opcode, n])
    : n < 65536 ? Buffer.from([(fin ? 0x80 : 0) | opcode, 126, n >> 8, n & 0xff])
    : Buffer.concat([Buffer.from([(fin ? 0x80 : 0) | opcode, 127, 0, 0, 0, 0]), (b => { b.writeUInt32BE(n); return b; })(Buffer.alloc(4))]);
  return Buffer.concat([head, data]);
}

// A minimal remote-control API: one scripted conversation per connection.
async function fakeTv(script) {
  const seen = { requests: [], frames: [], origins: [] }, sockets = new Set();
  const server = net.createServer(socket => {
    let buffer = Buffer.alloc(0), open = false;
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    const send = (message, opcode = 1) => socket.write(serverFrame(opcode, Buffer.from(typeof message === 'string' ? message : JSON.stringify(message))));
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!open) {
        const end = buffer.indexOf('\r\n\r\n');
        if (end < 0) return;
        const head = buffer.subarray(0, end).toString(), key = /Sec-WebSocket-Key: (.+)/.exec(head)[1].trim();
        seen.origins.push(/Origin: (.+)/.exec(head)[1].trim());
        assert.equal(Buffer.from(key, 'base64').length, 16);
        buffer = buffer.subarray(end + 4); open = true;
        if (script.handshake) { socket.end(script.handshake); return; }
        const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
        socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
      }
      while (buffer.length >= 6) {
        const opcode = buffer[0] & 0x0f, masked = buffer[1] & 0x80;
        let n = buffer[1] & 0x7f, at = 2;
        if (n === 126) { n = buffer.readUInt16BE(2); at = 4; }
        if (buffer.length < at + 4 + n) return;
        const mask = buffer.subarray(at, at + 4), data = Buffer.from(buffer.subarray(at + 4, at + 4 + n));
        for (let i = 0; i < n; i++) data[i] ^= mask[i % 4];
        buffer = buffer.subarray(at + 4 + n);
        seen.frames.push({ opcode, masked: !!masked });
        if (opcode !== 1) continue;
        const message = JSON.parse(data.toString());
        seen.requests.push(message);
        script.reply(message, send, socket);
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  // Closing also drops a connection a failed test left waiting.
  const close = () => new Promise(r => { sockets.forEach(socket => socket.destroy()); server.close(r); });
  return { port: server.address().port, seen, close };
}

const POINTS = Array.from({ length: 400 }, (_, i) => ({
  id: 'app.' + i, title: 'App ' + i + ' ' + 'é'.repeat(40), icon: '/usr/palm/applications/app.' + i + '/icon.png',
  largeIcon: '/usr/palm/applications/app.' + i + '/large.png', bgColor: '#000000', params: { secret: 'not forwarded' }
}));

test('a new client is asked once, then receives the trimmed app list and its client key', async () => {
  const tv = await fakeTv({ reply(message, send, socket) {
    if (message.type === 'register') {
      assert.deepEqual(message.payload.manifest.permissions, ['READ_INSTALLED_APPS']);
      assert.equal(message.payload['client-key'], undefined);
      send({ type: 'response', id: 'register', payload: { pairingType: 'PROMPT', returnValue: true } });
      send('', 9);  // A ping while the owner decides.
      send({ type: 'registered', id: 'register', payload: { 'client-key': 'fresh-key' } });
      return;
    }
    // A reply over 64 KB, continued in a second frame in the middle of a two-byte character.
    const body = Buffer.from(JSON.stringify({ type: 'response', id: message.id, payload: { returnValue: true, launchPoints: POINTS } }));
    const cut = body.indexOf('é') + 1;
    socket.write(serverFrame(1, body.subarray(0, cut), false));
    socket.write(serverFrame(0, body.subarray(cut)));
  } });
  const service = load(tv.port), result = await service.call('launchPoints', { clientKey: '' });
  assert.equal(result.returnValue, true);
  assert.equal(result.clientKey, 'fresh-key');
  assert.equal(result.launchPoints.length, POINTS.length);
  assert.deepEqual(Object.keys(result.launchPoints[0]).sort().join(), 'icon,id,largeIcon,title');
  assert.equal(result.launchPoints[7].title, POINTS[7].title);
  assert.deepEqual(service.connected, [{ to: 3000, host: '127.0.0.1' }]);  // Recorded in this realm.
  assert.deepEqual(tv.seen.origins, ['file://']);
  assert.deepEqual(tv.seen.requests.map(r => r.uri || r.type), ['register', 'ssap://com.webos.applicationManager/listLaunchPoints']);
  assert.ok(tv.seen.frames.every(f => f.masked));
  assert.ok(tv.seen.frames.some(f => f.opcode === 10));
  await tv.close();
});

test('a stored client key is presented and no prompt is needed', async () => {
  const tv = await fakeTv({ reply(message, send) {
    if (message.type === 'register') send({ type: 'registered', id: 'register', payload: { 'client-key': message.payload['client-key'] } });
    else send({ type: 'response', id: message.id, payload: { returnValue: true, launchPoints: POINTS.slice(0, 2) } });
  } });
  const result = await load(tv.port).call('launchPoints', { clientKey: 'kept-key' });
  assert.equal(tv.seen.requests[0].payload['client-key'], 'kept-key');
  assert.deepEqual([result.returnValue, result.clientKey, result.launchPoints.length], [true, 'kept-key', 2]);
  await tv.close();
});

test('an owner who declines on the TV is reported as a refusal', async () => {
  const tv = await fakeTv({ reply(message, send) { send({ type: 'error', id: 'register', error: '403 User denied access' }); } });
  const result = await load(tv.port).call('launchPoints', { clientKey: '' });
  assert.deepEqual({ ...result }, { returnValue: false, refused: true, errorText: '403 User denied access' });
  await tv.close();
});

test('a refused handshake or a closed port fails without a refusal', async () => {
  const tv = await fakeTv({ handshake: 'HTTP/1.1 403 Forbidden\r\n\r\n', reply() {} });
  const refused = await load(tv.port).call('launchPoints', {});
  assert.equal(refused.returnValue, false);
  assert.equal(refused.refused, undefined);
  await tv.close();
  const closed = await load(tv.port).call('launchPoints', { clientKey: '' });
  assert.equal(closed.returnValue, false);
  assert.equal(closed.refused, undefined);
});

test('a failed list request answers once with an error', async () => {
  const tv = await fakeTv({ reply(message, send) {
    if (message.type === 'register') send({ type: 'registered', id: 'register', payload: { 'client-key': 'k' } });
    else send({ type: 'error', id: message.id, error: '401 insufficient permissions' });
  } });
  const result = await load(tv.port).call('launchPoints', { clientKey: 'k' });
  assert.deepEqual({ ...result }, { returnValue: false, errorText: '401 insufficient permissions' });
  await tv.close();
});
