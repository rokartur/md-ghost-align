const test = require("node:test");
const assert = require("node:assert/strict");
const { ghostLayout, wrapColumnBounds, canProbe, shownBreak } = require("./align");

const pads = (text) => ghostLayout(text.split("\n")).pads;

test("pads short cells before the closing pipe and the delimiter row with dashes", () => {
  assert.deepEqual(pads("| a | bbbb |\n|---|---|\n| ccc | d |"), [
    { line: 0, character: 4, text: "  " },
    { line: 1, character: 1, text: "--" },
    { line: 1, character: 5, text: "---" },
    { line: 2, character: 10, text: "   " },
  ]);
});

test("right and center columns pad before the content", () => {
  assert.deepEqual(pads("| a | b |\n|--:|:-:|\n| ccc | ddd |"), [
    { line: 0, character: 1, text: "  " },
    { line: 0, character: 5, text: " " },
    { line: 0, character: 8, text: " " },
    { line: 1, character: 1, text: "--" },
    { line: 1, character: 6, text: "--" },
  ]);
});

test("aligned tables, code fences and escaped pipes", () => {
  assert.deepEqual(pads("| a | b |\n|---|---|\n| c | d |"), []);
  assert.deepEqual(pads("```\n| a | bbbb |\n|---|---|\n```"), []);
  assert.deepEqual(pads("| a\\|b | c |\n|---|---|\n| d | e |"), [
    { line: 1, character: 1, text: "---" },
    { line: 2, character: 4, text: "   " },
  ]);
});

test("unclosed last cell gets no trailing pad", () => {
  assert.deepEqual(pads("a | b\n--|--\nccc | dddd"), [
    { line: 0, character: 2, text: "  " },
    { line: 1, character: 0, text: "--" },
    { line: 1, character: 3, text: "---" },
  ]);
});

test("caps a long column so the header fits the limit, the overflowing row gets realigned by later slack", () => {
  const lines = ["| a | b | c |", "|---|---|---|", "| xxxxxxxxxx | y | z |", "| q | r | s |"];
  assert.deepEqual(ghostLayout(lines, 16).pads, [
    { line: 0, character: 4, text: "   " },
    { line: 1, character: 1, text: "---" },
    { line: 3, character: 4, text: "   " },
  ]);
  const realigned = ["| a | bbbbbbbb |", "|---|---|", "| xxxxx | y |"];
  assert.deepEqual(ghostLayout(realigned, 16).pads, [
    { line: 1, character: 5, text: "-------" },
    { line: 2, character: 12, text: "   " },
  ]);
});

// Port of VS Code's monospace line breaking (monospaceLineBreaksComputer.ts, wrappingIndent "same"),
// fed the line with its inlay hints, whose spaces VS Code renders as no-break spaces.
const BREAK_AFTER = " \t})]?|/&.,;";
const BREAK_BEFORE = "([{+";
const charClass = (c) => (BREAK_AFTER.includes(c) ? "after" : BREAK_BEFORE.includes(c) ? "before" : "none");
const canBreak = (prev, c) =>
  c !== " " && ((charClass(prev) === "after" && charClass(c) !== "after") || (charClass(prev) !== "before" && charClass(c) === "before"));

function wrapLikeVSCode(text, column) {
  const indent = text.match(/^[ \t]*/)[0].length;
  const chars = [...text];
  const widthOf = (c) => (c.length === 2 ? 2 : 1);
  const visual = [];
  let start = 0;
  let breakAt = 0;
  let breakWidth = 0;
  let width = widthOf(chars[0]);
  let limit = column;
  for (let i = 1; i < chars.length; i++) {
    if (canBreak(chars[i - 1], chars[i])) {
      breakAt = i;
      breakWidth = width;
    }
    width += widthOf(chars[i]);
    if (width <= limit) continue;
    if (breakAt === 0 || width - breakWidth > column - indent) {
      breakAt = i;
      breakWidth = width - widthOf(chars[i]);
    }
    visual.push((start ? " ".repeat(indent) : "") + chars.slice(start, breakAt).join(""));
    start = breakAt;
    limit = breakWidth + column - indent;
    breakAt = 0;
  }
  visual.push((start ? " ".repeat(indent) : "") + chars.slice(start).join(""));
  return visual;
}

// What the editor shows: each line with its hints, wrapped, then every move applied. Only for characters 1 column wide.
function screen(lines, column, rawRows, cursorPlaces) {
  const { pads, moves, cursors } = ghostLayout(lines, column, true, rawRows);
  return lines.flatMap((line, i) => {
    const chars = line.split("").map((char, offset) => ({ char, offset }));
    const here = pads.filter((pad) => pad.line === i).sort((a, b) => b.character - a.character);
    for (const pad of here) chars.splice(pad.character, 0, ...[...pad.text.replaceAll(" ", "\u00a0")].map((char) => ({ char })));
    const visual = wrapLikeVSCode(chars.map((c) => c.char).join(""), column);
    const rows = visual.map((row) => [...row.replaceAll("\u00a0", " ")]);
    const indent = line.match(/^[ \t]*/)[0].length;
    const placeOf = new Map();
    let k = 0;
    visual.forEach((row, y) => {
      for (let x = y ? indent : 0; x < row.length; x++) placeOf.set(chars[k++].offset, [y, x]);
    });
    // Measured in VS Code 1.146: a cursor is drawn at the left edge of its character, a moved one included, but on the line
    // the character had before the move. At the offset of a hint it is drawn after the unmoved character before.
    const cursorPlace = (offset) => {
      const shift = cursors.find((c) => c.line === i && c.start <= offset && offset <= c.end) ?? { dx: 0, dy: 0 };
      if (here.some((pad) => pad.character === offset) && offset > 0) {
        const [y, x] = placeOf.get(offset - 1);
        return [y + shift.dy, x + 1 + shift.dx];
      }
      const [y, x] = placeOf.get(offset);
      const drawn = moves.find((move) => move.line === i && move.start <= offset && offset < move.end) ?? { dx: 0 };
      return [y + shift.dy, x + drawn.dx + shift.dx];
    };
    cursorPlaces?.push(line.split("").map((_, offset) => cursorPlace(offset)));
    const moved = moves.filter((move) => move.line === i);
    const offsets = (move) => Array.from({ length: move.end - move.start }, (_, n) => move.start + n);
    for (const move of moved) {
      for (const offset of offsets(move)) {
        const [y, x] = placeOf.get(offset);
        rows[y][x] = " ";
      }
    }
    for (const move of moved) {
      for (const offset of offsets(move)) {
        const [y, x] = placeOf.get(offset);
        assert.equal(rows[y + move.dy][x + move.dx], " ", `${line[offset]} lands on text`);
        rows[y + move.dy][x + move.dx] = line[offset];
      }
    }
    if (moved.length > 0) {
      for (const [offset, char] of [...line].entries()) {
        if (char === " " || char === "|") continue;
        const [y, x] = cursorPlace(offset);
        assert.equal(rows[y][x], char, `cursor at offset ${offset} of ${line}`);
      }
    }
    return rows.map((row) => row.join(""));
  });
}

function render(lines, column, rawRows) {
  assert.deepEqual(ghostLayout(lines, column, true, rawRows).moves, []);
  return screen(lines, column, rawRows);
}

test("a row with a long cell is a grid of its real text: every cell starts on the first line of the row", () => {
  const lines = ["| a | b |", "|---|--:|", "| one two three four | 5 |", "| x | 6 |"];
  assert.deepEqual(screen(lines, 16), [
    "| a        | b |",
    "|----------|--:|",
    "| one two  | 5 |",
    "\u2502 three    |   |",
    "\u2502 four     |   |",
    "| x        | 6 |",
  ]);
  assert.deepEqual(ghostLayout(lines, 16, true).moves, [{ line: 2, start: 23, end: 24, dx: 0, dy: -2 }]);
  const cursorPlaces = [];
  screen(lines, 16, undefined, cursorPlaces);
  const at = (y, from, count) => Array.from({ length: count }, (_, n) => [y, from + n]);
  // "| one two" and the place after it, "three" and after it, "four " and before its pipe, then " 5 " and before its pipe.
  assert.deepEqual(cursorPlaces[2].slice(0, 26), [...at(0, 0, 10), ...at(1, 2, 6), ...at(2, 2, 6), ...at(0, 12, 4)]);
  assert.ok(ghostLayout(lines, 16, true).cursors.every((cursor) => cursor.line === 2));
  const extraCell = [...lines.slice(0, 2), "| one two three four | 5 | not in the header |"];
  assert.deepEqual(ghostLayout(extraCell, 16, true).moves, []);
  const longLastCell = [...lines.slice(0, 2), "| 5 | one two three four |"];
  assert.deepEqual(ghostLayout(longLastCell, 16, true).moves, []);
});

test("grid cells move sideways into their own column, aligned as the delimiter row says", () => {
  const lines = ["| a | b | c | d |", "|---|--:|:-:|---|", "| x | one two three | alpha beta gamma | [z](u) |"];
  assert.deepEqual(screen(lines, 30), [
    "| a |      b |   c   | d     |",
    "|---|-------:|:-----:|-------|",
    "| x |    one | alpha | [z](u |",
    "\u2502   |    two | beta  | )     |",
    "\u2502   |  three | gamma |       |",
  ]);
});

test("a cell whose trailing spaces outgrow its capped column still moves into the grid", () => {
  const lines = ["| a | bbbbbbbbbb |", "|---|---|", "| x          | one two three four |"];
  assert.deepEqual(screen(lines, 25), [
    "| a        | bbbbbbbbbb |",
    "|----------|------------|",
    "| x        | one two    |",
    "\u2502          | three four |",
  ]);
});

test("a row under a selection wraps in place and every column border stays on the grid", () => {
  const lines = [
    "| # | Co| Sklep|Cena |Status| Uwagi |",
    "|---|---|---|---:|---|---|",
    "| 1 | Carlinkit Mini Ultra 3, czarny (GTIN 6972185561017) | [Media Expert](https://www.mediaexpert.pl/telewizory-i-rtv/car-audio/adapter-carlinkit-mini-ultra-3) | 89,00 zł | do kupienia | MFi + Wi-Fi + Bluetooth. LIVI Link wspiera `v821b_aic8800d80`; `livi-link-provision` sprawdza układ. |",
    "| 9 | Płytka z 4 transoptorami PC817 | nie wybrano | około 10 zł (szacunek) | do kupienia | Musi działać z podciągnięciem do 3,3 V 🚗 po stronie Pi. |",
    "| 3 | microSD | nie wybrano | 30 zł | mam | OK |",
  ];
  const cursor = new Set([2, 3, 4]);
  const visual = render(lines, 60, cursor);
  const borders = [...visual[0]].flatMap((c, i) => (c === "|" && i > 0 ? [i] : []));
  assert.equal(visual[0].length, 60);
  assert.ok(visual.length > 20);
  for (const line of visual) {
    assert.equal(line.length, 60, line);
    for (const b of borders) assert.equal(line[b], "|", line);
  }
});

test("a header wider than the limit still aligns every column to its widest cell", () => {
  assert.deepEqual(ghostLayout(["| aaaa | bbbb |", "|---|---|", "| c | dddddd |"], 10).pads, [
    { line: 0, character: 14, text: "  " },
    { line: 1, character: 1, text: "---" },
    { line: 1, character: 5, text: "-----" },
    { line: 2, character: 4, text: "   " },
  ]);
});

test("the line breaks of a prose paragraph bound the wrap column, and a few paragraphs pin it", () => {
  const words = ["a", "to", "the", "wrap", "column", "(note)", "x+y", "path/to/file", "end.", "averyveryverylongword"];
  let seed = 7;
  const random = (n) => (seed = (seed * 48271) % 2147483647) % n;
  let pinned = 0;
  for (let column = 20; column <= 120; column++) {
    let min = 0;
    let max = Infinity;
    for (let n = 0; n < 3; n++) {
      const text = Array.from({ length: 60 }, () => words[random(words.length)]).join(" ");
      let start = 0;
      for (const visual of wrapLikeVSCode(text, column)) {
        const end = start + visual.length;
        const bounds = wrapColumnBounds(text, start, end);
        assert.ok(bounds.min <= column && column <= bounds.max, `${column} outside ${bounds.min}..${bounds.max}`);
        min = Math.max(min, bounds.min);
        max = Math.min(max, bounds.max);
        start = end;
      }
    }
    if (min === max) pinned++;
  }
  assert.ok(pinned > 95, `${pinned} of 101 columns pinned`);
  assert.deepEqual(wrapColumnBounds("short line", 0, 10), { min: 10, max: Infinity });
});

test("a table row bounds the wrap column through its padding, and no row bounds it wrong", () => {
  assert.ok(canProbe("Żółta łódź – próba…") && canProbe("| a | b |"));
  assert.ok(!canProbe("  indented") && !canProbe("emoji 🚗") && !canProbe("a\\|b"));
  const lines = [
    "| # | Co | Sklep | Uwagi |",
    "|---|---|---|---|",
    "| 1 | Carlinkit Mini Ultra 3, czarny (GTIN 6972185561017) | Media Expert | MFi + Wi-Fi + Bluetooth. LIVI Link wspiera v821b; provision sprawdza układ. |",
    "| 9 | Płytka z 4 transoptorami PC817 | nie wybrano | Musi działać z podciągnięciem do 3,3 V po stronie Pi. |",
    "| 3 | microSD | nie wybrano | OK |",
  ];
  const read = { padded: 0, grid: 0 };
  for (let column = 40; column <= 120; column++) {
    for (const state of ["padded", "grid"]) {
      const { pads } = state === "grid" ? ghostLayout(lines, column, true) : ghostLayout(lines, 80);
      lines.forEach((text, line) => {
        const here = pads.filter((pad) => pad.line === line);
        const { shown } = shownBreak(text, here, Infinity);
        const first = wrapLikeVSCode(shown, column)[0];
        if (first.length === shown.length) return;
        // The cursor reports a break as an offset of the real text: the count of real characters before it.
        const real = [...text].map(() => true);
        for (const pad of here.toSorted((a, b) => b.character - a.character)) real.splice(pad.character, 0, ...[...pad.text].map(() => false));
        const offset = real.slice(0, first.length).filter(Boolean).length;
        const { place } = shownBreak(text, here, offset);
        if (place === undefined) return;
        assert.equal(place, first.length, `${state} ${column}: ${text}`);
        const bounds = wrapColumnBounds(shown, 0, place);
        assert.ok(bounds.min <= column && column <= bounds.max, `${state} ${column} outside ${bounds.min}..${bounds.max}`);
        read[state]++;
      });
    }
  }
  assert.ok(read.padded > 200, `${read.padded} padded rows read`);
});

test("a table that fits keeps its natural widths and never wraps", () => {
  const visual = render(["| a | b |", "|---|--:|", "| one two | 3 |"], 60);
  assert.deepEqual(visual, ["| a       | b |", "|---------|--:|", "| one two | 3 |"]);
});
