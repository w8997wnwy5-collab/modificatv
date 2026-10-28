# Third-party notices

The root MIT licence covers CleanFrame's original code and documentation. Third-party material retains the terms below. Keep these notices and the adjacent licence texts when sharing source or a build.

## Fonts

| Material | Terms and source record |
| --- | --- |
| Manrope | SIL Open Font License 1.1; `app/assets/manrope-OFL.txt` |
| Geist and Newsreader | SIL Open Font License 1.1; licences beside the files in `app/assets/fonts/`, with exact sources and hashes in `app/assets/fonts/SOURCES.json` |
| Optional PP Neue Montreal, PP Mori and PP Pangram Sans | Proprietary. Binaries stay in ignored `.local/` storage and are excluded from Git and from the LG package; only the local browser preview can offer them, with the user's own permission to use those files. |

The LG package uses Manrope, Geist and Newsreader only. See [Pangram's licensing information](https://pangrampangram.com/pages/eula).

## Icons and trademarks

| Material | Provenance and terms |
| --- | --- |
| Simple Icons service marks | CC0; exact revisions and adaptations in `app/assets/icons/SOURCES.json` and `ADDITIONAL-SOURCES.json`. The CC0 text is retained beside the icons. |
| Disney+, ABC and SBS marks | [Custom Brand Icons](https://github.com/elax46/custom-brand-icons), MIT. The retained licence is `app/assets/icons/CUSTOM-BRAND-ICONS-LICENSE.txt`. ABC and SBS sources were replaced during the public-source review. Exact revisions, source files and extraction/recolour notes are in `SOURCES.json`. |
| Art, apps, settings and home outlines | Original CleanFrame drawings, covered by the project's MIT licence. |

Brand marks identify services. Their owners retain trademark rights; this project claims no endorsement or affiliation. The older Australian TV icon archive's GPL text is retained for historical provenance only; no current icon uses that archive.

## Photographs and derived materials

The fifteen photo pages were individually checked on 20 October 2026. Each displayed its credited author and free use under the [Unsplash License](https://unsplash.com/license). The [asset source register](docs/asset-sources.md) links every page. Runtime paths are in `app/assets/wallpapers/SOURCES.json`.

Photographers retain their rights. Wallpapers, thumbnails, panel backgrounds and material fields derive from the credited photographs and retain their terms. The Unsplash licence permits copying, modification and distribution subject to its restrictions, including on selling unmodified images and building a competing image service.

## Adapted code

The TV service in `service/service.js` follows the approach of [Free My TV](https://github.com/simbasjungles/free-my-tv)'s webOS service: asking the TV's local remote-control API for its launch points, with a `file://` origin, after the TV prompts its owner. The phone installer, `scripts/install-tv.sh`, follows the flow of Free My TV's `webos/install.py`: the Key Server key unlocked with `ssh-keygen`, a copy over SSH and `com.webos.appInstallService/dev/install`. Free My TV is MIT-licensed, © 2026 Free My TV contributors; its licence text is retained in `service/FREE-MY-TV-LICENSE.txt`, which is packaged with the service.

## Development dependencies and the LG package

Development dependencies retain the licences in their npm packages, including LG's webOS TV CLI (`@webos-tools/cli`, Apache-2.0), which builds and installs the package. They are not copied into the TV runtime.

`npm run package` packages `app/` and `service/` only, with public fonts. When sharing the `.ipk`, include this notice and the root MIT licence, as the GitHub Actions artifact does. Preserve the included font and icon licence texts.

CleanFrame for LG is an independent adaptation, with no LG, Samsung or streaming-service affiliation.
