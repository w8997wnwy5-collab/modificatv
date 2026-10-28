# CleanFrame for LG webOS

This repository adapts CleanFrame (upstream: `nthnclrk/CleanFrame`, for Samsung Tizen) to LG webOS TVs. `app/` is the packaged UI and `service/` its small TV-side JS service. Read `docs/development.md` and `docs/interaction-behaviour.md` before app changes. The owner's guide is the Italian `README.md`; keep it in step with anything a TV owner sees or does.

Use simple HTML, CSS and ES5-compatible JavaScript in `app/` and `service/`: the target TV (LG 50UQ75006LF, webOS 22) runs Chromium 87 and an older Node.js. Node tooling can use modern JavaScript. Keep every TV call in `app/device.js`. Preserve remote focus/navigation, preference migrations and cached rendering. Read `docs/assets.md` before changing images, glass geometry or icon sizing; keep live blur and pixel analysis off the TV animation path.

Run `npm run check` for every change and `CLEANFRAME_PUBLIC_FONTS=1 npm run check:browser` for interaction changes. `npm run package` must still build the `.ipk`. Run `npm run check:public` before publishing. Public contributors must not need proprietary fonts. Retain third-party notices.

Repository tasks do not authorise device access. Installing, launching or removing the app on a TV (`npm run tv:*`, `ares-*`) needs the owner's go-ahead; announce each action and confirm visible results with the owner. Keep the app ID `io.cleanframe.lg`: an update with the same ID replaces the installed app and keeps its preferences. Rooting, Home-button remapping and startup changes are outside this app and need a separate, explicit request.

Keep passphrases, keys, device addresses and generated packages out of Git (`.local/`, `dist/`). Never commit paid font binaries. Preserve shared or uncommitted work; never reset, force-push or rewrite history without explicit authority.
