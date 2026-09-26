const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../youtube-response.js'), 'utf8');
const endpoint = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const fixture = () => ({
  adPlacements: [{ ad: 'pre-roll' }], adSlots: [{ ad: 'mid-roll' }],
  playerAds: { retainedLegacyField: true },
  streamingData: { formats: [{ url: 'https://example.googlevideo.com/videoplayback?content=1' }] },
  videoDetails: { videoId: 'INqn8pOQJzQ', lengthSeconds: '120' },
  captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ languageCode: 'en' }] } },
  playabilityStatus: { status: 'OK' }
});

function harness({ enabled = true, fetchImpl, initialDescriptor } = {}) {
  const document = new EventTarget();
  const window = {
    fetch: fetchImpl || (() => Promise.resolve(new Response(JSON.stringify(fixture()), {
      status: 200, headers: { 'content-type': 'application/json', 'x-test': 'preserved' }
    })))
  };
  if (initialDescriptor) Object.defineProperty(window, 'ytInitialPlayerResponse', initialDescriptor);
  class XHR {
    constructor(value = JSON.stringify(fixture())) {
      this.raw = value; this.responseURL = endpoint; this.readyState = 4; this.responseType = '';
    }
    get response() { return this.raw; }
    get responseText() {
      if (this.responseType && this.responseType !== 'text') throw new DOMException('InvalidState', 'InvalidStateError');
      return this.raw;
    }
  }
  vm.runInNewContext(source, { window, document, Event, URL, XMLHttpRequest: XHR,
    location: { href: 'https://www.youtube.com/watch?v=INqn8pOQJzQ' } });
  const toggle = value => document.dispatchEvent(new CustomEvent('advoid:response-filter-state', { detail: value }));
  if (enabled) toggle(true);
  return { window, document, XHR, toggle };
}
function assertPruned(value) {
  assert.equal('adPlacements' in value, false);
  assert.equal('adSlots' in value, false);
  assert.deepEqual(value.streamingData, fixture().streamingData);
  assert.deepEqual(value.captions, fixture().captions);
  assert.deepEqual(value.videoDetails, fixture().videoDetails);
  assert.deepEqual(value.playabilityStatus, fixture().playabilityStatus);
  assert.deepEqual(value.playerAds, fixture().playerAds);
}

test('initial player response is cleaned before the page reads it', () => {
  const h = harness();
  const payload = fixture();
  h.window.ytInitialPlayerResponse = payload;
  assert.equal(h.window.ytInitialPlayerResponse, payload);
  assertPruned(payload);
});

test('initial response and fetch stay untouched until preference arrives', async () => {
  const h = harness({ enabled: false });
  h.window.ytInitialPlayerResponse = fixture();
  assert.ok(h.window.ytInitialPlayerResponse.adPlacements);
  assert.ok((await (await h.window.fetch(endpoint)).json()).adSlots);
  h.toggle(true);
  assertPruned(h.window.ytInitialPlayerResponse);
});

test('fetch preserves identity and metadata without eagerly consuming the body', async () => {
  const original = new Response(JSON.stringify(fixture()), { status: 201, headers: { 'x-test': 'kept' } });
  const h = harness({ fetchImpl: () => Promise.resolve(original) });
  const result = await h.window.fetch(endpoint);
  assert.equal(result, original);
  assert.equal(result.bodyUsed, false);
  assert.equal(result.status, 201);
  assert.equal(result.headers.get('x-test'), 'kept');
  assertPruned(await result.json());
  assert.equal(result.bodyUsed, true);
  await assert.rejects(result.json(), TypeError);
});

test('text consumption, Response clones, URL and Request inputs are filtered', async () => {
  const h = harness();
  for (const input of [endpoint, new URL(endpoint), new Request(endpoint), '/youtubei/v1/player']) {
    const response = await h.window.fetch(input);
    const clone = response.clone();
    assertPruned(JSON.parse(await response.text()));
    assertPruned(await clone.json());
  }
});

test('same-named data outside player endpoints and on lookalike domains stays unchanged', async () => {
  const h = harness();
  for (const url of [
    'https://www.youtube.com/youtubei/v1/browse',
    'https://www.youtube.com/youtubei/v1/player/extra',
    'https://www.youtube.com/api/stats/ads',
    'https://youtube.com.example.com/youtubei/v1/player',
    'https://notyoutube.com/youtubei/v1/player'
  ]) assert.ok((await (await h.window.fetch(url)).json()).adSlots, url);
});

test('redirected responses outside player endpoints stay unchanged', async () => {
  const response = new Response(JSON.stringify(fixture()));
  Object.defineProperty(response, 'url', { value: 'https://example.com/login' });
  const h = harness({ fetchImpl: () => Promise.resolve(response) });
  assert.ok((await (await h.window.fetch(endpoint)).json()).adSlots);
});

test('disabled state also applies to already-returned fetch responses', async () => {
  const h = harness();
  const response = await h.window.fetch(endpoint);
  h.toggle(false);
  assert.ok((await response.json()).adSlots);
  h.window.ytInitialPlayerResponse = fixture();
  assert.ok(h.window.ytInitialPlayerResponse.adSlots);
});

test('known nested and batched player responses are cleaned', async () => {
  const payload = [{ playerResponse: fixture() }];
  const h = harness({ fetchImpl: () => Promise.resolve(new Response(JSON.stringify(payload))) });
  assertPruned((await (await h.window.fetch(endpoint)).json())[0].playerResponse);
});

test('unrelated nested data and server playback errors are retained', async () => {
  const payload = { other: { adSlots: ['ordinary-data'] }, playabilityStatus: { status: 'LOGIN_REQUIRED' } };
  const text = JSON.stringify(payload, null, 2);
  const h = harness({ fetchImpl: () => Promise.resolve(new Response(text)) });
  assert.equal(await (await h.window.fetch(endpoint)).text(), text);
});

test('invalid text and JSON parser failures retain native behavior', async () => {
  const text = '{"adSlots": malformed';
  const h = harness({ fetchImpl: () => Promise.resolve(new Response(text)) });
  assert.equal(await (await h.window.fetch(endpoint)).text(), text);
  await assert.rejects((await h.window.fetch(endpoint)).json(), SyntaxError);
});

test('fetch rejection, aborts, and arguments are passed through', async () => {
  const error = new DOMException('Aborted', 'AbortError');
  const init = { signal: new AbortController().signal };
  let seen;
  const h = harness({ fetchImpl: (...args) => { seen = args; return Promise.reject(error); } });
  await assert.rejects(h.window.fetch(endpoint, init), value => value === error);
  assert.equal(seen[1], init);
});

test('XHR text responses are cleaned; partial and unrelated responses stay intact', () => {
  const h = harness();
  const xhr = new h.XHR();
  assertPruned(JSON.parse(xhr.responseText));
  assert.equal(xhr.responseText, xhr.response);
  xhr.readyState = 3;
  assert.ok(JSON.parse(xhr.responseText).adSlots);
  xhr.readyState = 4; xhr.responseURL = 'https://www.youtube.com/youtubei/v1/browse';
  assert.ok(JSON.parse(xhr.responseText).adSlots);
  xhr.responseURL = endpoint; h.toggle(false);
  assert.ok(JSON.parse(xhr.responseText).adSlots);
});

test('XHR JSON is filtered and responseText still throws for non-text response types', () => {
  const h = harness();
  const xhr = new h.XHR(fixture()); xhr.responseType = 'json';
  assertPruned(xhr.response);
  assert.throws(() => xhr.responseText, { name: 'InvalidStateError' });
  const binary = new ArrayBuffer(5);
  xhr.raw = binary; xhr.responseType = 'arraybuffer';
  assert.equal(xhr.response, binary);
});

test('existing accessors and frozen objects do not break playback', () => {
  const payload = Object.freeze(fixture());
  const h = harness({ initialDescriptor: { get: () => payload, configurable: false } });
  assert.equal(h.window.ytInitialPlayerResponse, payload);
  const normal = harness();
  normal.window.ytInitialPlayerResponse = payload;
  assert.equal(normal.window.ytInitialPlayerResponse, payload);
});

test('methods borrowed from filtered responses do not filter unrelated bodies', async () => {
  const h = harness();
  const response = await h.window.fetch(endpoint);
  assert.ok((await response.json.call(new Response(JSON.stringify(fixture())))).adSlots);
});

test('manifest installs the MAIN-world filter before isolated-world controller', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'), 'utf8'));
  const main = manifest.content_scripts.findIndex(entry => entry.js.includes('youtube-response.js'));
  const isolated = manifest.content_scripts.findIndex(entry => entry.js.includes('content.js'));
  assert.ok(main >= 0 && main < isolated);
  assert.equal(manifest.content_scripts[main].world, 'MAIN');
  assert.equal(manifest.content_scripts[main].run_at, 'document_start');
});
