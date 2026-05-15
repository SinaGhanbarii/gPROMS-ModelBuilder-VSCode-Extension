# Changelog

## [0.9.0]

### Added
- **Auto-complete** (Phase 2 ③): context-aware suggestions as you type
  - User-declared symbols (variables, parameters, unit instances, types) suggested from the current file
  - Built-in functions (`EXP`, `LOG`, `SQRT`, `SIGMA`, `PARTIAL` etc.) with signature shown
  - All gPROMS structural keywords grouped by category
  - Discretisation methods (`CFDM`, `BFDM`, `PDCOL` etc.)
  - Context snippets that float to the top after trigger words (`AS`, `FOR`, `CONTINUE`, `SWITCH`, `INITIAL`)
  - Smart dot-trigger: only user symbols suggested after `.` — keywords suppressed in `unit.variable` context
  - Per-document rich symbol cache rebuilt on every keystroke

## [0.8.7]

### Added
- `REPORT` section keywords (`TITLES`, `HEADERS`, `FOOTER`, `COLUMN`, `NOHEADER`) added to keyword list
- `->` connection arrow captured by tokeniser, highlighted in editor, and checked for terminating `;`
- `CONNECTIONS` section added to assignment semicolon checker
- `INITIALISATION_PROCEDURE`, `PRESET`, `CONNECTIONS` now highlighted as section headers (blue bold)
- `SEND`, `GET`, `SENDMATHINFO`, `ABORT` added to schedule keyword highlighting
- 30+ additional ModelBuilder-specific keywords added (`USING`, `OBJECTIVE`, `CONSTRAINTS`, `AT`, `EVERY`, `INTERVAL`, `PORT`, `INTERFACE`, `EXTERNAL`, `REINITIALISE`, `CHECKPOINT` and more)

### Fixed
- `REPORT` section exempted from false schedule-only keyword errors
- `PRESET` section: `RESTORE`, `WITHIN`, `FOR`, `SAVE` no longer flagged inside `PRESET`

## [0.8.6]

### Added
- `DISCRETISATION_METHODS` set: `CFDM`, `BFDM`, `FFDM`, `MIXED`, `UDS`, `QDS`, `PDCOL2` and others — never flagged as unknown keywords or misspellings
- Discretisation methods highlighted in teal (same as PDE operators)

### Fixed
- Tokeniser now captures dotted identifiers (`Solar_heater.mwi`) as a single token — second part of dotted path no longer falsely flagged as unknown keyword
- Misspelling checker explicitly skips any token containing `.`
- Misspelling checker skips discretisation method names
- Symbol table now collects `OPTIMISATION` and `ESTIMATION` entity names

## [0.8.5]

### Fixed
- `INITIALISATION_PROCEDURE` reclassified as a **section inside PROCESS** (not a top-level block) — eliminates "cannot be nested" false error
- `USE...END` sub-block inside `INITIALISATION_PROCEDURE` now correctly recognised
- `SAVE` and other schedule-adjacent keywords no longer falsely flagged inside `INITIALISATION_PROCEDURE`

## [0.8.4]

### Fixed
- `EQUATION` added to `VALID_IN_PROCESS` — stream connection equations (`Solar_heater.Outlet = Humidifier.Inlet`) no longer falsely flagged inside a `PROCESS` block

## [0.8.3]

### Fixed
- `OPTIMISATION`/`ESTIMATION` blocks: fixed five bugs introduced in v0.8.1
  - Virtual stack entry no longer triggers false "cannot be nested" error
  - `MAXIMISE`/`MINIMISE` removed from `SCHEDULE_ONLY_KEYWORDS` (valid in both `OPTIMISATION` and `SCHEDULE`)
  - `SOLUTIONPARAMETERS`, `FREE`, `CONSTRAINTS`, `OBJECTIVE` now recognised inside `OPTIMISATION`/`ESTIMATION`
  - Schedule-only keyword checks exempt `OPTIMISATION`/`ESTIMATION` context

## [0.8.2]

### Fixed
- `INITIALISATION_PROCEDURE` added as valid top-level block (`USE`, `SAVE`, `RESTORE`, `WITHIN` recognised inside it)
- `USE` added to `BLOCK_OPEN_CLOSE` for correct `USE...END` matching
- `PRESET` section fully supported: `RESTORE`, `WITHIN`, `FOR`, `SAVE` no longer flagged inside `PRESET`

## [0.8.1]

### Added
- `OPTIMISATION` and `ESTIMATION` recognised as valid top-level blocks alongside `MODEL`, `PROCESS`, `TASK`
- `# TYPE: OPTIMISATION` and `# TYPE: ESTIMATION` accepted as file type hints
- `typehint` and `header` snippets updated to include all five block types
- Info diagnostic on line 1 when no `# TYPE:` hint is present (blue marker, not an error)
- `checkAssignmentSemicolons()`: dedicated multi-line continuation checker for `SET`/`ASSIGN`/`INITIAL`/`SOLUTIONPARAMETERS` sections

### Fixed
- Multi-line assignments in `SET`/`ASSIGN`/`INITIAL` (e.g. value spanning two lines) no longer falsely flagged for missing semicolon
- Continuation detector now also recognises lines where previous line ended with `:=`, `(`, or `,`

## [0.8.0]

### Changed
- Extension bundled with `esbuild`: package reduced from 396 files / 583 KB to **12 files / 174 KB**
- `node_modules` no longer shipped — all dependencies inlined into `dist/extension.js` and `dist/server.js`
- `.vscodeignore` added to exclude source, samples, and development files from packaged extension

### Added
- 5 new snippets: `OPTIMISATION` (steady-state), `OPTIMISATION` (dynamic), `ESTIMATION`, `SENSITIVITY`, `DECLARE STREAM_TYPE`
- Smarter continuation detection: lines where previous line ended with `=`, `(`, `+`, `-`, `,` correctly treated as continuations
- Duplicate `PARAMETER`/`VARIABLE` declaration detection (warning)
- `SWITCH TO <State>` validation: flags state names not declared in a `SELECTOR` section

## [0.7.2] — Beta

### Changed
- Updated extension description
- Improved README with full How to Use guide

### Fixed
- Multi-line equations no longer falsely flagged for missing semicolon
- `FOR`, `IF`, `WHILE` blocks now correctly close with bare `END` (not `END_FOR` / `END_IF` / `END_WHILE`)
- `END_FOR`, `END_IF`, `END_WHILE` removed from all snippets, hover docs and error messages

## [0.7.1]

### Fixed
- All loop and conditional blocks (`FOR`, `IF`, `WHILE`) now correctly use bare `END` as closer, matching actual gPROMS GPL syntax

## [0.7.0]

### Added
- `# TYPE: MODEL / PROCESS / TASK` file hint system — tells the error checker which block type the file contains, eliminating false positives on partial files
- `typehint` snippet for quick hint insertion
- Safe-only mode when no hint is present: only misspellings and semicolons checked (zero false positives)

## [0.6.0]

### Changed
- Complete rewrite of error checker using a two-pass parser (tokenise → check), replacing the fragile line-by-line scanner
- Pass 1 builds a symbol table of all declared names before any checking begins — eliminates false positives on user-defined type and model names
- Pass 2 walks the token stream with a proper block stack and full lookahead
- Edit-distance engine suggests corrections for misspelled keywords

## [0.5.0]

### Added
- Phase 2 Feature ①: Language Server with hover tooltips
- Hover documentation for 50+ keywords: signature, description and code example for each
- Real-time error checking (Phase 2 Feature ②): unclosed blocks, misspelled keywords, missing semicolons, wrong operators, keywords in wrong sections

## [0.4.0]

### Added
- Language Server infrastructure (Node.js, LSP protocol)
- `extension.js` entry point wiring client to server

## [0.3.0]

### Fixed
- Colour theme now applied automatically via `configurationDefaults` — no longer requires manually switching VSCode theme

## [0.2.0]

### Added
- Custom icon (user-provided logo)
- gPROMS Dark and gPROMS Light colour themes
- 10 additional snippets: CSTR, batch reactor, buffer tank, heat exchanger, PFR (1D PDE), Arrhenius, Antoine, Raoult's Law, VLE summation, full DECLARE TYPE set
- Additional keywords from Advanced User Guide

## [0.1.0]

### Added
- Initial release
- Syntax highlighting grammar based on gPROMS Introductory and Advanced User Guides
- 31 code snippets
- Block folding, comment toggling, bracket auto-close
- Publisher: SinaGhanbarii
