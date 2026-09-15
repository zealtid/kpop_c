/**
 * run: node --test miniprogram/utils/compressImage.test.js
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const compress = require("./compressImage");

test("150KB cap and quality/width steps", () => {
  assert.equal(compress.MAX_UPLOAD_BYTES, 150 * 1024);
  assert.equal(compress.needsCompress(150 * 1024), false);
  assert.equal(compress.needsCompress(150 * 1024 + 1), true);
  assert.deepEqual(compress.nextCompressArgs(0), { quality: 80, compressedWidth: 900 });
  assert.deepEqual(compress.nextCompressArgs(2), { quality: 56, compressedWidth: 600 });
  assert.equal(compress.nextCompressArgs(99).quality, 38);
});
