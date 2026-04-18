'use strict';

const {
  createConnection, TextDocuments, ProposedFeatures,
  TextDocumentSyncKind, MarkupKind, DiagnosticSeverity
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
  CASE:     'END',
  FOR:      'END',
  WHILE:    'END',
  IF:       'END',
};

// Valid section headers and which top-level block they belong to
const VALID_IN_MODEL = new Set([
  'PARAMETER','VARIABLE','EQUATION','SELECTOR','UNIT','STREAM',
  'BOUNDARY','DISTRIBUTION_DOMAIN'
]);
const VALID_IN_PROCESS = new Set([
  'UNIT','SET','ASSIGN','INITIAL','SELECTOR','SOLUTIONPARAMETERS',
  'SCHEDULE','CONNECTIONS','REPORT','TOPOLOGY'
]);
const VALID_IN_TASK = new Set([
  'VARIABLE','SCHEDULE'
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

// Every valid gPROMS keyword — used to detect misspellings
const ALL_KEYWORDS = new Set([
  'MODEL','PROCESS','TASK','END',
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
  'NOT','TRUE','FALSE','MOD','DIV','OLD',
  ...BUILTIN_FUNCTIONS
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

    // Tokenise: identifiers, := , ; , = , $ prefixed identifiers
    const re = /(\$[A-Za-z_][A-Za-z0-9_.()]*|[A-Za-z_][A-Za-z0-9_]*|:=|<>|<=|>=|[;=<>])/g;
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
    // MODEL <Name>, PROCESS <Name>, TASK <Name>
    if (['MODEL','PROCESS','TASK'].includes(t.upper)) {
      const next = tokens[i+1];
      if (next && /^[A-Za-z_]/.test(next.text)) symbols.add(next.upper);
    }
    // DECLARE TYPE <Name>
    if (t.upper === 'DECLARE' && tokens[i+1]?.upper === 'TYPE') {
      const name = tokens[i+2];
      if (name) symbols.add(name.upper);
    }
    // <Name> AS ...  (variable/parameter/unit instance declarations)
    if (t.upper === 'AS') {
      const prev = tokens[i-1];
      if (prev && /^[A-Za-z_]/.test(prev.text)) symbols.add(prev.upper);
      // Also the type after AS
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
      // scan ahead for parenthesised list
      for (let j = i+1; j < Math.min(i+20, tokens.length); j++) {
        if (tokens[j].text === ')') break;
        if (/^[A-Za-z_]/.test(tokens[j].text) &&
            !ALL_KEYWORDS.has(tokens[j].upper)) {
          symbols.add(tokens[j].upper);
        }
      }
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
      if (['MODEL','PROCESS','TASK'].includes(t.upper)) {
        const outer = stack.find(s => ['MODEL','PROCESS','TASK'].includes(s.keyword));
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
        const inSched = inStack('SEQUENCE') || inStack('PARALLEL') ||
                        inStack('RESET')    || inStack('WITHIN')   ||
                        currentSection === 'SCHEDULE';
        if (!inSched) {
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

      const outerTL = stack.filter(s => ['MODEL','PROCESS','TASK'].includes(s.keyword));
      const tlBlock = outerTL.length ? outerTL[outerTL.length-1].keyword : null;

      // MODEL section used inside PROCESS
      if (tlBlock === 'PROCESS' && VALID_IN_MODEL.has(t.upper) && !VALID_IN_PROCESS.has(t.upper)) {
        err(t, `"${t.upper}" is a MODEL section and cannot appear inside a PROCESS block.`);
      }
      // PROCESS section used inside MODEL
      if (tlBlock === 'MODEL' && VALID_IN_PROCESS.has(t.upper) && !VALID_IN_MODEL.has(t.upper)) {
        err(t, `"${t.upper}" is a PROCESS/TASK section and cannot appear inside a MODEL block.`);
      }

      prevSection    = currentSection;
      currentSection = t.upper;
      lastSectionLine = t.line;
      i++; continue;
    }

    // ── Schedule-only keywords outside SCHEDULE ───────────────────────────────
    if (SCHEDULE_ONLY_KEYWORDS.has(t.upper)) {
      const inSched = inStack('SEQUENCE') || inStack('PARALLEL') ||
                      inStack('RESET')    || inStack('WITHIN')   ||
                      currentSection === 'SCHEDULE';
      if (!inSched && !['MODEL','PROCESS','TASK'].includes(t.upper)) {
        err(t, `"${t.upper}" is a SCHEDULE keyword and cannot appear in a "${currentSection || 'unknown'}" section.`);
      }
    }

    // ── Misspelled keywords ───────────────────────────────────────────────────
    // Only check ALL_CAPS tokens that are NOT in our symbol table and
    // NOT known keywords and look like they're meant to be a keyword
    // (i.e. appear at the start of a statement, or after specific contexts)
    if (t.text === t.text.toUpperCase() &&          // all caps
        /^[A-Z][A-Z0-9_]{2,}$/.test(t.text) &&     // 3+ chars, caps/digits/underscore
        !ALL_KEYWORDS.has(t.upper) &&               // not a known keyword
        !symbols.has(t.upper) &&                    // not a declared name
        !BUILTIN_FUNCTIONS.has(t.upper)) {          // not a function

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
    // Starts with an operator — clearly a continuation
    if (['+', '-', '*', '/'].includes(first)) return true;
    // Starts with a closing paren/bracket (e.g. continuation of function args)
    if (first === ')' || first === ']') return true;
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
  'MODEL','PROCESS','TASK','END',
  'DECLARE','TYPE','PARAMETER','VARIABLE','EQUATION','SELECTOR',
  'UNIT','STREAM','BOUNDARY','DISTRIBUTION_DOMAIN','SCHEDULE',
  'INITIAL','ASSIGN','SET','SOLUTIONPARAMETERS','CONNECTIONS',
  'FOR','WHILE','IF','THEN','ELSE','CASE','WHEN','OTHERWISE',
  'SEQUENCE','PARALLEL','CONTINUE','RESET','WITHIN','STOP',
  'STEADY_STATE','FOREIGN_OBJECT','ARRAY','DISTRIBUTION',
  'REAL','INTEGER','LOGICAL','DEFAULT','AS','OF','IS'
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
      if (['MODEL','PROCESS','TASK'].includes(t)) return t;
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
        !ALL_KEYWORDS.has(t.upper) &&
        !symbols.has(t.upper) &&
        !BUILTIN_FUNCTIONS.has(t.upper)) {
      const isLineStart = !prev || prev.line < t.line;
      if (isLineStart) {
        const suggestion = KNOWN_MISSPELLINGS[t.upper] || findClosestKeyword(t.upper);
        if (suggestion) {
          mkErr(t, `Unknown keyword "${t.text}". Did you mean "${suggestion}"?`);
        }
      }
    }
  }

  // Semicolon check (safe — only fires inside a clearly open EQUATION section)
  checkSemicolons(tokens, symbols, diagnostics);
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

    // No # TYPE: hint → skip structural checks entirely (zero false positives)
    const diags = fileType
      ? check(tokens, symbols, fileType)
      : checkSafeOnly(tokens, symbols);

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
// SERVER WIRING
// ═══════════════════════════════════════════════════════════════════════════════

connection.onInitialize(() => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    hoverProvider: true
  }
}));

documents.onDidOpen(e => validate(e.document));
documents.onDidChangeContent(e => validate(e.document));

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
      value: [
        `**\`${word.toUpperCase()}\`** — gPROMS GPL`, '',
        `\`\`\`\n${entry.signature}\n\`\`\``, '',
        entry.description, '',
        '**Example:**',
        `\`\`\`gproms\n${entry.example}\n\`\`\``
      ].join('\n')
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
