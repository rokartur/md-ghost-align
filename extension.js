const vscode = require("vscode");
const { ghostPads } = require("./align");

function activate(context) {
  const changed = new vscode.EventEmitter();
  const provider = {
    onDidChangeInlayHints: changed.event,
    provideInlayHints(document, range) {
      const lines = document.getText().split(/\r?\n/);
      const hints = [];
      const editor = vscode.workspace.getConfiguration("editor", document);
      const wordWrap = editor.get("wordWrap");
      const maxWidth = wordWrap === "off" ? Infinity : editor.get("wordWrapColumn");
      // With "on" the wrap column is the editor width, which the extension API does not expose, so cells cannot wrap.
      const wrapCells = wordWrap === "wordWrapColumn" || wordWrap === "bounded";
      for (const pad of ghostPads(lines, maxWidth, wrapCells)) {
        if (pad.line < range.start.line || pad.line > range.end.line) continue;
        hints.push(new vscode.InlayHint(new vscode.Position(pad.line, pad.character), pad.text));
      }
      return hints;
    },
  };
  context.subscriptions.push(
    changed,
    vscode.languages.registerInlayHintsProvider({ language: "markdown" }, provider),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("editor.wordWrap") || event.affectsConfiguration("editor.wordWrapColumn")) changed.fire();
    }),
  );
}

module.exports = { activate };
