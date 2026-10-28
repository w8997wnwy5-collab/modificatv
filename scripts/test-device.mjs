// Test the production adapter with a synthetic Luna bus and clock. No TV access.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../app/device.js', import.meta.url), 'utf8');
const SELF = 'io.cleanframe.lg';
const DENIED = { returnValue: false, errorCode: -1, errorText: 'Denied method call "listLaunchPoints" for category "/"' };

function harness({ bridge = true, storage = {}, installed = ['netflix', 'amazon'] } = {}) {
  let now = 0, next = 0;
  const timers = new Map(), calls = [], store = { ...storage }, held = [], bridges = [];
  // Each test decides how a method answers; unanswered calls stay held.
  const answers = {
    'com.webos.applicationManager/launch': () => ({ returnValue: true }),
    'com.webos.applicationManager/listLaunchPoints': () => DENIED,
    'com.webos.applicationManager/getAppLoadStatus': p => ({ returnValue: true, exist: installed.includes(p.appId) }),
    [SELF + '.service/launchPoints']: () => ({ returnValue: false, errorText: 'The remote-control API is unavailable.' }),
    'com.webos.service.tvpower/power/registerScreenSaverRequest': () => ({ returnValue: true, subscribed: true })
  };
  function PalmServiceBridge() {}
  PalmServiceBridge.prototype.call = function (uri, params) {
    const method = uri.replace('luna://', ''), payload = JSON.parse(params), bridge = this;
    calls.push({ method, payload }); bridges.push({ method, bridge });
    const answer = answers[method];
    if (answer === 'hold') { held.push({ method, payload, reply: value => bridge.onservicecallback(JSON.stringify(value)) }); return; }
    setTimer(() => this.onservicecallback(JSON.stringify(answer ? answer(payload) : { returnValue: false, errorText: 'Unknown method' })), 0);
  };
  const window = { PalmSystem: { identifier: SELF + ' 1234', platformBack() { calls.push({ method: 'platformBack' }); } } };
  if (bridge) window.PalmServiceBridge = PalmServiceBridge;
  const localStorage = { getItem: key => key in store ? store[key] : null, setItem: (key, value) => { store[key] = String(value); } };
  function setTimer(callback, delay) { const id = ++next; timers.set(id, { callback, at: now + delay }); return id; }
  const document = { hidden: false };
  vm.runInNewContext(source, { window, document, localStorage, setTimeout: setTimer, clearTimeout: id => timers.delete(id) });
  function advance(ms) {
    const until = now + ms;
    for (;;) {
      const due = [...timers].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]); now = due[1].at; due[1].callback();
    }
    now = until;
  }
  return { device: window.FrameDevice, answers, calls, store, held, bridges, advance, document };
}
const list = (h, done) => h.device.apps((error, apps) => done({ error, apps }));
const ids = apps => Array.from(apps, a => a.appId);  // A plain array: the adapter runs in another realm.

test('launch sends the LG app ID and reports success once', () => {
  const h = harness(), results = [];
  h.device.launchApp('netflix', error => results.push(error));
  h.advance(10);
  assert.deepEqual(h.calls.at(-1), { method: 'com.webos.applicationManager/launch', payload: { id: 'netflix' } });
  assert.deepEqual(results, [null]);
});

test('brand launches use LG IDs; Live TV and TV settings use system apps', () => {
  const h = harness(), done = () => {};
  h.device.launch('primevideo', done); h.device.launch('youtube', done); h.device.tv(done); h.device.settings(done);
  h.advance(10);
  assert.deepEqual(h.calls.filter(c => c.method.endsWith('/launch')).map(c => c.payload.id),
    ['amazon', 'youtube.leanback.v4', 'com.webos.app.livetv', 'com.palm.app.settings']);
});

test('a refused launch becomes a readable message with the TV reason', () => {
  const h = harness(), results = [];
  h.answers['com.webos.applicationManager/launch'] = () => ({ returnValue: false, errorCode: -101, errorText: 'Cannot find app' });
  h.device.launchApp('missing.app', error => results.push(error));
  h.advance(10);
  assert.equal(results.length, 1);
  assert.equal(results[0].message, 'The TV could not open this screen.');
  assert.equal(results[0].detail, 'Cannot find app');
});

test('launch keeps its eight-second deadline and ignores a late answer', () => {
  const h = harness(), results = [];
  h.answers['com.webos.applicationManager/launch'] = 'hold';
  h.device.launchApp('slow.app', error => results.push(error));
  h.advance(8000);
  assert.equal(results.length, 1);
  assert.match(results[0].message, /did not respond/);
  h.held[0].reply({ returnValue: true });
  assert.equal(results.length, 1);
});

test('LG Home falls back to stepping back when no Home app opens', () => {
  const h = harness(), results = [];
  h.answers['com.webos.applicationManager/launch'] = p => p.id === 'com.webos.app.home' ? { returnValue: false, errorText: 'Denied' } : { returnValue: true };
  h.device.home(error => results.push(error));
  h.advance(10);
  assert.deepEqual(results, [null]);
  assert.equal(h.calls.at(-1).method, 'platformBack');
});

test('the browser preview reports that TV controls need the TV', () => {
  const h = harness({ bridge: false }), results = [];
  h.device.launchApp('netflix', error => results.push(error));
  h.device.apps(error => results.push(error));
  assert.equal(results.length, 2);
  assert.ok(results.every(r => /Open CleanFrame on the TV/.test(r.message)));
});

test('listed launch points become the catalogue, without CleanFrame or LG launchers', () => {
  const h = harness(), results = [];
  h.answers['com.webos.applicationManager/listLaunchPoints'] = () => ({ returnValue: true, launchPoints: [
    { id: SELF, title: 'CleanFrame' }, { id: 'com.webos.app.home', title: 'Home' },
    { id: 'netflix', title: 'Netflix', largeIcon: '/usr/palm/applications/netflix/large.png' },
    { id: 'it.rai.raiplay', title: 'RaiPlay', icon: '/media/cryptofs/apps/usr/palm/applications/it.rai.raiplay/icon.png' },
    { id: 'spotify-beehive', title: 'Spotify' }, { id: 'untitled.app' }
  ] });
  list(h, r => results.push(r));
  h.advance(10);
  assert.equal(results[0].error, null);
  assert.deepEqual(ids(results[0].apps), ['netflix', 'it.rai.raiplay', 'spotify-beehive']);
  assert.equal(results[0].apps[0].brand, 'netflix');
  assert.equal(results[0].apps[0].icon, '/usr/palm/applications/netflix/large.png');
  assert.equal(results[0].apps[2].brand, 'spotify');
  assert.equal(h.calls.filter(c => c.method.endsWith('getAppLoadStatus')).length, 0);
});

test('first refusal of listLaunchPoints asks the TV once, then keeps its client key', () => {
  const h = harness(), results = [];
  h.answers[SELF + '.service/launchPoints'] = p => p.clientKey === ''
    ? { returnValue: true, clientKey: 'key-1', launchPoints: [{ id: 'it.rai.raiplay', title: 'RaiPlay' }] } : { returnValue: false };
  list(h, r => results.push(r));
  h.advance(10);
  assert.deepEqual(ids(results[0].apps), ['it.rai.raiplay']);
  assert.equal(h.store['cleanframe.lg.remoteKey'], 'key-1');
  h.answers[SELF + '.service/launchPoints'] = p => p.clientKey === 'key-1'
    ? { returnValue: true, clientKey: 'key-1', launchPoints: [{ id: 'netflix', title: 'Netflix' }] } : { returnValue: false };
  list(h, r => results.push(r));
  h.advance(10);
  assert.deepEqual(ids(results[1].apps), ['netflix']);
});

test('the first catalogue waits for the TV prompt beyond the usual twenty seconds', () => {
  const h = harness(), results = [];
  h.answers[SELF + '.service/launchPoints'] = 'hold';
  list(h, r => results.push(r));
  h.advance(60000);
  assert.equal(results.length, 0);
  h.held[0].reply({ returnValue: true, clientKey: 'key-2', launchPoints: [{ id: 'netflix', title: 'Netflix' }] });
  assert.deepEqual(ids(results[0].apps), ['netflix']);
});

test('a refused prompt is remembered and known apps are checked one by one', () => {
  const h = harness({ installed: ['netflix', 'spotify-beehive', 'com.webos.app.hdmi1'] }), results = [];
  h.answers[SELF + '.service/launchPoints'] = () => ({ returnValue: false, refused: true, errorText: 'Denied by the owner' });
  list(h, r => results.push(r));
  h.advance(10);
  assert.equal(h.store['cleanframe.lg.remoteRefused'], '1');
  assert.deepEqual(ids(results[0].apps), ['netflix', 'com.webos.app.hdmi1', 'spotify-beehive']);
  const asked = h.calls.filter(c => c.method === SELF + '.service/launchPoints').length;
  list(h, r => results.push(r));
  h.advance(10);
  assert.equal(h.calls.filter(c => c.method === SELF + '.service/launchPoints').length, asked);
  assert.deepEqual(ids(results[1].apps), ids(results[0].apps));
});

test('asking again after a refusal goes back to the TV prompt', () => {
  const h = harness({ storage: { 'cleanframe.lg.remoteRefused': '1' } }), results = [];
  const asked = () => h.calls.filter(c => c.method === SELF + '.service/launchPoints').length;
  list(h, r => results.push(r));
  h.advance(10);
  assert.equal(asked(), 0);
  h.device.askAgain();
  h.answers[SELF + '.service/launchPoints'] = () => ({ returnValue: true, clientKey: 'key-3', launchPoints: [{ id: 'it.example.tv', title: 'Example TV' }] });
  list(h, r => results.push(r));
  h.advance(10);
  assert.equal(asked(), 1);
  assert.deepEqual(ids(results[1].apps), ['it.example.tv']);
});

test('a stale client key is dropped so the TV can ask again', () => {
  const h = harness({ storage: { 'cleanframe.lg.remoteKey': 'old' } }), results = [];
  h.answers[SELF + '.service/launchPoints'] = () => ({ returnValue: false, refused: true });
  list(h, r => results.push(r));
  h.advance(10);
  assert.equal(h.store['cleanframe.lg.remoteKey'], '');
  assert.equal(h.store['cleanframe.lg.remoteRefused'], undefined);
  assert.deepEqual(ids(results[0].apps), ['netflix', 'amazon']);
});

test('known-app checks finish without an ID that never answers', () => {
  const h = harness({ storage: { 'cleanframe.lg.remoteRefused': '1' } }), results = [];
  h.answers['com.webos.applicationManager/getAppLoadStatus'] = 'hold';
  list(h, r => results.push(r));
  h.advance(10);
  h.held.filter(c => c.payload.appId === 'netflix').forEach(c => c.reply({ returnValue: true, exist: true }));
  h.advance(4980);
  assert.equal(results.length, 0);
  h.advance(10);
  assert.equal(results.length, 1);
  assert.deepEqual(ids(results[0].apps), ['netflix']);
});

test('a TV that refuses every check reports an error instead of an empty list', () => {
  const h = harness({ storage: { 'cleanframe.lg.remoteRefused': '1' } }), results = [];
  h.answers['com.webos.applicationManager/getAppLoadStatus'] = () => ({ returnValue: false, errorText: 'Denied' });
  list(h, r => results.push(r));
  h.advance(10);
  assert.match(results[0].error.message, /Could not read installed apps/);
});

test('the screensaver is held only while CleanFrame is visible', () => {
  const h = harness(), saver = h.bridges.find(b => b.method.endsWith('registerScreenSaverRequest'));
  const responses = () => h.calls.filter(c => c.method.endsWith('responseScreenSaverRequest')).map(c => c.payload);
  assert.deepEqual(h.calls.find(c => c.method.endsWith('registerScreenSaverRequest')).payload, { subscribe: true, clientName: SELF });
  h.advance(10);
  assert.deepEqual(responses(), []);
  saver.bridge.onservicecallback(JSON.stringify({ returnValue: true, timestamp: 11 }));
  h.document.hidden = true;
  saver.bridge.onservicecallback(JSON.stringify({ returnValue: true, timestamp: 12 }));
  assert.deepEqual(responses(), [{ clientName: SELF, ack: false, timestamp: 11 }, { clientName: SELF, ack: true, timestamp: 12 }]);
});
