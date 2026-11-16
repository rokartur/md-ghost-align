const test = require("node:test");
const assert = require("node:assert/strict");
const { ghostLayout } = require("./align");

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
function screen(lines, column, rawRows) {
  const { pads, moves } = ghostLayout(lines, column, true, rawRows);
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

test("a row under a cursor wraps in place and every column border stays on the grid", () => {
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

test("a table that fits keeps its natural widths and never wraps", () => {
  const visual = render(["| a | b |", "|---|--:|", "| one two | 3 |"], 60);
  assert.deepEqual(visual, ["| a       | b |", "|---------|--:|", "| one two | 3 |"]);
});
