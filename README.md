# gPROMS ModelBuilder — VSCode Extension

> Syntax highlighting, code snippets, hover documentation and real-time error checking for the **gPROMS GPL language** (gPROMS ModelBuilder).

**Version:** 0.7.2 — Beta  
**Publisher:** SinaGhanbarii  
**Language:** gPROMS GPL (Process Systems Enterprise)

---

## Features

| Feature | Description |
|---------|-------------|
| 🎨 **Syntax highlighting** | Distinct colours for every keyword category — block keywords, section headers, built-in functions, PDE operators, time derivatives, numbers, strings and comments |
| 📝 **Code snippets** | 40+ templates for MODEL, PROCESS, TASK, CSTR, PFR, heat exchangers, mass balances, PDEs, schedules and more |
| 💬 **Hover documentation** | Hover over any keyword to see its full signature, description and a working code example |
| 🔍 **Real-time error checking** | Detects missing semicolons, unclosed blocks, misspelled keywords, wrong operators and keywords used in wrong sections |
| 🗂️ **Block folding** | Collapse MODEL, PROCESS, TASK, FOR, WHILE, SEQUENCE, PARALLEL blocks |
| ⌨️ **Comment toggling** | `Ctrl+/` (or `Cmd+/` on Mac) |

---

## How to Use

### 1 — Set your file type

Save your gPROMS code files with the `.gproms` or `.gpl` extension. VSCode will activate the extension automatically.

If you use plain `.txt` files, click the language indicator in the **bottom-right corner** of VSCode and select **gPROMS** from the list.

### 2 — Add the file type hint (important for error checking)

Add one of the following as the **first line** of your file so the error checker knows what kind of block it is reading:

```
# TYPE: MODEL
```
```
# TYPE: PROCESS
```
```
# TYPE: TASK
```

Without this hint, structural checks (section placement, block context) are skipped to avoid false positives. Safe checks — misspelled keywords and missing semicolons — always run regardless.

> **Quick tip:** Type `typehint` + `Tab` to insert the hint with a dropdown selector, or `header` + `Tab` for a full file header that includes it.

### 3 — Use snippets to write code faster

Type a **prefix** and press `Tab` to expand a full code template. Press `Tab` again to jump between placeholders.

#### Structure snippets
| Prefix | Expands to |
|--------|-----------|
| `header` | File header with `# TYPE:` hint |
| `typehint` | Just the `# TYPE:` hint line |
| `model` | Full `MODEL...END` block |
| `modelsel` | `MODEL` with `SELECTOR` and `CASE` switching |
| `modelpde` | `MODEL` with `DISTRIBUTION_DOMAIN` for PDEs |
| `process` | Full `PROCESS...END` block |
| `processseq` | `PROCESS` with multi-step `SEQUENCE` schedule |
| `task` | `TASK...END` entity |
| `decltype` | `DECLARE TYPE` with bounds and unit |
| `decltypes` | Full set of common engineering type declarations |

#### Model templates
| Prefix | Expands to |
|--------|-----------|
| `modeltank` | Buffer tank with mass balance |
| `modelcstr` | CSTR with component and energy balances |
| `modelbatch` | Batch reactor |
| `modelhe` | Heat exchanger with LMTD |
| `modelpfr` | Plug flow reactor (1D PDE with axial dispersion) |

#### Declarations
| Prefix | Expands to |
|--------|-----------|
| `preal` | `PARAMETER AS REAL` |
| `pint` | `PARAMETER AS INTEGER` |
| `parrreal` | `PARAMETER AS ARRAY OF REAL` |
| `pfo` | `PARAMETER AS FOREIGN_OBJECT` |
| `var` | Single `VARIABLE` declaration |
| `vararr` | `VARIABLE AS ARRAY OF` |
| `vardist` | `VARIABLE AS DISTRIBUTION OF` (PDEs) |
| `unit` | `UNIT` instance |
| `unitarr` | `UNIT` array instance |
| `stream` | `STREAM` declaration |
| `streamis` | `STREAM IS` alias |

#### Equations
| Prefix | Expands to |
|--------|-----------|
| `ode` | Time derivative `$Variable = ...` |
| `alg` | Algebraic equation |
| `massbal` | Mass balance ODE |
| `compbal` | Component mass balance with `FOR` loop |
| `energybal` | Energy balance ODE |
| `arrhenius` | Arrhenius rate expression |
| `antoine` | Antoine equation for vapour pressure |
| `raoult` | Raoult's Law VLE loop |
| `sumvle` | Mole fraction summation constraints |
| `partial` | `PARTIAL(Expression, Domain)` — 1st order |
| `partial2` | `PARTIAL(Expression, Domain, Domain)` — 2nd order |
| `integral` | `INTEGRAL(z := 0:L ; Expression)` |
| `sigma` | `SIGMA(ArrayExpression)` |
| `product` | `PRODUCT(ArrayExpression)` |

#### Control flow
| Prefix | Expands to |
|--------|-----------|
| `for` | `FOR i := 1 TO N DO ... END` |
| `forstep` | `FOR` loop with `STEP` |
| `if` | `IF-THEN-ELSE-END` |
| `while` | `WHILE ... END` |
| `case` | `CASE-WHEN` with `SWITCH TO IF` |
| `connect` | Stream connection equation |
| `within` | `WITHIN unit DO ... END` |

#### Schedule and process control
| Prefix | Expands to |
|--------|-----------|
| `solparam` | `SOLUTIONPARAMETERS` block |
| `schedcont` | `CONTINUE FOR` |
| `scheduntil` | `CONTINUE FOR ... OR UNTIL` |
| `schedseq` | `SCHEDULE` with `SEQUENCE` |
| `schedpar` | `SCHEDULE` with `PARALLEL` |
| `reset` | `RESET...END` task |
| `resetold` | `RESET` using `OLD()` for a step change |
| `switchtask` | `SWITCH unit.Var TO State` |
| `message` | `MESSAGE "text"` |
| `stop` | `STOP` |
| `initss` | `INITIAL STEADY_STATE` |
| `initial` | `INITIAL` with explicit values |

### 4 — Hover over keywords for documentation

Hover your mouse over any gPROMS keyword — `MODEL`, `EQUATION`, `SIGMA`, `PARTIAL`, `CONTINUE`, `RESET`, and 45 more — to see a tooltip with:

- The full **syntax signature**
- A plain-English **description**
- A working **code example**

### 5 — Read the error messages

The error checker runs every time you type or save. Errors appear as:

- 🔴 **Red underline** — hard errors: unclosed block, misspelled keyword, missing semicolon, keyword in wrong section
- 🟡 **Yellow underline** — warnings: using `=` instead of `:=` in `SET` or `ASSIGN` sections

All errors also appear in the **Problems panel** (`Ctrl+Shift+M`) with the exact line number and a clear message.

---

## Colour Guide

| Colour | Category | Examples |
|--------|----------|---------|
| 🩵 Cyan bold | Top-level blocks | `MODEL` `PROCESS` `TASK` `END` |
| 🔵 Blue bold | Section headers | `PARAMETER` `VARIABLE` `EQUATION` `SCHEDULE` |
| 🟣 Purple bold | Type declarations | `DECLARE` `TYPE` |
| 🔷 Sky blue | Type modifiers | `AS` `OF` `REAL` `INTEGER` `DEFAULT` `FREE` |
| 🟡 Yellow bold | Control flow | `IF` `FOR` `WHILE` `CASE` `WHEN` |
| 🟠 Orange | Schedule tasks | `SEQUENCE` `PARALLEL` `RESET` `WITHIN` |
| 🟢 Green bold | Math functions | `EXP` `LOG` `SQRT` `SIGMA` `PARTIAL` |
| 🩶 Teal | PDE operators | `PDFSS` `PDCOL` `BFDIFF` |
| 🌸 Pink | Logical constants | `AND` `OR` `NOT` `TRUE` `FALSE` |
| 🔴 Red bold | Time derivative & assignment | `$Variable` `:=` |
| 🍑 Peach | Numbers | `1.0` `1e-6` `298.15` |
| 🟢 Soft green | Strings | `"kg/s"` `"description"` |
| ⚫ Grey italic | Comments | `# line comment` `{ block comment }` |

---

## Language Quick Reference

- **Line comment:** `# this is a comment`
- **Block comment:** `{ this spans multiple lines }`
- **Time derivative:** `$Variable` means `d(Variable)/dt`
- **Assignment:** use `:=` in `SET`, `ASSIGN`, `INITIAL` and `RESET` blocks
- **Equation terminator:** every equation in `EQUATION` and `BOUNDARY` sections must end with `;`
- **Boundary notation:** `T(0|+:L|-)` — `|+` opens the left boundary, `|-` opens the right
- **Block closers:** all blocks (`MODEL`, `FOR`, `IF`, `WHILE`, `SEQUENCE`, etc.) close with bare `END`

---

## License

MIT — © SinaGhanbarii
