# Change Log

## 0.1.1
- Stop setting `editor.wordWrap` to `wordWrapColumn` for markdown, so prose wraps at the window edge again. Long cells wrap inside their column only when you set `editor.wordWrap` to `wordWrapColumn` or `bounded`.

## 0.1.0
- Align markdown table columns with virtual padding (inlay hints), without changes to the file.
- Keep the header row on one line inside `editor.wordWrapColumn`, and wrap long cells inside their column.
