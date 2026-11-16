# Markdown Ghost Align

Aligns the columns of markdown tables in the text editor. The padding is virtual: the extension does not write spaces to the file.

## Features

- Pads table cells with inlay hints, so the columns line up on screen and the file stays compact.
- Pads the delimiter row with dashes.
- Obeys `:---`, `---:` and `:---:` column alignment.
- Keeps the header row on one line: when a table is wider than `editor.wordWrapColumn`, the table fills exactly `editor.wordWrapColumn` and the widest columns get narrower. A column is never narrower than its header.
- With `editor.wordWrap` set to `bounded` or `wordWrapColumn`, draws a row with a long cell as a grid: each cell wraps inside its column, between words, and all cells start on the first line of the row. A word longer than the column (for example a URL) is cut at the column edge. The grid is the real text of the row, moved on screen, so it keeps its markdown colors.
- Keeps the text of the rows the cursor or selection is on in file order, so you can edit them. There, a long cell wraps in place and the rest of the row continues on the last line of the cell.

## Settings it changes

The extension sets these defaults for markdown files. Your own settings override them.

| Setting | Value | Why |
| --- | --- | --- |
| `editor.inlayHints.enabled` | `on` | The padding is made of inlay hints. |
| `editor.inlayHints.maximumLength` | `0` | Without this, VS Code cuts the padding after 43 characters in a line. |
| `editor.inlayHints.padding`, `fontSize`, `fontFamily` | editor defaults | The padding must have the width of the editor font. |

Set `editor.wordWrapColumn` in `[markdown]` to change the table width. With the markdown default `editor.wordWrap: "on"`, prose wraps at the window edge, columns align and the header fits `editor.wordWrapColumn`, but long cells do not wrap and no row is a grid: the extension API does not give the width of the editor. To get the grid, set `editor.wordWrap` to `bounded` (lines wrap at `editor.wordWrapColumn` or at the window edge, whichever comes first) or `wordWrapColumn`; prose then wraps at `editor.wordWrapColumn` too. With `off`, nothing wraps and columns use their full width.

## Limits

- In a grid row, search highlights and the marks of other extensions show where the text was before the move.
- A grid row can end with one or more empty lines of the grid: text moves only into a column wide enough to hold it.
- The leading `|` of a wrapped line is the box-drawing character `│`: VS Code does not break a line between two pipes.
- The underline of a link and the line through struck text continue under the padding inside a cut URL or phrase.
- Tables without a leading `|` do not wrap their cells. In tables indented with tabs, wrapped lines fall off the grid.
- In a row under the cursor, wrapped cells in right-aligned and centered columns wrap like left-aligned cells.
- The color of the padding is the theme color `editorInlayHint.background`.
