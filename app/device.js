/* LG webOS calls on the TV's service bus (Luna). No network address, account or credentials. */
(function () {
  'use strict';
  var IDS = {
    netflix: 'netflix', youtube: 'youtube.leanback.v4', primevideo: 'amazon',
    disneyplus: 'com.disney.disneyplus-prod', appletv: 'com.apple.appletv'
  };
  var EXTRA_BRANDS = { 'spotify-beehive': 'spotify', 'com.wbd.stream': 'hbomax', 'com.hbo.hbomax': 'hbomax' };
  // webOS 6 and later do not list launch points to Developer Mode apps. Until the owner allows
  // the TV's remote-control API, these IDs are checked one by one.
  var KNOWN = [['netflix', 'Netflix'], ['youtube.leanback.v4', 'YouTube'], ['amazon', 'Prime Video'],
    ['com.disney.disneyplus-prod', 'Disney+'], ['com.apple.appletv', 'Apple TV'], ['spotify-beehive', 'Spotify'],
    ['com.wbd.stream', 'HBO Max'], ['com.hbo.hbomax', 'Max'], ['ui30', 'Rakuten TV'], ['cdp-30', 'Plex'],
    ['org.jellyfin.webos', 'Jellyfin'], ['tv.twitch.tv.starshot.lg', 'Twitch'], ['com.crunchyroll.webapp', 'Crunchyroll'],
    ['com.webos.app.browser', 'Web Browser'], ['com.webos.app.livetv', 'Live TV'],
    ['com.webos.app.hdmi1', 'HDMI 1'], ['com.webos.app.hdmi2', 'HDMI 2'], ['com.webos.app.hdmi3', 'HDMI 3']];
  // LG's own launchers and pickers are not apps to put on Home.
  var HIDDEN = /^com\.webos\.app\.(?:home|homeconnect|launcher|inputpicker)$/;
  var SELF = 'io.cleanframe.lg', PAIRED = 'cleanframe.lg.remoteKey', REFUSED = 'cleanframe.lg.remoteRefused';
  var pending = [], saver = null;
  function available() { return typeof window.PalmServiceBridge !== 'undefined'; }
  function selfId() {
    try { return String(window.PalmSystem.identifier).split(' ')[0] || SELF; }
    catch (err) { return SELF; }
  }
  // A bridge that nothing references can be collected before its reply arrives.
  function luna(uri, params, done) {
    var bridge = new window.PalmServiceBridge(), answered = false;
    pending.push(bridge);
    bridge.onservicecallback = function (message) {
      var result = null;
      if (answered) return;
      answered = true; pending.splice(pending.indexOf(bridge), 1);
      try { result = JSON.parse(message); } catch (err) { result = null; }
      if (result && result.returnValue !== false) done(null, result);
      else done(result || {});
    };
    bridge.call('luna://' + uri, JSON.stringify(params || {}));
  }
  function stored(key) { try { return localStorage.getItem(key); } catch (err) { return null; } }
  function keep(key, value) { try { localStorage.setItem(key, value); } catch (err) { /* Asked again next time. */ } }
  function unavailable(done) {
    done({ message: 'Open CleanFrame on the TV to use this control.', detail: 'The web preview cannot control the TV.' });
  }
  function failure(err) {
    return { message: 'The TV could not open this screen.', detail: err && (err.errorText || err.message) || 'Try again in a moment.' };
  }
  function bounded(done, timeout) {
    var finished = false, timer = setTimeout(function () { finish({ message: 'The TV did not respond. Please try again.' }); }, timeout || 8000);
    function finish(err, value) { if (finished) return; finished = true; clearTimeout(timer); done(err, value); }
    return finish;
  }
  function launchApp(id, done) {
    if (!available()) { unavailable(done); return; }
    var finish = bounded(done);
    try { luna('com.webos.applicationManager/launch', { id: id }, function (err) { finish(err ? failure(err) : null); }); }
    catch (err) { finish(failure(err)); }
  }
  function launch(brand, done) {
    if (!IDS[brand]) { done({message: 'This app has no launch target.'}); return; }
    launchApp(IDS[brand], done);
  }
  function tv(done) { launchApp('com.webos.app.livetv', done); }
  function home(done) {
    launchApp('com.webos.app.home', function (err) {
      // Firmware without a separate Home app returns to LG's launcher when an app steps back.
      if (err && window.PalmSystem && window.PalmSystem.platformBack) { window.PalmSystem.platformBack(); done(null); }
      else done(err);
    });
  }
  function settings(done) { launchApp('com.palm.app.settings', done); }
  function catalogue(list) {
    var known = {}, seen = {}, result = [], self = selfId(), order = Object.keys(IDS);
    order.forEach(function (brand) { known[IDS[brand]] = brand; });
    list.forEach(function (a) {
      if (!a || !a.id || !a.title || a.id === self || seen[a.id] || HIDDEN.test(a.id)) return;
      seen[a.id] = true;
      result.push({ appId: a.id, name: a.title, brand: known[a.id] || EXTRA_BRANDS[a.id] || '', icon: a.largeIcon || a.icon || '', rank: known[a.id] ? order.indexOf(known[a.id]) : 30 });
    });
    result.sort(function (a, b) { return a.rank - b.rank || a.name.toLowerCase().localeCompare(b.name.toLowerCase()); });
    return result;
  }
  // Each check answers on its own; one that never answers does not hold the rest.
  function knownApps(done) {
    var found = [], left = KNOWN.length, denied = 0, sent = false;
    function finish() {
      if (sent) return;
      sent = true;
      if (denied === KNOWN.length) done({ message: 'Could not read installed apps.', detail: 'The TV refused the request.' });
      else done(null, catalogue(found.filter(function (a) { return a; })));
    }
    setTimeout(finish, 5000);
    KNOWN.forEach(function (k, i) {
      luna('com.webos.applicationManager/getAppLoadStatus', { appId: k[0] }, function (err, res) {
        if (err) denied++;
        else if (res.exist) found[i] = { id: k[0], title: k[1] };
        if (--left === 0) finish();
      });
    });
  }
  // The remote-control API lists every app once the owner allows it on screen. It refuses this
  // page's origin on current firmware, so CleanFrame's own service makes the call.
  function remoteApps(done) {
    var key = stored(PAIRED) || '';
    luna(selfId() + '.service/launchPoints', { clientKey: key }, function (err, res) {
      if (res && res.clientKey) keep(PAIRED, res.clientKey);
      if (err && err.refused) keep(key ? PAIRED : REFUSED, key ? '' : '1');
      done(!err && res.launchPoints ? res.launchPoints : null);
    });
  }
  // Forget an earlier refusal, so the next catalogue asks the TV again.
  function askAgain() { keep(REFUSED, ''); }
  function apps(done) {
    if (!available()) { unavailable(done); return; }
    // The first request waits for the owner to answer the TV's one-time permission prompt.
    var finish = bounded(done, stored(PAIRED) || stored(REFUSED) ? 20000 : 100000);
    try {
      luna('com.webos.applicationManager/listLaunchPoints', {}, function (err, res) {
        if (!err && res.launchPoints) { finish(null, catalogue(res.launchPoints)); return; }
        if (stored(REFUSED)) { knownApps(finish); return; }
        remoteApps(function (points) { if (points) finish(null, catalogue(points)); else knownApps(finish); });
      });
    } catch (err) { finish(failure(err)); }
  }
  // While CleanFrame is on screen, its photograph and clock stand in for LG's screensaver.
  function holdScreenSaver() {
    if (!available() || saver) return;
    saver = new window.PalmServiceBridge();
    saver.onservicecallback = function (message) {
      var request = null;
      try { request = JSON.parse(message); } catch (err) { return; }
      if (!request || request.timestamp === undefined) return;
      luna('com.webos.service.tvpower/power/responseScreenSaverRequest', { clientName: selfId(), ack: !!document.hidden, timestamp: request.timestamp }, function () {});
    };
    saver.call('luna://com.webos.service.tvpower/power/registerScreenSaverRequest', JSON.stringify({ subscribe: true, clientName: selfId() }));
  }
  try { holdScreenSaver(); } catch (err) { saver = null; }
  window.FrameDevice = { launch: launch, launchApp: launchApp, tv: tv, home: home, settings: settings, apps: apps, askAgain: askAgain };
}());
