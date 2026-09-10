/**
 * 卡面裁剪：固定 2:3 竖图（比例只在这一处配置）。
 * 坐标系：裁剪框左上角为 (0,0)，预览图以 scale 绘制在 (tx, ty)。
 * 大图仅降采样预览；导出尺寸只在确认时按 OUTPUT_WIDTH 生成。
 */

const CROP_ASPECT_W = 2;
const CROP_ASPECT_H = 3;
/** width / height，竖图小卡 */
const CROP_ASPECT = CROP_ASPECT_W / CROP_ASPECT_H;
const CROP_ASPECT_LABEL = "2:3";
const OUTPUT_WIDTH = 900;
const MAX_SCALE_FACTOR = 4;
/** 预览长边上限，避免主线程解码超大图卡顿 */
const PREVIEW_MAX_EDGE = 1280;
/** 边缘阻尼特征长度（px） */
const EDGE_DAMP_RANGE = 80;

let session = null;

function outputHeight(width) {
  const w = width == null ? OUTPUT_WIDTH : Number(width);
  return Math.round(w / CROP_ASPECT);
}

function frameSize(windowWidth, windowHeight) {
  let width = Math.round(Number(windowWidth) * 0.72);
  let height = Math.round(width / CROP_ASPECT);
  const maxH = Math.round(Number(windowHeight) * 0.58);
  if (height > maxH && maxH > 0) {
    height = maxH;
    width = Math.round(height * CROP_ASPECT);
  }
  return { width, height };
}

function coverScale(imgW, imgH, frameW, frameH) {
  return Math.max(frameW / imgW, frameH / imgH);
}

function initialTransform(imgW, imgH, frameW, frameH) {
  const scale = coverScale(imgW, imgH, frameW, frameH);
  return {
    scale,
    x: (frameW - imgW * scale) / 2,
    y: (frameH - imgH * scale) / 2,
  };
}

function translateLimits(scale, imgW, imgH, frameW, frameH) {
  const sw = imgW * scale;
  const sh = imgH * scale;
  return {
    minX: frameW - sw,
    maxX: 0,
    minY: frameH - sh,
    maxY: 0,
  };
}

function clampTranslate(tx, ty, scale, imgW, imgH, frameW, frameH) {
  const lim = translateLimits(scale, imgW, imgH, frameW, frameH);
  const maxX = Math.max(lim.minX, lim.maxX);
  const minX = Math.min(lim.minX, lim.maxX);
  const maxY = Math.max(lim.minY, lim.maxY);
  const minY = Math.min(lim.minY, lim.maxY);
  return {
    x: Math.min(maxX, Math.max(minX, tx)),
    y: Math.min(maxY, Math.max(minY, ty)),
  };
}

function clampScale(scale, minScale) {
  const maxScale = minScale * MAX_SCALE_FACTOR;
  return Math.max(minScale, Math.min(maxScale, scale));
}

/** 橡皮筋：越界越多，增量越小 */
function rubberDelta(over, range) {
  const k = range == null ? EDGE_DAMP_RANGE : Number(range);
  const o = Math.max(0, Number(over) || 0);
  if (!(k > 0)) return 0;
  return (o * k) / (o + k);
}

function rubberAxis(value, min, max, range) {
  if (max < min) return (min + max) / 2;
  if (value > max) return max + rubberDelta(value - max, range);
  if (value < min) return min - rubberDelta(min - value, range);
  return value;
}

/** 拖动中的边缘阻尼；松手后应再用 clampTranslate 回弹 */
function dampTranslate(tx, ty, scale, imgW, imgH, frameW, frameH, range) {
  const lim = translateLimits(scale, imgW, imgH, frameW, frameH);
  return {
    x: rubberAxis(tx, lim.minX, lim.maxX, range),
    y: rubberAxis(ty, lim.minY, lim.maxY, range),
  };
}

function dampScale(scale, minScale, range) {
  const maxScale = minScale * MAX_SCALE_FACTOR;
  const k = range == null ? minScale * 0.35 : Number(range);
  if (scale > maxScale) return maxScale + rubberDelta(scale - maxScale, k);
  if (scale < minScale) return Math.max(minScale * 0.85, minScale - rubberDelta(minScale - scale, k));
  return scale;
}

function previewSize(imgW, imgH, maxEdge) {
  const max = maxEdge == null ? PREVIEW_MAX_EDGE : Number(maxEdge);
  const w = Number(imgW) || 0;
  const h = Number(imgH) || 0;
  const long = Math.max(w, h);
  if (!w || !h || !(max > 0) || long <= max) {
    return { width: w, height: h, scale: 1, downsampled: false };
  }
  const scale = max / long;
  return {
    width: Math.round(w * scale),
    height: Math.round(h * scale),
    scale,
    downsampled: true,
  };
}

function touchDistance(a, b) {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

/** 把框内绘制参数映射到导出画布（仅确认时调用） */
function exportDrawArgs(tx, ty, imgDrawW, imgDrawH, frameW, outW) {
  const k = outW / frameW;
  return {
    dx: tx * k,
    dy: ty * k,
    dWidth: imgDrawW * k,
    dHeight: imgDrawH * k,
  };
}

function beginSession(src) {
  const path = src || "";
  session = { src: path, origSrc: path, previewSrc: "", croppedPath: "" };
  return session;
}

function getSession() {
  return session;
}

function setPreviewSrc(path) {
  if (!session) return;
  session.previewSrc = path || "";
}

function setCroppedPath(path) {
  if (!session) session = { src: "", origSrc: "", previewSrc: "", croppedPath: path || "" };
  else session.croppedPath = path || "";
}

function consumeCroppedPath() {
  if (!session || !session.croppedPath) return "";
  const path = session.croppedPath;
  session.croppedPath = "";
  return path;
}

function peekOriginal() {
  return session ? session.origSrc || session.src || "" : "";
}

function cancelSession() {
  session = null;
}

module.exports = {
  CROP_ASPECT,
  CROP_ASPECT_W,
  CROP_ASPECT_H,
  CROP_ASPECT_LABEL,
  OUTPUT_WIDTH,
  MAX_SCALE_FACTOR,
  PREVIEW_MAX_EDGE,
  EDGE_DAMP_RANGE,
  outputHeight,
  frameSize,
  coverScale,
  initialTransform,
  translateLimits,
  clampTranslate,
  clampScale,
  rubberDelta,
  dampTranslate,
  dampScale,
  previewSize,
  touchDistance,
  exportDrawArgs,
  beginSession,
  getSession,
  setPreviewSrc,
  setCroppedPath,
  consumeCroppedPath,
  peekOriginal,
  cancelSession,
};
