const DELIMITER_ROW = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const FENCE = /^\s*(```|~~~)/;
// Stands in for the leading pipe of a wrapped line: VS Code does not break a line between two pipes.
const GHOST_PIPE = "\u2502";
// The ASCII part of VS Code's editor.wordWrapBreakAfterCharacters and wordWrapBreakBeforeCharacters, hidden options.
const BREAK_AFTER = " \t})]?|/&.,;";
const BREAK_BEFORE = "([{+";

// `pads` are virtual text to insert. `moves` shift real text by `dx` columns and `dy` lines on screen.
// `cursors` shift a cursor between offsets `start` and `end` of a line, on top of where VS Code draws it, to the moved text.
// `rawRows` are the lines whose text stays where the editor puts it (the rows under a selection).
function ghostLayout(lines, maxWidth = Infinity, wrapCells = false, rawRows = new Set()) {
  const pads = [];
  const moves = [];
  const cursors = [];
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
    cursors.push(...table.cursors);
    i = end - 1;
  }
  return { pads, moves, cursors };
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
  const cursors = [];
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
        cursors.push(...grid.cursors);
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
  return { pads, moves, cursors };
}

// The text of a row stays in file order, so its cell parts are poured into the grid's slots in reading order,
// each into the next slot wide enough. A move then shifts a part to its own column and line.
// Hints fill the slots and draw the borders. Null when a part does not fit any slot.
function gridRow(cells, widths, aligns, rowLead, line) {
  const pads = [];
  const moves = [];
  const cursors = [];
  const shiftCursor = (offset, dx, dy) => {
    if (dx === 0 && dy === 0) return;
    const last = cursors.at(-1);
    if (last && last.end === offset - 1 && last.dx === dx && last.dy === dy) last.end = offset;
    else cursors.push({ line, start: offset, end: offset, dx, dy });
  };
  // Where VS Code draws a cursor that is at the offset of a hint: after the character before, as if nothing was moved.
  let beforeHint = { x: 0, y: 0 };
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
    if (!pending) return false;
    const last = pads.at(-1);
    if (last && last.character === character) last.text += pending;
    else pads.push({ line, character, text: pending });
    pending = "";
    return true;
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

  const widest = Math.max(...widths);
  let height = 1;
  for (const [col, cell] of cells.entries()) {
    const margin = widths[col] > 2 ? 1 : 0;
    const inner = widths[col] - 2 * margin;
    const wrapped = wrapParts(cell, inner);
    height = Math.max(height, wrapped.length);
    // An empty cell is one part of no width: its spaces and its pipe still take a slot.
    const parts = wrapped.length > 0 ? wrapped : [{ start: cell.end, end: cell.end, width: 0 }];
    let from = cell.start;
    let homeEnd = 0;
    for (const [i, part] of parts.entries()) {
      const last = i === parts.length - 1;
      const spaceBefore = part.start - from;
      const need = spaceBefore + part.width + (last ? cell.end - part.end : 0);
      // Spaces around a part may not fit its own column; they stay in a wider slot while the move takes the text home.
      if (need > widest) return null;
      while (widths[slot] < need) blankSlot();
      openSlot();
      const hinted = flush(from);
      const slotX = origins[slot];
      const home = origins[col] + margin + alignOffset(inner - part.width, aligns[col]);
      const dx = home - (slotX + spaceBefore);
      const dy = i - slotLine;
      if (part.width > 0 && (dx !== 0 || dy !== 0)) moves.push({ line, start: part.start, end: part.end, dx, dy });
      for (let offset = from; offset <= (last ? cell.end : part.end - 1); offset++) {
        // The spaces before a part: those that begin the cell go with its text, those at a line break stay after the part before.
        let shift = i === 0 ? { dx, dy } : { dx: homeEnd - slotX, dy: dy - 1 };
        // VS Code reads the place of a cursor from the drawn text, so on moved text it is off by `dy` only.
        if (offset >= part.start) shift = offset < part.end ? { dx: 0, dy } : { dx, dy };
        if (offset === from && hinted) {
          const wanted = from < part.start ? { x: slotX + shift.dx, y: slotLine + shift.dy } : { x: home, y: i };
          shift = { dx: wanted.x - beforeHint.x, dy: wanted.y - beforeHint.y };
        }
        shiftCursor(offset, shift.dx, shift.dy);
      }
      beforeHint = { x: last ? slotX + widths[slot] + 1 : slotX + need, y: slotLine };
      homeEnd = home + part.width;
      pending = " ".repeat(widths[slot] - need);
      // The pipe that ends the cell is the border of the slot of its last part.
      if (last) flush(cell.end);
      else pending += "|";
      closeSlot();
      from = part.end;
    }
  }
  while (slot !== 0 || slotLine < height) blankSlot();
  // A cursor at the end of the line goes to the end of the first line of the row.
  flush(cells.at(-1).end + 1);
  shiftCursor(cells.at(-1).end + 1, x - beforeHint.x, -beforeHint.y);
  return { pads, moves, cursors };
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

// A row under a selection wraps in place, so each cell starts on the last line of the cell before it.
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
  // The header cannot fit, so no column is capped: capped columns would only push every long cell off the grid.
  if (sum(floor) > room) return { widths: natural, wrap: false };

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

// What VS Code's own break of `text` says about its wrap column: a visual line runs from offset `start` to `end`.
// Only for text `canProbe` accepts. Rules from monospaceLineBreaksComputer: spaces do not hang past the column,
// and a line breaks at its last break opportunity, or at the column when it has none.
function wrapColumnBounds(text, start, end) {
  if (end >= text.length) return { min: text.length - start, max: Infinity };
  if (!canBreak(text, end)) return { min: end - start, max: end - start };
  let next = end + 1;
  while (next < text.length && !canBreak(text, next)) next++;
  // Had the text up to the next opportunity fit, the line would break there.
  return { min: end - start, max: next - 1 - start };
}

function canBreak(text, i) {
  return (
    text[i] !== " " &&
    ((BREAK_AFTER.includes(text[i - 1]) && !BREAK_AFTER.includes(text[i])) ||
      (!BREAK_BEFORE.includes(text[i - 1]) && BREAK_BEFORE.includes(text[i])))
  );
}

// Lines `wrapColumnBounds` can read: no indentation, and only characters 1 column wide that break by the ASCII rules.
// shortcut: ASCII, Latin letters and dashes only, so a line with typographic quotes, CJK or emoji is skipped; add their break classes when such documents fail to measure.
const PROBE_LINE = /^[!-~\u00C0-\u024F][ -~\u00C0-\u024F\u2013\u2014\u2026]*$/;

function canProbe(text) {
  return PROBE_LINE.test(text) && !text.includes("\\");
}

// `shown` is a line as VS Code wraps it: its hints (`pads`) in place, their spaces as the no-break spaces VS Code draws.
// `place` is where in `shown` a break at `offset` of the real text is; undefined when the hints there can hold it at more than one place.
function shownBreak(text, pads, offset) {
  let shown = "";
  let from = 0;
  let to = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === offset) from = shown.length;
    for (const pad of pads) {
      if (pad.character === i) shown += pad.text.replaceAll(" ", "\u00a0");
    }
    if (i === offset) to = shown.length;
    shown += text[i] ?? "";
  }
  if (offset >= text.length) return { shown, place: shown.length };
  if (from === to) return { shown, place: from };
  const places = [];
  for (let i = from; i <= to; i++) {
    if (canBreak(shown, i)) places.push(i);
  }
  return { shown, place: places.length === 1 ? places[0] : undefined };
}

module.exports = { ghostLayout, wrapColumnBounds, canProbe, shownBreak };
