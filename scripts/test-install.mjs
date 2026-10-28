// Test scripts/install-tv.sh end to end against a synthetic TV on loopback: a Key Server, an SSH
// server for the Developer Mode user and a scripted luna-send-pub. Uses the system's OpenSSH client.
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { once } from 'node:events';
import test from 'node:test';
import ssh2 from 'ssh2';

const root = new URL('../', import.meta.url).pathname;
const hasSsh = ['ssh', 'ssh-keygen', 'tar'].every(tool => spawnSync('sh', ['-c', 'command -v ' + tool]).status === 0);
const PASSPHRASE = 'A1b2C3';

// The files in an ar archive, and in a tar archive (enough of ustar/pax for these packages).
function ar(data) {
  assert.equal(data.subarray(0, 8).toString(), '!<arch>\n');
  const out = {};
  for (let at = 8; at + 60 <= data.length;) {
    const name = data.subarray(at, at + 16).toString().trim(), size = Number(data.subarray(at + 48, at + 58).toString().trim());
    assert.equal(data.subarray(at + 58, at + 60).toString(), '`\n');
    out[name] = data.subarray(at + 60, at + 60 + size);
    at += 60 + size + size % 2;
  }
  return out;
}
function tarFiles(gz) {
  const data = gunzipSync(gz), files = {};
  let longName = null;
  for (let at = 0; at + 512 <= data.length;) {
    const header = data.subarray(at, at + 512);
    if (header.every(b => b === 0)) break;
    const field = (start, length) => header.subarray(start, start + length).toString().replace(/\0.*$/s, '');
    const size = parseInt(field(124, 12).trim() || '0', 8), type = field(156, 1), prefix = field(345, 155);
    let name = longName || (prefix ? prefix + '/' : '') + field(0, 100);
    longName = null;
    const body = data.subarray(at + 512, at + 512 + size);
    if (type === 'x') { const m = /\d+ path=([^\n]*)\n/.exec(body.toString()); if (m) longName = m[1]; }
    else if (type === 'L') longName = body.toString().replace(/\0.*$/s, '');
    else if (type === '0' || type === '') files[name.replace(/^\.\//, '')] = body;
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

async function fakeTv(dir) {
  execFileSync('ssh-keygen', ['-q', '-t', 'rsa', '-b', '2048', '-m', 'PEM', '-N', PASSPHRASE, '-C', '', '-f', join(dir, 'webos_rsa')]);
  execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', '', '-f', join(dir, 'host')]);
  const allowed = ssh2.utils.parseKey(readFileSync(join(dir, 'webos_rsa.pub')));
  const tv = { commands: [], ptys: 0, uploads: [], installed: null, removed: false };
  const keys = createServer((req, res) => {
    if (req.url !== '/webos_rsa') { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end(readFileSync(join(dir, 'webos_rsa')));
  });
  const server = new ssh2.Server({ hostKeys: [readFileSync(join(dir, 'host'))] }, client => {
    // Only the Developer Mode user, with the key the Key Server hands out.
    client.on('authentication', ctx => {
      if (ctx.method !== 'publickey' || ctx.username !== 'prisoner' || !ctx.key.data.equals(allowed.getPublicSSH())) return ctx.reject(['publickey']);
      if (ctx.signature && allowed.verify(ctx.blob, ctx.signature, ctx.hashAlgo) !== true) return ctx.reject(['publickey']);
      ctx.accept();
    }).on('ready', () => client.on('session', accept => {
      const session = accept();
      let pty = false;
      session.on('pty', acceptPty => { pty = true; tv.ptys++; acceptPty && acceptPty(); });
      session.on('exec', (acceptExec, reject, info) => {
        const stream = acceptExec(), command = info.command;
        tv.commands.push(command);
        const done = (text, code = 0) => { if (text) stream.write(text); stream.exit(code); stream.end(); };
        if (/cat > \/media\/developer\/temp\/cleanframe\.ipk$/.test(command)) {
          const parts = [];
          stream.on('data', chunk => parts.push(chunk)).on('end', () => { tv.uploads.push(Buffer.concat(parts)); done(''); });
        } else if (command.includes('luna-send-pub')) {
          // luna-send-pub prints nothing without a terminal, as on the TV.
          const json = /'(\{.*\})'/.exec(command), payload = json && JSON.parse(json[1]);
          if (!pty || !payload) { done(''); return; }
          if (command.includes('appInstallService/dev/install')) {
            tv.installed = { payload, ipk: tv.uploads.at(-1) };
            done('{"returnValue":true,"subscribed":true}\r\n{"details":{"packageId":"' + payload.id + '","state":"installing"}}\r\n'
              + '{"id":"' + payload.id + '","details":{"packageId":"' + payload.id + '","state":"installed"},"statusValue":30}\r\n');
          } else if (command.includes('appInstallService/dev/remove')) { tv.removed = payload.id; done('{"returnValue":true}\r\n'); }
          else if (command.includes('applicationManager/launch')) { tv.launched = payload.id; done('{"returnValue":true}\r\n'); }
          else done('{"returnValue":false}\r\n');
        } else if (command.startsWith('rm -f ')) done('');
        else done('', 127);
      });
    }));
  });
  keys.listen(0, '127.0.0.1'); server.listen(0, '127.0.0.1');
  await Promise.all([once(keys, 'listening'), once(server, 'listening')]);
  tv.env = { CLEANFRAME_TV_IP: '127.0.0.1', CLEANFRAME_KEY_PORT: String(keys.address().port), CLEANFRAME_SSH_PORT: String(server.address().port) };
  tv.close = () => Promise.all([new Promise(r => keys.close(r)), new Promise(r => server.close(r))]);
  return tv;
}

// The repository's own app/ and service/, as GitHub's tarball of the branch would hold them.
async function sourceServer(dir) {
  const tree = join(dir, 'source', 'modificatv-main');
  mkdirSync(tree, { recursive: true });
  cpSync(join(root, 'app'), join(tree, 'app'), { recursive: true });
  cpSync(join(root, 'service'), join(tree, 'service'), { recursive: true });
  execFileSync('tar', ['-czf', join(dir, 'source.tar.gz'), '-C', join(dir, 'source'), 'modificatv-main']);
  const server = createServer((req, res) => res.writeHead(200).end(readFileSync(join(dir, 'source.tar.gz'))));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { url: 'http://127.0.0.1:' + server.address().port + '/tar.gz/HEAD', close: () => new Promise(r => server.close(r)) };
}

function run(args, env, input = '') {
  return new Promise(resolve => {
    // INSTALL_SHELL="busybox sh" with BusyBox applets first on PATH approximates iSH's userland.
    const shell = (process.env.INSTALL_SHELL || 'sh').split(' ');
    const child = spawn(shell[0], shell.slice(1).concat(join(root, 'scripts/install-tv.sh'), args), { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
    child.stdin.end(input);
    child.on('close', code => resolve({ code, out }));
  });
}

test('installs, updates and removes CleanFrame on a synthetic TV', { skip: !hasSsh && 'needs OpenSSH and tar' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cleanframe-install-')), home = join(dir, 'home');
  mkdirSync(home);
  const tv = await fakeTv(dir), source = await sourceServer(dir);
  const env = { ...tv.env, HOME: home, TMPDIR: dir, CLEANFRAME_SOURCE: source.url };
  try {
    const first = await run([], env, PASSPHRASE + '\n');
    assert.equal(first.code, 0, first.out);
    assert.match(first.out, /Fatto/);
    const files = ar(tv.installed.ipk);
    assert.deepEqual(Object.keys(files), ['debian-binary', 'control.tar.gz', 'data.tar.gz']);
    assert.equal(files['debian-binary'].toString(), '2.0\n');
    const control = tarFiles(files['control.tar.gz']).control.toString();
    assert.match(control, /^Package: io\.cleanframe\.lg\nVersion: \d+\.\d+\.\d+\n/);
    const data = tarFiles(files['data.tar.gz']), base = 'usr/palm/applications/io.cleanframe.lg/';
    assert.deepEqual(readFileSync(join(root, 'app/main.js')), data[base + 'main.js']);
    assert.deepEqual(readFileSync(join(root, 'app/assets/wallpapers/misty.jpg')), data[base + 'assets/wallpapers/misty.jpg']);
    assert.deepEqual(readFileSync(join(root, 'service/service.js')), data['usr/palm/services/io.cleanframe.lg.service/service.js']);
    const info = JSON.parse(data['usr/palm/packages/io.cleanframe.lg/packageinfo.json']);
    assert.deepEqual(info, { id: 'io.cleanframe.lg', version: JSON.parse(readFileSync(join(root, 'app/appinfo.json'))).version, app: 'io.cleanframe.lg', services: ['io.cleanframe.lg.service'] });
    const packaged = Object.keys(data).filter(n => n.startsWith(base)).map(n => n.slice(base.length)).sort();
    const sources = execFileSync('find', ['.', '-type', 'f'], { cwd: join(root, 'app') }).toString().trim().split('\n').map(n => n.slice(2)).sort();
    assert.deepEqual(packaged, sources);
    assert.deepEqual(tv.installed.payload, { id: 'io.cleanframe.lg', ipkUrl: '/media/developer/temp/cleanframe.ipk', subscribe: true });
    // LG's own packager reads the phone-built package as an app with its service.
    const ares = join(root, 'node_modules/@webos-tools/cli/bin/ares-package.js');
    if (spawnSync('test', ['-f', ares]).status === 0) {
      writeFileSync(join(dir, 'built.ipk'), tv.installed.ipk);
      const report = execFileSync(process.execPath, [ares, '-i', join(dir, 'built.ipk')]).toString();
      assert.match(report, /app: io\.cleanframe\.lg/);
      assert.match(report, /services: \["io\.cleanframe\.lg\.service"\]/);
    }
    assert.equal(tv.launched, 'io.cleanframe.lg');
    assert.ok(tv.commands.some(c => c === 'rm -f /media/developer/temp/cleanframe.ipk'));
    // The unlocked key and the TV's address are kept, so an update asks nothing.
    const update = await run([], { ...env, CLEANFRAME_TV_IP: '' }, '\n');
    assert.equal(update.code, 0, update.out);
    assert.equal(tv.uploads.length, 2);
    // A package file can be installed as it is.
    const ipk = join(dir, 'given.ipk');
    writeFileSync(ipk, tv.uploads[0]);
    const given = await run([ipk], env);
    assert.equal(given.code, 0, given.out);
    assert.deepEqual(tv.uploads.at(-1), tv.uploads[0]);
    const removed = await run(['--remove'], env);
    assert.equal(removed.code, 0, removed.out);
    assert.equal(tv.removed, 'io.cleanframe.lg');
  } finally { await tv.close(); await source.close(); }
});

test('a wrong passphrase stops before anything reaches the TV', { skip: !hasSsh && 'needs OpenSSH and tar' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cleanframe-install-')), home = join(dir, 'home');
  mkdirSync(home);
  const tv = await fakeTv(dir);
  try {
    const result = await run([], { ...tv.env, HOME: home, TMPDIR: dir, CLEANFRAME_SOURCE: 'http://127.0.0.1:9/unused' }, 'wrong\n');
    assert.notEqual(result.code, 0);
    assert.match(result.out, /Passphrase sbagliata/);
    assert.deepEqual(tv.commands, []);
  } finally { await tv.close(); }
});
