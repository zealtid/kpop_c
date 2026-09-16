/**
 * Nested album selection + batch own payload.
 * run: node --test miniprogram/utils/catalogSelect.test.js
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const catalogSelect = require("./catalogSelect");

test("mapTemplatesForGrid adds on:false, versionChip and resolved image URL", () => {
  const mapped = catalogSelect.mapTemplatesForGrid(
    [{ id: "a", isBenefit: true, mainImageUrl: "/img/a.jpg" }],
    (url) => `https://cdn${url}`,
  );
  assert.deepEqual(mapped, [
    {
      id: "a",
      isBenefit: true,
      mainImageUrl: "https://cdn/img/a.jpg",
      versionChip: "特典",
      on: false,
    },
  ]);
});

test("versionChipLabel combines 特典 with version once", () => {
  assert.equal(catalogSelect.versionChipLabel({ isBenefit: true, version: "Apple Music" }), "特典-Apple Music");
  assert.equal(catalogSelect.versionChipLabel({ isBenefit: true, version: "特典-JP" }), "特典-JP");
  assert.equal(catalogSelect.versionChipLabel({ isBenefit: true }), "特典");
  assert.equal(catalogSelect.versionChipLabel({ isBenefit: false, version: "Lemon Beach" }), "Lemon Beach");
});

test("withAlbumExpanded defaults first album open and remembers last", () => {
  const releases = [{ id: "r1" }, { id: "r2" }, { id: "r3" }];
  const first = catalogSelect.withAlbumExpanded(releases, []);
  assert.deepEqual(
    first.map((r) => r.expanded),
    [true, false, false],
  );
  const remembered = catalogSelect.withAlbumExpanded(releases, [
    { id: "r1", expanded: false },
    { id: "r2", expanded: true },
  ]);
  assert.deepEqual(
    remembered.map((r) => r.expanded),
    [false, true, false],
  );
});

test("toggleAlbumExpanded flips one album", () => {
  const next = catalogSelect.toggleAlbumExpanded(
    [
      { id: "r1", expanded: true },
      { id: "r2", expanded: false },
    ],
    "r2",
  );
  assert.equal(next[0].expanded, true);
  assert.equal(next[1].expanded, true);
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

test("clearSelected turns off all tiles", () => {
  const releases = [{ id: "r1", templates: [{ id: "t1", on: true }, { id: "t2", on: true }] }];
  const cleared = catalogSelect.clearSelected(releases);
  assert.deepEqual(cleared.selected, []);
  assert.equal(cleared.releases[0].templates[0].on, false);
  assert.equal(cleared.releases[0].templates[1].on, false);
});
