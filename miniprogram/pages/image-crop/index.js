const crop = require("../../utils/crop");

Page({
  data: {
    src: "",
    aspectLabel: crop.CROP_ASPECT_LABEL,
    frameW: 200,
    frameH: 300,
    tx: 0,
    ty: 0,
    scale: 1,
    minScale: 1,
    imgDrawW: 0,
    imgDrawH: 0,
    outW: crop.OUTPUT_WIDTH,
    outH: crop.outputHeight(),
    busy: false,
  },
  onLoad() {
    const session = crop.getSession();
    if (!session || !session.src) {
      wx.showToast({ title: "请先选择照片", icon: "none" });
      setTimeout(() => wx.navigateBack(), 240);
      return;
    }
    this.setData({ src: session.src, aspectLabel: crop.CROP_ASPECT_LABEL });
    this.initLayout(session.src);
  },
  onUnload() {
    if (!this._confirmed) crop.cancelSession();
  },
  initLayout(src) {
    const sys = wx.getSystemInfoSync();
    const frame = crop.frameSize(sys.windowWidth, sys.windowHeight);
    this.setData({
      frameW: frame.width,
      frameH: frame.height,
      outW: crop.OUTPUT_WIDTH,
      outH: crop.outputHeight(),
    });
    wx.getImageInfo({
      src,
      success: (info) => {
        this._imgW = info.width;
        this._imgH = info.height;
        const t = crop.initialTransform(info.width, info.height, frame.width, frame.height);
        this.setData({
          scale: t.scale,
          minScale: t.scale,
          tx: t.x,
          ty: t.y,
          imgDrawW: info.width * t.scale,
          imgDrawH: info.height * t.scale,
        });
      },
      fail: () => wx.showToast({ title: "图片读取失败", icon: "none" }),
    });
  },
  applyTransform(scale, tx, ty) {
    if (!this._imgW) return;
    const nextScale = crop.clampScale(scale, this.data.minScale);
    const clamped = crop.clampTranslate(
      tx,
      ty,
      nextScale,
      this._imgW,
      this._imgH,
      this.data.frameW,
      this.data.frameH,
    );
    this.setData({
      scale: nextScale,
      tx: clamped.x,
      ty: clamped.y,
      imgDrawW: this._imgW * nextScale,
      imgDrawH: this._imgH * nextScale,
    });
  },
  onTouchStart(e) {
    const t = e.touches || [];
    if (t.length >= 2) {
      this._pinch = { dist: crop.touchDistance(t[0], t[1]), scale: this.data.scale };
      this._last = null;
      return;
    }
    if (t.length === 1) {
      this._last = { x: t[0].clientX, y: t[0].clientY };
      this._pinch = null;
    }
  },
  onTouchMove(e) {
    const t = e.touches || [];
    if (t.length >= 2) {
      const dist = crop.touchDistance(t[0], t[1]);
      const start = this._pinch || { dist, scale: this.data.scale };
      this._pinch = start;
      this.applyTransform(start.scale * (dist / (start.dist || dist)), this.data.tx, this.data.ty);
      return;
    }
    if (t.length === 1 && this._last) {
      const dx = t[0].clientX - this._last.x;
      const dy = t[0].clientY - this._last.y;
      this._last = { x: t[0].clientX, y: t[0].clientY };
      this.applyTransform(this.data.scale, this.data.tx + dx, this.data.ty + dy);
    }
  },
  onTouchEnd() {
    this._last = null;
    this._pinch = null;
  },
  confirm() {
    if (this.data.busy || !this.data.src || !this._imgW) return;
    this.setData({ busy: true });
    const { tx, ty, imgDrawW, imgDrawH, frameW, outW, outH } = this.data;
    const draw = crop.exportDrawArgs(tx, ty, imgDrawW, imgDrawH, frameW, outW);
    const ctx = wx.createCanvasContext("cropCanvas", this);
    ctx.setFillStyle("#111");
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(this.data.src, draw.dx, draw.dy, draw.dWidth, draw.dHeight);
    ctx.draw(false, () => {
      setTimeout(() => {
        wx.canvasToTempFilePath(
          {
            canvasId: "cropCanvas",
            destWidth: outW,
            destHeight: outH,
            fileType: "jpg",
            quality: 0.9,
            success: (res) => {
              this._confirmed = true;
              crop.setCroppedPath(res.tempFilePath);
              this.setData({ busy: false });
              wx.navigateBack();
            },
            fail: () => {
              this.setData({ busy: false });
              wx.showToast({ title: "裁剪失败", icon: "none" });
            },
          },
          this,
        );
      }, 40);
    });
  },
});
