const vscode = require("vscode");
const { ghostLayout, wrapColumnBounds, canProbe, shownBreak } = require("./align");

function activate(context) {
  const changed = new vscode.EventEmitter();
  // The CSS of a decoration type is fixed when it is created, so each distance gets its own type.
  const moveTypes = new Map();
  const cursorTypes = new Map();
  let rawRowsKey = "";
  // Wrap column bounds per document under `editor.wordWrap: "on"`, read by `probeWrapColumn`.
  const wrapColumns = new Map();
  let probeTimer;
  let probing = false;
  // Set when the editor may have a new width: the next probe then drops the bounds it has.
  let remeasure = false;

  const layoutOf = (document) => {
    const editor = vscode.workspace.getConfiguration("editor", document);
    const wordWrap = editor.get("wordWrap");
    const measured = wordWrap === "on" ? wrapColumns.get(document.uri.toString()) : undefined;
    let maxWidth = wordWrap === "off" ? Infinity : editor.get("wordWrapColumn");
    // A grid needs the exact wrap column: each continuation line must end on it.
    const exact = measured !== undefined && measured.min === measured.max;
    // Without a break seen the window may be wider than any line, so the table takes its full width: capped at the
    // longest line, all its rows are that long, none wraps, and no probe can learn more. Rows that wrap give the bounds.
    // Between two bounds the table takes the middle: the next probe sees if its rows wrap there, which halves the range.
    if (measured) maxWidth = measured.max === Infinity ? Infinity : Math.ceil((measured.min + measured.max) / 2);
    const wrapCells = wordWrap === "wordWrapColumn" || wordWrap === "bounded" || exact;
    const lines = document.getText().split(/\r?\n/);
    // A grid row is real text moved into slots that hints make, so with hints off no row is a grid.
    const hintsOn = editor.get("inlayHints.enabled").startsWith("on");
    const rawRows = hintsOn ? rawLines(document) : new Set(lines.keys());
    return ghostLayout(lines, maxWidth, wrapCells, rawRows);
  };

  const moveText = (editor) => {
    if (editor.document.languageId !== "markdown") return;
    const ranges = new Map();
    for (const move of layoutOf(editor.document).moves) {
      const distance = `left: ${move.dx}ch; top: ${move.dy}lh`;
      if (!moveTypes.has(distance)) {
        // The API has no position property. `opacity` carries the CSS: `textDecoration` would take the underline off a moved link.
        moveTypes.set(distance, vscode.window.createTextEditorDecorationType({ opacity: `1; position: relative; ${distance}` }));
      }
      if (!ranges.has(distance)) ranges.set(distance, []);
      ranges.get(distance).push(new vscode.Range(move.line, move.start, move.line, move.end));
    }
    for (const [distance, type] of moveTypes) editor.setDecorations(type, ranges.get(distance) ?? []);
    moveCursor(editor);
  };

  // In a grid row the text is drawn away from its place in the line, and the cursor goes with it.
  const moveCursor = (editor) => {
    if (editor.document.languageId !== "markdown") return;
    const { active } = editor.selection;
    const single = editor.selections.length === 1 && editor.selection.isEmpty;
    const shift = single
      ? layoutOf(editor.document).cursors.find((c) => c.line === active.line && c.start <= active.character && active.character <= c.end)
      : undefined;
    const distance = shift && `${shift.dx}ch, ${shift.dy}lh`;
    if (shift && !cursorTypes.has(distance)) {
      // A decoration can style only its own text. Nested CSS reaches the cursor of the editor that draws the decoration.
      const css = `.monaco-editor:has(&) .cursors-layer .cursor { transform: translate(${distance}); }`;
      cursorTypes.set(distance, vscode.window.createTextEditorDecorationType({ opacity: `1; ${css}` }));
    }
    // The decoration needs a character to sit on: the one after the cursor, or the one before it at the end of the line.
    const from = shift && Math.min(active.character, editor.document.lineAt(active.line).text.length - 1);
    for (const [key, type] of cursorTypes) {
      editor.setDecorations(type, key === distance ? [new vscode.Range(active.line, from, active.line, from + 1)] : []);
    }
  };

  const refresh = () => {
    changed.fire();
    vscode.window.visibleTextEditors.forEach(moveText);
  };

  const probe = async () => {
    probeTimer = undefined;
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "markdown" || probing) return;
    probing = true;
    let seen;
    try {
      seen = await probeWrapColumn(editor, layoutOf(editor.document).pads);
    } finally {
      probing = false;
    }
    const key = editor.document.uri.toString();
    const known = wrapColumns.get(key) ?? { min: 0, max: Infinity };
    if (!seen) return;
    const old = remeasure ? { min: 0, max: Infinity } : known;
    remeasure = false;
    // Breaks seen in other views still hold, until the new ones contradict them: then the editor has a new width.
    let bounds = { min: Math.max(old.min, seen.min), max: Math.min(old.max, seen.max) };
    if (bounds.min > bounds.max) bounds = seen;
    if (known.min === bounds.min && known.max === bounds.max) return;
    wrapColumns.set(key, bounds);
    refresh();
    // The new padding changes where table rows break: those breaks narrow the bounds, or show that a probe read stale hints.
    scheduleProbe();
  };
  // The cursor moves during a probe, so it waits until scrolling and typing have stopped for a while.
  const scheduleProbe = () => {
    clearTimeout(probeTimer);
    probeTimer = setTimeout(probe, 500);
  };

  // The API has no event for a new editor width. A split or a closed group gives one; for the rest there is the command.
  const fitTables = () => {
    remeasure = true;
    scheduleProbe();
  };

  const provider = {
    onDidChangeInlayHints: changed.event,
    provideInlayHints(document, range) {
      const hints = [];
      for (const pad of layoutOf(document).pads) {
        if (pad.line < range.start.line || pad.line > range.end.line) continue;
        hints.push(new vscode.InlayHint(new vscode.Position(pad.line, pad.character), pad.text));
      }
      return hints;
    },
  };

  context.subscriptions.push(
    changed,
    { dispose: () => moveTypes.forEach((type) => type.dispose()) },
    { dispose: () => cursorTypes.forEach((type) => type.dispose()) },
    { dispose: () => clearTimeout(probeTimer) },
    vscode.languages.registerInlayHintsProvider({ language: "markdown" }, provider),
    vscode.commands.registerCommand("mdGhostAlign.fitTables", fitTables),
    vscode.window.tabGroups.onDidChangeTabGroups((event) => {
      if (event.opened.length > 0 || event.closed.length > 0) fitTables();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("editor")) return;
      refresh();
      scheduleProbe();
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId !== "markdown") return;
      refresh();
      if (probeTimer) scheduleProbe();
    }),
    vscode.window.onDidChangeVisibleTextEditors(refresh),
    vscode.window.onDidChangeActiveTextEditor(() => {
      refresh();
      scheduleProbe();
    }),
    // A new editor width changes how lines wrap, and so the lines in view.
    vscode.window.onDidChangeTextEditorVisibleRanges(scheduleProbe),
    vscode.window.onDidChangeWindowState((state) => {
      if (state.focused) scheduleProbe();
    }),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (event.textEditor.document.languageId !== "markdown" || probing) return;
      if (probeTimer) scheduleProbe();
      const key = [...rawLines(event.textEditor.document)].join();
      if (key === rawRowsKey) return moveCursor(event.textEditor);
      rawRowsKey = key;
      refresh();
    }),
  );
  refresh();
  scheduleProbe();
}

const MAX_PROBE_STEPS = 24;

// VS Code's wrap column under `editor.wordWrap: "on"` is the editor width, which the API does not give. So the cursor
// visits the visual lines of the longest lines in view, and each place where VS Code broke a line bounds the column.
// `pads` are the hints on screen now. Undefined when the breaks cannot be read.
async function probeWrapColumn(editor, pads) {
  const document = editor.document;
  const config = vscode.workspace.getConfiguration("editor", document);
  if (config.get("wordWrap") !== "on" || config.get("wrappingStrategy") !== "simple") return undefined;
  // With "indent" and "deepIndent", continuation lines get an indent the bounds do not count.
  if (!["none", "same"].includes(config.get("wrappingIndent"))) return undefined;

  // A cursor move scrolls until this many lines sit between the cursor and the editor edge, sticky scroll lines
  // included (VS Code 1.146 `_computeScrollTopToRevealRange`). The edge line itself can be cut off.
  const stickyLines = config.get("stickyScroll.enabled") ? config.get("stickyScroll.maxLineCount") : 0;
  const margin = 1 + Math.max(config.get("cursorSurroundingLines"), stickyLines);
  const lines = [];
  for (const range of editor.visibleRanges) {
    for (let line = range.start.line + margin; line <= range.end.line - margin; line++) {
      if (canProbe(document.lineAt(line).text)) lines.push(line);
    }
  }
  const padsOf = (line) => pads.filter((pad) => pad.line === line);
  const widthOf = (line) => shownBreak(document.lineAt(line).text, padsOf(line), Infinity).shown.length;
  lines.sort((a, b) => widthOf(b) - widthOf(a));

  const saved = editor.selections;
  let min = 0;
  let max = Infinity;
  let steps = 0;
  try {
    for (const line of lines) {
      const text = document.lineAt(line).text;
      let start = 0;
      let shownStart = 0;
      let wrapped = false;
      while (start < text.length && steps < MAX_PROBE_STEPS && min < max) {
        // A position on a break belongs to the visual line that starts there.
        editor.selection = new vscode.Selection(line, start, line, start);
        await vscode.commands.executeCommand("cursorMove", { to: "wrappedLineEnd" });
        steps++;
        const end = editor.selection.active.character;
        // The cursor command went to another editor (this one has no keyboard focus): nothing was read.
        if (start === 0 && end === 0 && editor.selection.active.line === line) return undefined;
        if (editor.selection.active.line !== line || end <= start) break;
        wrapped ||= end < text.length;
        const { shown, place } = shownBreak(text, padsOf(line), end);
        if (place === undefined) break;
        const bounds = wrapColumnBounds(shown, shownStart, place);
        min = Math.max(min, bounds.min);
        max = Math.min(max, bounds.max);
        start = end;
        shownStart = place;
      }
      // Lines go longest first, so once one does not wrap, none of the rest does.
      if (!wrapped || min >= max) break;
    }
  } finally {
    editor.selections = saved;
    // cursorMove reveals a cursor at the right edge with 30 px to spare, so a row wider than the editor scrolls it
    // sideways. Column 0 of a probed line scrolls it back, and that line is already far enough from the top and bottom.
    if (steps > 0) editor.revealRange(new vscode.Range(lines[0], 0, lines[0], 0));
  }
  // The breaks disagree (another extension's inline text, or hints not drawn yet): they say nothing.
  if (min > max) return undefined;
  return { min, max };
}

// A lone cursor is moved with the text of its grid row. A selection or more cursors cannot be, so their rows stay raw.
function rawLines(document) {
  const lines = new Set();
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document !== document) return lines;
  if (editor.selections.length === 1 && editor.selection.isEmpty) return lines;
  for (const selection of editor.selections) {
    for (let line = selection.start.line; line <= selection.end.line; line++) lines.add(line);
  }
  return lines;
}

module.exports = { activate };
