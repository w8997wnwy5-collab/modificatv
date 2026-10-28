# Validation

## Offline app changes

```sh
npm ci
npm run check
npx playwright install chromium
CLEANFRAME_PUBLIC_FONTS=1 npm run check:browser
npm run package
```

`check` runs ES5 lint for the app and the TV service, validates the webOS manifests, versions and bundled resources, then tests the production device adapter against a synthetic Luna bus and clock, and the TV service against a synthetic remote-control API on loopback. It does not contact a TV. `check:browser` uses a fresh Playwright Chromium profile and its own loopback preview, with the public Luna boundary mocked (`PalmServiceBridge`, `PalmSystem`). It checks List and Dock navigation, single focus, Home controls, grouped Settings, explicit OK application, applied checkmarks, pending-load cancellation, retries, persistence, all fifteen wallpaper bundles, available fonts, 720p scaling, migrations, the Home editor, Developer Mode app discovery and honest browser-only launch errors. Reports and screenshots are in ignored `.local/qa/`. A failed assertion exits with a nonzero status.

`package` builds the `.ipk` with LG's `ares-package` and checks that it holds the app, the service and nothing private. The GitHub Actions workflow runs all of the above with public fonts and uploads the package.

`check:public` checks working files, index blobs and all reachable Git refs for the shared private-file policy and recognisable credential patterns. These checks are bounded and do not detect every possible secret. Optional local commit/push guards in `.githooks/` run the same check; enable them deliberately with `git config --local core.hooksPath .githooks`.

If Playwright's own Chromium is unavailable, point the checks at an installed one with `CLEANFRAME_CHROMIUM=/path/to/chrome`. To keep the browser download inside the repo:

```sh
PLAYWRIGHT_BROWSERS_PATH="$PWD/.local/playwright" npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH="$PWD/.local/playwright" npm run check:browser
```

For manual review, use `npm run dev:public` and open `/home/`. Use the arrow keys, Enter and Escape. Check the changed flow in List and Dock, on Photo, Light and Dark backgrounds. In Settings, browse without applying, apply with OK, return with both Back routes, and cancel a pending resource load. Browser preferences are separate from TV preferences.

`CLEANFRAME_PUBLIC_FONTS=1 npm run check:performance` runs a 4× CPU-throttled Chromium regression screen. Compare navigation work, frame stalls, retained DOM/heap and live-filter checks before and after rendering changes. This is not a physical-TV benchmark.

## Physical TV checks

Run these only with the owner, under a task that includes TV work. Announce any installation or launch first. A successful `ares-install` is not a visible result; ask the owner what the TV shows.

1. Open CleanFrame from LG's app list. Move in both directions through each layout and Settings; check focus, response and readable labels from the sofa, with the arrow keys and with the Magic Remote pointer.
2. Launch Netflix and YouTube, press Home, and reopen CleanFrame from its Quick Access number. Check that it keeps the selected app. Streaming apps handle their own Back.
3. Check Live TV, All apps, Settings → LG → TV settings and Settings → LG → LG Home, and Back → LG Home; confirm the visible destinations.
4. Open All apps the first time: the TV should ask for permission. Accept, and check that every installed app appears. After a refusal, Settings → LG → Installed apps asks again.
5. Leave CleanFrame on Photo for longer than the TV's screensaver delay; the photo and clock should stay. In another app, the TV's screensaver should still appear.
6. Check saved appearance, app order and wallpaper after closing and reopening CleanFrame, and after switching the TV off and on.

Record the model, webOS and firmware version (Settings → General → About this TV) with each result.
