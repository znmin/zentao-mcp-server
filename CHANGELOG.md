# Changelog

## 1.1.0

- Add `assignedTo` to single and batch resolution; default to ZENTAO_DEFAULT_ASSIGNED_TO or the Bug creator instead of silently clearing the assignee. Read back assignment after resolution.
- Add `add_bug_comment` and `edit_bug_comment` with authenticated page sessions and verified action-history read-back.
- Let `comment_bug` accept ordinary text/HTML as well as structured explanations; remove nonexistent REST comment routes.
- Remove duplicate automatic comments after resolution; explanations already belong to the resolve action.
- Extend readonly filtering and regression coverage for new tools.

## 1.0.0

- Fork the upstream 0.1.26 bug workflow tools under the znmin npm scope.
- Replace broken page upload and unsupported separate linking with REST v2 multipart upload using objectType/objectID.
- Read the bug back to verify attachment association; report unverified linkage honestly.
- Preserve subdirectory deployment paths in API requests.
- Add multipart filename handling, size limits, HTTP/JSON error handling, timeout and redirect rejection.
- Add readonly mode and repeatable regression tests plus Windows/Linux CI.
