# Changelog

## 1.0.0

- Fork the upstream 0.1.26 bug workflow tools under the znmin npm scope.
- Replace broken page upload and unsupported separate linking with REST v2 multipart upload using objectType/objectID.
- Read the bug back to verify attachment association; report unverified linkage honestly.
- Preserve subdirectory deployment paths in API requests.
- Add multipart filename handling, size limits, HTTP/JSON error handling, timeout and redirect rejection.
- Add readonly mode and repeatable regression tests plus Windows/Linux CI.
