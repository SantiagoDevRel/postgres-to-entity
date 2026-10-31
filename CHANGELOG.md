# Changelog

## 1.0.0

Breaking: output is now arkiv-entity-model/3 for SDK 1.0.0 and Rabdi.

- Replace the previous storage mapping with schema.name and typed schema.columns.
  Each column explicitly declares indexed, source type, encoding and nullability.
- Store binary/JSON/arrays in named bytes columns without an index. Preserve source
  identities and relationships; relationship ordinal is an explicit u64 column.
- Require bounded numeric expirationBlocks in addition to owner and expiration decisions.
  Longer retention requires authorized Lifetime Extension.
- Retain attributeLimits as the explicit queried-text byte-bound input. Validate UTF-8;
  reject oversized data without truncation. Stored source types remain lossless.
- Add offline toSdkSchema and shared converter-contract fixtures.
- Migrate the optional sample to reviewed SDK schema writes, explicit transaction gas,
  latest-state reads and server-only access keys; provide an idempotent Rabdi seed.
- Consume the actual npm archive in the sample and clean-install checks.
