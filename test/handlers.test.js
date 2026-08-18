// Extracts the two inline Lambda@Edge handlers from prerender-cloudfront.yaml and
// exercises them against synthetic CloudFront events.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const yamlPath = path.join(__dirname, '..', 'prerender-cloudfront.yaml');
const yaml = fs.readFileSync(yamlPath, 'utf8');

// Pull the indented ZipFile blocks: from "'use strict';" to the closing "};" of the handler.
function extractHandlers(text) {
  const blocks = [];
  const lines = text.split('\n');
  let current = null;
  let indent = '';
  for (const line of lines) {
    if (line.trim() === "'use strict';") {
      current = [];
      indent = line.match(/^ */)[0];
    }
    if (current) {
      current.push(line);
      // The handler ends on the "};" that sits at the same indentation as "'use strict';".
      if (line === `${indent}};`) {
        blocks.push(current.join('\n'));
        current = null;
      }
    }
  }
  return blocks;
}

const blocks = extractHandlers(yaml);
assert.strictEqual(blocks.length, 2, `expected 2 handlers, found ${blocks.length}`);

function load(src) {
  const dedented = src
    .replace(/\$\{PrerenderToken\}/g, 'TEST-TOKEN')
    .split('\n')
    .map(l => l.replace(/^ {10}/, ''))
    .join('\n');
  const module = { exports: {} };
  new Function('exports', 'module', dedented)(module.exports, module);
  return module.exports.handler;
}

const setPrerenderHeader = load(blocks[0]);
const redirectToPrerender = load(blocks[1]);

const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

function viewerRequestEvent(userAgent, uri = '/over/here', querystring = '') {
  return {
    Records: [
      {
        cf: {
          request: {
            uri,
            querystring,
            headers: {
              host: [{ key: 'Host', value: 'www.example.com' }],
              'user-agent': [{ key: 'User-Agent', value: userAgent }]
            }
          }
        }
      }
    ]
  };
}

function run(handler, event) {
  return new Promise((resolve, reject) =>
    handler(event, {}, (err, result) => (err ? reject(err) : resolve(result)))
  );
}

// CloudFront replaces User-Agent with this constant when the header is not forwarded.
function maskUserAgent(request) {
  request.headers['user-agent'] = [{ key: 'User-Agent', value: 'Amazon CloudFront' }];
  return request;
}

const checks = [];
function check(name, fn) {
  checks.push({ name, fn });
}

check('viewer-request marks a bot request and captures the user agent as a string', async () => {
  const request = await run(setPrerenderHeader, viewerRequestEvent(BOT_UA));

  assert.strictEqual(request.headers['x-prerender-token'][0].value, 'TEST-TOKEN');
  assert.strictEqual(request.headers['x-user-agent'][0].value, BOT_UA);
  assert.strictEqual(typeof request.headers['x-user-agent'][0].value, 'string');
});

check('viewer-request leaves a human request untouched', async () => {
  const humanUa = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36';
  const request = await run(setPrerenderHeader, viewerRequestEvent(humanUa));

  assert.strictEqual(request.headers['x-prerender-token'], undefined);
  assert.strictEqual(request.headers['x-user-agent'], undefined);
});

check('origin-request restores the crawler user agent that CloudFront masked', async () => {
  const marked = await run(setPrerenderHeader, viewerRequestEvent(BOT_UA));
  const masked = maskUserAgent(marked);

  const request = await run(redirectToPrerender, { Records: [{ cf: { request: masked } }] });

  assert.strictEqual(request.origin.custom.domainName, 'service.prerender.io');
  assert.strictEqual(request.headers['user-agent'][0].value, BOT_UA);
  assert.strictEqual(request.headers['user-agent'][0].key, 'User-Agent');
});

check('origin-request keeps a forwarded user agent unchanged', async () => {
  const marked = await run(setPrerenderHeader, viewerRequestEvent(BOT_UA));

  const request = await run(redirectToPrerender, { Records: [{ cf: { request: marked } }] });

  assert.strictEqual(request.headers['user-agent'][0].value, BOT_UA);
});

check('origin-request does not invent a user agent for a non-prerender request', async () => {
  const humanUa = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36';
  const passthrough = await run(setPrerenderHeader, viewerRequestEvent(humanUa));

  const request = await run(redirectToPrerender, { Records: [{ cf: { request: passthrough } }] });

  assert.strictEqual(request.origin, undefined);
  assert.strictEqual(request.headers['user-agent'][0].value, humanUa);
});

check('forwarded header list contains User-Agent and X-User-Agent', async () => {
  const forwarded = yaml.match(/^\s+- "[\w-]+"$/gm).map(l => l.trim());
  assert.ok(forwarded.includes('- "User-Agent"'), `User-Agent not forwarded: ${forwarded}`);
  assert.ok(forwarded.includes('- "X-User-Agent"'), `X-User-Agent not forwarded: ${forwarded}`);
});

(async () => {
  let failed = 0;
  for (const { name, fn } of checks) {
    try {
      await fn();
      console.log(`PASS  ${name}`);
    } catch (err) {
      failed++;
      console.log(`FAIL  ${name}\n      ${err.message}`);
    }
  }
  console.log(`\n${checks.length - failed}/${checks.length} passed`);
  process.exit(failed ? 1 : 0);
})();
