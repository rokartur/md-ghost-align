const DELIMITER_ROW = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const FENCE = /^\s*(```|~~~)/;
// Stands in for the leading pipe of a wrapped line: VS Code does not break a line between two pipes.
const GHOST_PIPE = "\u2502";

// `pads` are virtual text to insert. `moves` shift real text by `dx` columns and `dy` lines on screen.
// `rawRows` are the lines whose text stays where the editor puts it (the rows under a cursor), so they can be edited.
function ghostLayout(lines, maxWidth = Infinity, wrapCells = false, rawRows = new Set()) {
  const pads = [];
  const moves = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (FENCE.test(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !isTableStart(lines, i)) continue;
    let end = i + 2;
    while (end < lines.length && lines[end].includes("|") && lines[end].trim()) end++;
    const table = padTable(lines, i, end, maxWidth, wrapCells, rawRows);
    pads.push(...table.pads);
    moves.push(...table.moves);
    i = end - 1;
  }
  return { pads, moves };
}

function isTableStart(lines, i) {
  const next = lines[i + 1];
  return lines[i].includes("|") && next !== undefined && next.includes("|") && DELIMITER_ROW.test(next);
}

function padTable(lines, from, to, maxWidth, wrapCells, rawRows) {
  const rows = [];
  for (let i = from; i < to; i++) rows.push(splitCells(lines[i]));
  const columns = rows[0].length;
  const lead = displayWidth(lines[from].slice(0, rows[0][0].start));
  const { widths, wrap } = fitWidths(rows, columns, maxWidth - lead - columns, wrapCells);
  const aligns = rows[1].map((cell) => alignment(cell.text.trim()));

  const pads = [];
  const moves = [];
  rows.forEach((cells, r) => {
    const line = from + r;
    const text = lines[line];
    const indent = text.length - text.trimStart().length;
    const rowLead = displayWidth(text.slice(0, cells[0].start));
    // A continuation line must start with GHOST_PIPE, not a pipe or a space, or VS Code will not break before it.
    const wrapRow = wrap && r > 1 && rowLead > indent;
    const fitsGrid = wrapRow && !rawRows.has(line) && cells.length <= columns && cells.at(-1).closed;
    // A long last cell wraps in place with no cell after it to push down, so it needs no grid.
    if (fitsGrid && cells.slice(0, -1).some((cell, col) => cell.width > widths[col])) {
      const grid = gridRow(cells, widths, aligns, rowLead, line);
      if (grid) {
        pads.push(...grid.pads);
        moves.push(...grid.moves);
        return;
      }
    }
    let pos = rowLead;
    let cellStart = rowLead;
    cells.slice(0, columns).forEach((cell, col) => {
      const cellEnd = cellStart + widths[col];
      const wrapped = wrapRow && cell.width > widths[col];
      if (wrapped) {
        const fill = (x) => " ".repeat(cellEnd - x) + "|" + widths.slice(col + 1).map((width) => " ".repeat(width) + "|").join("");
        const blank = (leading) => GHOST_PIPE + widths.slice(0, col).map((width) => " ".repeat(width) + "|").join("") + " ".repeat(leading);
        pos = wrapCell(cell, line, cellStart, cellEnd, fill, blank, pads);
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
      const align = wrapped ? "left" : aligns[col];
      const before = alignOffset(missing, align);
      if (before > 0) pads.push({ line, character: cell.start, text: " ".repeat(before) });
      if (before < missing && cell.closed) pads.push({ line, character: cell.end, text: " ".repeat(missing - before) });
    });
  });
  return { pads, moves };
}

// The text of a row stays in file order, so its cell parts are poured into the grid's slots in reading order,
// each into the next slot wide enough. A move then shifts a part to its own column and line.
// Hints fill the slots and draw the borders. Null when a part does not fit its own column.
function gridRow(cells, widths, aligns, rowLead, line) {
  const pads = [];
  const moves = [];
  const origins = [];
  let x = rowLead;
  for (const width of widths) {
    origins.push(x);
    x += width + 1;
  }
  let slot = 0;
  let slotLine = 0;
  let pending = "";
  const flush = (character) => {
    if (!pending) return;
    const last = pads.at(-1);
    if (last && last.character === character) last.text += pending;
    else pads.push({ line, character, text: pending });
    pending = "";
  };
  const openSlot = () => {
    if (slot === 0 && slotLine > 0) pending += GHOST_PIPE;
  };
  const closeSlot = () => {
    slot++;
    if (slot < widths.length) return;
    slot = 0;
    slotLine++;
  };
  const blankSlot = () => {
    openSlot();
    pending += " ".repeat(widths[slot]) + "|";
    closeSlot();
  };

  let height = 1;
  for (const [col, cell] of cells.entries()) {
    const margin = widths[col] > 2 ? 1 : 0;
    const inner = widths[col] - 2 * margin;
    const wrapped = wrapParts(cell, inner);
    height = Math.max(height, wrapped.length);
    // An empty cell is one part of no width: its spaces and its pipe still take a slot.
    const parts = wrapped.length > 0 ? wrapped : [{ start: cell.end, end: cell.end, width: 0 }];
    let from = cell.start;
    for (const [i, part] of parts.entries()) {
      const last = i === parts.length - 1;
      const spaceBefore = part.start - from;
      const need = spaceBefore + part.width + (last ? cell.end - part.end : 0);
      if (need > widths[col]) return null;
      while (widths[slot] < need) blankSlot();
      openSlot();
      flush(from);
      const dx = origins[col] + margin + alignOffset(inner - part.width, aligns[col]) - (origins[slot] + spaceBefore);
      const dy = i - slotLine;
      if (part.width > 0 && (dx !== 0 || dy !== 0)) moves.push({ line, start: part.start, end: part.end, dx, dy });
      pending = " ".repeat(widths[slot] - need);
      // The pipe that ends the cell is the border of the slot of its last part.
      if (last) flush(cell.end);
      else pending += "|";
      closeSlot();
      from = part.end;
    }
  }
  while (slot !== 0 || slotLine < height) blankSlot();
  flush(cells.at(-1).end + 1);
  return { pads, moves };
}

// Parts of a cell's text, each at most `width` wide, cut between words.
function wrapParts(cell, width) {
  const parts = [];
  let part;
  for (const word of cell.text.matchAll(/\S+/g)) {
    let offset = cell.start + word.index;
    const wordWidth = displayWidth(word[0]);
    if (part && part.width + (offset - part.end) + wordWidth <= width) {
      part.width += offset - part.end + wordWidth;
      part.end = offset + word[0].length;
      continue;
    }
    part = { start: offset, end: offset, width: 0 };
    parts.push(part);
    // A word longer than the column is cut where it reaches the column edge.
    for (const char of word[0]) {
      const charWidth = displayWidth(char);
      if (part.width > 0 && part.width + charWidth > width) {
        part = { start: offset, end: offset, width: 0 };
        parts.push(part);
      }
      part.width += charWidth;
      offset += char.length;
      part.end = offset;
    }
  }
  return parts;
}

function alignOffset(missing, align) {
  if (align === "right") return missing;
  if (align === "center") return Math.floor(missing / 2);
  return 0;
}

// A row under a cursor wraps in place, so each cell starts on the last line of the cell before it.
// Every continuation line ends with the table's right border on the wrap column, then starts with GHOST_PIPE.
// VS Code breaks after "|" before a non-space, and inlay hint spaces render as no-break spaces, so it breaks exactly there.
function wrapCell(cell, line, cellStart, cellEnd, fill, blank, pads) {
  const leading = cell.text.length - cell.text.trimStart().length;
  const limit = cellEnd - 1;
  let x = cellStart + leading;
  const breakAt = (character, gap) => {
    pads.push({ line, character: cell.start + character, text: fill(x) + blank(Math.max(0, leading - gap)) });
    x = cellStart + Math.max(leading, gap);
  };
  const words = [...cell.text.matchAll(/\S+/g)];
  words.forEach((word, i) => {
    if (i > 0) {
      const gapStart = words[i - 1].index + words[i - 1][0].length;
      const gap = word.index - gapStart;
      if (x + gap + displayWidth(word[0]) > limit) breakAt(gapStart, gap);
      else x += gap;
    }
    let offset = word.index;
    for (const char of word[0]) {
      const width = displayWidth(char);
      // A word longer than the column is cut where it reaches the column edge.
      if (x + width > limit && x > cellStart + leading) breakAt(offset, 0);
      x += width;
      offset += char.length;
    }
  });
  return x + cell.text.length - cell.text.trimEnd().length;
}

// A table that fits gets its natural widths. A wider one fills `room` exactly, so every wrapped line ends on the wrap column;
// the widest columns get narrower first, and a column never gets narrower than its header and delimiter cells.
function fitWidths(rows, columns, room, wrapCells) {
  const natural = new Array(columns).fill(0);
  const floor = new Array(columns).fill(0);
  rows.forEach((cells, r) => {
    cells.slice(0, columns).forEach((cell, col) => {
      natural[col] = Math.max(natural[col], cell.width);
      if (r < 2) floor[col] = Math.max(floor[col], cell.width);
    });
  });
  if (sum(natural) <= room) return { widths: natural, wrap: false };
  if (sum(floor) > room) return { widths: floor, wrap: false };

  let cap = Math.max(...natural);
  const capped = () => natural.map((width, col) => Math.max(floor[col], Math.min(width, cap)));
  while (sum(capped()) > room) cap--;
  const widths = capped();
  let left = room - sum(widths);
  for (let col = 0; col < columns && left > 0; col++) {
    if (natural[col] > widths[col]) {
      widths[col]++;
      left--;
    }
  }
  return { widths, wrap: wrapCells };
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
// VS Code also counts a surrogate pair (most emoji) as 2 columns.
const FULL_WIDTH = /[\u2E80-\uD7AF\uF900-\uFAFF\uFF01-\uFF5E]/u;

function displayWidth(text) {
  let width = 0;
  for (const char of text) width += FULL_WIDTH.test(char) || char.length === 2 ? 2 : 1;
  return width;
}

module.exports = { ghostLayout };
