# AdVoid — YouTube Ad Blocker

A lightweight Chrome Manifest V3 extension that combines bundled network rules with YouTube player monitoring and cosmetic ad hiding. No external libraries, remote code, or data collection.

## Version 1.1.0

- Reacts to player mutations in a microtask instead of waiting for an animation frame.
- Keeps Skip controls accessible: hiding their `.video-ads` ancestor previously prevented the extension from clicking them.
- Checks all matching Skip buttons, ignores hidden/disabled controls, and retries every 100 ms only while the player reports an ad. Chrome may throttle timers in background tabs.
- Observes player attributes locally; the document observer only watches DOM insertions/removals for player discovery and style recovery.
- Covers additional display, companion, search, and mobile ad containers without hiding unrelated YouTube promotional UI.
- Runs in matching embedded frames, including `youtube-nocookie.com` players.
- Restores mute state and playback speed when ads end, media elements change, or the extension is disabled. Disabled mode stays disabled across page navigation.

## How it works

| Layer | File | Behavior |
|---|---|---|
| Network | `rules.json` | Chrome blocks requests matching the bundled advertising domain and YouTube endpoint rules before they load. |
| Player and page | `content.js` | Hides known cosmetic ad containers, observes ad-state classes, and clicks available Skip buttons. |
| Fallback | `content.js` | For a separate finite ad clip up to five minutes long, attempts to seek near its end and plays at 16× while muted. |
| State | `background.js` | Synchronizes the ruleset with the toggle and stores the local counter. |
| Controls | `popup.html`, `popup.js`, `popup.css` | Displays the toggle and counter. |

The fallback requires `ad-showing`, ready media metadata, and a source different from the last observed content source. `ad-interrupting` alone, lingering ad UI, or a short video duration do not trigger a seek. If the known content source returns before the ad class disappears, playback settings are restored immediately. These checks reduce source-transition mistakes; YouTube's undocumented ad classes are not an absolute guarantee.

The popup counter records handled ad sessions when the player leaves ad mode. An uninterrupted multi-ad break may count as one session. Network-blocked requests and cosmetically hidden ads are not included.

## Install or update

Requires Chrome 105+ or a compatible Chromium browser.

1. Open `chrome://extensions/` and enable **Developer mode**.
2. Select **Load unpacked** and choose this project folder, containing `manifest.json`.
3. If already loaded, click the extension's **Reload** button instead.
4. Refresh existing YouTube tabs and pages containing YouTube embeds so they receive the new content script.

The older `AdVoid-v1.0.x.zip` archives do not contain these changes. Load the project folder to use version 1.1.0.

## Verification

Run the dependency-free automated regression suite:

```sh
node --test tests/content.test.cjs
```

The suite runs the actual content script against simulated DOM/media/Chrome APIs. It covers prompt skip handling, hidden and disabled buttons, source-transition guards, playback restoration, media replacement, startup before the document root exists, disabled navigation, ad-only retries, and manifest resources. It does not simulate YouTube's servers or prove live blocking effectiveness.

After reloading the extension, manually check:

- A skippable pre-roll and a mid-roll: Skip should activate as soon as YouTube makes the button available.
- An unskippable separate ad clip: verify fallback handling and that content resumes at the previous volume/mute state and playback speed.
- A short normal video, live stream, and a Shorts session: verify normal content is not skipped or accelerated.
- Disable during an ad, then navigate within YouTube: speed/sound should restore and cosmetic filtering should stay off.
- Standard and privacy-enhanced YouTube embeds on other sites.
- Multiple ads in a break, full-screen playback, and returning from a background tab.

## Coverage and limitations

This is a YouTube-focused extension, not a maintained universal filter-list blocker. The bundled advertising-domain network rules also affect matching requests on other sites, but cosmetic filtering and video skipping run only on YouTube and its privacy-enhanced embeds.

No guarantee is made that every ad will disappear. YouTube changes its markup and delivery behavior, may reject seeking or programmatic clicks, and can deliver ads in the same media stream as content. Same-source ads and unknown/live durations are deliberately not fast-forwarded; available Skip controls can still be clicked. Ads longer than five minutes also rely on Skip controls. Creator sponsorships inside a video are not detected. Network filtering does not distinguish ads from content sharing the same streaming URL, so the extension does not blanket-block YouTube's video CDN.

## Permissions and privacy

- `declarativeNetRequest`: apply the bundled blocking rules.
- `storage`: save the enabled preference and local counter.
- Content-script matches for `youtube.com` and `youtube-nocookie.com`: detect and handle ads in pages and matching frames.

No browsing history or video data is transmitted or persisted. See [PRIVACY.md](PRIVACY.md).

Chrome documentation: [content scripts and matching frames](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [declarative network rules](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest).

## License

[MIT](LICENSE).
