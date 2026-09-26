# AdVoid — YouTube Ad Blocker

A lightweight Chrome Manifest V3 extension that combines bundled network rules, early YouTube player-response filtering, player monitoring, and cosmetic ad hiding. No external libraries, remote code, or data collection.

## Version 1.2.0

- Adds `youtube-response.js` in the page's MAIN world at `document_start`. It removes known `adPlacements` and `adSlots` fields from initial player data and supported YouTube player API responses before the player consumes them.
- Filters the `player`, `get_watch`, and `next` JSON endpoints through fetch JSON/text consumption and XHR getters. Streaming URLs, captions, playability errors, and unrelated requests are preserved. Fetch bodies are not eagerly downloaded or reconstructed.
- Keeps the existing DOM skip handler as a fallback. End-of-ad seeking now requires that the target is both buffered and seekable, and occurs at most once per source. Seeking into an unavailable ad segment can otherwise cause buffering/blank-player delays.
- Requires Chrome 111+ for manifest-declared MAIN-world scripts.

This is a prevention layer, not a guarantee of instant or universal YouTube blocking. A live comparison against the reported video (`INqn8pOQJzQ`) is still required in Chrome with this extension installed. Controlled tests do not measure live ad latency.

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
| Early prevention | `youtube-response.js` | Removes known ad placements from supported initial/JSON player data before playback is configured. |
| Player and page | `content.js` | Hides known cosmetic ad containers, observes ad-state classes, and clicks available Skip buttons. |
| Fallback | `content.js` | For a separate finite ad clip up to five minutes long, attempts one seek near its buffered, seekable end and plays at 16× while muted. |
| State | `background.js` | Synchronizes the ruleset with the toggle and stores the local counter. |
| Controls | `popup.html`, `popup.js`, `popup.css` | Displays the toggle and counter. |

The fallback requires `ad-showing`, ready media metadata, and a source different from the last observed content source. `ad-interrupting` alone, lingering ad UI, or a short video duration do not trigger a seek. If the known content source returns before the ad class disappears, playback settings are restored immediately. These checks reduce source-transition mistakes; YouTube's undocumented ad classes are not an absolute guarantee.

The popup counter records handled ad sessions when the player leaves ad mode. An uninterrupted multi-ad break may count as one session. Network-blocked requests and cosmetically hidden ads are not included.

## Install or update

Requires Chrome 111+ or a compatible Chromium browser.

1. Open `chrome://extensions/` and enable **Developer mode**.
2. Select **Load unpacked** and choose this project folder, containing `manifest.json`.
3. If already loaded, click the extension's **Reload** button instead.
4. Refresh existing YouTube tabs and pages containing YouTube embeds so they receive the new content script.

The older ZIP archives do not contain these changes. Load the project folder or extract `AdVoid-v1.2.0.zip` to use version 1.2.0. Reload the extension **and** refresh YouTube: replacing files alone cannot update scripts already running in a tab.

The page-world filter waits for the saved enabled preference. Turning the extension off stops future filtering, but cannot reconstruct player data already consumed; reload the page for a fully unfiltered session.

## Verification

Run the dependency-free automated regression suite:

```sh
node --test tests/content.test.cjs tests/youtube-response.test.cjs
```

The 30 tests run the actual scripts against simulated DOM/media/Chrome APIs and native Node Response objects. They cover prompt skip handling, source-transition guards, buffered seeking, restoration, disabled navigation, startup, response identity/metadata, cloning, JSON/text/XHR filtering, aborts, and endpoint isolation. They do not simulate YouTube's servers or prove live blocking effectiveness.

For native browser response/XHR checks, run `node tests/serve-browser-tests.cjs` and open `http://127.0.0.1:8766`. All eight browser fixture checks passed during development. The local test server exposes only its test page, response-filter script, and fixture data.

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

Early filtering is intentionally limited to known JSON fields and endpoints. Direct ReadableStream consumers, different response envelopes, and data consumed before the saved preference arrives can bypass it. Other blockers or YouTube can replace page-world hooks. No login status, account entitlement, or server error is forged. An ad-free experience still depends on YouTube's current delivery variant.

## How this compares with AdBlock

AdBlock documents maintained filter subscriptions, EasyList and anti-circumvention filters, privacy lists, cosmetic rules, and configurable exceptions. AdVoid still has only eight bundled network rules and no maintained general-purpose filter-list engine. It is not equivalent to AdBlock's whole-web coverage. Acceptable Ads is an allowlisting option, not an acceleration technique.

References: [AdBlock filtering overview](https://helpcenter.getadblock.com/adblock-help-center/how-does-adblock-work), [recommended AdBlock filters](https://helpcenter.getadblock.com/adblock-help-center/seeing-unblocked-ads-start-here), [uBlock's current YouTube filtering examples](https://github.com/uBlockOrigin/uAssets/blob/master/filters/quick-fixes.txt). The response-filter implementation in this repository is original; it does not bundle those projects' code or lists.

## Permissions and privacy

- `declarativeNetRequest`: apply the bundled blocking rules.
- `storage`: save the enabled preference and local counter.
- Content-script matches for `youtube.com` and `youtube-nocookie.com`: detect and handle ads in pages and matching frames.

No browsing history or video data is transmitted or persisted. See [PRIVACY.md](PRIVACY.md).

Chrome documentation: [content scripts and matching frames](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [declarative network rules](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest).

## License

[MIT](LICENSE).
