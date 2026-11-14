# Markdown Ghost Align

Aligns the columns of markdown tables in the text editor. The padding is virtual: the extension does not write spaces to the file.

## Features

- Pads table cells with inlay hints, so the columns line up on screen and the file stays compact.
- Pads the delimiter row with dashes.
- Obeys `:---`, `---:` and `:---:` column alignment.
- Keeps the header row on one line: when a table is wider than `editor.wordWrapColumn`, the table fills exactly `editor.wordWrapColumn` and the widest columns get narrower. A column is never narrower than its header.
- Wraps a long cell inside its column, between words. A word longer than the column (for example a URL) is cut at the column edge. Every wrapped line shows all column borders, and the rest of the row continues on the last line of the cell.

## Settings it changes

The extension sets these defaults for markdown files. Your own settings override them.

| Setting | Value | Why |
| --- | --- | --- |
| `editor.inlayHints.enabled` | `on` | The padding is made of inlay hints. |
| `editor.inlayHints.maximumLength` | `0` | Without this, VS Code cuts the padding after 43 characters in a line. |
| `editor.inlayHints.padding`, `fontSize`, `fontFamily` | editor defaults | The padding must have the width of the editor font. |

Set `editor.wordWrapColumn` in `[markdown]` to change the table width. With the markdown default `editor.wordWrap: "on"`, prose wraps at the window edge, columns align and the header fits `editor.wordWrapColumn`, but long cells do not wrap: the extension API does not give the width of the editor. To wrap long cells inside their column, set `editor.wordWrap` to `wordWrapColumn` or `bounded`; prose then wraps at `editor.wordWrapColumn` too. With `off`, nothing wraps and columns use their full width.

## Limits

- The leading `|` of a wrapped line is blank: VS Code does not break a line between two pipes.
- A link underline continues under the padding inside a cut URL.
- Tables without a leading `|` do not wrap their cells. In tables indented with tabs, wrapped lines fall off the grid.
- Wrapped cells in right-aligned and centered columns wrap like left-aligned cells.
- The color of the padding is the theme color `editorInlayHint.background`.
