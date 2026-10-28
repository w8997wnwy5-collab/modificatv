# Interaction behaviour — 0.6.1 for LG webOS

## Home

- Dock: Left/Right scrolls the apps without wrapping. Up enters the top-right controls, starting with Live TV or the last selected control. Left/Right moves between Live TV, All apps and Settings. Down or Back returns to the selected app. The clock is at the top left.
- List: Up/Down scrolls the apps without wrapping. Right enters the bottom-right controls, aligned with the clock above. Up/Down moves between Live TV, All apps and Settings. Left or Back returns to the selected app. The list fades at both ends as it scrolls.
- OK opens the selected item. Focus alone never launches an app.
- Icons-only apps and controls reveal their names when focused. App presentation and control presentation are independent.
- Back from the app list or Dock opens a choice to stay or open LG Home. The remote's Home button always opens LG Home.
- A panel keeps focus within its own controls. Back closes one panel at a time.
- Returning to the running launcher keeps the selected app or panel item. There is no auto-return timer. Held OK and Back keys act once until the key is released.

## Settings and appearance

Settings opens a grouped overview: Background, Layout, Typography, Focus, Apps on Home and LG. OK opens a group. Appearance groups use a two-pane screen with visible choices on the left and the committed Home preview on the right.

| Group | Choices |
| --- | --- |
| Background | Photo, Light, Dark; Wallpaper and Rotation when Photo is active |
| Layout | List or Dock; independent Text, Icons or Both choices for apps and Home controls |
| Typography | Manrope, Neue Montreal, Mori, Pangram Sans, Geist and Newsreader, when available |
| Focus | Type or Glass; Soft, Frost or Clear tint material |
| Apps on Home | Membership and arrangement editor |
| LG | LG Home, TV settings and Installed apps |

Up/Down moves between rows. Left/Right moves between choices in a horizontal row. Focus alone changes neither the preview nor saved preferences in these appearance groups. Wallpaper has its own temporary photo preview, described below. OK applies the focused value. A checkmark identifies the applied value; the filled plate identifies remote focus. Applying the current value does not write again.

Material applies to a photographic Dock, or Glass focus on a photographic List. Inactive material choices remain visible with an explanation and are skipped during navigation. Their stored value is retained. Wallpaper and rotation are also inactive on flat backgrounds.

A font or photo change applies only after its resources are ready and storage succeeds. A load or storage failure keeps the previous appearance and checkmark, with a Try again action. Back cancels a pending change, leaves the group and keeps completed changes. Late load callbacks cannot apply a cancelled choice. There is no Save button. Returning to a group restores its last choice focus; returning to Settings restores its category focus. Rotation is nested within Background, and Back returns to its Rotation row.

The selected font applies to Home app names, the clock and Home controls, including Newsreader. Settings, All apps, the Home editor and status text retain Manrope. The preview shows the committed Home appearance and its clock continues to update. Pangram faces appear only in the local browser preview when their files are present; their binaries are not in the source and never enter the LG package. An unavailable optional face is omitted. If the baseline font is slow or missing, Home remains usable with a local fallback and can recover when the font loads.

## Streaming apps

Home starts with Netflix, YouTube, Prime Video, Disney+ and Apple TV, using their LG app IDs (`netflix`, `youtube.leanback.v4`, `amazon`, `com.disney.disneyplus-prod`, `com.apple.appletv`). Other installed apps can also be added to Home. Launching calls `luna://com.webos.applicationManager/launch` with the app's ID. Missing apps and denied launches produce a real error, with the TV's reason. No web player, placeholder success page or account credential is embedded.

## All apps

The panel reads the TV's launch points on entry and shows them alphabetically, without CleanFrame itself, LG's Home and launcher pieces, untitled entries and repeats. Known brands use bundled marks. Other apps use the icon the TV lists, with initials as a fallback.

webOS 6 and later refuse `listLaunchPoints` to Developer Mode apps. CleanFrame then asks the TV's remote-control API for the same list through its own service (`service/`), because that API refuses the page's own origin. The first time, the TV shows a one-time permission prompt; the client key it returns is kept locally. If the owner declines, or the API is unavailable, CleanFrame checks a short list of known LG app IDs one by one with `getAppLoadStatus` and shows those that are installed. A refusal is not asked again automatically; Settings → LG → Installed apps forgets it and asks again.

The five-column grid scrolls with remote focus. OK launches an app; its On Home badge shows membership. Up from the first row reaches Apps on Home, which opens the editor. An API failure shows a retry and keeps saved Home choices. Browser previews report that installed-app discovery and launching require the TV.

## Apps on Home

Open the editor from Settings or All apps. On Home shows the current order on the left. Not on Home shows Recently removed first, followed by other installed apps on the right. Home holds one to nine apps.

- Reorder: OK on an app name picks it up. Up/Down moves it. OK places it and saves the order. Back puts an unplaced app back without saving that move.
- Remove: Right from an app name reaches Remove from Home. OK saves the removal and moves focus to the same app in Recently removed. The app stays installed.
- Add: OK on an app in Not on Home adds it and saves. A recently removed app returns to its previous position within the editing session; another app is added at the end. Focus follows the app to its Remove from Home control, so another OK can reverse the addition.
- Undo reverses a completed addition, removal or reorder from the current editing session. Done or Back closes the editor and keeps completed changes. Undo history ends when the editor closes.

Removing the last Home app or adding a tenth app is prevented. A failed storage write keeps the committed choices and order, with a retry message. Saved native app IDs and names survive a restart or a failed catalogue refresh.

## Live TV and LG screens

LG TVs have no Art Mode, so the first Home control is Live TV: it opens `com.webos.app.livetv`, the TV tuner on its last channel. LG Home opens `com.webos.app.home`; where firmware refuses that launch, CleanFrame steps back with `PalmSystem.platformBack()`, which returns to LG's launcher. TV settings opens `com.palm.app.settings`.

All calls have bounded response handling. A failure leaves CleanFrame usable. No simulated device success views remain. Browser validation cannot confirm the visible LG destination.

Installed-app discovery allows up to 20 seconds for large TV catalogues, or 100 seconds while the TV's one-time permission prompt waits for an answer; launch controls retain an 8-second limit. Opening All apps or the editor refreshes the catalogue while retaining saved Home choices. No discovery polling runs during startup.

While CleanFrame is visible, it answers LG's screensaver requests with "not now", so the photograph and clock stay on screen; while another app is in front, the TV's own screensaver works as usual. The TV's automatic power-off settings are unchanged.

## Preferences and wallpaper

The launcher stores appearance, Home order, recently removed apps, the last launched Home app, wallpaper and rotation locally. List and Dock share these preferences. The existing `cleanframe.home.v1` key is retained, with a fallback read from `cleanframe.shore.v1`. Legacy List maps to Dark + List + Type; Glass Dock and Glass Grid map to Photo + Dock + Glass. App order, wallpaper, rotation and the last Home app are preserved.

The gallery contains 15 bundled wallpapers. Settings → Background → Wallpaper keeps the two-pane Settings frame. Up/Down browses a vertical thumbnail list without wrapping; the right-hand Home preview shows the candidate while the surrounding Settings backdrop stays on the applied photo. OK applies the focused photo and stays in Wallpaper. The tick marks the applied photo and preview status distinguishes unsaved browsing. Back restores the latest applied photo, cancels pending loading and returns to Background’s Wallpaper row. Photo and material assets change as one complete bundle; a failed load restores the applied preview and offers retry. Preview loading waits briefly for remote focus to settle. OK during loading queues application for that photo; another browse move or Back cancels it. Browsing never saves, and repeated OK on the applied photo does not write again.

Settings → Background → Rotation offers Fixed, Each time Home opens, Every 5 minutes, Every 15 minutes and Every hour. Each time Home opens advances once when the launcher loads; a return to the already-running launcher does not advance it. Timed rotation counts only visible Photo Home time in either List or Dock. Panels, flat backgrounds and time spent in other apps pause the cycle. Changing the photo or rotation mode starts a new interval.

Runtime photos, materials and available fonts are local assets; they do not require a computer or a network download.

## Sources

- [LG Application Manager API](https://webostv.developer.lge.com/develop/references/application-manager): launching apps.
- [LG Back button guide](https://webostv.developer.lge.com/develop/guides/back-button): `disableBackHistoryAPI` and the root-screen exit behaviour.
- [Free My TV](https://github.com/simbasjungles/free-my-tv) (MIT): field reports on which Luna calls Developer Mode apps may use on webOS 6 to 11, and the remote-control API route for the app list.

CleanFrame does not replace LG's Home screen or the remote's Home button, and installs nothing outside its own package. Streaming apps retain their own Back navigation. This specification is not a record of on-TV verification.

## Clock and rendering

Both layouts show the TV's local time in 24-hour format, without seconds. It updates at the minute boundary and on return to the launcher. No date or clock panel is shown.

Photographic materials and blurred panel backgrounds are generated before packaging and stay aligned with the full-screen image. Photo colour and contrast metadata are also prepared offline. Navigation does not sample image pixels, run an optics engine or apply live backdrop blur. Flat backgrounds use matching light or dark panel colours. Focus feedback uses transforms and opacity; reduced motion removes animated scaling and movement while retaining opacity feedback.

Hidden prelaunch can install a fully loaded wallpaper bundle without waiting for an animation frame. A valid loaded image remains usable if detached-image decoding rejects. A failed startup bundle retries when the launcher becomes visible; an active wallpaper preview keeps its candidate. Font recovery clears fallback measurements and cached markup. This readiness fallback uses a completed load and nonzero image dimensions; it does not prove a TV has painted the image, and an accepted bundle is not automatically decoded again on return. These paths have browser regression coverage; physical cold-boot behaviour still needs owner observation.
