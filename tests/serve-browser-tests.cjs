// Serves only explicit test resources on localhost; never exposes the repository.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const fixture = { adSlots: [{ad:1}], adPlacements: [{ad:2}],
  streamingData: {formats:[{url:'https://example.googlevideo.com/content'}]},
  captions: {language:'en'}, videoDetails: {videoId:'fixture'}, playabilityStatus: {status:'OK'} };
http.createServer((req, res) => {
  const routes = {
    '/': ['tests/browser.html', 'text/html; charset=utf-8'],
    '/youtube-response.js': ['youtube-response.js', 'text/javascript; charset=utf-8']
  };
  if (req.url === '/fixture') {
    res.writeHead(200, {'content-type':'application/json'}); res.end(JSON.stringify(fixture)); return;
  }
  const route = routes[req.url];
  if (!route) {res.writeHead(404); res.end(); return;}
  res.writeHead(200, {'content-type':route[1], 'cache-control':'no-store'});
  res.end(fs.readFileSync(path.join(__dirname, '..', route[0])));
}).listen(8766, '127.0.0.1', () => console.log('AdVoid browser tests: http://127.0.0.1:8766'));
