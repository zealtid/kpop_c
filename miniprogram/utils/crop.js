/**
 * M1.5.1 卡面裁剪：固定 2:3 竖图，比例只在这一处配置。
 * 坐标系：裁剪框左上角为 (0,0)，图片以 scale 绘制在 (tx, ty)。
 */

const CROP_ASPECT_W = 2;
const CROP_ASPECT_H = 3;
/** width / height，竖图小卡 */
const CROP_ASPECT = CROP_ASPECT_W / CROP_ASPECT_H;
const CROP_ASPECT_LABEL = "2:3";
const OUTPUT_WIDTH = 900;
const MAX_SCALE_FACTOR = 4;

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

function clampTranslate(tx, ty, scale, imgW, imgH, frameW, frameH) {
  const sw = imgW * scale;
  const sh = imgH * scale;
  return {
    x: Math.min(0, Math.max(frameW - sw, tx)),
    y: Math.min(0, Math.max(frameH - sh, ty)),
  };
}

function clampScale(scale, minScale) {
  const maxScale = minScale * MAX_SCALE_FACTOR;
  return Math.max(minScale, Math.min(maxScale, scale));
}

function touchDistance(a, b) {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

/** 把框内绘制参数映射到导出画布 */
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
  session = { src: src || "", croppedPath: "" };
  return session;
}

function getSession() {
  return session;
}

function setCroppedPath(path) {
  if (!session) session = { src: "", croppedPath: path || "" };
  else session.croppedPath = path || "";
}

function consumeCroppedPath() {
  if (!session || !session.croppedPath) return "";
  const path = session.croppedPath;
  session = null;
  return path;
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
  outputHeight,
  frameSize,
  coverScale,
  initialTransform,
  clampTranslate,
  clampScale,
  touchDistance,
  exportDrawArgs,
  beginSession,
  getSession,
  setCroppedPath,
  consumeCroppedPath,
  cancelSession,
};
