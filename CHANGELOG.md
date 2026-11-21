# Change Log

## 0.2.4
- Fix the editor scrolling one or two characters to the right half a second after you scroll or type: the width measurement put the cursor at the right edge of a line, and VS Code scrolled sideways to show it when a row was wider than the editor.

## 0.2.3
- Fix the editor jumping back a few lines after you scroll: the width measurement moved the cursor onto lines near the edge of the editor, and VS Code scrolled to keep sticky scroll lines (or `editor.cursorSurroundingLines`) around the cursor.

## 0.2.2
- Fit tables to the window under `editor.wordWrap: "on"`: the extension measures the wrap column from where VS Code breaks prose lines in view, and rows with a long cell become a grid again.
- Fix a table that fits the window but was cut to the longest line in view, so its long cells pushed their rows off the columns.
- Add the command `Markdown Ghost Align: Fit Tables to the Window`, which measures the editor width again. The same happens when you split or close an editor group, or come back to the window.
- Keep the grid in the row you edit: the cursor is drawn at its text in the grid. Rows under a selection or under more than one cursor still show their text in file order.
- Fix a table whose header is wider than the limit: its columns now align at full width, where they got no padding.
- Fix a grid row that broke off the grid when a cell had more trailing spaces than its column is wide.

## 0.2.1
- Stop setting `editor.wordWrap` to `bounded` for markdown, so prose wraps at the window edge again. Rows with a long cell are drawn as a grid only when you set `editor.wordWrap` to `bounded` or `wordWrapColumn`.

## 0.2.0
- Draw a row with a long cell as a grid: all cells start on the first line of the row. The grid is the real text of the row, moved on screen, so it keeps its markdown colors. The text goes back to file order when the cursor is on the row.
- Draw the left border of a wrapped line with `│`, where it was blank.
- Need VS Code 1.82 or later: the grid uses the CSS unit `lh`.
- Set `editor.wordWrap` to `bounded` for markdown, so long cells wrap inside a column of fixed width. Prose wraps at the window edge when the window is narrower than `editor.wordWrapColumn`.

## 0.1.1
- Stop setting `editor.wordWrap` to `wordWrapColumn` for markdown, so prose wraps at the window edge again. Long cells wrap inside their column only when you set `editor.wordWrap` to `wordWrapColumn` or `bounded`.

## 0.1.0
- Align markdown table columns with virtual padding (inlay hints), without changes to the file.
- Keep the header row on one line inside `editor.wordWrapColumn`, and wrap long cells inside their column.
