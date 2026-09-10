const crop = require("../../utils/crop");

Page({
  data: {
    src: "",
    aspectLabel: crop.CROP_ASPECT_LABEL,
    aspectLocked: true,
    frameW: 200,
    frameH: 300,
    tx: 0,
    ty: 0,
    scale: 1,
    minScale: 1,
    imgNatW: 0,
    imgNatH: 0,
    outW: crop.OUTPUT_WIDTH,
    outH: crop.outputHeight(),
    busy: false,
    preparing: false,
  },
  onLoad() {
    const session = crop.getSession();
    if (!session || !session.src) {
      wx.showToast({ title: "请先选择照片", icon: "none" });
      setTimeout(() => wx.navigateBack(), 240);
      return;
    }
    this._origSrc = session.origSrc || session.src;
    this.setData({
      src: session.src,
      aspectLabel: crop.CROP_ASPECT_LABEL,
      aspectLocked: true,
    });
    this.initLayout(session.src);
  },
  onUnload() {
    // 未确认时保留原图会话，便于返回后重新裁剪；不丢弃已确认预览
  },
  initLayout(src) {
    const sys = wx.getSystemInfoSync();
    const frame = crop.frameSize(sys.windowWidth, sys.windowHeight);
    this.setData({
      frameW: frame.width,
      frameH: frame.height,
      outW: crop.OUTPUT_WIDTH,
      outH: crop.outputHeight(),
      preparing: true,
    });
    wx.getImageInfo({
      src,
      success: (info) => {
        this.preparePreview(src, info.width, info.height, frame);
      },
      fail: () => {
        this.setData({ preparing: false });
        wx.showToast({ title: "图片读取失败", icon: "none" });
      },
    });
  },
  preparePreview(src, imgW, imgH, frame) {
    const sized = crop.previewSize(imgW, imgH);
    const apply = (previewSrc, prevW, prevH) => {
      this._imgW = prevW;
      this._imgH = prevH;
      this._origW = imgW;
      this._origH = imgH;
      if (previewSrc !== src) crop.setPreviewSrc(previewSrc);
      const t = crop.initialTransform(prevW, prevH, frame.width, frame.height);
      this.setData({
        src: previewSrc,
        preparing: false,
        scale: t.scale,
        minScale: t.scale,
        tx: t.x,
        ty: t.y,
        imgNatW: prevW,
        imgNatH: prevH,
      });
    };
    if (!sized.downsampled) {
      apply(src, imgW, imgH);
      return;
    }
    if (typeof wx.compressImage === "function") {
      wx.compressImage({
        src,
        compressedWidth: sized.width,
        quality: 0.75,
        success: (res) => apply(res.tempFilePath || src, sized.width, sized.height),
        fail: () => apply(src, imgW, imgH),
      });
      return;
    }
    apply(src, imgW, imgH);
  },
  applyTransform(scale, tx, ty, live) {
    if (!this._imgW) return;
    const nextScale = live ? crop.dampScale(scale, this.data.minScale) : crop.clampScale(scale, this.data.minScale);
    const pos = live
      ? crop.dampTranslate(tx, ty, nextScale, this._imgW, this._imgH, this.data.frameW, this.data.frameH)
      : crop.clampTranslate(tx, ty, nextScale, this._imgW, this._imgH, this.data.frameW, this.data.frameH);
    this.setData({
      scale: nextScale,
      tx: pos.x,
      ty: pos.y,
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
      this.applyTransform(start.scale * (dist / (start.dist || dist)), this.data.tx, this.data.ty, true);
      return;
    }
    if (t.length === 1 && this._last) {
      const dx = t[0].clientX - this._last.x;
      const dy = t[0].clientY - this._last.y;
      this._last = { x: t[0].clientX, y: t[0].clientY };
      this.applyTransform(this.data.scale, this.data.tx + dx, this.data.ty + dy, true);
    }
  },
  onTouchEnd() {
    this._last = null;
    this._pinch = null;
    this.applyTransform(this.data.scale, this.data.tx, this.data.ty, false);
  },
  confirm() {
    if (this.data.busy || this.data.preparing || !this.data.src || !this._imgW) return;
    this.applyTransform(this.data.scale, this.data.tx, this.data.ty, false);
    this.setData({ busy: true });
    const { tx, ty, scale, imgNatW, imgNatH, frameW, outW, outH } = this.data;
    const imgDrawW = imgNatW * scale;
    const imgDrawH = imgNatH * scale;
    const draw = crop.exportDrawArgs(tx, ty, imgDrawW, imgDrawH, frameW, outW);
    const exportSrc = this._origSrc || this.data.src;
    const ctx = wx.createCanvasContext("cropCanvas", this);
    ctx.setFillStyle("#111");
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(exportSrc, draw.dx, draw.dy, draw.dWidth, draw.dHeight);
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
