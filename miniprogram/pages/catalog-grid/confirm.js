const api = require("../../utils/api");
const customCard = require("../../utils/customCard");
const channelPick = require("../../utils/channelPick");
const compressImage = require("../../utils/compressImage");
const crop = require("../../utils/crop");
const gridDetect = require("../../utils/gridDetect");
const gridSession = require("../../utils/gridSession");

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

function statusLabel(status) {
  if (status === "own") return "已匹配入册";
  if (status === "submit") return "已提交待审";
  if (status === "error") return "失败";
  if (status === "uploading") return "上传中";
  if (status === "cropping") return "裁切中";
  return "等待";
}

Page({
  data: {
    src: "",
    groups: [],
    groupsEmpty: false,
    groupId: "",
    releases: [],
    releaseId: "",
    members: [],
    versionLabel: "",
    agreed: false,
    saving: false,
    warnings: [],
    overlays: [],
    selected: null,
    displayW: 300,
    displayH: 450,
    outW: crop.OUTPUT_WIDTH,
    outH: crop.outputHeight(),
    channelQ: "",
    channelHits: [],
    channelOptions: [],
    progress: [],
    progressText: "",
    cvNote: "",
  },
  onLoad() {
    const sess = gridSession.get();
    if (!sess || !sess.src || !sess.boxes || !sess.boxes.length) {
      wx.showToast({ title: "切分结果丢失，改单卡", icon: "none" });
      gridSession.degradeToUgc1(wx, "");
      return;
    }
    const sys = wx.getSystemInfoSync();
    const displayW = Math.max(200, Math.round(sys.windowWidth - 64 * (sys.windowWidth / 750)));
    const ratio = sess.origH && sess.origW ? sess.origH / sess.origW : 1.5;
    const displayH = Math.round(displayW * ratio);
    this._boxes = sess.boxes.map((b) => ({ ...b }));
    this.data.displayW = displayW;
    this.data.displayH = displayH;
    this.setData({
      src: sess.src,
      displayW,
      displayH,
      groupId: sess.groupId || "",
      releaseId: sess.releaseId || "",
      versionLabel: sess.versionLabel || "",
      cvNote: sess.fromServer
        ? `服务端回退切分 · ${sess.library}`
        : `客户端 ${sess.library} 切分`,
    });
    this.syncOverlays();
    this.loadGroups();
    this.loadChannels();
    if (this.data.groupId) this.loadGroupExtras(this.data.groupId);
  },
  syncOverlays(selectIndex) {
    const live = this._boxes.filter((b) => !b.deleted);
    const overlays = gridDetect.overlayBoxes(live, this.data.displayW, this.data.displayH).map((o, i) => ({
      ...o,
      n: i + 1,
      selected: selectIndex != null ? o.index === selectIndex : i === 0,
    }));
    const selectedBox = live.find((b) =>
      selectIndex != null ? b.index === selectIndex : b.index === (overlays[0] && overlays[0].index),
    );
    const ov = selectedBox ? overlays.find((o) => o.index === selectedBox.index) : null;
    const selected = selectedBox ? { ...selectedBox, n: ov ? ov.n : 1 } : null;
    this.setData({ overlays, selected, channelQ: selected ? selected.channelLabel || "" : "" });
    this.refreshChannelHits();
  },
  patchSelected(patch) {
    const sel = this.data.selected;
    if (!sel) return;
    this._boxes = this._boxes.map((b) => (b.index === sel.index ? { ...b, ...patch } : b));
    gridSession.setBoxes(this._boxes);
    this.syncOverlays(sel.index);
  },
  loadGroups() {
    api
      .request({ url: "/catalog/groups?ugc_open=1", auth: false })
      .then((d) => {
        const groups = d.groups || [];
        this.setData({ groups, groupsEmpty: groups.length === 0 });
      })
      .catch(() => this.setData({ groups: [], groupsEmpty: true }));
  },
  refreshChannelHits() {
    const hits = channelPick.filterOptions(this.data.channelOptions, this.data.channelQ);
    this.setData({ channelHits: hits });
  },
  loadChannels() {
    api
      .request({ url: "/catalog/channels", auth: false })
      .then((d) => {
        this._dictChannels = channelPick.mapChannels(d.channels);
        this.setData({ channelOptions: this._dictChannels });
        this.refreshChannelHits();
        if (this.data.releaseId) this.loadBenefits(this.data.releaseId);
      })
      .catch(() => {
        this._dictChannels = [];
        this.setData({ channelOptions: [] });
        this.refreshChannelHits();
      });
  },
  loadBenefits(releaseId) {
    if (!releaseId) {
      this.setData({ channelOptions: this._dictChannels || [] });
      this.refreshChannelHits();
      return;
    }
    api
      .request({ url: `/catalog/releases/${releaseId}/benefit-matrix`, auth: false })
      .then((d) => {
        const benefits = channelPick.mapBenefitRows(d.rows);
        this.setData({ channelOptions: channelPick.mergeOptions(this._dictChannels || [], benefits) });
        this.refreshChannelHits();
      })
      .catch(() => this.refreshChannelHits());
  },
  loadGroupExtras(groupId) {
    api.request({ url: `/catalog/groups/${groupId}/releases`, auth: false }).then((d) => {
      const releases = (d.releases || []).map(customCard.mapCatalogRelease).filter(Boolean);
      this.setData({ releases });
    });
    api.request({ url: `/catalog/groups/${groupId}/members`, auth: false }).then((d) => {
      const members = (d.members || []).map(customCard.mapCatalogMember).filter(Boolean);
      this.setData({ members });
    });
  },
  pickGroup(e) {
    const groupId = e.currentTarget.dataset.id;
    this.setData({ groupId, releaseId: "" });
    gridSession.setMeta({ groupId, releaseId: "" });
    this.loadGroupExtras(groupId);
    this.loadBenefits("");
  },
  pickRelease(e) {
    const releaseId = e.currentTarget.dataset.id || "";
    this.setData({ releaseId });
    gridSession.setMeta({ releaseId });
    this.loadBenefits(releaseId);
  },
  onVersion(e) {
    const versionLabel = e.detail.value || "";
    this.setData({ versionLabel });
    gridSession.setMeta({ versionLabel });
  },
  selectCard(e) {
    this.syncOverlays(Number(e.currentTarget.dataset.index));
  },
  pickMember(e) {
    this.patchSelected({ memberId: e.currentTarget.dataset.id || "" });
  },
  onSlot(e) {
    this.patchSelected({ slotLabel: e.detail.value || "" });
  },
  onChannelQ(e) {
    this.setData({ channelQ: e.detail.value || "" });
    this.refreshChannelHits();
  },
  pickChannel(e) {
    const value = e.currentTarget.dataset.value || "";
    const label = e.currentTarget.dataset.label || "";
    const other = channelPick.isOther(value);
    this.patchSelected({
      channelValue: value,
      channelLabel: other ? channelPick.OTHER_LABEL : label,
      channelOther: other,
      channelCustom: other ? (this.data.selected && this.data.selected.channelCustom) || "" : "",
    });
  },
  onChannelCustom(e) {
    this.patchSelected({ channelCustom: e.detail.value || "" });
  },
  rotateSelected() {
    const sel = this.data.selected;
    if (!sel) return;
    this.patchSelected({ rotation: gridDetect.nextRotation(sel.rotation) });
  },
  deleteSelected() {
    const sel = this.data.selected;
    if (!sel) return;
    const live = this._boxes.filter((b) => !b.deleted);
    if (live.length <= 1) {
      wx.showToast({ title: "至少留一张，或改单卡", icon: "none" });
      return;
    }
    this._boxes = this._boxes.map((b) => (b.index === sel.index ? { ...b, deleted: true } : b));
    gridSession.setBoxes(this._boxes);
    const next = this._boxes.find((b) => !b.deleted);
    this.syncOverlays(next ? next.index : 0);
  },
  toggleAgree() {
    if (this.data.saving) return;
    this.setData({ agreed: !this.data.agreed });
  },
  onHandleStart(e) {
    const t = e.touches && e.touches[0];
    if (!t) return;
    const index = Number(e.currentTarget.dataset.index);
    const box = this._boxes.find((b) => b.index === index);
    if (!box) return;
    this._drag = {
      edge: e.currentTarget.dataset.edge,
      index,
      x: t.clientX,
      y: t.clientY,
      box: { ...box },
    };
    this.syncOverlays(index);
  },
  onHandleMove(e) {
    const drag = this._drag;
    const t = e.touches && e.touches[0];
    if (!drag || !t || !this.data.displayW) return;
    const dxN = (t.clientX - drag.x) / this.data.displayW;
    const dyN = (t.clientY - drag.y) / this.data.displayH;
    const next = gridDetect.applyEdgeDelta(drag.box, drag.edge, dxN, dyN);
    this._boxes = this._boxes.map((b) => (b.index === drag.index ? { ...b, ...next } : b));
    this.syncOverlays(drag.index);
  },
  onHandleEnd() {
    this._drag = null;
    gridSession.setBoxes(this._boxes);
  },
  degrade() {
    const sess = gridSession.get();
    gridSession.degradeToUgc1(wx, sess && sess.src, {
      groupId: this.data.groupId,
      releaseId: this.data.releaseId,
      versionLabel: this.data.versionLabel,
    });
  },
  cropCard(box) {
    const sess = gridSession.get();
    const page = this;
    const rot = box.rotation || 0;
    const px = gridDetect.pixelBox(box, sess.origW, sess.origH);
    const cardW = crop.OUTPUT_WIDTH;
    const cardH = crop.outputHeight();
    const landscape = rot === 90 || rot === 270;
    const outW = landscape ? cardH : cardW;
    const outH = landscape ? cardW : cardH;
    this.setData({ outW, outH });
    return new Promise((resolve, reject) => {
      const ctx = wx.createCanvasContext("cropCanvas", page);
      ctx.setFillStyle("#111");
      ctx.fillRect(0, 0, outW, outH);
      if (rot) {
        ctx.translate(outW / 2, outH / 2);
        ctx.rotate((rot * Math.PI) / 180);
        ctx.drawImage(sess.src, px.sx, px.sy, px.sw, px.sh, -cardW / 2, -cardH / 2, cardW, cardH);
      } else {
        ctx.drawImage(sess.src, px.sx, px.sy, px.sw, px.sh, 0, 0, outW, outH);
      }
      ctx.draw(false, () => {
        setTimeout(() => {
          wx.canvasToTempFilePath(
            {
              canvasId: "cropCanvas",
              destWidth: outW,
              destHeight: outH,
              fileType: "jpg",
              quality: 0.9,
              success: (res) => resolve(res.tempFilePath),
              fail: () => reject({ message: "裁切失败" }),
            },
            page,
          );
        }, 40);
      });
    });
  },
  uploadFront(filePath) {
    return compressImage.compressToLimit(filePath).then((path) =>
      readBase64(path || filePath).then((b64) =>
        api.request({
          url: "/media/ugc-pending",
          method: "POST",
          data: { imageBase64: b64, mimeType: "image/jpeg", side: "front" },
        }),
      ),
    );
  },
  submit() {
    if (this.data.saving) return;
    const cards = this._boxes.filter((b) => !b.deleted);
    if (!cards.length) {
      wx.showToast({ title: "请至少保留一张", icon: "none" });
      return;
    }
    if (!this.data.groupId) {
      wx.showToast({ title: "请选择开放投稿的组合", icon: "none" });
      return;
    }
    if (!this.data.releaseId || !this.data.versionLabel) {
      wx.showToast({ title: "请填写专辑和版本", icon: "none" });
      return;
    }
    if (!this.data.agreed) {
      wx.showToast({ title: "请先勾选协议", icon: "none" });
      return;
    }
    const progress = cards.map((c, i) => ({
      index: c.index,
      title: c.slotLabel || `宫格${i + 1}`,
      status: "wait",
      statusLabel: "等待",
    }));
    this.setData({
      saving: true,
      warnings: [],
      progress,
      progressText: `0 / ${cards.length}`,
    });
    const run = async () => {
      let owns = 0;
      let submits = 0;
      let fails = 0;
      const warnings = [];
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        progress[i].status = "cropping";
        progress[i].statusLabel = statusLabel("cropping");
        this.setData({ progress: progress.slice(), progressText: `${i + 1} / ${cards.length}` });
        try {
          const cropped = await this.cropCard(card);
          progress[i].status = "uploading";
          progress[i].statusLabel = statusLabel("uploading");
          this.setData({ progress: progress.slice() });
          const front = await this.uploadFront(cropped);
          const slotLabel = card.slotLabel || `宫格${i + 1}`;
          const res = await api.request({
            url: "/catalog/submissions",
            method: "POST",
            data: {
              groupId: this.data.groupId,
              releaseId: this.data.releaseId,
              memberId: card.memberId || null,
              versionLabel: this.data.versionLabel,
              slotLabel,
              channelCode: channelPick.resolveChannelCode(card.channelValue, card.channelCustom),
              imageFront: front.path,
              imageFrontThumb: front.thumbPath,
              agreementAccepted: true,
              matchOwnIfDuplicate: true,
              source: "grid_page",
            },
          });
          (res.warnings || []).forEach((w) => warnings.push(w));
          if (res.mode === "own") {
            owns += 1;
            progress[i].status = "own";
            progress[i].statusLabel = statusLabel("own");
          } else {
            submits += 1;
            progress[i].status = "submit";
            progress[i].statusLabel = statusLabel("submit");
          }
        } catch (err) {
          fails += 1;
          progress[i].status = "error";
          progress[i].statusLabel = (err && err.message) || statusLabel("error");
        }
        this.setData({ progress: progress.slice(), warnings });
      }
      this.setData({
        progressText: `待审 ${submits} · 匹配入册 ${owns} · 失败 ${fails}`,
        saving: true,
      });
      const title = fails === cards.length ? "全部失败" : "入册完成";
      wx.showModal({
        title,
        content: `待审 ${submits} 张，已匹配入册 ${owns} 张，失败 ${fails} 张。未审不会公开。`,
        showCancel: fails === cards.length,
        cancelText: "改单卡",
        confirmText: fails === cards.length ? "留下" : "查看投稿",
        success: (r) => {
          if (fails === cards.length && r.cancel) {
            this.setData({ saving: false });
            this.degrade();
            return;
          }
          if (fails === cards.length) {
            this.setData({ saving: false });
            return;
          }
          // 结束宫格确认：redirectTo 替换当前页，禁止 reLaunch
          wx.redirectTo({ url: "/pages/my-submissions/index" });
        },
      });
    };
    run().catch((err) => {
      this.setData({ saving: false });
      api.handleWriteError(err);
    });
  },
});
