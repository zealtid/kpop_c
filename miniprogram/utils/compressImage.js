/**
 * 投稿 / 加卡上传：裁切后压到 ≤150KB（#13）。
 * 纯函数可单测；真正压图走 wx.compressImage。
 */

const MAX_UPLOAD_BYTES = 150 * 1024;
const QUALITY_STEPS = [80, 68, 56, 46, 38];
const WIDTH_STEPS = [900, 720, 600, 480, 400];

function needsCompress(size) {
  return Number(size) > MAX_UPLOAD_BYTES;
}

function nextCompressArgs(attempt) {
  const i = Math.max(0, Number(attempt) || 0);
  return {
    quality: QUALITY_STEPS[Math.min(i, QUALITY_STEPS.length - 1)],
    compressedWidth: WIDTH_STEPS[Math.min(i, WIDTH_STEPS.length - 1)],
  };
}

function getFileSize(filePath) {
  return new Promise((resolve) => {
    if (!filePath || typeof wx === "undefined" || typeof wx.getFileInfo !== "function") {
      resolve(0);
      return;
    }
    wx.getFileInfo({
      filePath,
      success: (res) => resolve(Number(res.size) || 0),
      fail: () => resolve(0),
    });
  });
}

function wxCompress(src, args) {
  return new Promise((resolve, reject) => {
    if (typeof wx === "undefined" || typeof wx.compressImage !== "function") {
      resolve(src);
      return;
    }
    wx.compressImage({
      src,
      quality: args.quality,
      compressedWidth: args.compressedWidth,
      success: (res) => resolve(res.tempFilePath || src),
      fail: (err) => reject(err || { message: "compress failed" }),
    });
  });
}

/**
 * 循环降质量 / 边长，直到 ≤150KB 或用尽步数。失败则返回原路径。
 */
function compressToLimit(filePath, maxBytes) {
  const limit = maxBytes == null ? MAX_UPLOAD_BYTES : Number(maxBytes);
  const src = filePath || "";
  if (!src) return Promise.resolve("");
  const loop = (path, attempt) =>
    getFileSize(path).then((size) => {
      if (size > 0 && size <= limit) return path;
      if (attempt >= QUALITY_STEPS.length) return path;
      return wxCompress(path, nextCompressArgs(attempt))
        .then((next) => {
          if (!next || next === path) return path;
          return loop(next, attempt + 1);
        })
        .catch(() => path);
    });
  return loop(src, 0);
}

module.exports = {
  MAX_UPLOAD_BYTES,
  QUALITY_STEPS,
  WIDTH_STEPS,
  needsCompress,
  nextCompressArgs,
  compressToLimit,
};
