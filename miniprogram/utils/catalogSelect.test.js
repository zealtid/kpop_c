/**
 * Nested album selection + batch own payload.
 * run: node --test miniprogram/utils/catalogSelect.test.js
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const catalogSelect = require("./catalogSelect");

test("mapTemplatesForGrid adds on:false and resolved image URL", () => {
  const mapped = catalogSelect.mapTemplatesForGrid(
    [{ id: "a", isBenefit: true, mainImageUrl: "/img/a.jpg" }],
    (url) => `https://cdn${url}`,
  );
  assert.deepEqual(mapped, [
    { id: "a", isBenefit: true, mainImageUrl: "https://cdn/img/a.jpg", on: false },
  ]);
});

test("toggleSelected works across albums and deselects", () => {
  const releases = [
    { id: "r1", templates: [{ id: "t1", on: false }, { id: "t2", on: false }] },
    { id: "r2", templates: [{ id: "t3", on: false }] },
  ];
  const once = catalogSelect.toggleSelected(releases, "t2");
  assert.equal(once.releases[0].templates[1].on, true);
  assert.deepEqual(once.selected, ["t2"]);

  const twice = catalogSelect.toggleSelected(once.releases, "t3");
  assert.deepEqual(twice.selected, ["t2", "t3"]);

  const off = catalogSelect.toggleSelected(twice.releases, "t2");
  assert.deepEqual(off.selected, ["t3"]);
  assert.equal(off.releases[0].templates[1].on, false);
});

test("toBatchOwnItems matches POST /collection/cards/batch body", () => {
  assert.deepEqual(catalogSelect.toBatchOwnItems(["x", "y"]), [
    { templateId: "x", quantity: 1 },
    { templateId: "y", quantity: 1 },
  ]);
  assert.deepEqual(catalogSelect.toBatchOwnItems([]), []);
});
