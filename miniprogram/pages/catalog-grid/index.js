const api = require("../../utils/api");
const gridDetect = require("../../utils/gridDetect");
const gridSession = require("../../utils/gridSession");
const compressImage = require("../../utils/compressImage");
const nav = require("../../utils/navigate");

function readBase64(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: "base64",
      success: (res) => resolve(res.data),
      fail: () => reject({ message: "读取图片失败" }),
    });
  });
}

function getImageInfo(src) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src,
      success: resolve,
      fail: () => reject({ message: "图片读取失败" }),
    });
  });
}

Page({
  data: {
    cells: 4,
    preview: "",
    busy: false,
    busyText: "",
    failHint: "",
    canvasW: 320,
    canvasH: 320,
  },
  onLoad() {
    this._src = "";
  },
  pickCells(e) {
    const cells = Number(e.currentTarget.dataset.cells) === 9 ? 9 : 4;
    this.setData({ cells });
  },
  pickAlbum() {
    this.choose(["album"]);
  },
  pickCamera() {
    this.choose(["camera"]);
  },
  choose(sourceType) {
    if (this.data.busy) return;
    const done = (filePath) => {
      if (!filePath) return;
      this._src = filePath;
      this.setData({ preview: filePath, failHint: "" });
      this.split(filePath);
    };
    if (typeof wx.chooseMedia === "function") {
      wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType,
        sizeType: ["compressed"],
        success: (res) => {
          const f = res.tempFiles && res.tempFiles[0];
          if (f && f.tempFilePath) done(f.tempFilePath);
        },
      });
      return;
    }
    wx.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType,
      success: (res) => {
        const p = res.tempFilePaths && res.tempFilePaths[0];
        if (p) done(p);
      },
    });
  },
  split(src) {
    this.setData({ busy: true, busyText: "正在切分宫格…", failHint: "" });
    getImageInfo(src)
      .then((info) => {
        this._origW = info.width;
        this._origH = info.height;
        const sized = gridDetect.fitInside(info.width, info.height);
        this.setData({ canvasW: sized.width, canvasH: sized.height });
        return new Promise((resolve) => {
          setTimeout(() => {
            this.detectOnCanvas(src, sized.width, sized.height).then(resolve);
          }, 50);
        });
      })
      .then((result) => {
        if (result && result.ok) {
          this.openConfirm(result, false);
          return null;
        }
        this.setData({ busyText: "改用服务端切分…" });
        return this.serverSplit(src);
      })
      .then((server) => {
        if (!server) return;
        if (server.ok) {
          this.openConfirm(server, true);
          return;
        }
        this.degrade("没有识别成四宫/九宫，已改为单卡投稿");
      })
      .catch(() => {
        this.degrade("切分失败，已改为单卡投稿");
      });
  },
  detectOnCanvas(src, w, h) {
    const page = this;
    return new Promise((resolve) => {
      const ctx = wx.createCanvasContext("detectCanvas", page);
      ctx.drawImage(src, 0, 0, w, h);
      ctx.draw(false, () => {
        setTimeout(() => {
          wx.canvasGetImageData(
            {
              canvasId: "detectCanvas",
              x: 0,
              y: 0,
              width: w,
              height: h,
              success: (res) => {
                try {
                  resolve(gridDetect.detectGridFromRgba(res.data, w, h, page.data.cells));
                } catch (e) {
                  resolve({ ok: false, reason: "cv_throw" });
                }
              },
              fail: () => resolve({ ok: false, reason: "canvas_pixels" }),
            },
            page,
          );
        }, 40);
      });
    });
  },
  serverSplit(src) {
    return compressImage
      .compressToLimit(src)
      .then((path) => readBase64(path || src))
      .then((b64) =>
        api.request({
          url: "/catalog/grid/split",
          method: "POST",
          data: { imageBase64: b64, mimeType: "image/jpeg", cells: this.data.cells },
        }),
      )
      .catch(() => ({ ok: false }));
  },
  openConfirm(result, fromServer) {
    gridSession.begin({
      src: this._src,
      origW: this._origW,
      origH: this._origH,
      cells: this.data.cells,
      boxes: result.boxes,
      library: result.library,
      method: result.method,
      confidence: result.confidence,
      fromServer,
    });
    this.setData({ busy: false, busyText: "" });
    nav.navigateTo({ url: "/pages/catalog-grid/confirm" });
  },
  degrade(message) {
    this.setData({ busy: false, busyText: "", failHint: message || "切分失败" });
    wx.showToast({ title: "改为单卡投稿", icon: "none" });
    setTimeout(() => {
      gridSession.degradeToUgc1(wx, this._src || this.data.preview);
    }, 280);
  },
});
