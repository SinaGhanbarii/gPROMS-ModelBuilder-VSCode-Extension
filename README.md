# gPROMS ModelBuilder — VSCode Extension

> Write and edit gPROMS ModelBuilder code in VSCode with full syntax highlighting, 40+ snippets, keyword hover documentation and a real-time error checker — built directly from the official gPROMS user guides.

<p align="center">
  <img src="https://img.shields.io/badge/version-0.7.2--beta-orange" alt="Version"/>
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License"/>
  <img src="https://img.shields.io/badge/VSCode-%5E1.75.0-blue" alt="VSCode"/>
  <img src="https://img.shields.io/badge/language-gPROMS%20GPL-teal" alt="Language"/>
</p>

---

## Contents

- [Features](#features)
- [Installation](#installation)
- [How to Use](#how-to-use)
- [Snippets Reference](#snippets-reference)
- [Colour Guide](#colour-guide)
- [Language Quick Reference](#language-quick-reference)
- [Changelog](#changelog)
- [License](#license)

---

## Features

| Feature | What it does |
|---------|-------------|
| **Syntax highlighting** | Distinct colours for every keyword category — block keywords, section headers, built-in functions, PDE operators, time derivatives `$`, numbers, strings and comments |
| **Code snippets** | 40+ ready-to-use templates for MODEL, PROCESS, TASK, CSTR, PFR, heat exchangers, PDEs, schedules and more — just type a prefix and press `Tab` |
| **Hover documentation** | Hover over any keyword to instantly see its syntax signature, description and a working code example |
| **Real-time error checking** | Flags missing semicolons, unclosed blocks, misspelled keywords, wrong assignment operators and keywords used in wrong sections — as you type |
| **Block folding** | Collapse and expand `MODEL`, `PROCESS`, `TASK`, `FOR`, `WHILE`, `SEQUENCE`, `PARALLEL` blocks |
| **Comment toggling** | `Ctrl+/` (Windows/Linux) or `Cmd+/` (Mac) to comment or uncomment lines |

---

## Installation

### Requirements

- [Visual Studio Code](https://code.visualstudio.com/) version 1.75 or later
- No other dependencies — everything is bundled inside the `.vsix` file

### Step 1 — Download the `.vsix` file

Go to the [**Releases**](https://github.com/SinaGhanbarii/gproms-modelbuilder/releases) page of this repository and download the latest `.vsix` file (e.g. `gproms-modelbuilder-0.7.2.vsix`).

### Step 2 — Install in VSCode

There are two ways to install it:

**Option A — From the Extensions panel (recommended)**

1. Open VSCode
2. Press `Ctrl+Shift+X` to open the Extensions panel
3. Click the **`···`** menu in the top-right corner of the panel
4. Select **"Install from VSIX..."**
5. Navigate to the downloaded `.vsix` file and open it
6. VSCode will install the extension and show a confirmation notification

**Option B — From the terminal**

```bash
code --install-extension gproms-modelbuilder-0.7.2.vsix
```

### Step 3 — Verify the installation

1. Press `Ctrl+Shift+X` to open the Extensions panel
2. Search for **gPROMS** — you should see it listed under **Installed**

### Step 4 — Reload VSCode

If the extension does not activate immediately, reload the window:

```
Ctrl+Shift+P  →  Developer: Reload Window
```

### Updating to a newer version

When a new version is released, first uninstall the old one:

1. `Ctrl+Shift+X` → find **gPROMS ModelBuilder** → click the gear icon → **Uninstall**
2. Then repeat Steps 1–3 above with the new `.vsix` file

---

## How to Use

### 1 — Open or create a gPROMS file

Save your file with the `.gproms` or `.gpl` extension — VSCode will activate the extension and syntax highlighting automatically.

> **Using plain `.txt` files?** Click the language name in the **bottom-right status bar** of VSCode (it will say "Plain Text") and type **gPROMS** to select it manually.

---

### 2 — Add the file type hint

Add **one of these lines** at the very top of your file:

```
# TYPE: MODEL
```
```
# TYPE: PROCESS
```
```
# TYPE: TASK
```

This tells the error checker what kind of gPROMS block your file contains, enabling full structural validation. Without it, only safe checks run (misspelled keywords and missing semicolons) to avoid false positives.

> **Fastest way:** type `typehint` + `Tab` and pick MODEL, PROCESS or TASK from the dropdown. Or type `header` + `Tab` for a full file header that includes the hint plus author and date fields.

A complete file should start like this:

```gproms
# TYPE: MODEL
{
    Model   : BufferTank
    Author  : Sina Ghanbari
    Date    : 2024-01-01
}

DECLARE TYPE Mass
  = 1.0 : 0.0 : 1E5   UNIT = "kg"
END

MODEL BufferTank

  PARAMETER
    Rho  AS  REAL  DEFAULT  1000.0

  VARIABLE
    HoldUp   AS  Mass
    FlowIn   AS  MassFlowrate
    FlowOut  AS  MassFlowrate

  EQUATION
    $HoldUp  =  FlowIn - FlowOut ;

END  # BufferTank
```

---

### 3 — Write code faster with snippets

Type a **prefix** and press `Tab` to expand a full code block. Press `Tab` again to jump to the next editable placeholder.

For example, typing `model` + `Tab` immediately gives you:

```gproms
MODEL ModelName

  PARAMETER
    ParamName  AS  REAL  DEFAULT  1.0

  VARIABLE
    VarName  AS  VariableType

  EQUATION
    # equations here

END  # ModelName
```

Every placeholder is pre-selected so you can tab through and fill in your names without touching the mouse. See the full [Snippets Reference](#snippets-reference) table below.

---

### 4 — Hover over keywords for instant documentation

Hover your mouse over **any** gPROMS keyword to see a documentation card appear:

```
MODEL
─────────────────────────────────────
MODEL <n> ... END

Defines a mathematical model. Contains PARAMETER,
VARIABLE, EQUATION, SELECTOR, UNIT, STREAM,
DISTRIBUTION_DOMAIN, and BOUNDARY sections.

Example:
  MODEL BufferTank
    PARAMETER
      Rho AS REAL DEFAULT 1000.0
    ...
  END
```

Hover documentation is available for 50+ keywords including `MODEL`, `PROCESS`, `EQUATION`, `FOR`, `IF`, `CASE`, `SELECTOR`, `PARTIAL`, `INTEGRAL`, `SIGMA`, `EXP`, `SQRT`, `RESET`, `CONTINUE`, `SEQUENCE`, `PARALLEL`, `DECLARE`, `FOREIGN_OBJECT` and more.

---

### 5 — Understand the error messages

The error checker runs automatically every time you type or save. Problems appear in two ways:

**Inline underlines in the editor:**
- 🔴 **Red underline** — error that must be fixed (e.g. unclosed `MODEL` block, missing `;`, misspelled keyword)
- 🟡 **Yellow underline** — warning (e.g. using `=` instead of `:=` in a `SET` section)

**Problems panel** (`Ctrl+Shift+M`):
Shows all errors and warnings with their exact line number and a clear message. Click any entry to jump straight to that line.

**Common errors and how to fix them:**

| Error message | Cause | Fix |
|--------------|-------|-----|
| `"MODEL" block is never closed` | Missing `END` at the end of the block | Add `END  # ModelName` |
| `Equation is missing a terminating semicolon` | No `;` at the end of an equation | Add `;` to the end of the equation line |
| `Unknown keyword "VARIALBE". Did you mean "VARIABLE"?` | Typo in keyword | Correct the spelling |
| `Use ":=" for assignment in SET, not "="` | Wrong assignment operator | Replace `=` with `:=` |
| `"EQUATION" is a MODEL section and cannot appear inside a PROCESS block` | Section in wrong block | Move the section to the correct block type |

> **Note:** If you see errors on correct code, make sure you have added the `# TYPE:` hint at the top of your file (see Step 2).

---

## Snippets Reference

### Structure
| Prefix | Expands to |
|--------|-----------|
| `header` | File header with `# TYPE:` hint, author and date |
| `typehint` | `# TYPE:` hint line only |
| `model` | Full `MODEL...END` block |
| `modelsel` | `MODEL` with `SELECTOR` and `CASE` switching |
| `modelpde` | `MODEL` with `DISTRIBUTION_DOMAIN` for PDEs |
| `process` | Full `PROCESS...END` block |
| `processseq` | `PROCESS` with multi-step `SEQUENCE` schedule |
| `task` | `TASK...END` entity |
| `decltype` | `DECLARE TYPE` with default, bounds and unit |
| `decltypes` | Full set of common engineering type declarations |

### Model templates
| Prefix | Expands to |
|--------|-----------|
| `modeltank` | Buffer tank / surge vessel |
| `modelcstr` | CSTR with component and energy balances |
| `modelbatch` | Batch reactor |
| `modelhe` | Heat exchanger with LMTD |
| `modelpfr` | Plug flow reactor — 1D PDE with axial dispersion |

### Declarations
| Prefix | Expands to |
|--------|-----------|
| `preal` | `PARAMETER AS REAL` |
| `pint` | `PARAMETER AS INTEGER` |
| `parrreal` | `PARAMETER AS ARRAY OF REAL` |
| `pfo` | `PARAMETER AS FOREIGN_OBJECT` |
| `var` | Single `VARIABLE` declaration |
| `vararr` | `VARIABLE AS ARRAY OF` |
| `vardist` | `VARIABLE AS DISTRIBUTION OF` (for PDEs) |
| `unit` | `UNIT` instance declaration |
| `unitarr` | `UNIT` array declaration |
| `stream` | `STREAM` declaration |
| `streamis` | `STREAM IS` alias |

### Equations
| Prefix | Expands to |
|--------|-----------|
| `ode` | Time derivative `$Variable = expression ;` |
| `alg` | Algebraic equation |
| `massbal` | Simple mass balance ODE |
| `compbal` | Component mass balance with `FOR` loop |
| `energybal` | Energy balance ODE |
| `arrhenius` | Arrhenius rate constant expression |
| `antoine` | Antoine equation for vapour pressure |
| `raoult` | Raoult's Law VLE loop |
| `sumvle` | Mole fraction summation constraints |
| `partial` | `PARTIAL(Expression, Domain)` — 1st order |
| `partial2` | `PARTIAL(Expression, Domain, Domain)` — 2nd order |
| `integral` | `INTEGRAL(z := 0:L ; Expression)` |
| `sigma` | `SIGMA(ArrayExpression)` |
| `product` | `PRODUCT(ArrayExpression)` |

### Control flow
| Prefix | Expands to |
|--------|-----------|
| `for` | `FOR i := 1 TO N DO ... END` |
| `forstep` | `FOR` loop with `STEP` increment |
| `if` | `IF-THEN-ELSE-END` |
| `while` | `WHILE ... END` |
| `case` | `CASE-WHEN` block with `SWITCH TO IF` |
| `connect` | Stream connection equation |
| `within` | `WITHIN unit DO ... END` |

### Schedule and process control
| Prefix | Expands to |
|--------|-----------|
| `solparam` | `SOLUTIONPARAMETERS` block |
| `schedcont` | `CONTINUE FOR` |
| `scheduntil` | `CONTINUE FOR ... OR UNTIL` |
| `schedseq` | `SCHEDULE` with `SEQUENCE` |
| `schedpar` | `SCHEDULE` with `PARALLEL` branches |
| `reset` | `RESET...END` task |
| `resetold` | `RESET` using `OLD()` for a step change |
| `switchtask` | `SWITCH unit.Var TO State` |
| `message` | `MESSAGE "text"` |
| `stop` | `STOP` |
| `initss` | `INITIAL STEADY_STATE` |
| `initial` | `INITIAL` with explicit values |

---

## Colour Guide

The extension applies its own colours automatically on top of your active VSCode theme.

| Colour | Keyword category | Examples |
|--------|-----------------|---------|
| Cyan bold | Top-level blocks | `MODEL` `PROCESS` `TASK` `END` |
| Blue bold | Section headers | `PARAMETER` `VARIABLE` `EQUATION` `SCHEDULE` |
| Purple bold | Type declarations | `DECLARE` `TYPE` |
| Sky blue | Type modifiers | `AS` `OF` `REAL` `INTEGER` `DEFAULT` `FREE` `FIXED` |
| Yellow bold | Control flow | `IF` `FOR` `WHILE` `CASE` `WHEN` `SWITCH` |
| Orange | Schedule tasks | `SEQUENCE` `PARALLEL` `RESET` `WITHIN` `CONTINUE` |
| Green bold | Math functions | `EXP` `LOG` `SQRT` `SIGMA` `PARTIAL` `INTEGRAL` |
| Teal | PDE discretisation | `PDFSS` `PDCOL` `BFDIFF` `CFDIFF` |
| Pink | Logical constants | `AND` `OR` `NOT` `TRUE` `FALSE` |
| Red bold | Time derivative & assignment | `$Variable` `:=` |
| Peach | Numbers | `1.0` `1e-6` `298.15` |
| Soft green | Strings | `"kg/s"` `"temperature"` |
| Grey italic | Comments | `# line comment`   `{ block comment }` |

---

## Language Quick Reference

| Syntax | Meaning |
|--------|---------|
| `# comment` | Line comment |
| `{ comment }` | Block comment (can span multiple lines) |
| `$Variable` | Time derivative — `d(Variable)/dt` |
| `:=` | Assignment operator (used in `SET`, `ASSIGN`, `INITIAL`, `RESET`) |
| `;` | Equation terminator — required at the end of every equation |
| `T(0\|+:L\|-)` | Distributed variable on open domain `(0, L)` — `\|+` excludes left, `\|-` excludes right |
| `END` | Closes all block types — `MODEL`, `PROCESS`, `FOR`, `IF`, `WHILE`, `CASE`, `SEQUENCE`, etc. |

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full version history.

---

## License

MIT — © SinaGhanbarii
