const vscode = require("vscode");
const { ghostLayout } = require("./align");

function activate(context) {
  const changed = new vscode.EventEmitter();
  // The CSS of a decoration type is fixed when it is created, so each distance gets its own type.
  const moveTypes = new Map();
  let cursorRows = "";

  const layoutOf = (document) => {
    const editor = vscode.workspace.getConfiguration("editor", document);
    const wordWrap = editor.get("wordWrap");
    const maxWidth = wordWrap === "off" ? Infinity : editor.get("wordWrapColumn");
    // With "on" the wrap column is the editor width, which the extension API does not expose, so cells cannot wrap.
    const wrapCells = wordWrap === "wordWrapColumn" || wordWrap === "bounded";
    const lines = document.getText().split(/\r?\n/);
    // A grid row is real text moved into slots that hints make, so with hints off no row is a grid.
    const hintsOn = editor.get("inlayHints.enabled").startsWith("on");
    const rawRows = hintsOn ? cursorLines(document) : new Set(lines.keys());
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
  };

  const refresh = () => {
    changed.fire();
    vscode.window.visibleTextEditors.forEach(moveText);
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
    vscode.languages.registerInlayHintsProvider({ language: "markdown" }, provider),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("editor")) refresh();
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === "markdown") refresh();
    }),
    vscode.window.onDidChangeVisibleTextEditors(refresh),
    vscode.window.onDidChangeActiveTextEditor(refresh),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (event.textEditor.document.languageId !== "markdown") return;
      const rows = event.selections.map((selection) => `${selection.start.line}-${selection.end.line}`).join();
      if (rows === cursorRows) return;
      cursorRows = rows;
      refresh();
    }),
  );
  refresh();
}

function cursorLines(document) {
  const lines = new Set();
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document !== document) return lines;
  for (const selection of editor.selections) {
    for (let line = selection.start.line; line <= selection.end.line; line++) lines.add(line);
  }
  return lines;
}

module.exports = { activate };
