# Development

## Browser preview

Start with Node.js 22.13+ (22 LTS), or 24+, and Python 3.10+, then `npm ci`. Install Chromium once with `npx playwright install chromium` for the browser checks. Linux hosts may also need Playwright's system dependencies (`npx playwright install --with-deps chromium`).

`npm run dev:public` starts http://localhost:4795/home/, bound to this computer only, with the bundled public fonts. `/home/` serves `app/`, the same source that goes into the LG package. Arrow keys, Enter and Escape mirror the remote. TV controls report that they require the TV; no success is simulated. `npm run dev` also offers the optional Pangram fonts when their files are in `.local/research/font-candidates/`; they are never packaged.

All UI assets, public fonts and the fifteen wallpapers are bundled. Glass materials and blurred panel backgrounds are rendered ahead of time; see `app/assets/wallpapers/README.md` and [assets](assets.md).

## Runtime map

- `app/appinfo.json` is the webOS manifest: app ID `io.cleanframe.lg`, a 1920 × 1080 web app that handles Back itself (`disableBackHistoryAPI`).
- `app/index.html` loads the device adapter, gallery/font/palette catalogues, `assets/icons/metrics.js` and `main.js`, with `style.css`.
- `main.js` owns the List and Dock layouts, panel stack, focus, preferences, clock and wallpaper timers. Remote keys arrive as key codes 37–40, 13 and 461 (Back).
- `device.js` owns every TV call, on the Luna bus through `PalmServiceBridge`: launching apps, Live TV, LG Home, TV settings, installed-app discovery and the screensaver hold. Keep device details in this adapter.
- `service/` is a small JS service in the same package (`io.cleanframe.lg.service`). webOS 6 and later refuse `listLaunchPoints` to Developer Mode apps, and the TV's remote-control API on `127.0.0.1:3000` refuses the page's own origin, so the service asks that API for the app list with only the `READ_INSTALLED_APPS` permission. The TV asks its owner once. It runs on the TV's older Node.js: keep it ES5.
- Discovery order: `listLaunchPoints`; then the service; then a short list of known LG app IDs checked one by one with `getAppLoadStatus`. Free My TV reports these behaviours on TVs from webOS 3 to webOS 11, and tested the service route on webOS 22 with 2026 firmware.
- The logical stage is 1920 × 1080, scaled uniformly to the viewport. Check at 1920 × 1080 and 1280 × 720.
- Preferences use localStorage key `cleanframe.home.v1`, with a fallback read from `cleanframe.shore.v1`, as upstream. `cleanframe.lg.remoteKey` and `cleanframe.lg.remoteRefused` keep the TV's answer to the app-list prompt. A saved non-primary app keeps its real app ID and name.
- `window.ShoreQA.state()` and `.where()` expose state and focus for browser tests.

The target is the LG 50UQ75006LF on webOS 22, whose web engine is Chromium 87. `npm run lint` uses ESLint's ES5 grammar for the app and service. It does not check DOM/CSS or TV API availability; verify new APIs on the TV before relying on them. The upstream CSS guard (no `inset`, no flex `gap`) stays, for older engines.

## Package

`npm run package` runs LG's `ares-package` (from `@webos-tools/cli`, a development dependency) on `app/` and `service/` and writes `dist/io.cleanframe.lg_<version>_all.ipk`. Sources go in unminified. The script first rejects private files and credential patterns, checks that the app, package and service versions agree, then checks the package contents. Developer Mode installs the package unsigned; no LG certificate is involved.

`ares-package` warns that `requiredACG` is missing. LG has said that field becomes mandatory for store apps on later webOS versions; webOS 22 does not use it, and an empty list would wrongly declare that CleanFrame calls no Luna APIs. Revisit it if the TV's firmware starts enforcing access groups for Developer Mode apps.

The GitHub Actions workflow builds the same package and uploads it as the `CleanFrame-LG-webOS` artifact, with `LICENSE` and `THIRD_PARTY_NOTICES.md`.

## Install on a TV

Each of these is a device action: announce it to the TV's owner first.

1. On the TV, install **Developer Mode** from the LG Content Store, sign in with an LG developer account, turn on **Dev Mode Status** (the TV restarts) and then **Key Server**. Note the IP address and passphrase it shows.
2. Add the TV, with the name `tv`:

   ```sh
   npx ares-setup-device -a tv -i "host=TV_IP_ADDRESS" -i "port=9922" -i "username=prisoner"
   npx ares-novacom --getkey -d tv
   ```

   The second command asks for the passphrase and stores the TV's key in `~/.ssh`.
3. `npm run package`, then `npm run tv:install` and `npm run tv:launch`. `npm run tv:remove` uninstalls. Set `CLEANFRAME_TV` to use another device name.

Keep the app ID unchanged: an install with the same ID updates the app in place and keeps its preferences. A Developer Mode session lasts a limited time (the app shows what remains); **EXTEND** in the Developer Mode app renews it. When it expires, the TV removes developer apps, and installing again brings CleanFrame back without its preferences.

[webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop) does the same without a terminal: add the TV with its IP address and passphrase, then install the `.ipk`.

## Sources

- [LG webOS TV CLI guide](https://webostv.developer.lge.com/develop/tools/webos-tv-cli-dev-guide) and [Developer Mode app](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app)
- [LG Application Manager API](https://webostv.developer.lge.com/develop/references/application-manager) and [Back button guide](https://webostv.developer.lge.com/develop/guides/back-button)
- [LG web engine versions](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine)
- [Free My TV](https://github.com/simbasjungles/free-my-tv) (MIT): field reports for Developer Mode Luna access and the remote-control API route
