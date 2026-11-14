const test = require("node:test");
const assert = require("node:assert/strict");
const { ghostPads } = require("./align");

const pads = (text) => ghostPads(text.split("\n"));

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
  assert.deepEqual(ghostPads(lines, 16), [
    { line: 0, character: 4, text: "   " },
    { line: 1, character: 1, text: "---" },
    { line: 3, character: 4, text: "   " },
  ]);
  const realigned = ["| a | bbbbbbbb |", "|---|---|", "| xxxxx | y |"];
  assert.deepEqual(ghostPads(realigned, 16), [
    { line: 1, character: 5, text: "-------" },
    { line: 2, character: 12, text: "   " },
  ]);
});

test("an overflowing cell wraps inside its column: each break lands its space on the wrap column", () => {
  const lines = ["| k | desc | s |", "|---|---|---|", "| a | one two three four | x |"];
  assert.deepEqual(ghostPads(lines, 20, true), [
    { line: 0, character: 11, text: "    " },
    { line: 1, character: 5, text: "-------" },
    { line: 2, character: 13, text: "  |   " },
    { line: 2, character: 14, text: "    | " },
    { line: 2, character: 19, text: "    |   " },
    { line: 2, character: 20, text: "    | " },
    { line: 2, character: 25, text: "    " },
  ]);
});
