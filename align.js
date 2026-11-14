const DELIMITER_ROW = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const FENCE = /^\s*(```|~~~)/;

function ghostPads(lines, maxWidth = Infinity, wrapCells = false) {
  const pads = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (FENCE.test(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !isTableStart(lines, i)) continue;
    let end = i + 2;
    while (end < lines.length && lines[end].includes("|") && lines[end].trim()) end++;
    pads.push(...padTable(lines, i, end, maxWidth, wrapCells));
    i = end - 1;
  }
  return pads;
}

function isTableStart(lines, i) {
  const next = lines[i + 1];
  return lines[i].includes("|") && next !== undefined && next.includes("|") && DELIMITER_ROW.test(next);
}

function padTable(lines, from, to, maxWidth, wrapCells) {
  const rows = [];
  for (let i = from; i < to; i++) rows.push(splitCells(lines[i]));
  const widths = fitWidths(rows, displayWidth(lines[from]), maxWidth);
  const aligns = rows[1].map((cell) => alignment(cell.text.trim()));

  const pads = [];
  rows.forEach((cells, r) => {
    const line = from + r;
    const text = lines[line];
    const indent = text.length - text.trimStart().length;
    const leadWidth = displayWidth(text.slice(0, cells[0].start));
    let pos = leadWidth;
    let cellStart = leadWidth;
    cells.forEach((cell, col) => {
      const cellEnd = cellStart + widths[col];
      if (wrapCells && r > 1 && cell.width > widths[col]) {
        const blankColumns = " ".repeat(Math.max(0, leadWidth - indent)) + widths.slice(0, col).map((width) => " ".repeat(width) + "|").join("");
        pos = wrapCell(cell, line, pos, cellStart, cellEnd, blankColumns, maxWidth, pads);
      } else {
        pos += cell.width;
      }
      // A cell wider than its column pushes the row right; later cells pad less until the row is back on the grid.
      const missing = Math.max(0, cellEnd - pos);
      pos += missing + 1;
      cellStart = cellEnd + 1;
      if (missing === 0) return;
      if (r === 1) {
        pads.push({ line, character: cell.start + cell.text.indexOf("-"), text: "-".repeat(missing) });
        return;
      }
      const before = aligns[col] === "right" ? missing : aligns[col] === "center" ? Math.floor(missing / 2) : 0;
      if (before > 0) pads.push({ line, character: cell.start, text: " ".repeat(before) });
      if (before < missing && cell.closed) pads.push({ line, character: cell.end, text: " ".repeat(missing - before) });
    });
  });
  return pads;
}

// Padding pushes the space before each overflowing word onto the wrap column, so VS Code wraps right there.
// blankColumns must not start with "|": VS Code never wraps between a space and a pipe.
function wrapCell(cell, line, pos, cellStart, cellEnd, blankColumns, wrapColumn, pads) {
  const words = [...cell.text.matchAll(/\S+/g)];
  const leading = words[0].index;
  let x = pos + leading;
  words.forEach((word, i) => {
    const width = displayWidth(word[0]);
    if (i === 0) {
      x += width;
      return;
    }
    const previous = words[i - 1];
    const gap = word.index - previous.index - previous[0].length;
    if (x + gap + width < cellEnd) {
      x += gap + width;
      return;
    }
    const lastSpace = x + gap - 1;
    const afterBorder = wrapColumn - 2 - cellEnd;
    const fill = lastSpace <= cellEnd && afterBorder >= 0
      ? " ".repeat(cellEnd - lastSpace) + "|" + " ".repeat(afterBorder)
      : " ".repeat(Math.max(0, wrapColumn - 1 - lastSpace));
    pads.push({ line, character: cell.start + word.index - 1, text: fill });
    pads.push({ line, character: cell.start + word.index, text: blankColumns + " ".repeat(leading) });
    x = cellStart + leading + width;
  });
  return x + cell.text.length - cell.text.trimEnd().length;
}

// Caps the widest columns until the header row fits maxWidth, so the header never wraps.
// A column never gets narrower than its header and delimiter cells.
function fitWidths(rows, headerLineWidth, maxWidth) {
  const natural = [];
  const floor = [];
  rows.forEach((cells, r) => {
    cells.forEach((cell, col) => {
      natural[col] = Math.max(natural[col] ?? 0, cell.width);
      if (r < 2) floor[col] = Math.max(floor[col] ?? 0, cell.width);
    });
  });
  const header = rows[0];
  const overhead = headerLineWidth - sum(header.map((cell) => cell.width));
  const capped = (cap) => natural.map((width, col) => Math.max(floor[col] ?? 0, Math.min(width, cap)));

  for (let cap = Math.max(...natural); cap > 0; cap--) {
    const widths = capped(cap);
    if (overhead + sum(widths.slice(0, header.length)) <= maxWidth) return widths;
  }
  return capped(0);
}

function sum(numbers) {
  let total = 0;
  for (const n of numbers) total += n;
  return total;
}

function splitCells(line) {
  const pipes = [];
  for (let c = 0; c < line.length; c++) {
    if (line[c] === "\\") c++;
    else if (line[c] === "|") pipes.push(c);
  }
  const edges = [-1, ...pipes, line.length];
  const cells = [];
  for (let k = 0; k + 1 < edges.length; k++) {
    const start = edges[k] + 1;
    const end = edges[k + 1];
    const text = line.slice(start, end);
    cells.push({ start, end, text, width: displayWidth(text), closed: end < line.length });
  }
  if (!cells[0].text.trim()) cells.shift();
  if (!cells.at(-1).text.trim() && !cells.at(-1).closed) cells.pop();
  return cells;
}

function alignment(delimiter) {
  if (delimiter.startsWith(":") && delimiter.endsWith(":")) return "center";
  if (delimiter.endsWith(":")) return "right";
  return "left";
}

// Same full-width ranges VS Code's wrapper counts as 2 columns (strings.isFullWidthCharacter).
// shortcut: emoji count as 1 column but most fonts draw them wider, measure rendered width if tables with emoji drift.
const FULL_WIDTH = /[\u2E80-\uD7AF\uF900-\uFAFF\uFF01-\uFF5E]/u;

function displayWidth(text) {
  let width = 0;
  for (const char of text) width += FULL_WIDTH.test(char) ? 2 : 1;
  return width;
}

module.exports = { ghostPads };
