prerender.io cloudfront example middleware
==

This is an example of integrating prerender.io and a SPA in S3 served
over Cloudfront.

Instructions
--

1. Upload prerender-cloudfront.yaml to Cloudformation as a new stack,
   that'll setup the example for you. Enter your prerender.io token when
   asked.
2. Upload code.js and index.html to the S3 bucket created by
   Cloudformation in step 1.
3. Change the read permissions for code.js and index.html to be publicly
   readable.

Testing
--

To see the page as rendered by prerender.io run:

    curl -H 'User-Agent: Facebot' https://${CLOUDFRONT_DOMAIN}/over/here

The same page without pre-rendering:

    curl https://${CLOUDFRONT_DOMAIN}/over/here

Implementation
--

Two Lambda@edge functions are used. The first detects bot requests on
requests entering the system, it sets a header which Cloudfront uses to
partition the cache. The second function, run after the cache, detects
the presence of the header and, if present, routes the request to
Prerender.io

Tests
--

The two Lambda@Edge handlers are extracted from the template and run
against synthetic CloudFront events. No dependencies are needed:

    node test/handlers.test.js

Crawler User-Agent
--

CloudFront replaces the `User-Agent` header with the constant
`Amazon CloudFront` on the origin request unless the header is forwarded
(cache policy, origin request policy, or the legacy whitelist in
`ForwardedValues.Headers`). When that happens Prerender.io receives
`Amazon CloudFront` instead of `Googlebot`, `GPTBot`, and so on. The
result is wrong crawler statistics in the Prerender.io dashboard, and no
mobile-adaptive rendering, because the device type is derived from the
`User-Agent`.

This template protects against that in two ways:

1. The cache behavior forwards `User-Agent` and `X-User-Agent`.
2. The viewer-request function copies the true `User-Agent` into
   `X-User-Agent`, and the origin-request function writes it back into
   `User-Agent` before the request goes to Prerender.io. `User-Agent` is
   not a read-only header in viewer-request or origin-request events, so
   this write is permitted.

The integration stays identifiable after the restore. The viewer-request
function also sends `X-Prerender-Int-Type: cloudfront` and
`X-Prerender-Int-Version`, so Prerender.io knows that the request came
through CloudFront and which version of these functions produced it.
Bump the version value when you change the function code. A request
without the version header comes from a stack that is older than 2.0.0.

If you added the two Lambda@Edge functions to an existing distribution
instead of deploying this stack, forward `User-Agent` and `X-User-Agent`
in the cache behavior of that distribution.

Caching
--

By default, static resources from the bucket are cached for a long time
period. This improves performance but means that the deploy process of
any real app will need a Cloudfront purge step.

As prerender.io does NOT want any Cloudfront caching (see
https://github.com/prerender/prerender/issues/93#issuecomment-366774910)
we disable that by including a X-Prerender-Cachebuster header which
effectively disables cloudfront caching.

NOTE: using X-Prerender-Cachebuster is probably not optimal, if you find
a better way, please let me know.
