# Changelog

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
