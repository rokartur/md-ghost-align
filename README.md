# Markdown Ghost Align

Aligns the columns of markdown tables in the text editor. The padding is virtual: the extension does not write spaces to the file.

## Features

- Pads table cells with inlay hints, so the columns line up on screen and the file stays compact.
- Pads the delimiter row with dashes.
- Obeys `:---`, `---:` and `:---:` column alignment.
- Keeps the header row on one line: when a table is wider than `editor.wordWrapColumn`, the widest columns get narrower. A column is never narrower than its header.
- Wraps a long cell inside its column. The next visual lines start with empty columns up to that cell, and the rest of the row continues on the last line.

## Settings it changes

The extension sets these defaults for markdown files. Your own settings override them.

| Setting | Value | Why |
| --- | --- | --- |
| `editor.wordWrap` | `wordWrapColumn` | Cells can wrap only at a known column. The extension API does not give the width of the editor. |
| `editor.inlayHints.enabled` | `on` | The padding is made of inlay hints. |
| `editor.inlayHints.maximumLength` | `0` | Without this, VS Code cuts the padding after 43 characters in a line. |
| `editor.inlayHints.padding`, `fontSize`, `fontFamily` | editor defaults | The padding must have the width of the editor font. |

Set `editor.wordWrapColumn` in `[markdown]` to change the table width. With `editor.wordWrap` set to `on`, columns still align and the header still fits `editor.wordWrapColumn`, but long cells do not wrap. With `off`, nothing wraps and columns use their full width.

## Limits

- A word that is longer than its column (for example a long URL) pushes the rest of the row to the right.
- Emoji count as one column, but most fonts draw them wider.
- Wrapped cells in right-aligned and centered columns wrap like left-aligned cells.
- The color of the padding is the theme color `editorInlayHint.background`.
