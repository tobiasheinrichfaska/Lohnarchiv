# CLAUDE.md — Lohnarchiv

> Workspace-wide conventions (language, git, build, architecture, testing, collaboration):
> [`c:\skripte\private\general stuff\CLAUDE.md`](../../private/general%20stuff/CLAUDE.md)
> Private companion (decisions, source briefing): [`../../private/Lohnarchiv-privat/`](../../private/Lohnarchiv-privat/CLAUDE.md)

---

## Project overview

Tamper-evident archive for supporting payroll documents (§ 8 BVV; GoBD; § 9a BVV / DRV, last transition
period ends 2027-01-01). One offline HTML app, created 2026-11-23. The archive is a **password-protected
ZIP** (AES-256) holding the single documents (PDF/JPEG/BMP/PNG/TIFF), their time stamps and a **chain of
JSON manifests**.

**How it works (decisions of Tobias, 2026-11-23):**

1. Every new document gets a trusted time stamp from an RFC 3161 time server (TSA). PDFs get an embedded
   document time stamp (PAdES `DocTimeStamp`, Adobe recognises it); other formats get a detached `.tsr`.
2. Every add/remove writes a **new manifest** (state of all files + audit log of the step) and links it to
   the SHA-256 of the previous manifest **and of its time-stamp token**. The new manifest is time-stamped.
3. **All old manifests and tokens stay in the ZIP.** Chain verification proves at any time that nothing was
   dropped, swapped or overwritten: each difference between two manifests must be explained exactly by the
   audit log; removals need a technical reason (Fehlablage / unleserlich, ersetzt / Duplikat) + user name.
4. **ZIP is the working store only.** § 9a BVV demands single readable files, so the audit export writes the
   plain documents as single files (without manifests/tokens) into a hand-over folder.

**Platform:** web (offline single HTML file, File System Access API + Web Crypto), navigation with `rad-navi`
**Language:** TypeScript + React 19
**Architecture:** UI-free logic layer `src/logic/` (done, tested); IO layer (ZIP, TSA, PDF stamp) and UI to
come. TSA/ZIP/token checks are ports (`TokenVerifier`); the logic is tested with a fake TSA.
Private companion repo: `Lohnarchiv-privat` (data only).

## Key rules

- **Public repo (AGPLv3 + commercial):** no real data (names, documents, archives, tokens) and no private
  project names — in files and in history. `.gitignore` blocks `*.zip *.tsr *.pdf` and images.
- Dependencies must stay AGPL-compatible: `zip.js` (BSD-3, AES) is planned for the ZIP; check the licence
  of every new package first.
- The device clock is not trusted time; `erstellt_am` is informational, the TSA `genTime` counts.
- A path that was signed is never overwritten (`FILE_CHANGED` blocks signing).

## Project Directory

| File/Folder                      | Purpose                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| `CLAUDE.md`                      | This file                                                                                       |
| `README.md`                      | Short description (German), license section                                                     |
| `FEATURES_REQUIRED.md`           | Critical user paths                                                                             |
| `docs/data-model.html`           | Self-contained data-model reference (regenerate when the model changes)                         |
| `manual_tests/`                  | Human-tester instructions (German)                                                              |
| `src/logic/model.ts`             | Types (`Manifest`, `FileEntry`, `AuditEntry`, `StampRef`), `LIMITS`, reason codes, `Result`     |
| `src/logic/canonical.ts`         | `canonicalJson`, `sha256Hex`                                                                    |
| `src/logic/filename.ts`          | `sanitizeFileName`, `proposeFileName`, `checkArchivePath` (BVV name rules)                      |
| `src/logic/diff.ts`              | `diffFiles`, `caseCollisions`                                                                   |
| `src/logic/manifest.ts`          | `planManifest` (builds the next manifest, blocks on missing reason/overwrite), `encodeManifest` |
| `src/logic/chain.ts`             | `verifyChain`, `checkState` (traffic light), `parseManifest`, `TokenVerifier` port              |
| `src/logic/index.ts`             | Public entry of the logic layer                                                                 |
| `src/ui/App.tsx`, `src/main.tsx` | UI shell (placeholder)                                                                          |
| `tests/`                         | Vitest (logic layer; fake TSA in `helpers.ts`)                                                  |
| `.github/workflows/tests.yml`    | CI check „Tests“                                                                                |

## Data Model

Authoritative reference: [`docs/data-model.html`](docs/data-model.html). Regenerate from source whenever
the model changes.

## Development Server Ports

| Server | Port |
| ------ | ---- |
| Vite   | 5178 |

## Known Limitations

- **Only the logic layer exists.** No ZIP read/write, no TSA client (RFC 3161 request/response parsing),
  no PDF `DocTimeStamp`, no UI yet.
- Free TSAs usually have no CORS headers → a small relay will be needed for browser calls. Free TSAs are
  not qualified; Adobe shows a time stamp as trusted only if the TSA chains to Adobe's trust list
  (AATL/EUTL) — check before choosing the default TSA.
- A path removed earlier can be re-used for a new file later (only an in-step overwrite is blocked).
- A deleted **last** manifest cannot be detected from the ZIP alone (the chain stays valid up to the
  previous one); the start-up check catches it because the files no longer match. Keep an external copy of
  the latest manifest hash (e.g. in the Verfahrensdokumentation / backup).
- Organisational duties stay with the user: Verfahrensdokumentation, Windows rights, daily backup.

_Last updated: 2026-11-23_
