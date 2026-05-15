'use strict';

const {
  createConnection, TextDocuments, ProposedFeatures,
  TextDocumentSyncKind, MarkupKind, DiagnosticSeverity,
  CompletionItemKind
} = require('vscode-languageserver/node');
const { TextDocument } = require('vscode-languageserver-textdocument');

const connection = createConnection(ProposedFeatures.all);
const documents  = new TextDocuments(TextDocument);

// ═══════════════════════════════════════════════════════════════════════════════
// KNOWLEDGE BASE
// ═══════════════════════════════════════════════════════════════════════════════

// Block openers and their required closers
const BLOCK_OPEN_CLOSE = {
  MODEL:    'END',
  PROCESS:  'END',
  TASK:     'END',
  SEQUENCE: 'END',
  PARALLEL: 'END',
  RESET:    'END',
  WITHIN:   'END',
  CASE:        'END',
  FOR:         'END',
  WHILE:       'END',
  IF:          'END',
  OPTIMISATION:  'END',
  ESTIMATION:    'END',
  USE:           'END',
};

// Valid section headers and which top-level block they belong to
const VALID_IN_MODEL = new Set([
  'PARAMETER','VARIABLE','EQUATION','SELECTOR','UNIT','STREAM',
  'BOUNDARY','DISTRIBUTION_DOMAIN'
]);
const VALID_IN_PROCESS = new Set([
  'UNIT','SET','ASSIGN','INITIAL','SELECTOR','SOLUTIONPARAMETERS',
  'SCHEDULE','CONNECTIONS','REPORT','TOPOLOGY','EQUATION',
  'INITIALISATION_PROCEDURE','PRESET'
]);
const VALID_IN_TASK = new Set([
  'VARIABLE','SCHEDULE'
]);
const VALID_IN_OPTIMISATION = new Set([
  'USING','OBJECTIVE','FREE','FIXED','CONSTRAINTS',
  'SOLUTIONPARAMETERS','ESTIMATE','SENSITIVITY',
  'MEASUREMENTS','VARIABLE_TYPES'
]);
const VALID_IN_INITIALISATION = new Set([
  'USE','SAVE','RESTORE','PRESET','WITHIN','FOR'
]);

// Keywords that are only valid inside a SCHEDULE context
const SCHEDULE_ONLY_KEYWORDS = new Set([
  'CONTINUE','SEQUENCE','PARALLEL','RESET','WITHIN',
  'STOP','MESSAGE','SAVE','RESTORE','RESETRESULTS',
  'PAUSE','MONITOR','MAXIMISE','MINIMISE'
]);

// Keywords that are only valid inside an EQUATION or BOUNDARY section
const EQUATION_ONLY_KEYWORDS = new Set([
  'PARTIAL','INTEGRAL','SIGMA','PRODUCT'
]);

// All built-in functions — never flag these as unknown
const BUILTIN_FUNCTIONS = new Set([
  'ABS','ACOS','ASIN','ATAN','ATAN2','COS','COSH','EXP','INT',
  'LOG','LOG10','SGN','SIN','SINH','SQRT','TAN','TANH',
  'SIGMA','PRODUCT','MIN','MAX','INTEGRAL','PARTIAL',
  'OLD','SMOOTH','HEAVISIDE','INTERPOL','TABLEINT',
  'NINT','ROUND','FLOOR','CEIL','SIGN','ERF','ERFC',
  'PDFSS','PDCOL','BFDIFF','CFDIFF','DPDSS','UDS1','UDS2'
]);

// Discretisation method specifiers — appear in SET sections as [CFDM, 2, 9]
// Must never be flagged as unknown keywords or misspellings
const DISCRETISATION_METHODS = new Set([
  'CFDM',    // Central Finite Difference Method
  'BFDM',    // Backward Finite Difference Method
  'FFDM',    // Forward Finite Difference Method
  'MIXED',   // Mixed finite difference
  'UDS',     // Upwind Differencing Scheme
  'QDS',     // Quadratic Differencing Scheme
  'PDCOL',   // Orthogonal Collocation on Finite Elements
  'PDCOL2',  // Extended PDCOL
  'PDFSS',   // Centred Finite Difference Steady State
  'BFDIFF',  // Backward Finite Difference
  'CFDIFF',  // Centred Finite Difference
  'DPDSS',   // Discretisation
  'UDS1',    // First-order Upwind
  'UDS2',    // Second-order Upwind
  'NONE'     // No discretisation
]);

// Every valid gPROMS keyword — used to detect misspellings
const ALL_KEYWORDS = new Set([
  'MODEL','PROCESS','TASK','OPTIMISATION','ESTIMATION',
  'INITIALISATION_PROCEDURE','INITIALISATION','USE','DEFAULT','END',
  'VARIABLE_TYPE','PORT','INTERFACE','TOPOLOGY','EXTERNAL',
  'USING','OBJECTIVE','CONSTRAINTS','MEASUREMENTS','VARIABLE_TYPES',
  'AT','EVERY','INTERVAL','AFTER','SEND','GET','SENDMATHINFO',
  'REINITIALISE','CHECKPOINT','REWIND','ABORT','WARNING','INFO',
  'NOINT','REPORT_AFTER','GRADIENT','WITHIN_BOUNDS',
  'DECLARE','TYPE','STREAM_TYPE',
  'PARAMETER','VARIABLE','EQUATION','SELECTOR','UNIT','STREAM',
  'BOUNDARY','DISTRIBUTION_DOMAIN','SCHEDULE','INITIAL','ASSIGN',
  'SET','PRESET','CONNECTIONS','SOLUTIONPARAMETERS','REPORT','TOPOLOGY',
  'AS','OF','ARRAY','DISTRIBUTION','FOREIGN_OBJECT',
  'REAL','INTEGER','LOGICAL','DEFAULT','LOWER','UPPER',
  'DESCRIPTION','FREE','FIXED','GIVEN','OPEN','CLOSED','NOFLOW',
  'STEADY_STATE','DYNAMIC','IS',
  'FOR','TO','BY','STEP','DO',
  'WHILE','IF','THEN','ELSE','ELSEIF',
  'CASE','WHEN','OTHERWISE','SWITCH',
  'SEQUENCE','PARALLEL','CONTINUE','UNTIL','AND','OR',
  'RESET','STOP','MESSAGE','SAVE','RESTORE','RESETRESULTS',
  'PAUSE','SIGNALID','STATUS','WITHIN','MONITOR',
  'MAXIMISE','MINIMISE','ESTIMATE','SENSITIVITY',
  'REPORTINGINTERVAL','SIMULTANEOUS','PRINT',
  'TITLES','HEADERS','FOOTER','COLUMN','NOHEADER',
  'NOT','TRUE','FALSE','MOD','DIV','OLD',
  ...BUILTIN_FUNCTIONS,
  ...DISCRETISATION_METHODS
]);

// Misspelling candidates: map common mistakes to correct spelling
// (We detect misspellings by edit-distance, but keep a curated list too)
const KNOWN_MISSPELLINGS = {
  'VARIALBE':   'VARIABLE',  'VARIABL':    'VARIABLE',
  'EQUAION':    'EQUATION',  'EQUATIN':    'EQUATION',
  'PARAMETR':   'PARAMETER', 'PARAMTER':   'PARAMETER',
  'PROCESSS':   'PROCESS',   'PROCE':      'PROCESS',
  'SCHEDUAL':   'SCHEDULE',  'SCHEDUL':    'SCHEDULE',
  'INTIAL':     'INITIAL',   'INITAL':     'INITIAL',
  'CONTINEU':   'CONTINUE',  'CONTNUE':    'CONTINUE',
  'SEQEUNCE':   'SEQUENCE',  'SEQUNCE':    'SEQUENCE',
  'PARALEL':    'PARALLEL',  'PARRALLEL':  'PARALLEL',
  'BOUNDRY':    'BOUNDARY',  'BOUDNARY':   'BOUNDARY',
  'SELECTRO':   'SELECTOR',  'SELECOTR':   'SELECTOR',
  'DECLRE':     'DECLARE',   'DECALRE':    'DECLARE',
};

// ═══════════════════════════════════════════════════════════════════════════════
// PASS 1 — TOKENISER
// Produces a flat array of tokens from the entire file, stripping comments.
// Each token: { text, upper, line, col, len }
// ═══════════════════════════════════════════════════════════════════════════════

function tokenise(source) {
  const tokens = [];
  const lines  = source.split(/\r?\n/);
  let inBlock  = false;   // inside { ... } block comment

  for (let li = 0; li < lines.length; li++) {
    let raw = lines[li];

    // Handle { } block comments (can span lines)
    if (inBlock) {
      const close = raw.indexOf('}');
      if (close >= 0) { inBlock = false; raw = raw.slice(close + 1); }
      else continue;
    }

    // Strip { ... } on a single line
    raw = raw.replace(/\{[^}]*\}/g, ' ');
    // Open block comment that continues
    const openBrace = raw.indexOf('{');
    if (openBrace >= 0) { inBlock = true; raw = raw.slice(0, openBrace); }

    // Strip # line comment
    const hashIdx = raw.indexOf('#');
    const code = hashIdx >= 0 ? raw.slice(0, hashIdx) : raw;

    // Tokenise: identifiers (including dotted unit.var paths), := , ; , =
    // Dotted names like Solar_heater.mwi are captured as one token.
    // Note: | in boundary notation (0|+:L|-) is intentionally not captured
    // as a token — it appears inside parentheses and doesn't affect checking.
    const re = /(\$[A-Za-z_][A-Za-z0-9_.()]*|[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*|:=|->|<>|<=|>=|[;=<>])/g;
    let m;
    while ((m = re.exec(code)) !== null) {
      const text = m[1];
      tokens.push({
        text,
        upper: text.toUpperCase(),
        line:  li,
        col:   m.index,
        len:   text.length
      });
    }
  }
  return tokens;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASS 1b — SYMBOL TABLE
// Collect all user-defined names: MODEL names, DECLARE TYPE names,
// variable/parameter names. These must never be flagged as unknown keywords.
// ═══════════════════════════════════════════════════════════════════════════════

function buildSymbolTable(tokens) {
  const symbols = new Set();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    // MODEL <Name>, PROCESS <Name>, TASK <Name>, OPTIMISATION <Name>, ESTIMATION <Name>
    if (['MODEL','PROCESS','TASK','OPTIMISATION','ESTIMATION'].includes(t.upper)) {
      const next = tokens[i+1];
      if (next && /^[A-Za-z_]/.test(next.text)) symbols.add(next.upper);
    }

    // DECLARE TYPE <Name>
    if (t.upper === 'DECLARE' && tokens[i+1]?.upper === 'TYPE') {
      const name = tokens[i+2];
      if (name) symbols.add(name.upper);
    }

    // <Name> AS <Type> — variable, parameter, unit instance, stream declarations
    if (t.upper === 'AS') {
      const prev = tokens[i-1];
      if (prev && /^[A-Za-z_]/.test(prev.text)) symbols.add(prev.upper);
      const next = tokens[i+1];
      if (next && /^[A-Za-z_]/.test(next.text)) symbols.add(next.upper);
    }

    // WHEN <StateName> (selector state names)
    if (t.upper === 'WHEN') {
      const next = tokens[i+1];
      if (next && /^[A-Za-z_]/.test(next.text)) symbols.add(next.upper);
    }

    // SELECTOR: <n> AS (<State1>, <State2>) — collect state names
    if (t.upper === 'SELECTOR') {
      for (let j = i+1; j < Math.min(i+20, tokens.length); j++) {
        if (tokens[j].text === ')') break;
        if (/^[A-Za-z_]/.test(tokens[j].text) &&
            !ALL_KEYWORDS.has(tokens[j].upper)) {
          symbols.add(tokens[j].upper);
        }
      }
    }

    // Unit.variable dotted paths in SET/ASSIGN/INITIAL/EQUATION:
    // The base name before a dot is always a unit instance — add it to symbols.
    // This prevents unit instance names from being flagged as unknown keywords.
    // We detect these by looking for tokens followed by another token on the
    // same line where the pair forms a dotted path (tokeniser gives them separately).
    // Heuristic: any identifier at line start that is followed by a dot-like
    // pattern is a unit instance reference.
    const next = tokens[i+1];
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(t.text) &&
        next && next.line === t.line &&
        // next token starts immediately after (dotted path: "Unit.var")
        // We can't see the dot since tokeniser skips it, but if two identifiers
        // appear consecutively on the same line separated by nothing meaningful,
        // they are likely a dotted path
        !ALL_KEYWORDS.has(t.upper)) {
      symbols.add(t.upper);
    }
  }
  return symbols;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASS 2 — CHECKER
// Walks the token stream with a block stack and section context.
// Never uses line text directly — only the token stream.
// ═══════════════════════════════════════════════════════════════════════════════

function check(tokens, symbols, fileType) {
  const diagnostics = [];
  // block stack entries: { keyword, line, col }
  const stack = [];

  // When fileType is known (from # TYPE: hint), pre-seed the stack with a
  // virtual top-level block so sections like PARAMETER are immediately valid
  // without needing an explicit MODEL / PROCESS opener in the file.
  if (fileType) {
    stack.push({ keyword: fileType, line: -1, col: 0, virtual: true });
  }

  // Context helpers
  const topBlock  = () => stack.length ? stack[stack.length-1].keyword : null;
  const inStack   = (kw) => stack.some(s => s.keyword === kw);
  const stackList = () => stack.map(s => s.keyword).join(' > ');

  // Line-level state (rebuilt per token line)
  let currentSection = null;   // EQUATION, PARAMETER, SET, ASSIGN, etc.
  let prevSection    = null;
  let lastSectionLine = -1;

  // Track which lines have semicolons (for equation checking)
  // We'll build this as a Set of line numbers
  const linesWithSemi = new Set();
  for (const t of tokens) {
    if (t.text === ';') linesWithSemi.add(t.line);
  }

  // Track assignment lines in SET/ASSIGN/INITIAL that need :=
  // We do this per-line: if we see = but not := on the same line
  const lineHasAssign  = new Map(); // line -> col of :=
  const lineHasBadEq   = new Map(); // line -> col of plain =
  for (const t of tokens) {
    if (t.text === ':=') lineHasAssign.set(t.line, t.col);
    if (t.text === '=')  lineHasBadEq.set(t.line, t.col);
  }

  function err(tok, msg) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: tok.line, character: tok.col },
        end:   { line: tok.line, character: tok.col + tok.len }
      },
      message: msg,
      source: 'gPROMS'
    });
  }

  function warn(tok, msg) {
    diagnostics.push({
      severity: DiagnosticSeverity.Warning,
      range: {
        start: { line: tok.line, character: tok.col },
        end:   { line: tok.line, character: tok.col + tok.len }
      },
      message: msg,
      source: 'gPROMS'
    });
  }

  function warnAt(line, col, len, msg) {
    diagnostics.push({
      severity: DiagnosticSeverity.Warning,
      range: {
        start: { line, character: col },
        end:   { line, character: col + len }
      },
      message: msg,
      source: 'gPROMS'
    });
  }

  // ── Token-by-token walk ────────────────────────────────────────────────────
  let i = 0;
  while (i < tokens.length) {
    const t    = tokens[i];
    const next = tokens[i+1];
    const prev = i > 0 ? tokens[i-1] : null;

    // ── DECLARE TYPE ──────────────────────────────────────────────────────────
    if (t.upper === 'DECLARE') {
      if (!next || next.upper !== 'TYPE' && next.upper !== 'STREAM_TYPE') {
        err(t, 'DECLARE must be followed by TYPE or STREAM_TYPE.');
      }
      // Skip until END
      let found = false;
      for (let j = i+1; j < tokens.length; j++) {
        if (tokens[j].upper === 'END') {
          // Check it's on its own line (simple heuristic)
          found = true;
          i = j + 1;
          break;
        }
        // If we hit another top-level keyword, END is missing
        if (['MODEL','PROCESS','TASK','DECLARE'].includes(tokens[j].upper) && j > i+2) {
          err(t, `DECLARE TYPE block opened here was never closed with END.`);
          i = j;
          break;
        }
      }
      if (!found && i === tokens.length) {
        err(t, `DECLARE TYPE block opened here was never closed with END.`);
      }
      continue;
    }

    // ── Block OPENERS ─────────────────────────────────────────────────────────
    if (Object.prototype.hasOwnProperty.call(BLOCK_OPEN_CLOSE, t.upper)) {

      // Top-level MODEL/PROCESS/TASK must not be nested inside each other
      if (['MODEL','PROCESS','TASK','OPTIMISATION','ESTIMATION',
           'INITIALISATION_PROCEDURE'].includes(t.upper)) {
        const outer = stack.find(s => ['MODEL','PROCESS','TASK','OPTIMISATION','ESTIMATION'].includes(s.keyword));
        if (outer) {
          err(t, `"${t.upper}" cannot be nested inside "${outer.keyword}". Close the outer block first.`);
        }
        currentSection = null;
      }

      // FOR must have DO
      if (t.upper === 'FOR') {
        let hasDo = false;
        for (let j = i+1; j < Math.min(i+15, tokens.length); j++) {
          if (tokens[j].upper === 'DO') { hasDo = true; break; }
          if (tokens[j].line > t.line + 1) break;
        }
        if (!hasDo) err(t, 'FOR loop is missing DO keyword.');
      }

      // WHILE must have DO
      if (t.upper === 'WHILE') {
        let hasDo = false;
        for (let j = i+1; j < Math.min(i+15, tokens.length); j++) {
          if (tokens[j].upper === 'DO') { hasDo = true; break; }
          if (tokens[j].line > t.line + 1) break;
        }
        if (!hasDo) err(t, 'WHILE loop is missing DO keyword.');
      }

      // IF must have THEN
      if (t.upper === 'IF') {
        let hasThen = false;
        for (let j = i+1; j < Math.min(i+20, tokens.length); j++) {
          if (tokens[j].upper === 'THEN') { hasThen = true; break; }
          if (tokens[j].line > t.line + 2) break;
        }
        if (!hasThen) err(t, 'IF statement is missing THEN keyword.');
      }

      // SCHEDULE-only keywords used outside SCHEDULE context
      if (SCHEDULE_ONLY_KEYWORDS.has(t.upper)) {
        const inSched  = inStack('SEQUENCE') || inStack('PARALLEL') ||
                         inStack('RESET')    || inStack('WITHIN')   ||
                         currentSection === 'SCHEDULE';
        const inOptim  = inStack('OPTIMISATION') || inStack('ESTIMATION');
        const inInitPr = currentSection === 'INITIALISATION_PROCEDURE'
                      || currentSection === 'PRESET'
                      || currentSection === 'REPORT';
        if (!inSched && !inOptim && !inInitPr) {
          err(t, `"${t.upper}" is a SCHEDULE keyword and cannot appear here. It must be inside a SCHEDULE block.`);
          i++; continue;
        }
      }

      stack.push({ keyword: t.upper, line: t.line, col: t.col });
      i++; continue;
    }

    // ── Block CLOSERS ─────────────────────────────────────────────────────────
    if (t.upper === 'END') {
      if (stack.length === 0) {
        err(t, `Unexpected "${t.upper}" — no open block to close.`);
        i++; continue;
      }

      const top = stack[stack.length - 1];
      const expected = BLOCK_OPEN_CLOSE[top.keyword];

      if (expected !== t.upper) {
        // Special case: bare END is used for MODEL/PROCESS/TASK/SEQUENCE/PARALLEL/RESET/WITHIN/CASE
        // In gPROMS all blocks close with bare END
        // All gPROMS blocks close with bare END — just pop with best-effort recovery
        stack.pop();
      } else {
        // Update section context when closing a top-level block
        if (['MODEL','PROCESS','TASK'].includes(top.keyword)) {
          currentSection = null;
        }
        stack.pop();
      }
      i++; continue;
    }

    // ── Section headers ───────────────────────────────────────────────────────
    if (VALID_IN_MODEL.has(t.upper) || VALID_IN_PROCESS.has(t.upper) ||
        VALID_IN_TASK.has(t.upper)) {

      const outer = topBlock();

      // Section used outside any block
      if (!outer || !['MODEL','PROCESS','TASK'].includes(outer)) {
        // Only flag if not inside a nested block (FOR, WHILE etc. inside EQUATION are fine)
        const outerTopLevel = stack.find(s => ['MODEL','PROCESS','TASK'].includes(s.keyword));
        if (!outerTopLevel) {
          err(t, `"${t.upper}" section must appear inside a MODEL, PROCESS, or TASK block.`);
          i++; continue;
        }
      }

      const outerTL = stack.filter(s =>
        ['MODEL','PROCESS','TASK','OPTIMISATION','ESTIMATION'].includes(s.keyword));
      const tlBlock = outerTL.length ? outerTL[outerTL.length-1].keyword : null;

      // MODEL section used inside PROCESS/OPTIMISATION/ESTIMATION
      if (tlBlock === 'PROCESS' && VALID_IN_MODEL.has(t.upper) && !VALID_IN_PROCESS.has(t.upper)) {
        err(t, `"${t.upper}" is a MODEL section and cannot appear inside a PROCESS block.`);
      }
      // PROCESS section used inside MODEL
      if (tlBlock === 'MODEL' && VALID_IN_PROCESS.has(t.upper) && !VALID_IN_MODEL.has(t.upper)) {
        err(t, `"${t.upper}" is a PROCESS/TASK section and cannot appear inside a MODEL block.`);
      }
      // Skip section validation for OPTIMISATION/ESTIMATION — allow their sections freely
      if (['OPTIMISATION','ESTIMATION'].includes(tlBlock)) {
        currentSection = t.upper; i++; continue;
      }

      prevSection    = currentSection;
      currentSection = t.upper;
      lastSectionLine = t.line;
      i++; continue;
    }

    // ── SWITCH TO <State> — verify state exists in symbols ──────────────────
    if (t.upper === 'SWITCH') {
      // Expect: SWITCH TO <StateName> IF ...
      const toTok  = tokens[i+1];
      const state  = tokens[i+2];
      if (toTok && toTok.upper === 'TO' && state && /^[A-Za-z_]/.test(state.text)) {
        if (!symbols.has(state.upper) && !ALL_KEYWORDS.has(state.upper)) {
          err(state, `"\${state.text}" is not a declared SELECTOR state. Check the SELECTOR section of this MODEL.`);
        }
      }
    }

    // ── Schedule-only keywords outside SCHEDULE ───────────────────────────────
    if (SCHEDULE_ONLY_KEYWORDS.has(t.upper)) {
      const inSched  = inStack('SEQUENCE') || inStack('PARALLEL') ||
                       inStack('RESET')    || inStack('WITHIN')   ||
                       currentSection === 'SCHEDULE';
      const inOptim  = inStack('OPTIMISATION') || inStack('ESTIMATION');
      const inInitPr = currentSection === 'INITIALISATION_PROCEDURE'
                    || currentSection === 'PRESET'
                    || currentSection === 'REPORT';
      if (!inSched && !inOptim && !inInitPr && !['MODEL','PROCESS','TASK'].includes(t.upper)) {
        err(t, `"${t.upper}" is a SCHEDULE keyword and cannot appear in a "${currentSection || 'unknown'}" section.`);
      }
    }

    // ── Misspelled keywords ───────────────────────────────────────────────────
    // Only check ALL_CAPS tokens that are NOT in our symbol table and
    // NOT known keywords and look like they're meant to be a keyword
    // (i.e. appear at the start of a statement, or after specific contexts)
    if (t.text === t.text.toUpperCase() &&          // all caps
        /^[A-Z][A-Z0-9_]{2,}$/.test(t.text) &&     // 3+ chars, caps/digits/underscore
        !t.text.includes('.') &&                    // not a dotted path
        !ALL_KEYWORDS.has(t.upper) &&               // not a known keyword
        !symbols.has(t.upper) &&                    // not a declared name
        !BUILTIN_FUNCTIONS.has(t.upper) &&          // not a function
        !DISCRETISATION_METHODS.has(t.upper)) {     // not a discretisation method

      // Only flag if it appears as the first meaningful token on its line
      // (i.e. it's trying to be a keyword, not a variable reference)
      const isLineStart = !prev || prev.line < t.line;
      if (isLineStart) {
        const suggestion = KNOWN_MISSPELLINGS[t.upper];
        if (suggestion) {
          err(t, `Unknown keyword "${t.text}". Did you mean "${suggestion}"?`);
        } else {
          // Compute simple edit distance to find closest keyword
          const closest = findClosestKeyword(t.upper);
          if (closest) {
            err(t, `Unknown keyword "${t.text}". Did you mean "${closest}"?`);
          }
        }
      }
    }

    // ── = instead of := in SET/ASSIGN/INITIAL/SOLUTIONPARAMETERS ─────────────
    if (t.text === '=' &&
        ['SET','ASSIGN','INITIAL','SOLUTIONPARAMETERS'].includes(currentSection)) {
      // Make sure it's not part of <=, >=, <>
      const prevTok = tokens[i-1];
      const nextTok = tokens[i+1];
      const prevChar = prevTok ? prevTok.text.slice(-1) : '';
      if (prevChar !== '<' && prevChar !== '>' && prevChar !== '!') {
        warn(t, `Use ":=" for assignment in ${currentSection}, not "=".`);
      }
    }

    i++;
  }

  // ── After full scan: unclosed blocks ─────────────────────────────────────
  // ── Duplicate variable/parameter names in same section ──────────────────
  // Scan tokens for repeated identifiers declared with AS in the same section
  {
    let dupSection = null;
    const sectionNames = new Map(); // sectionKey -> Set of declared names

    for (let di = 0; di < tokens.length; di++) {
      const dt = tokens[di];

      // Track section changes
      if (['PARAMETER','VARIABLE'].includes(dt.upper)) {
        dupSection = dt.upper;
        const key = dt.line + ':' + dt.upper;
        if (!sectionNames.has(key)) sectionNames.set(key, new Set());
        continue;
      }
      if (['EQUATION','SELECTOR','UNIT','STREAM','BOUNDARY',
           'DISTRIBUTION_DOMAIN','SET','ASSIGN','INITIAL',
           'SOLUTIONPARAMETERS','SCHEDULE','MODEL','PROCESS','TASK','END'].includes(dt.upper)) {
        dupSection = null; continue;
      }

      // Look for: <name> AS pattern — the name before AS is the declaration
      if (dt.upper === 'AS' && di > 0 && dupSection) {
        const nameTok = tokens[di - 1];
        if (!nameTok || !(/^[A-Za-z_]/.test(nameTok.text))) continue;
        if (ALL_KEYWORDS.has(nameTok.upper)) continue;

        // Find the section key for the current section opening
        // (use the most recent PARAMETER or VARIABLE line as key)
        let secLine = -1;
        for (let si = di - 1; si >= 0; si--) {
          if (['PARAMETER','VARIABLE'].includes(tokens[si].upper)) {
            secLine = tokens[si].line; break;
          }
        }
        const key = secLine + ':' + dupSection;
        if (!sectionNames.has(key)) sectionNames.set(key, new Set());
        const names = sectionNames.get(key);

        if (names.has(nameTok.upper)) {
          warn(nameTok, `"\${nameTok.text}" is declared more than once in the same \${dupSection} section.`);
        } else {
          names.add(nameTok.upper);
        }
      }
    }
  }

  // Skip virtual pre-seeded block (no real opener to report)
  for (const unclosed of stack.filter(s => !s.virtual)) {
    const closer = BLOCK_OPEN_CLOSE[unclosed.keyword] || 'END';
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: unclosed.line, character: unclosed.col },
        end:   { line: unclosed.line, character: unclosed.col + unclosed.keyword.length }
      },
      message: `"${unclosed.keyword}" block is never closed. Add "${closer}" to close it.`,
      source: 'gPROMS'
    });
  }

  // ── Semicolon check for EQUATION / BOUNDARY sections ─────────────────────
  // We do this as a separate post-pass over the token stream, grouped by line.
  checkSemicolons(tokens, symbols, diagnostics);

  return diagnostics;
}

// ── Semicolon checker ─────────────────────────────────────────────────────────
// Key fix for multi-line equations:
//   $T(0|+:L|-) =
//       - u * PARTIAL(T, Axial)
//       + D * PARTIAL(T, Axial, Axial) ;   <-- semicolon is HERE, not on line 1
//
// Strategy:
//   1. Group tokens by line.
//   2. Identify which lines are "continuation lines" — lines that begin with
//      an operator (+, -, *, /) or are clearly mid-expression.
//   3. Merge consecutive lines into a single logical equation group.
//   4. Check the LAST line of the group for the semicolon, not each line
//      individually.
function checkSemicolons(tokens, symbols, diagnostics) {

  // ── Group tokens by line number ──────────────────────────────────────────
  const byLine = new Map();
  for (const t of tokens) {
    if (!byLine.has(t.line)) byLine.set(t.line, []);
    byLine.get(t.line).push(t);
  }

  // ── Collect EQUATION/BOUNDARY line ranges ────────────────────────────────
  // Walk the token stream once to find which line numbers are inside an
  // EQUATION or BOUNDARY section.
  const equationLines = new Set();
  let inEq = false;

  const SECTION_KEYWORDS = new Set([
    'PARAMETER','VARIABLE','SELECTOR','UNIT','STREAM',
    'DISTRIBUTION_DOMAIN','SET','ASSIGN','INITIAL',
    'SOLUTIONPARAMETERS','SCHEDULE','CONNECTIONS','REPORT','TOPOLOGY'
  ]);
  const TOP_KEYWORDS = new Set(['MODEL','PROCESS','TASK']);
  const CONTROL_WORDS = new Set([
    'FOR','IF','THEN','ELSE','ELSEIF','WHILE','CASE',
    'WHEN','OTHERWISE','DO','SWITCH','END'
  ]);

  for (const t of tokens) {
    if (t.upper === 'EQUATION' || t.upper === 'BOUNDARY') {
      inEq = true; continue;
    }
    if (SECTION_KEYWORDS.has(t.upper) || TOP_KEYWORDS.has(t.upper)) {
      inEq = false; continue;
    }
    if (t.upper === 'END') { continue; }
    if (inEq) equationLines.add(t.line);
  }

  if (equationLines.size === 0) return;

  // ── Identify continuation lines ──────────────────────────────────────────
  // A line is a continuation if its FIRST non-whitespace token is an
  // arithmetic operator (+, -, *, /) or it starts with a function/parenthesis
  // that makes no sense as a standalone equation starter.
  function isContinuationLine(lineNum) {
    const toks = byLine.get(lineNum) || [];
    if (toks.length === 0) return false;
    const first = toks[0].text;

    // Starts with arithmetic operator — clearly a continuation
    if (['+', '-', '*', '/', '^'].includes(first)) return true;

    // Starts with closing paren/bracket
    if (first === ')' || first === ']') return true;

    // Previous line ended with an operator or open paren — this is a continuation
    const prevToks = byLine.get(lineNum - 1) || [];
    if (prevToks.length > 0) {
      const lastPrev = prevToks[prevToks.length - 1].text;
      // Previous line ended with operator, open paren, or comma — continuation
      if (['+', '-', '*', '/', '^', '(', ',', '='].includes(lastPrev)) return true;
    }

    return false;
  }

  // ── Group equation lines into logical blocks ─────────────────────────────
  // Consecutive equation lines where line[i+1] is a continuation of line[i]
  // are merged into one group. We only check the LAST line of the group.
  const sortedEqLines = [...equationLines].sort((a, b) => a - b);
  const groups = [];   // each group = array of consecutive line numbers
  let currentGroup = [];

  for (let i = 0; i < sortedEqLines.length; i++) {
    const lineNum = sortedEqLines[i];

    if (currentGroup.length === 0) {
      currentGroup.push(lineNum);
    } else {
      const prevLine = currentGroup[currentGroup.length - 1];
      // Attach to current group if:
      //   (a) consecutive line number AND
      //   (b) this line is a continuation (starts with operator)
      if (lineNum === prevLine + 1 && isContinuationLine(lineNum)) {
        currentGroup.push(lineNum);
      } else {
        groups.push(currentGroup);
        currentGroup = [lineNum];
      }
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  // ── Check each group ─────────────────────────────────────────────────────
  for (const group of groups) {
    // Collect all tokens across all lines in the group
    const allToks = group.flatMap(ln => byLine.get(ln) || []);

    // Skip pure control-flow groups
    const firstUp = allToks[0]?.upper;
    if (CONTROL_WORDS.has(firstUp)) continue;

    // Only check groups that look like equations (contain = or $derivative)
    const hasEq    = allToks.some(t => t.text === '=' || t.text === ':=');
    const hasDeriv = allToks.some(t => t.text.startsWith('$'));
    if (!hasEq && !hasDeriv) continue;

    // Check the LAST line of the group for a semicolon
    const lastLineNum = group[group.length - 1];
    const lastLineToks = byLine.get(lastLineNum) || [];
    const hasSemi = lastLineToks.some(t => t.text === ';');

    if (!hasSemi) {
      // Point the error at the end of the last token on the last line
      const lastTok = lastLineToks[lastLineToks.length - 1];
      if (lastTok) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: lastTok.line, character: lastTok.col + lastTok.len },
            end:   { line: lastTok.line, character: lastTok.col + lastTok.len + 1 }
          },
          message: 'Equation is missing a terminating semicolon (;).',
          source: 'gPROMS'
        });
      }
    }
  }
}

// ── Assignment semicolon checker (SET / ASSIGN / INITIAL / SOLUTIONPARAMETERS)
// Same continuation-line grouping logic as checkSemicolons, but for
// assignment sections where lines end with := ... ;
function checkAssignmentSemicolons(tokens, symbols, diagnostics) {
  const ASSIGN_SECTIONS = new Set([
    'SET','ASSIGN','INITIAL','SOLUTIONPARAMETERS','CONNECTIONS'
  ]);
  const EXIT_SECTIONS = new Set([
    'PARAMETER','VARIABLE','EQUATION','SELECTOR','UNIT','STREAM',
    'BOUNDARY','DISTRIBUTION_DOMAIN','SCHEDULE','CONNECTIONS',
    'REPORT','TOPOLOGY','MODEL','PROCESS','TASK','OPTIMISATION','ESTIMATION'
  ]);

  // Group tokens by line
  const byLine = new Map();
  for (const t of tokens) {
    if (!byLine.has(t.line)) byLine.set(t.line, []);
    byLine.get(t.line).push(t);
  }

  // Collect lines inside SET/ASSIGN/INITIAL/SOLUTIONPARAMETERS
  const assignLines = new Set();
  let inAssign = false;

  for (const t of tokens) {
    if (ASSIGN_SECTIONS.has(t.upper))      { inAssign = true;  continue; }
    if (EXIT_SECTIONS.has(t.upper))        { inAssign = false; continue; }
    if (t.upper === 'END')                 { inAssign = false; continue; }
    if (inAssign) assignLines.add(t.line);
  }

  if (assignLines.size === 0) return;

  // Continuation: previous line ended with := or an operator (value spans lines)
  function isContinuation(lineNum) {
    const prevToks = byLine.get(lineNum - 1) || [];
    if (prevToks.length === 0) return false;
    const last = prevToks[prevToks.length - 1].text;
    return [':=', '+', '-', '*', '/', '^', '(', ','].includes(last);
  }

  // Group into logical assignment statements
  const sorted = [...assignLines].sort((a, b) => a - b);
  const groups = [];
  let cur = [];

  for (const ln of sorted) {
    if (cur.length === 0) {
      cur.push(ln);
    } else {
      const prev = cur[cur.length - 1];
      if (ln === prev + 1 && isContinuation(ln)) {
        cur.push(ln);
      } else {
        groups.push(cur);
        cur = [ln];
      }
    }
  }
  if (cur.length > 0) groups.push(cur);

  // Check each group
  const SKIP_KEYWORDS = new Set(['STEADY_STATE','SELECTOR','USING','FREE',
    'FIXED','ESTIMATE','SENSITIVITY','MEASUREMENTS','CONSTRAINTS','OBJECTIVE']);

  for (const group of groups) {
    const allToks = group.flatMap(ln => byLine.get(ln) || []);
    if (allToks.length === 0) continue;

    // Skip keyword-only lines (STEADY_STATE, SELECTOR etc.)
    if (SKIP_KEYWORDS.has(allToks[0].upper)) continue;

    // Only check lines that contain := (assignment)
    const hasAssign = allToks.some(t => t.text === ':=');
    if (!hasAssign) continue;

    // Check last line for semicolon
    const lastLn   = group[group.length - 1];
    const lastToks = byLine.get(lastLn) || [];
    const hasSemi  = lastToks.some(t => t.text === ';');

    if (!hasSemi) {
      const lastTok = lastToks[lastToks.length - 1];
      if (lastTok) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: lastTok.line, character: lastTok.col + lastTok.len },
            end:   { line: lastTok.line, character: lastTok.col + lastTok.len + 1 }
          },
          message: 'Assignment is missing a terminating semicolon (;).',
          source: 'gPROMS'
        });
      }
    }
  }
}

// ── Edit-distance keyword suggestion ─────────────────────────────────────────
function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 4) return 99;
  const dp = Array.from({ length: m+1 }, (_, i) =>
    Array.from({ length: n+1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

// Only suggest structural/section keywords as corrections (not functions)
const CHECKABLE_KEYWORDS = [
  'MODEL','PROCESS','TASK','OPTIMISATION','ESTIMATION',
  'INITIALISATION_PROCEDURE','INITIALISATION','USE','DEFAULT','END',
  'VARIABLE_TYPE','PORT','INTERFACE','TOPOLOGY','EXTERNAL',
  'USING','OBJECTIVE','CONSTRAINTS','MEASUREMENTS','VARIABLE_TYPES',
  'AT','EVERY','INTERVAL','AFTER','SEND','GET','SENDMATHINFO',
  'REINITIALISE','CHECKPOINT','REWIND','ABORT','WARNING','INFO',
  'NOINT','REPORT_AFTER','GRADIENT','WITHIN_BOUNDS',
  'DECLARE','TYPE','PARAMETER','VARIABLE','EQUATION','SELECTOR',
  'UNIT','STREAM','BOUNDARY','DISTRIBUTION_DOMAIN','SCHEDULE',
  'INITIAL','ASSIGN','SET','SOLUTIONPARAMETERS','CONNECTIONS',
  'FOR','WHILE','IF','THEN','ELSE','CASE','WHEN','OTHERWISE',
  'SEQUENCE','PARALLEL','CONTINUE','RESET','WITHIN','STOP',
  'STEADY_STATE','FOREIGN_OBJECT','ARRAY','DISTRIBUTION',
  'REAL','INTEGER','LOGICAL','DEFAULT','AS','OF','IS',
  'USING','USE','INITIALISATION_PROCEDURE'
];

function findClosestKeyword(word) {
  let best = null, bestDist = 3; // Only suggest if distance ≤ 3
  for (const kw of CHECKABLE_KEYWORDS) {
    const d = editDistance(word, kw);
    if (d < bestDist) { bestDist = d; best = kw; }
  }
  return best;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILE TYPE DETECTION
// Reads  # TYPE: MODEL / # TYPE: PROCESS / # TYPE: TASK  from the first 10 lines.
// Returns 'MODEL', 'PROCESS', 'TASK', or null when no hint is present.
// ═══════════════════════════════════════════════════════════════════════════════

function detectFileType(text) {
  const lines = text.split(/\r?\n/).slice(0, 10);
  for (const line of lines) {
    const m = line.match(/^#\s*TYPE\s*:\s*(\w+)/i);
    if (m) {
      const t = m[1].toUpperCase();
      if (['MODEL','PROCESS','TASK','OPTIMISATION','ESTIMATION'].includes(t)) return t;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SAFE-ONLY CHECKER  (used when no # TYPE: hint is present)
// Only runs checks that cannot produce false positives:
//   — Misspelled keywords (edit-distance on ALL-CAPS words at line start)
//   — Missing semicolons inside clearly-identified EQUATION sections
// ═══════════════════════════════════════════════════════════════════════════════

function checkSafeOnly(tokens, symbols) {
  const diagnostics = [];

  function mkErr(tok, msg) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: tok.line, character: tok.col },
        end:   { line: tok.line, character: tok.col + tok.len }
      },
      message: msg, source: 'gPROMS'
    });
  }

  // Misspelling check
  for (let i = 0; i < tokens.length; i++) {
    const t    = tokens[i];
    const prev = i > 0 ? tokens[i-1] : null;
    if (t.text === t.text.toUpperCase() &&
        /^[A-Z][A-Z0-9_]{2,}$/.test(t.text) &&
        !t.text.includes('.') &&
        !ALL_KEYWORDS.has(t.upper) &&
        !symbols.has(t.upper) &&
        !BUILTIN_FUNCTIONS.has(t.upper) &&
        !DISCRETISATION_METHODS.has(t.upper)) {
      const isLineStart = !prev || prev.line < t.line;
      if (isLineStart) {
        const suggestion = KNOWN_MISSPELLINGS[t.upper] || findClosestKeyword(t.upper);
        if (suggestion) {
          mkErr(t, `Unknown keyword "${t.text}". Did you mean "${suggestion}"?`);
        }
      }
    }
  }

  // Semicolon checks
  checkSemicolons(tokens, symbols, diagnostics);
  checkAssignmentSemicolons(tokens, symbols, diagnostics);
  return diagnostics;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN VALIDATE FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

function validate(doc) {
  try {
    const text     = doc.getText();
    const fileType = detectFileType(text);
    const tokens   = tokenise(text);
    const symbols  = buildSymbolTable(tokens);

    // No # TYPE: hint → skip structural checks (zero false positives)
    // but add a single informational diagnostic on line 1 guiding the user
    let diags = fileType
      ? check(tokens, symbols, fileType)
      : checkSafeOnly(tokens, symbols);

    if (!fileType) {
      // Only show the hint if the file looks like gPROMS code
      // (contains at least one known keyword)
      const looksLikeGproms = tokens.some(t =>
        ['MODEL','PROCESS','TASK','PARAMETER','VARIABLE',
         'EQUATION','DECLARE','SCHEDULE'].includes(t.upper)
      );
      if (looksLikeGproms) {
        diags = [{
          severity: DiagnosticSeverity.Information,
          range: {
            start: { line: 0, character: 0 },
            end:   { line: 0, character: 1 }
          },
          message: 'Add "# TYPE: MODEL", "# TYPE: PROCESS", "# TYPE: TASK", ' +
                   '"# TYPE: OPTIMISATION" or "# TYPE: ESTIMATION" ' +
                   'as the first line to enable full structural error checking.',
          source: 'gPROMS'
        }, ...diags];
      }
    }

    connection.sendDiagnostics({ uri: doc.uri, diagnostics: diags });
  } catch (e) {
    connection.console.error(`gPROMS checker error: ${e.message}`);
    connection.sendDiagnostics({ uri: doc.uri, diagnostics: [] });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOVER DOCS (condensed)
// ═══════════════════════════════════════════════════════════════════════════════

const HOVER_DOCS = {
  MODEL:{signature:'MODEL <n> ... END',description:'Defines a mathematical model. Contains PARAMETER, VARIABLE, EQUATION, SELECTOR, UNIT, STREAM, DISTRIBUTION_DOMAIN, and BOUNDARY sections.',example:'MODEL BufferTank\n  PARAMETER\n    Rho AS REAL DEFAULT 1000.0\n  VARIABLE\n    Height AS Length\n  EQUATION\n    $HoldUp = FlowIn - FlowOut ;\nEND'},
  PROCESS:{signature:'PROCESS <n> ... END',description:'Defines a simulation experiment. Instantiates MODEL units, sets parameters, assigns inputs, and defines the operating procedure via SCHEDULE.',example:'PROCESS Sim\n  UNIT\n    T101 AS BufferTank\n  SET\n    T101.Rho := 1000.0 ;\n  INITIAL\n    T101.Height := 0.5 ;\n  SOLUTIONPARAMETERS\n    REPORTINGINTERVAL := 10.0 ;\n  SCHEDULE\n    CONTINUE FOR 3600\nEND'},
  TASK:{signature:'TASK <n> ... END',description:'Defines a reusable operating procedure callable from a PROCESS SCHEDULE or other TASKs.',example:'TASK StepChange\n  SCHEDULE\n    RESET\n      R101.FlowIn := 2.0 ;\n    END\n    CONTINUE FOR 100\nEND'},
  END:{signature:'END',description:'Closes a MODEL, PROCESS, TASK, SEQUENCE, PARALLEL, RESET, WITHIN, or CASE block.',example:'MODEL Reactor\n  ...\nEND  # Reactor'},
  PARAMETER:{signature:'PARAMETER\n  <n> AS <Type> [DEFAULT <value>]',description:'Declares constant inputs to a MODEL. Can be REAL, INTEGER, LOGICAL, ARRAY, or FOREIGN_OBJECT.',example:'PARAMETER\n  NoComp AS INTEGER\n  V      AS REAL  DEFAULT 1.0'},
  VARIABLE:{signature:'VARIABLE\n  <n> AS <VariableType>',description:'Declares dynamic unknowns of a MODEL. Every VARIABLE is a function of time.',example:'VARIABLE\n  T AS Temperature\n  C AS ARRAY(NoComp) OF Concentration'},
  EQUATION:{signature:'EQUATION\n  <expressions> ;',description:'Contains equations defining model behaviour. Each equation ends with semicolon (;). Time derivatives use the $ prefix.',example:'EQUATION\n  $HoldUp = FlowIn - FlowOut ;\n  HoldUp  = Rho * Area * Height ;'},
  SELECTOR:{signature:'SELECTOR\n  <n> AS (<State1>, <State2>) [DEFAULT <State>]',description:'Declares discrete state variables for models with discontinuous switching. Used with CASE...WHEN and SWITCH TO IF.',example:'SELECTOR\n  DiscState AS (Intact, Burst) DEFAULT Intact'},
  BOUNDARY:{signature:'BOUNDARY\n  <boundary condition equations> ;',description:'Specifies boundary conditions for PDE models at the edges of DISTRIBUTION_DOMAINs.',example:'BOUNDARY\n  u*C(0) = u*Cin + D*PARTIAL(C(0|+:L),Axial) ;\n  PARTIAL(C(0:L|-),Axial) = 0 ;'},
  DISTRIBUTION_DOMAIN:{signature:'DISTRIBUTION_DOMAIN\n  <n> AS [ <lower> : <upper> ]',description:'Declares a continuous spatial domain for PDE models.',example:'DISTRIBUTION_DOMAIN\n  Axial AS [ 0 : ReactorLength ]'},
  SCHEDULE:{signature:'SCHEDULE\n  CONTINUE FOR <time>\n  or SEQUENCE ... END',description:'Defines the operating procedure — duration, disturbances, and task ordering.',example:'SCHEDULE\n  SEQUENCE\n    CONTINUE FOR 100\n    RESET\n      R101.FlowIn := 2.0 ;\n    END\n  END'},
  INITIAL:{signature:'INITIAL\n  <unit>.<Var> := <value> ;\n  or STEADY_STATE',description:'Specifies initial conditions for differential variables.',example:'INITIAL\n  T101.Height := 1.5 ;\n\n# Or automatic:\nINITIAL\n  STEADY_STATE'},
  ASSIGN:{signature:'ASSIGN\n  <unit>.<Var> := <value> ;',description:'Fixes an input variable. Held constant unless changed by RESET.',example:'ASSIGN\n  T101.FlowIn := 0.5 ;'},
  SET:{signature:'SET\n  <unit>.<Parameter> := <value> ;',description:'Sets PARAMETER values for a model instance. Fixed for entire simulation.',example:'SET\n  R101.V := 2.5 ;'},
  SOLUTIONPARAMETERS:{signature:'SOLUTIONPARAMETERS\n  REPORTINGINTERVAL := <value> ;',description:'Controls solver settings. REPORTINGINTERVAL sets how often results are saved.',example:'SOLUTIONPARAMETERS\n  REPORTINGINTERVAL := 1.0 ;\n  AbsoluteTolerance := 1e-6 ;'},
  FOR:{signature:'FOR <i> := <start> TO <end> [STEP <n>] DO\n  ...\nEND',description:'Iterates over integer indices in EQUATION sections or SCHEDULE blocks.',example:'FOR i := 1 TO NoComp DO\n  $M(i) = Fin*Xin(i) - Fout*X(i) ;\nEND'},
  IF:{signature:'IF <condition> THEN\n  ...\n[ELSE ...]\nEND',description:'Conditional execution in EQUATION sections or SCHEDULE blocks.',example:'IF H > Hmax THEN\n  Overflow = k*(H-Hmax) ;\nELSE\n  Overflow = 0 ;\nEND'},
  WHILE:{signature:'WHILE <condition> DO\n  ...\nEND',description:'Iterative schedule execution while condition is TRUE.',example:'WHILE Done = FALSE DO\n  CONTINUE FOR dt\nEND'},
  CASE:{signature:'CASE <SelectorVar> OF\n  WHEN <State> : ...\nEND',description:'Selects equations based on current SELECTOR value. SWITCH TO IF triggers state transitions.',example:'CASE DiscState OF\n  WHEN Intact :\n    ReliefFlow = 0 ;\n    SWITCH TO Burst IF P > Pburst ;\n  WHEN Burst :\n    ReliefFlow = Cv*SQRT(dP) ;\nEND'},
  SWITCH:{signature:'SWITCH TO <State> IF <condition>',description:'Inside CASE-WHEN, triggers automatic state transition when condition becomes TRUE.',example:'SWITCH TO Burst IF Pressure > BurstPressure ;'},
  CONTINUE:{signature:'CONTINUE FOR <time> [OR|AND UNTIL <cond>]',description:'Primary integration task. Integrates forward for specified time. OR UNTIL stops early if condition met.',example:'CONTINUE FOR 3600\nCONTINUE FOR 100 OR UNTIL Conversion > 0.95'},
  SEQUENCE:{signature:'SEQUENCE\n  <tasks>\nEND',description:'Executes tasks one after another in order.',example:'SEQUENCE\n  CONTINUE FOR 100\n  RESET\n    R101.FlowIn := 2.0 ;\n  END\nEND'},
  PARALLEL:{signature:'PARALLEL\n  SEQUENCE...END\n  SEQUENCE...END\nEND',description:'Executes multiple task sequences simultaneously. Completes when ALL branches finish.',example:'PARALLEL\n  SEQUENCE\n    CONTINUE FOR 100\n  END\n  SEQUENCE\n    RESET\n      V.Position := 0.5 ;\n    END\n  END\nEND'},
  RESET:{signature:'RESET\n  <unit>.<Var> := <expr> ;\nEND',description:'Instantaneously changes ASSIGN variables. Models step disturbances.',example:'RESET\n  T101.FlowIn := OLD(T101.FlowIn) + 0.5 ;\nEND'},
  WITHIN:{signature:'WITHIN <unit> DO\n  ...\nEND',description:'Scopes RESET or ASSIGN actions to a specific unit instance.',example:'WITHIN R101 DO\n  RESET\n    FlowIn := 2.0 ;\n  END\nEND'},
  DECLARE:{signature:'DECLARE TYPE <n>\n  = <default> : <lower> : <upper>  UNIT = "<unit>"\nEND',description:'Creates a user-defined variable type with default value, bounds, and physical unit.',example:'DECLARE TYPE Temperature\n  = 298.15 : 200.0 : 1000.0   UNIT = "K"\nEND'},
  AS:{signature:'<n> AS <Type>',description:'Specifies the type of a PARAMETER, VARIABLE, UNIT instance, or STREAM in a declaration.',example:'Temperature AS Temp\nR101        AS CSTR'},
  OF:{signature:'ARRAY(<N>) OF <Type>',description:'Specifies the element type in ARRAY or DISTRIBUTION declarations.',example:'C AS ARRAY(NoComp) OF Concentration'},
  ARRAY:{signature:'ARRAY(<N>) OF <Type>',description:'Declares an indexed collection. Index starts at 1. Access with parentheses: X(i).',example:'C AS ARRAY(NoComp) OF Concentration\nX(1)    # first element\nX(2:5)  # slice'},
  DISTRIBUTION:{signature:'DISTRIBUTION(<Domain>) OF <Type>',description:'Declares a variable distributed over continuous DISTRIBUTION_DOMAINs for PDE models.',example:'C AS DISTRIBUTION(Axial) OF Concentration'},
  REAL:{signature:'<n> AS REAL [DEFAULT <value>]',description:'Floating-point PARAMETER type.',example:'V AS REAL DEFAULT 1.0'},
  INTEGER:{signature:'<n> AS INTEGER [DEFAULT <value>]',description:'Integer PARAMETER type. Used for array sizes and loop bounds.',example:'NoComp AS INTEGER'},
  LOGICAL:{signature:'<n> AS LOGICAL [DEFAULT TRUE|FALSE]',description:'Boolean PARAMETER or VARIABLE.',example:'HeaterOn AS LOGICAL DEFAULT TRUE'},
  DEFAULT:{signature:'DEFAULT <value>',description:'Specifies the default value for a PARAMETER or DECLARE TYPE.',example:'V AS REAL DEFAULT 1.0'},
  STEADY_STATE:{signature:'INITIAL\n  STEADY_STATE',description:'Requests automatic steady-state initialisation before dynamic simulation.',example:'INITIAL\n  STEADY_STATE'},
  FOREIGN_OBJECT:{signature:'<n> AS FOREIGN_OBJECT "<Class>"',description:'PARAMETER holding a reference to an external physical properties package.',example:'PhysProps AS FOREIGN_OBJECT "Multiflash"'},
  IS:{signature:'<Stream> IS <unit>.<SubStream>',description:'Creates a STREAM alias pointing to a sub-model stream.',example:'Inlet IS StorageTank.Inlet'},
  OLD:{signature:'OLD(<Variable>)',description:'Returns the value of a variable just before the current RESET executes.',example:'RESET\n  FlowIn := OLD(FlowIn) * 1.1 ;\nEND'},
  FREE:{signature:'FREE',description:'In OPTIMISATION — declares a variable as a decision variable.',example:'FREE\n  R101.T WITHIN [300, 500] ;'},
  FIXED:{signature:'FIXED',description:'Marks a variable as externally fixed.',example:'FIXED\n  R101.Pressure ;'},
  MESSAGE:{signature:'MESSAGE "<text>"',description:'Prints a message to the output window during simulation.',example:'MESSAGE "Step change applied"'},
  STOP:{signature:'STOP',description:'Immediately terminates the simulation.',example:'STOP'},
  SAVE:{signature:'SAVE',description:'Saves current simulation state as a checkpoint.',example:'SAVE'},
  RESTORE:{signature:'RESTORE',description:'Restores simulation state from last SAVE checkpoint.',example:'RESTORE'},
  REPORTINGINTERVAL:{signature:'REPORTINGINTERVAL := <value> ;',description:'Sets how often results are written to output (in simulation time units).',example:'REPORTINGINTERVAL := 1.0 ;'},
  ABS:{signature:'ABS(x)',description:'Returns the absolute value of x.',example:'e = ABS(Measured - Predicted) ;'},
  SQRT:{signature:'SQRT(x)',description:'Returns the positive square root of x.',example:'v = Cv * SQRT(2*dP/Rho) ;'},
  EXP:{signature:'EXP(x)',description:'Returns e raised to the power x.',example:'k = k0 * EXP(-Ea/(R*T)) ;'},
  LOG:{signature:'LOG(x)',description:'Returns the natural logarithm of x.',example:'dS = -R * SIGMA(x*LOG(x)) ;'},
  LOG10:{signature:'LOG10(x)',description:'Returns the base-10 logarithm of x.',example:'LOG10(Psat) = A - B/(T+C) ;'},
  SIN:{signature:'SIN(x)',description:'Returns the sine of x in radians.',example:'y = A * SIN(omega*t) ;'},
  COS:{signature:'COS(x)',description:'Returns the cosine of x in radians.',example:'y = A * COS(omega*t) ;'},
  TAN:{signature:'TAN(x)',description:'Returns the tangent of x in radians.',example:'slope = TAN(angle) ;'},
  ASIN:{signature:'ASIN(x)',description:'Returns the arcsine of x in radians.',example:'angle = ASIN(opp/hyp) ;'},
  ACOS:{signature:'ACOS(x)',description:'Returns the arccosine of x in radians.',example:'angle = ACOS(adj/hyp) ;'},
  ATAN:{signature:'ATAN(x)',description:'Returns the arctangent of x in radians.',example:'angle = ATAN(opp/adj) ;'},
  SINH:{signature:'SINH(x)',description:'Returns the hyperbolic sine of x.',example:'y = SINH(x) ;'},
  COSH:{signature:'COSH(x)',description:'Returns the hyperbolic cosine of x.',example:'y = COSH(x) ;'},
  TANH:{signature:'TANH(x)',description:'Returns the hyperbolic tangent of x.',example:'y = TANH(x) ;'},
  SGN:{signature:'SGN(x)',description:'Returns the sign of x: +1, -1, or 0.',example:'d = SGN(Velocity) ;'},
  INT:{signature:'INT(x)',description:'Returns the largest integer not exceeding x (floor).',example:'s = INT(h/hs) ;'},
  MIN:{signature:'MIN(array)',description:'Returns the smallest element of an array.',example:'Cmin = MIN(C) ;'},
  MAX:{signature:'MAX(array)',description:'Returns the largest element of an array.',example:'Tmax = MAX(T) ;'},
  SIGMA:{signature:'SIGMA(<ArrayExpr>)',description:'Returns the sum of all elements of an array expression (Σ operator).',example:'TotalH = SIGMA(M) ;\n$M(i) = SIGMA(Fin*Xin(,i)) - Fout*X(i) ;'},
  PRODUCT:{signature:'PRODUCT(<ArrayExpr>)',description:'Returns the product of all elements of an array expression (Π operator).',example:'Rate = k * PRODUCT(C^Order) ;'},
  PARTIAL:{signature:'PARTIAL(<Expr>, <Domain> [,<Domain>])',description:'Computes a partial derivative with respect to a DISTRIBUTION_DOMAIN.',example:'$C = -u*PARTIAL(C,Axial) + D*PARTIAL(C,Axial,Axial) ;'},
  INTEGRAL:{signature:'INTEGRAL(<var> := <start>:<end> ; <Expr>)',description:'Integrates an expression over a distribution domain.',example:'Tavg = (1/L) * INTEGRAL(z := 0:L ; T) ;'},
  SMOOTH:{signature:'SMOOTH(<x>, <eps>)',description:'Smooth approximation to ABS(x): SQRT(x²+eps²). Avoids discontinuities.',example:'F = SMOOTH(dP, 1e-4) * Cv ;'},
  HEAVISIDE:{signature:'HEAVISIDE(<x>)',description:'Returns 1 if x≥0, 0 if x<0.',example:'F = Fin * HEAVISIDE(H - Hmin) ;'},
  PDFSS:{signature:'PDFSS',description:'Centred Finite Difference Steady-State discretisation for DISTRIBUTION_DOMAINs.',example:'# Axial PDFSS npoints=20'},
  PDCOL:{signature:'PDCOL',description:'Orthogonal Collocation on Finite Elements discretisation.',example:'# Axial PDCOL nfinele=10 nordpol=3'},
  BFDIFF:{signature:'BFDIFF',description:'Backward Finite Difference (upwind) discretisation for convection-dominated PDEs.',example:'# Axial BFDIFF npoints=50'},
  TRUE:{signature:'TRUE',description:'Boolean constant TRUE.',example:'HeaterOn AS LOGICAL DEFAULT TRUE'},
  FALSE:{signature:'FALSE',description:'Boolean constant FALSE.',example:'Done AS LOGICAL DEFAULT FALSE'},
  AND:{signature:'<cond1> AND <cond2>',description:'Logical AND — TRUE only if both conditions are TRUE.',example:'IF T > Tmin AND T < Tmax THEN'},
  OR:{signature:'<cond1> OR <cond2>',description:'Logical OR — TRUE if at least one condition is TRUE.',example:'CONTINUE FOR 100 OR UNTIL Conv > 0.95'},
  NOT:{signature:'NOT <condition>',description:'Logical NOT — negates a boolean condition.',example:'IF NOT HeaterOn THEN\n  Q = 0 ;\nEND'}
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXTENDED SYMBOL TABLE
// Builds a richer map of declared symbols with their kind and type info.
// Used by auto-complete to offer context-aware suggestions.
// ═══════════════════════════════════════════════════════════════════════════════

// AUTO-COMPLETE ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

// ── Rich symbol table ──────────────────────────────────────────────────────────
// Builds a richer map: name (UPPER) → { name, kind, detail }
// Used by completion to show correctly typed suggestions.

function buildRichSymbols(tokens) {
  const map = new Map();

  function add(name, kind, detail) {
    if (!name || name.includes('.')) return;
    const u = name.toUpperCase();
    if (ALL_KEYWORDS.has(u)) return;
    if (!map.has(u)) map.set(u, { name, kind, detail: detail || '' });
  }

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    // Entity names: MODEL Foo, PROCESS Bar, etc.
    if (['MODEL','PROCESS','TASK','OPTIMISATION','ESTIMATION'].includes(t.upper)) {
      const n = tokens[i+1];
      if (n && /^[A-Za-z_]/.test(n.text))
        add(n.text, CompletionItemKind.Class, t.text + ' name');
    }

    // DECLARE TYPE <TypeName>
    if (t.upper === 'DECLARE' && tokens[i+1] && tokens[i+1].upper === 'TYPE') {
      const n = tokens[i+2];
      if (n) add(n.text, CompletionItemKind.TypeParameter, 'variable type');
    }

    // <Name> AS <Type>
    if (t.upper === 'AS' && i > 0) {
      const prev = tokens[i-1];
      const typ  = tokens[i+1];
      if (prev && /^[A-Za-z_]/.test(prev.text) && !prev.text.includes('.')) {
        let kind = CompletionItemKind.Variable;
        for (let j = i-1; j >= Math.max(0, i-40); j--) {
          const u = tokens[j].upper;
          if (u === 'PARAMETER')  { kind = CompletionItemKind.Constant;  break; }
          if (u === 'VARIABLE')   { kind = CompletionItemKind.Variable;  break; }
          if (u === 'UNIT')       { kind = CompletionItemKind.Module;    break; }
          if (u === 'STREAM')     { kind = CompletionItemKind.Interface; break; }
          if (['MODEL','PROCESS','TASK'].includes(u)) break;
        }
        add(prev.text, kind, typ ? 'AS ' + typ.text : '');
      }
      // The type name itself is also a user symbol
      if (typ && /^[A-Za-z_]/.test(typ.text) && !ALL_KEYWORDS.has(typ.upper))
        add(typ.text, CompletionItemKind.TypeParameter, 'type');
    }

    // SELECTOR state names
    if (t.upper === 'SELECTOR') {
      for (let j = i+1; j < Math.min(i+25, tokens.length); j++) {
        if (tokens[j].text === ')') break;
        const s = tokens[j];
        if (/^[A-Za-z_]/.test(s.text) && !ALL_KEYWORDS.has(s.upper))
          add(s.text, CompletionItemKind.EnumMember, 'selector state');
      }
    }

    // WHEN <State>
    if (t.upper === 'WHEN') {
      const n = tokens[i+1];
      if (n && /^[A-Za-z_]/.test(n.text))
        add(n.text, CompletionItemKind.EnumMember, 'selector state');
    }
  }

  return map;
}

// ── Keyword completion lists ───────────────────────────────────────────────────
const KW_BLOCKS    = ['MODEL','PROCESS','TASK','OPTIMISATION','ESTIMATION','DECLARE'];
const KW_SECTIONS  = ['PARAMETER','VARIABLE','EQUATION','SELECTOR','UNIT','STREAM',
                      'BOUNDARY','DISTRIBUTION_DOMAIN','SCHEDULE','INITIAL','ASSIGN',
                      'SET','PRESET','CONNECTIONS','SOLUTIONPARAMETERS','REPORT',
                      'INITIALISATION_PROCEDURE'];
const KW_CONTROL   = ['FOR','TO','STEP','DO','END','IF','THEN','ELSE','ELSEIF',
                      'WHILE','CASE','WHEN','OTHERWISE','SWITCH'];
const KW_SCHEDULE  = ['SEQUENCE','PARALLEL','CONTINUE','RESET','WITHIN','STOP',
                      'MESSAGE','SAVE','RESTORE','PAUSE','MAXIMISE','MINIMISE'];
const KW_TYPES     = ['AS','OF','ARRAY','DISTRIBUTION','FOREIGN_OBJECT','REAL',
                      'INTEGER','LOGICAL','DEFAULT','LOWER','UPPER','FREE','FIXED',
                      'GIVEN','STEADY_STATE','IS','OLD'];
const KW_LOGIC     = ['AND','OR','NOT','TRUE','FALSE'];

// Context snippets shown after specific preceding keywords
const CTX_SNIPPETS = {
  'AS': [
    { label:'AS REAL DEFAULT',           insert:'AS REAL DEFAULT ',               detail:'real parameter' },
    { label:'AS INTEGER',                 insert:'AS INTEGER',                     detail:'integer parameter' },
    { label:'AS LOGICAL DEFAULT TRUE',    insert:'AS LOGICAL DEFAULT TRUE',        detail:'boolean parameter' },
    { label:'AS ARRAY() OF',             insert:'AS ARRAY(${1:N}) OF ',           detail:'array' },
    { label:'AS DISTRIBUTION() OF',      insert:'AS DISTRIBUTION(${1:D}) OF ',    detail:'distributed variable' },
    { label:'AS FOREIGN_OBJECT ""',      insert:'AS FOREIGN_OBJECT "${1:Class}"', detail:'external package' },
  ],
  'FOR': [
    { label:'FOR i := 1 TO N DO', insert:'FOR ${1:i} := 1 TO ${2:N} DO', detail:'for loop' },
  ],
  'CONTINUE': [
    { label:'CONTINUE FOR',       insert:'CONTINUE FOR ',                  detail:'integrate forward' },
  ],
  'INITIAL': [
    { label:'INITIAL STEADY_STATE', insert:'INITIAL\n  STEADY_STATE',      detail:'steady-state init' },
  ],
  'SWITCH': [
    { label:'SWITCH TO',          insert:'SWITCH TO ',                     detail:'state transition' },
  ],
};

// ── Main completion handler ────────────────────────────────────────────────────

function getCompletions(doc, pos, richSymbols) {
  const text  = doc.getText();
  const lines = text.split(/\r?\n/);
  const line  = lines[pos.line] || '';

  // Extract typed prefix
  let s = pos.character;
  while (s > 0 && /[A-Za-z0-9_]/.test(line[s-1])) s--;
  const prefix = line.slice(s, pos.character).toUpperCase();

  // Is the cursor right after a dot? (unit.var context)
  const afterDot = s > 0 && line[s-1] === '.';

  // What is the word before the cursor (or before the prefix)?
  let ps = s - 1;
  while (ps >= 0 && /\s/.test(line[ps])) ps--;
  let pe = ps;
  while (pe > 0 && /[A-Za-z0-9_]/.test(line[pe-1])) pe--;
  const prevWord = line.slice(pe, ps+1).toUpperCase();

  const items = [];
  const seen  = new Set();

  function push(label, kind, detail, sortPfx, insertText) {
    if (seen.has(label)) return;
    if (prefix && !label.toUpperCase().startsWith(prefix)) return;
    seen.add(label);
    const item = { label, kind, detail: detail || '', sortText: sortPfx + label };
    if (insertText) item.insertText = insertText;
    items.push(item);
  }

  // 1. Context-sensitive snippets (float to the very top)
  if (!afterDot && CTX_SNIPPETS[prevWord]) {
    for (const s of CTX_SNIPPETS[prevWord])
      push(s.label, CompletionItemKind.Snippet, s.detail, '0', s.insert);
  }

  // 2. User-defined symbols from the file (names you actually declared)
  for (const [, sym] of richSymbols)
    push(sym.name, sym.kind, sym.detail, '1');

  // 3. Built-in math functions
  if (!afterDot) {
    for (const fn of BUILTIN_FUNCTIONS) {
      const doc = HOVER_DOCS[fn];
      push(fn, CompletionItemKind.Function,
        doc ? doc.signature.split('\n')[0] : 'built-in function', '2');
    }
  }

  // 4. Discretisation methods (for [CFDM, 2, 9] context)
  if (!afterDot) {
    for (const dm of DISCRETISATION_METHODS)
      push(dm, CompletionItemKind.Keyword, 'discretisation method', '3');
  }

  // 5. Structural keywords (not after a dot)
  if (!afterDot) {
    const kmap = [
      [KW_BLOCKS,   CompletionItemKind.Class,         '4b'],
      [KW_SECTIONS, CompletionItemKind.Module,        '4s'],
      [KW_CONTROL,  CompletionItemKind.Keyword,       '4c'],
      [KW_SCHEDULE, CompletionItemKind.Event,         '4e'],
      [KW_TYPES,    CompletionItemKind.TypeParameter, '4t'],
      [KW_LOGIC,    CompletionItemKind.Operator,      '4l'],
    ];
    for (const [list, kind, sort] of kmap) {
      for (const kw of list) {
        const doc = HOVER_DOCS[kw];
        push(kw, kind,
          doc ? doc.description.slice(0, 55) + '...' : '', sort);
      }
    }
  }

  return items;
}

// ── Per-document rich symbol cache ─────────────────────────────────────────────
const richCache = new Map();

function updateCache(doc) {
  const tokens = tokenise(doc.getText());
  richCache.set(doc.uri, buildRichSymbols(tokens));
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVER WIRING
// ═══════════════════════════════════════════════════════════════════════════════

connection.onInitialize(() => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    hoverProvider: true,
    completionProvider: {
      triggerCharacters: ['.', ' ', '\t'],
      resolveProvider: false
    }
  }
}));


documents.onDidChangeContent(e => {
  const tokens = tokenise(e.document.getText());
  richSymbolCache.set(e.document.uri, buildRichSymbols(tokens));
  validate(e.document);
});

connection.onCompletion((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const richSymbols = richSymbolCache.get(params.textDocument.uri) || new Map();
  try {
    return getCompletions(doc, params.position, richSymbols);
  } catch (e) {
    connection.console.error('Completion error: ' + e.message);
    return [];
  }
});

connection.onHover((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const word = getWordAt(doc, params.position);
  if (!word) return null;
  const entry = HOVER_DOCS[word.toUpperCase()];
  if (!entry) return null;
  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: '**`' + word.toUpperCase() + '`** — gPROMS GPL\n\n```\n'
           + entry.signature + '\n```\n\n'
           + entry.description + '\n\n**Example:**\n```gproms\n'
           + entry.example + '\n```'
    }
  };
});

function getWordAt(doc, pos) {
  const line = doc.getText({ start:{line:pos.line,character:0}, end:{line:pos.line,character:1000} });
  let s = pos.character, e = pos.character;
  while (s > 0 && /[A-Za-z0-9_]/.test(line[s-1])) s--;
  while (e < line.length && /[A-Za-z0-9_]/.test(line[e])) e++;
  const w = line.slice(s, e);
  return w.length > 0 ? w : null;
}

documents.listen(connection);
connection.listen();
