/**
 * jsfeat subset (BSD): matrix_t + imgproc.grayscale + imgproc.sobel_derivatives.
 * Based on https://github.com/inspirit/jsfeat (Eugene Zatepyakin).
 * Trimmed for WeChat mini-program pack size; API names match jsfeat.
 */
"use strict";

var U8_t = 0x0100;
var S32_t = 0x0400;
var C1_t = 0x01;
var C2_t = 0x02;

function dataType(type) {
  return type & 0xff00;
}

function channelCount(type) {
  return type & 0xff;
}

function matrix_t(c, r, data_type, data_buffer) {
  this.type = dataType(data_type) | 0;
  this.channel = channelCount(data_type) | 0;
  this.cols = c | 0;
  this.rows = r | 0;
  if (typeof data_buffer === "undefined") {
    this.allocate();
  } else {
    this.buffer = data_buffer;
    this.data = data_buffer.data || data_buffer;
  }
}

matrix_t.prototype.allocate = function () {
  var size = (this.cols * this.rows * this.channel) | 0;
  if (this.type === U8_t) this.data = new Uint8Array(size);
  else this.data = new Int32Array(size);
};

function grayscale(src, w, h, dst) {
  var dst_d = dst.data;
  var n = (w * h) | 0;
  for (var i = 0, j = 0; j < n; i += 4, j++) {
    dst_d[j] = (src[i] * 4899 + src[i + 1] * 9617 + src[i + 2] * 1868 + 8192) >> 14;
  }
}

function sobel_derivatives(src, dst) {
  var w = src.cols | 0;
  var h = src.rows | 0;
  var src_d = src.data;
  var dst_d = dst.data;
  var x;
  var y;
  var i;
  var j;
  for (y = 1; y < h - 1; y++) {
    for (x = 1; x < w - 1; x++) {
      i = y * w + x;
      j = i << 1;
      dst_d[j] =
        -src_d[i - w - 1] +
        src_d[i - w + 1] -
        2 * src_d[i - 1] +
        2 * src_d[i + 1] -
        src_d[i + w - 1] +
        src_d[i + w + 1];
      dst_d[j + 1] =
        -src_d[i - w - 1] -
        2 * src_d[i - w] -
        src_d[i - w + 1] +
        src_d[i + w - 1] +
        2 * src_d[i + w] +
        src_d[i + w + 1];
    }
  }
}

var jsfeat = {
  U8_t: U8_t,
  S32_t: S32_t,
  C1_t: C1_t,
  C2_t: C2_t,
  U8C1_t: U8_t | C1_t,
  S32C2_t: S32_t | C2_t,
  matrix_t: matrix_t,
  imgproc: {
    grayscale: grayscale,
    sobel_derivatives: sobel_derivatives,
  },
};

module.exports = jsfeat;
