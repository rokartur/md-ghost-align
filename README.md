# Markdown Ghost Align

Aligns the columns of markdown tables in the text editor. The padding is virtual: the extension does not write spaces to the file.

## Features

- Pads table cells with inlay hints, so the columns line up on screen and the file stays compact.
- Pads the delimiter row with dashes.
- Obeys `:---`, `---:` and `:---:` column alignment.
- Fits a wide table to the window: the table fills exactly the wrap column and the widest columns get narrower. A column is never narrower than its header. When the header is wider than the window, columns keep their full width.
- Draws a row with a long cell as a grid: each cell wraps inside its column, between words, and all cells start on the first line of the row. A word longer than the column (for example a URL) is cut at the column edge. The grid is the real text of the row, moved on screen, so it keeps its markdown colors.
- Keeps the grid while you edit: the cursor is drawn where its text is on screen. Only the rows under a selection or under more than one cursor show their text in file order. There, a long cell wraps in place and the rest of the row continues on the last line of the cell.

## Settings it changes

The extension sets these defaults for markdown files. Your own settings override them.

| Setting | Value | Why |
| --- | --- | --- |
| `editor.inlayHints.enabled` | `on` | The padding is made of inlay hints. |
| `editor.inlayHints.maximumLength` | `0` | Without this, VS Code cuts the padding after 43 characters in a line. |
| `editor.inlayHints.padding`, `fontSize`, `fontFamily` | editor defaults | The padding must have the width of the editor font. |

With the markdown default `editor.wordWrap: "on"`, prose and tables wrap at the window edge. The extension API does not give the width of the editor, so the extension measures it: half a second after you stop scrolling or typing, it moves the cursor along the longest prose lines in view, reads where VS Code broke them, and puts the cursor back. A table that fits the window keeps its full width. A wider one wraps for a moment, the extension reads the breaks of its rows, and the table fits the window. When the lines cannot be measured, the table fits `editor.wordWrapColumn` and no row is a grid. The measurement needs `editor.wrappingStrategy: "simple"` and `editor.wrappingIndent` `none` or `same`, and reads only lines of ASCII and Latin letters (Polish included) that do not start with a space and have no backslash.

VS Code does not tell extensions when the editor gets a new width. The extension measures again when you scroll, type, switch editors, split or close an editor group, or come back to the window. After you drag the window edge or a sidebar, run `Markdown Ghost Align: Fit Tables to the Window` from the Command Palette.

With `editor.wordWrap` set to `bounded` or `wordWrapColumn`, tables fit `editor.wordWrapColumn` (or the window edge under `bounded`, whichever comes first) and nothing is measured. With `off`, nothing wraps and columns use their full width.

## Limits

- In a grid row, search highlights and the marks of other extensions show where the text was before the move.
- A grid row can end with one or more empty lines of the grid: text moves only into a column wide enough to hold it.
- The leading `|` of a wrapped line is the box-drawing character `│`: VS Code does not break a line between two pipes.
- The underline of a link and the line through struck text continue under the padding inside a cut URL or phrase.
- Tables without a leading `|` do not wrap their cells. In tables indented with tabs, wrapped lines fall off the grid.
- In a row under a selection, wrapped cells in right-aligned and centered columns wrap like left-aligned cells.
- In a grid row, only the cursor is moved to its text. The suggestion list, the IME box and other widgets open where the text is in the line. The cursor is moved with CSS on VS Code's own cursor element (measured in VS Code 1.146), so a VS Code update can break it: the cursor is then drawn where the text is in the line.
- The color of the padding is the theme color `editorInlayHint.background`.
- The measurement moves the cursor for a moment, so an extension that reacts to cursor moves can see it. A window resize is measured when you next scroll or switch editors.
