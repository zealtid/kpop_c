const api = require("../../utils/api");
const gridDetect = require("../../utils/gridDetect");
const gridSession = require("../../utils/gridSession");
const compressImage = require("../../utils/compressImage");

const VLM_REQUEST_TIMEOUT = 25000;

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
    visionConsent: false,
    advancedOpen: false,
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
  toggleConsent() {
    if (this.data.busy) return;
    this.setData({ visionConsent: !this.data.visionConsent, failHint: "" });
  },
  toggleAdvanced() {
    if (this.data.busy) return;
    this.setData({ advancedOpen: !this.data.advancedOpen });
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
    if (!this.data.advancedOpen && !this.data.visionConsent) {
      wx.showToast({ title: "请先勾选视觉识别说明", icon: "none" });
      return;
    }
    const done = (filePath) => {
      if (!filePath) return;
      this._src = filePath;
      this.setData({ preview: filePath, failHint: "" });
      if (this.data.advancedOpen) this.splitCv(filePath);
      else this.splitVlm(filePath);
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
  splitVlm(src) {
    this.setData({ busy: true, busyText: "识别中…", failHint: "" });
    getImageInfo(src)
      .then((info) => {
        this._origW = info.width;
        this._origH = info.height;
        return this.serverSplit(src, { engine: "vlm", visionConsent: true });
      })
      .then((server) => {
        if (server && server.ok && server.boxes && server.boxes.length) {
          this.openConfirm(server, true);
          return;
        }
        this.degrade((server && (server.message || server.reason)) || "没有识别到小卡，已改为单卡投稿");
      })
      .catch((err) => {
        if (err && (err.code === "GRID_VLM_QUOTA" || err.status === 429)) {
          this.setData({
            busy: false,
            busyText: "",
            failHint: "今日识别次数已用完，请稍后再试，或改用手动规则宫格",
          });
          wx.showToast({ title: "今日次数已用完", icon: "none" });
          return;
        }
        this.degrade((err && err.message) || "识别失败，已改为单卡投稿");
      });
  },
  splitCv(src) {
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
        return this.serverSplit(src, { engine: "jsfeat", cells: this.data.cells });
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
  serverSplit(src, extra) {
    const payload = extra || {};
    return compressImage
      .compressToLimit(src)
      .then((path) => readBase64(path || src))
      .then((b64) =>
        api.request({
          url: "/catalog/grid/split",
          method: "POST",
          timeout: payload.engine === "vlm" ? VLM_REQUEST_TIMEOUT : 20000,
          data: {
            imageBase64: b64,
            mimeType: "image/jpeg",
            engine: payload.engine,
            visionConsent: payload.visionConsent,
            cells: payload.cells,
          },
        }),
      );
  },
  openConfirm(result, fromServer) {
    const boxes = (result.boxes || []).map((b) => ({
      ...b,
      suggestedMemberName: b.suggestedMemberName || b.memberName || "",
    }));
    const suggestions = result.suggestions || {};
    gridSession.begin({
      src: this._src,
      origW: this._origW,
      origH: this._origH,
      cells: result.cells || boxes.length,
      boxes,
      library: result.library,
      method: result.method,
      confidence: result.confidence,
      fromServer,
      engine: result.engine || (fromServer ? "vlm" : "jsfeat"),
      detectedCount: result.detectedCount || boxes.length,
      suggestedVersionLabel: suggestions.versionLabel || "",
    });
    this.setData({ busy: false, busyText: "" });
    wx.navigateTo({ url: "/pages/catalog-grid/confirm" });
  },
  degrade(message) {
    const text = message || "切分失败";
    this.setData({ busy: false, busyText: "", failHint: text });
    wx.showToast({ title: "改为单卡投稿", icon: "none" });
    setTimeout(() => {
      gridSession.degradeToUgc1(wx, this._src || this.data.preview);
    }, 280);
  },
});
