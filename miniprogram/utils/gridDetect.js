/**
 * UGC-2b 4/9 宫格切分：jsfeat 灰度 + Sobel，再做行列投影找格线。
 * 非大模型。boxes 为相对原图 0–1。
 */
const jsfeat = require("../vendor/jsfeat");

const CV_LIBRARY = "jsfeat";
const DETECT_MAX_EDGE = 360;
const MIN_CONFIDENCE = 0.28;
const CARD_ASPECT = 2 / 3;

function gridSide(cells) {
  const n = Number(cells);
  if (n === 9) return 3;
  if (n === 4) return 2;
  return 0;
}

function fitInside(w, h, maxEdge) {
  const mw = Number(w) || 0;
  const mh = Number(h) || 0;
  const max = maxEdge == null ? DETECT_MAX_EDGE : Number(maxEdge);
  const long = Math.max(mw, mh);
  if (!mw || !mh || !(max > 0) || long <= max) {
    return { width: mw, height: mh, scale: 1 };
  }
  const scale = max / long;
  return {
    width: Math.max(8, Math.round(mw * scale)),
    height: Math.max(8, Math.round(mh * scale)),
    scale,
  };
}

function smooth1d(arr, radius) {
  const r = Math.max(1, radius | 0);
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    let s = 0;
    let n = 0;
    for (let k = -r; k <= r; k++) {
      const j = i + k;
      if (j >= 0 && j < arr.length) {
        s += arr[j];
        n++;
      }
    }
    out[i] = n ? s / n : 0;
  }
  return out;
}

function maxOf(arr) {
  let m = 0;
  for (let i = 0; i < arr.length; i++) if (arr[i] > m) m = arr[i];
  return m;
}

function contentSpan(energy, ratio) {
  const max = maxOf(energy);
  const t = max * (ratio == null ? 0.12 : ratio);
  let a = 0;
  let b = energy.length - 1;
  while (a < b && energy[a] < t) a++;
  while (b > a && energy[b] < t) b--;
  const pad = Math.max(1, Math.round((b - a) * 0.01));
  return { a: Math.max(0, a - pad), b: Math.min(energy.length - 1, b + pad), max };
}

function findLines(energy, a, b, n) {
  const span = Math.max(1, b - a);
  const lines = [a];
  const peaks = [];
  const window = Math.max(3, Math.round(span * 0.1));
  for (let i = 1; i < n; i++) {
    const guess = a + Math.round((span * i) / n);
    let best = guess;
    let bestV = -1;
    const lo = Math.max(a + 2, guess - window);
    const hi = Math.min(b - 2, guess + window);
    for (let x = lo; x <= hi; x++) {
      if (energy[x] > bestV) {
        bestV = energy[x];
        best = x;
      }
    }
    lines.push(best);
    peaks.push(bestV);
  }
  lines.push(b);
  return { lines, peaks };
}

function spacingRegular(lines) {
  if (lines.length < 3) return 0;
  const gaps = [];
  for (let i = 1; i < lines.length; i++) gaps.push(Math.max(1, lines[i] - lines[i - 1]));
  const mean = gaps.reduce((s, v) => s + v, 0) / gaps.length;
  let acc = 0;
  for (const g of gaps) acc += (g - mean) * (g - mean);
  const cv = Math.sqrt(acc / gaps.length) / mean;
  return Math.max(0, 1 - cv);
}

function boxesFromLines(xs, ys, width, height) {
  const boxes = [];
  const cols = xs.length - 1;
  const rows = ys.length - 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = xs[c];
      const x1 = xs[c + 1];
      const y0 = ys[r];
      const y1 = ys[r + 1];
      const insetX = Math.max(1, Math.round((x1 - x0) * 0.03));
      const insetY = Math.max(1, Math.round((y1 - y0) * 0.03));
      const x = (x0 + insetX) / width;
      const y = (y0 + insetY) / height;
      const w = (x1 - x0 - insetX * 2) / width;
      const h = (y1 - y0 - insetY * 2) / height;
      boxes.push({
        x: Math.max(0, x),
        y: Math.max(0, y),
        w: Math.max(0.04, w),
        h: Math.max(0.04, h),
        index: r * cols + c,
      });
    }
  }
  return boxes;
}

function equalLines(a, b, n) {
  const lines = [];
  for (let i = 0; i <= n; i++) lines.push(a + Math.round(((b - a) * i) / n));
  return lines;
}

function meanPeakRatio(peaks, max) {
  if (!peaks.length || !(max > 0)) return 0;
  let s = 0;
  for (const p of peaks) s += p / max;
  return s / peaks.length;
}

function aspectScore(box) {
  if (!box.w || !box.h) return 0;
  const a = box.w / box.h;
  const d = Math.abs(Math.log(a / CARD_ASPECT));
  return Math.max(0, 1 - d);
}

/**
 * @param {Uint8Array|Float32Array} gray
 * @param {number} width
 * @param {number} height
 * @param {4|9} cells
 */
function detectGridFromGray(gray, width, height, cells) {
  const n = gridSide(cells);
  if (!n || !width || !height || !gray || gray.length < width * height) {
    return { ok: false, reason: "bad_input", boxes: [], confidence: 0, library: CV_LIBRARY, method: "jsfeat-sobel-projection" };
  }
  const src = new jsfeat.matrix_t(width, height, jsfeat.U8C1_t);
  src.data.set(gray.subarray(0, width * height));
  const deriv = new jsfeat.matrix_t(width, height, jsfeat.S32C2_t);
  jsfeat.imgproc.sobel_derivatives(src, deriv);
  const col = new Float32Array(width);
  const row = new Float32Array(height);
  const d = deriv.data;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const j = (y * width + x) << 1;
      col[x] += Math.abs(d[j]);
      row[y] += Math.abs(d[j + 1]);
    }
  }
  return detectFromProjections(col, row, width, height, n);
}

function detectGridFromRgba(rgba, width, height, cells) {
  const n = gridSide(cells);
  if (!n || !width || !height || !rgba) {
    return { ok: false, reason: "bad_input", boxes: [], confidence: 0, library: CV_LIBRARY, method: "jsfeat-sobel-projection" };
  }
  const gray = new jsfeat.matrix_t(width, height, jsfeat.U8C1_t);
  jsfeat.imgproc.grayscale(rgba, width, height, gray);
  const deriv = new jsfeat.matrix_t(width, height, jsfeat.S32C2_t);
  jsfeat.imgproc.sobel_derivatives(gray, deriv);
  const col = new Float32Array(width);
  const row = new Float32Array(height);
  const d = deriv.data;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const j = (y * width + x) << 1;
      col[x] += Math.abs(d[j]);
      row[y] += Math.abs(d[j + 1]);
    }
  }
  return detectFromProjections(col, row, width, height, n);
}

function detectFromProjections(col, row, width, height, n) {
  const colS = smooth1d(col, Math.max(1, Math.round(width / 80)));
  const rowS = smooth1d(row, Math.max(1, Math.round(height / 80)));
  const xs = contentSpan(colS, 0.1);
  const ys = contentSpan(rowS, 0.1);
  const cover = ((xs.b - xs.a) / width) * ((ys.b - ys.a) / height);
  if (cover < 0.18 || xs.max < 8 || ys.max < 8) {
    return { ok: false, reason: "not_grid", boxes: [], confidence: 0, library: CV_LIBRARY, method: "jsfeat-sobel-projection" };
  }
  const v = findLines(colS, xs.a, xs.b, n);
  const h = findLines(rowS, ys.a, ys.b, n);
  const peak = (meanPeakRatio(v.peaks, xs.max) + meanPeakRatio(h.peaks, ys.max)) / 2;
  const regular = (spacingRegular(v.lines) + spacingRegular(h.lines)) / 2;
  let linesX = v.lines;
  let linesY = h.lines;
  let method = "jsfeat-sobel-projection";
  let confidence = Math.min(1, peak * 0.65 + regular * 0.35);
  if (peak < 0.22 || regular < 0.55) {
    linesX = equalLines(xs.a, xs.b, n);
    linesY = equalLines(ys.a, ys.b, n);
    method = "jsfeat-bbox-equal";
    confidence = Math.max(0.3, Math.min(0.45, cover));
  }
  const boxes = boxesFromLines(linesX, linesY, width, height);
  const asp = boxes.length ? boxes.reduce((s, b) => s + aspectScore(b), 0) / boxes.length : 0;
  if (asp < 0.35 && peak < 0.2) {
    return { ok: false, reason: "scattered_or_single", boxes: [], confidence: confidence * asp, library: CV_LIBRARY, method };
  }
  confidence = Math.min(1, confidence * 0.75 + asp * 0.25);
  if (confidence < MIN_CONFIDENCE || boxes.length !== n * n) {
    return { ok: false, reason: "low_confidence", boxes, confidence, library: CV_LIBRARY, method };
  }
  return { ok: true, boxes, confidence, library: CV_LIBRARY, method, cells: n * n };
}

function clamp01(v) {
  const n = Number(v);
  if (!(n >= 0)) return 0;
  if (n > 1) return 1;
  return n;
}

function clampBox(box) {
  const x = clamp01(box.x);
  const y = clamp01(box.y);
  const w = Math.max(0.06, Math.min(1 - x, Number(box.w) || 0.06));
  const h = Math.max(0.06, Math.min(1 - y, Number(box.h) || 0.06));
  return { ...box, x, y, w, h };
}

function nextRotation(deg) {
  return (Number(deg) + 90) % 360;
}

function overlayBoxes(boxes, displayW, displayH) {
  const dw = Number(displayW) || 0;
  const dh = Number(displayH) || 0;
  return (boxes || []).map((b, i) => ({
    ...b,
    index: b.index == null ? i : b.index,
    left: Math.round(b.x * dw),
    top: Math.round(b.y * dh),
    width: Math.round(b.w * dw),
    height: Math.round(b.h * dh),
    n: i + 1,
  }));
}

function applyEdgeDelta(box, edge, dxN, dyN) {
  const b = clampBox(box);
  if (edge === "w") {
    const nx = clamp01(b.x + dxN);
    b.w = Math.max(0.06, b.x + b.w - nx);
    b.x = nx;
  } else if (edge === "e") {
    b.w = Math.max(0.06, b.w + dxN);
  } else if (edge === "n") {
    const ny = clamp01(b.y + dyN);
    b.h = Math.max(0.06, b.y + b.h - ny);
    b.y = ny;
  } else if (edge === "s") {
    b.h = Math.max(0.06, b.h + dyN);
  }
  return clampBox(b);
}

function pixelBox(box, imgW, imgH) {
  const b = clampBox(box);
  return {
    sx: Math.max(0, Math.round(b.x * imgW)),
    sy: Math.max(0, Math.round(b.y * imgH)),
    sw: Math.max(8, Math.round(b.w * imgW)),
    sh: Math.max(8, Math.round(b.h * imgH)),
  };
}

module.exports = {
  CV_LIBRARY,
  DETECT_MAX_EDGE,
  MIN_CONFIDENCE,
  CARD_ASPECT,
  gridSide,
  fitInside,
  detectGridFromGray,
  detectGridFromRgba,
  detectFromProjections,
  clampBox,
  nextRotation,
  overlayBoxes,
  applyEdgeDelta,
  pixelBox,
};
