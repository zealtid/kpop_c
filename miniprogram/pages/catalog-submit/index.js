const api = require("../../utils/api");
const customCard = require("../../utils/customCard");
const crop = require("../../utils/crop");

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

Page({
  data: {
    groups: [],
    groupsEmpty: false,
    groupId: "",
    releases: [],
    releaseId: "",
    members: [],
    memberId: "",
    versionLabel: "",
    slotLabel: "",
    frontPreview: "",
    backPreview: "",
    agreed: false,
    saving: false,
    pageLoading: true,
    warnings: [],
    aspectLabel: crop.CROP_ASPECT_LABEL,
    customCardId: "",
  },
  onLoad(q) {
    this._pickSide = "front";
    this._frontPath = "";
    this._backPath = "";
    const customCardId = (q && q.customCardId) || "";
    const prefill = wx.getStorageSync("ugc_submit_prefill") || {};
    if (q && q.clearPrefill) wx.removeStorageSync("ugc_submit_prefill");
    this.setData({
      customCardId,
      groupId: (q && q.groupId) || prefill.groupId || "",
      releaseId: (q && q.releaseId) || prefill.releaseId || "",
      memberId: (q && q.memberId) || prefill.memberId || "",
      versionLabel: (q && q.versionLabel) || prefill.versionLabel || "",
      slotLabel: (q && q.slotLabel) || prefill.slotLabel || prefill.title || "",
      frontPreview: prefill.frontPreview || "",
    });
    if (prefill.frontPath) this._frontPath = prefill.frontPath;
    this.loadGroups();
    if (this.data.groupId) this.loadGroupExtras(this.data.groupId);
    if (customCardId) this.loadCustom(customCardId);
  },
  onShow() {
    const cropped = crop.consumeCroppedPath();
    if (cropped) {
      if (this._pickSide === "back") {
        this._backPath = cropped;
        this.setData({ backPreview: cropped });
      } else {
        this._frontPath = cropped;
        this.setData({ frontPreview: cropped });
      }
    }
  },
  loadGroups() {
    api
      .request({ url: "/catalog/groups?ugc_open=1", auth: false })
      .then((d) => {
        const groups = d.groups || [];
        this.setData({ groups, groupsEmpty: groups.length === 0, pageLoading: false });
      })
      .catch(() => this.setData({ groups: [], groupsEmpty: true, pageLoading: false }));
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
  loadCustom(id) {
    api.request({ url: `/collection/custom-cards/${id}` }).then((card) => {
      this.setData({
        groupId: card.groupId || this.data.groupId,
        releaseId: card.releaseId || this.data.releaseId,
        memberId: card.memberId || this.data.memberId,
        versionLabel: card.versionLabel || this.data.versionLabel,
        slotLabel: card.title || this.data.slotLabel,
        frontPreview: api.mediaUrl(card.imageFront),
      });
      if (card.groupId) this.loadGroupExtras(card.groupId);
    });
  },
  pickGroup(e) {
    const groupId = e.currentTarget.dataset.id;
    this.setData({ groupId, releaseId: "", memberId: "" });
    this.loadGroupExtras(groupId);
  },
  pickRelease(e) {
    this.setData({ releaseId: e.currentTarget.dataset.id || "" });
  },
  pickMember(e) {
    this.setData({ memberId: e.currentTarget.dataset.id || "" });
  },
  onVersion(e) {
    this.setData({ versionLabel: e.detail.value || "" });
  },
  onSlot(e) {
    this.setData({ slotLabel: e.detail.value || "" });
  },
  toggleAgree() {
    this.setData({ agreed: !this.data.agreed });
  },
  pickFront() {
    this._pickSide = "front";
    this.chooseAndCrop();
  },
  pickBack() {
    this._pickSide = "back";
    this.chooseAndCrop();
  },
  skipBack() {
    this._backPath = "";
    this.setData({ backPreview: "" });
  },
  chooseAndCrop() {
    const done = (filePath) => {
      if (!filePath) return;
      crop.beginSession(filePath);
      wx.navigateTo({ url: "/pages/image-crop/index" });
    };
    if (typeof wx.chooseMedia === "function") {
      wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
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
      success: (res) => {
        const p = res.tempFilePaths && res.tempFilePaths[0];
        if (p) done(p);
      },
    });
  },
  async uploadSide(filePath, side) {
    const b64 = await readBase64(filePath);
    return api.request({
      url: "/media/ugc-pending",
      method: "POST",
      data: { imageBase64: b64, mimeType: "image/jpeg", side },
    });
  },
  submit() {
    if (this.data.saving) return;
    if (!this.data.groupId) {
      wx.showToast({ title: "请选择开放投稿的组合", icon: "none" });
      return;
    }
    if (!this.data.releaseId || !this.data.versionLabel || !this.data.slotLabel) {
      wx.showToast({ title: "请填写专辑、版本和名称", icon: "none" });
      return;
    }
    if (!this.data.agreed) {
      wx.showToast({ title: "请先勾选协议", icon: "none" });
      return;
    }
    this.setData({ saving: true, warnings: [] });
    if (typeof wx.showLoading === "function") wx.showLoading({ title: "提交中", mask: true });
    const hidePending = () => {
      if (typeof wx.hideLoading === "function") wx.hideLoading();
    };
    const finish = (req) => {
      req
        .then((d) => {
          this.setData({ warnings: d.warnings || [] });
          wx.showToast({ title: "已提交待审" });
          setTimeout(() => wx.redirectTo({ url: "/pages/my-submissions/index" }), 400);
        })
        .catch((err) => {
          hidePending();
          this.setData({ saving: false });
          api.handleWriteError(err);
        });
    };
    if (this.data.customCardId) {
      finish(
        api.request({
          url: `/collection/custom-cards/${this.data.customCardId}/apply-catalog`,
          method: "POST",
          data: {
            groupId: this.data.groupId,
            releaseId: this.data.releaseId,
            memberId: this.data.memberId || null,
            versionLabel: this.data.versionLabel,
            slotLabel: this.data.slotLabel,
            agreementAccepted: true,
          },
        }),
      );
      return;
    }
    if (!this._frontPath) {
      hidePending();
      this.setData({ saving: false });
      wx.showToast({ title: "请上传卡面", icon: "none" });
      return;
    }
    this.uploadSide(this._frontPath, "front")
      .then((front) => {
        const warnings = front.warnings || [];
        const body = {
          groupId: this.data.groupId,
          releaseId: this.data.releaseId,
          memberId: this.data.memberId || null,
          versionLabel: this.data.versionLabel,
          slotLabel: this.data.slotLabel,
          imageFront: front.path,
          imageFrontThumb: front.thumbPath,
          agreementAccepted: true,
        };
        const next = this._backPath
          ? this.uploadSide(this._backPath, "back").then((back) => {
              body.imageBack = back.path;
              body.imageBackThumb = back.thumbPath;
              return body;
            })
          : Promise.resolve(body);
        return next.then((payload) =>
          api.request({ url: "/catalog/submissions", method: "POST", data: payload }).then((d) => ({
            ...d,
            warnings: (d.warnings || []).concat(warnings),
          })),
        );
      })
      .then((d) => {
        this.setData({ warnings: d.warnings || [] });
        wx.showToast({ title: "已提交待审" });
        setTimeout(() => wx.redirectTo({ url: "/pages/my-submissions/index" }), 400);
      })
      .catch((err) => {
        hidePending();
        this.setData({ saving: false });
        api.handleWriteError(err);
      });
  },
});
