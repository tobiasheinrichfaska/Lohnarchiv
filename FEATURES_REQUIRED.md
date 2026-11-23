# Critical User Paths — Lohnarchiv

**Purpose:** Core workflows that must not break. Audit validates these end-to-end.
`[x]` = implemented and covered by tests; `[ ]` = planned.

## Logic layer

- [x] **New files become a manifest** — `planManifest` writes sequence, predecessor hashes (manifest + token), sorted files, audit entries.
- [x] **Removal needs name + technical reason** — missing/invalid decision blocks signing.
- [x] **Overwriting a signed path is blocked** — `FILE_CHANGED`.
- [x] **Chain verification finds** gaps, swapped tokens/manifests, dropped files, overwritten files, bad reasons, time going backwards.
- [x] **Start-up traffic light** — green / yellow (only unsigned new files) / red (missing or changed).
- [x] **BVV file names** — ≤ 64 chars, no umlauts/spaces/special chars, allowed extensions only.

## Not built yet

- [ ] Open/create password-protected ZIP (AES-256)
- [ ] RFC 3161 time stamp for manifest and files; PDF `DocTimeStamp` recognised by Adobe
- [ ] Import assistant (drag and drop, name proposal)
- [ ] Mandatory removal dialog
- [ ] Audit export as single files (§ 9a BVV)
- [ ] Reviewer / history view

| Path                             | Impact                      | Audit Check                      |
| -------------------------------- | --------------------------- | -------------------------------- |
| Tamper → red light / chain issue | Core promise of the archive | `tests/chain.test.ts` runs green |
| No console errors on load        | App must start              | Manual test MT-01                |
