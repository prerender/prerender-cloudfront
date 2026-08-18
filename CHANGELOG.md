# Changelog

## Unreleased

- Keep the crawler `User-Agent` when CloudFront does not forward it. The
  viewer-request function now stores the header value as a string (it
  stored the raw header object before, so the value was unusable), the
  origin-request function restores `User-Agent` from `X-User-Agent`, and
  the cache behavior forwards `X-User-Agent`. Without this, Prerender.io
  received `Amazon CloudFront` as the crawler identity.
- Bumped the `AWS::Lambda::Version` logical IDs, so a stack update
  publishes new function versions.

## Older notes

The runtime parameter of nodejs6.10 is no longer supported for creating or updating AWS Lambda functions. We recommend you use the new runtime (nodejs8.10) while creating or updating functions. (Service: AWSLambdaInternal; Status Code: 400; Error Code: InvalidParameterValueException; Request ID: 579f3922-7baa-11e9-adaf-11ff68a3ace1)
