# Change Log

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
