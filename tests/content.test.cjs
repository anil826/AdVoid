const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../content.js'), 'utf8');

function media(overrides = {}) {
  const listeners = new Map();
  const result = Object.assign({
    playbackRate: 1.5, muted: false, duration: 120, currentTime: 12,
    currentSrc: 'blob:content', readyState: 4,
    addEventListener(name, fn) { listeners.set(name, fn); },
    removeEventListener(name) { listeners.delete(name); },
    emit(name) { listeners.get(name)?.(); }
  }, overrides);
  result.buffered ??= { length: 1, start: () => 0, end: () => result.duration };
  result.seekable ??= { length: 1, start: () => 0, end: () => result.duration };
  return result;
}
function harness({ enabled = true, ad = false, noRoot = false, initialVideo = media(), deferStorage = false } = {}) {
  let style, storageListener, storageRead, now = 0;
  const observers = [], microtasks = [], timers = new Map(), events = new Map(), messages = [];
  let timerId = 0;
  const classes = new Set(ad ? ['ad-showing'] : []);
  const player = {
    isConnected: true, video: initialVideo, buttons: [],
    classList: { contains: name => classes.has(name) },
    querySelector() { return this.video; },
    querySelectorAll() { return this.buttons; }
  };
  const root = { appendChild(el) { style = el; } };
  const document = {
    documentElement: noRoot ? null : root, head: null, activePlayer: player,
    querySelector() { return this.activePlayer; },
    getElementById() { return style; },
    createElement() { return { remove() { style = undefined; } }; },
    addEventListener(name, fn) { events.set(name, fn); },
    dispatchEvent(event) { events.get(event.type)?.(event); }
  };
  class Observer {
    constructor(fn) { this.fn = fn; observers.push(this); }
    observe(target, options) { this.target = target; this.options = options; }
    disconnect() { this.target = null; }
    fire() { if (this.target) this.fn([]); }
  }
  const context = {
    window: {}, document, MutationObserver: Observer,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    performance: { now: () => now },
    getComputedStyle: button => ({ display: 'block', visibility: button.visibility || 'visible' }),
    queueMicrotask: fn => microtasks.push(fn),
    setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout: id => timers.delete(id),
    chrome: {
      runtime: { sendMessage(msg, cb) { messages.push(msg); cb(); } },
      storage: {
        local: { get(defaults, cb) { storageRead = cb; if (!deferStorage) cb({ enabled }); } },
        onChanged: { addListener(fn) { storageListener = fn; } }
      }
    }
  };
  vm.runInNewContext(source, context);
  function flush() {
    let iterations = 0;
    while (microtasks.length) {
      assert.ok(++iterations < 100, 'scan must not loop');
      microtasks.shift()();
    }
  }
  return {
    player, classes, document, timers, observers, messages,
    get style() { return style; },
    mutate() { observers.forEach(observer => observer.fire()); flush(); },
    emit(name) { events.get(name)?.(); flush(); },
    toggle(value) { storageListener({ enabled: { newValue: value } }, 'local'); flush(); },
    read(value) { storageRead({ enabled: value }); flush(); },
    root() { document.documentElement = root; this.mutate(); },
    tick() { now += 100; const pending = [...timers.values()]; timers.clear(); pending.forEach(t => t.fn()); flush(); },
    flush
  };
}
function button(overrides = {}) {
  return Object.assign({
    clicks: 0, disabled: false,
    getAttribute() { return null; }, getClientRects() { return [{}]; },
    click() { this.clicks++; }
  }, overrides);
}

test('handles an ad mutation immediately, without animation frames', () => {
  const h = harness();
  const skip = button();
  h.player.buttons = [skip];
  h.classes.add('ad-showing');
  h.mutate();
  assert.equal(skip.clicks, 1);
  assert.equal(h.player.video.currentTime, 12);
  assert.equal(h.timers.size, 1);
  assert.equal([...h.timers.values()][0].delay, 100);
  assert.ok(!h.style.textContent.includes('.video-ads'));
});

test('checks all skip buttons when the first is hidden or disabled', () => {
  const h = harness({ ad: true });
  const hidden = button({ getClientRects: () => [] }), disabled = button({ disabled: true }), usable = button();
  h.player.buttons = [hidden, disabled, usable];
  h.mutate();
  assert.equal(usable.clicks, 1);
  assert.equal(hidden.clicks + disabled.clicks, 0);
});

test('does not seek short content during an early ad-class transition', () => {
  const h = harness();
  h.classes.add('ad-showing');
  h.mutate();
  assert.equal(h.player.video.currentTime, 12);
  assert.equal(h.player.video.playbackRate, 1.5);
  assert.equal(h.player.video.muted, false);
});

test('seeks a separate ad clip, then restores when known content returns before class clears', () => {
  const h = harness();
  h.classes.add('ad-showing');
  Object.assign(h.player.video, { currentSrc: 'blob:ad', duration: 30, currentTime: 0 });
  h.mutate();
  assert.equal(h.player.video.currentTime, 29.95);
  assert.equal(h.player.video.playbackRate, 16);
  assert.equal(h.player.video.muted, true);
  Object.assign(h.player.video, { currentSrc: 'blob:content', duration: 120, currentTime: 12 });
  h.player.video.emit('loadedmetadata');
  h.flush();
  assert.equal(h.player.video.currentTime, 12);
  assert.equal(h.player.video.playbackRate, 1.5);
  assert.equal(h.player.video.muted, false);
  h.classes.clear(); h.mutate(); h.mutate();
  assert.equal(h.messages.length, 1);
  assert.equal(h.timers.size, 0);
});

test('disabling mid-ad restores state and navigation cannot re-enable hiding', () => {
  const h = harness({ ad: true, initialVideo: media({ currentSrc: 'blob:ad', muted: true }) });
  assert.equal(h.player.video.playbackRate, 16);
  h.toggle(false);
  assert.equal(h.player.video.playbackRate, 1.5);
  assert.equal(h.player.video.muted, true);
  assert.equal(h.timers.size, 0);
  h.emit('yt-navigate-finish');
  assert.equal(h.style, undefined);
  assert.equal(h.messages.length, 0);
  h.toggle(true);
  assert.ok(h.style);
  assert.equal(h.player.video.playbackRate, 16);
});

test('starts disabled without modifying the page; ignores stale storage read', () => {
  const h = harness({ enabled: false, ad: true });
  h.emit('DOMContentLoaded');
  assert.equal(h.style, undefined);
  assert.equal(h.player.video.playbackRate, 1.5);
  const deferred = harness({ deferStorage: true });
  deferred.toggle(false); deferred.read(true);
  assert.equal(deferred.style, undefined);
});

test('document_start with no root recovers when DOM arrives', () => {
  const h = harness({ noRoot: true });
  assert.equal(h.style, undefined);
  h.root();
  assert.ok(h.style);
});

test('video replacement restores both old media and resumed media', () => {
  const h = harness({ ad: true, initialVideo: media({ currentSrc: 'blob:ad' }) });
  const old = h.player.video;
  h.player.video = media({ playbackRate: 16, muted: true });
  h.classes.clear(); h.mutate();
  assert.equal(old.playbackRate, 1.5);
  assert.equal(old.muted, false);
  assert.equal(h.player.video.playbackRate, 1.5);
  assert.equal(h.player.video.muted, false);
});

test('ad-only timer catches a newly available skip button without mutations', () => {
  const h = harness({ ad: true });
  const skip = button();
  h.player.buttons = [skip];
  h.tick();
  assert.equal(skip.clicks, 1);
  assert.equal(h.timers.size, 1);
  h.tick();
  assert.equal(skip.clicks, 1, 'rate-limit clicks on the same button');
});

test('fallback never seeks into an unbuffered ad segment', () => {
  const video = media({ currentSrc: 'blob:ad', currentTime: 0, duration: 30,
    buffered: { length: 1, start: () => 0, end: () => 2 } });
  const h = harness({ ad: true, initialVideo: video });
  assert.equal(video.currentTime, 0);
  assert.equal(video.playbackRate, 16);
  video.buffered.end = () => 30;
  h.tick();
  assert.equal(video.currentTime, 29.95);
  video.currentTime = 1;
  h.tick(); h.tick(); h.tick();
  assert.equal(video.currentTime, 1, 'do not repeatedly seek when the player resets a clip');
});

test('fallback does not seek an unseekable ad even if buffered', () => {
  const video = media({ currentSrc: 'blob:ad', seekable: { length: 0 } });
  harness({ ad: true, initialVideo: video });
  assert.equal(video.currentTime, 12);
});

test('unknown/live durations and interrupting-only states never seek', () => {
  for (const duration of [NaN, Infinity, 0, 600]) {
    const h = harness({ ad: true, initialVideo: media({ duration }) });
    assert.equal(h.player.video.currentTime, 12);
    assert.equal(h.player.video.playbackRate, 1.5);
  }
  const h = harness();
  h.classes.add('ad-interrupting'); h.player.video.currentSrc = 'blob:ad'; h.mutate();
  assert.equal(h.player.video.currentTime, 12);
});

test('normal playback has no timer, and unrelated global mutations do not scan player', () => {
  const h = harness();
  let queries = 0;
  h.player.querySelector = () => { queries++; return h.player.video; };
  h.observers[1].fire(); h.flush();
  assert.equal(queries, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(h.observers[1].options.attributes, undefined);
});

test('manifest covers standard and privacy-enhanced embeds; referenced files exist', () => {
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  const script = manifest.content_scripts.find(entry => entry.js.includes('content.js'));
  assert.equal(script.all_frames, true);
  assert.ok(script.matches.includes('*://*.youtube-nocookie.com/*'));
  for (const file of [...manifest.content_scripts.flatMap(entry => entry.js), manifest.background.service_worker, ...manifest.declarative_net_request.rule_resources.map(r => r.path)]) {
    assert.ok(fs.existsSync(path.join(root, file)));
  }
  const rules = JSON.parse(fs.readFileSync(path.join(root, 'rules.json')));
  assert.equal(new Set(rules.map(r => r.id)).size, rules.length);
});
