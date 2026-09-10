const api = require("../../utils/api");
const cardCondition = require("../../utils/cardCondition");
const customCard = require("../../utils/customCard");
const crop = require("../../utils/crop");

Page({
  data: {
    preview: "",
    title: "",
    note: "",
    quantity: 1,
    condition: "",
    conditions: cardCondition.CONDITIONS,
    groups: [],
    groupId: "",
    members: [],
    memberId: "",
    showMembers: false,
    membersEmpty: false,
    releases: [],
    visibleReleases: [],
    releaseId: "",
    releaseQ: "",
    showReleases: false,
    releasesEmpty: false,
    benefitName: "",
    versionLabel: "",
    saving: false,
    aspectLabel: crop.CROP_ASPECT_LABEL,
  },
  onLoad(q) {
    if (q && q.groupId) {
      this.setData({ groupId: q.groupId });
      this.loadMembers(q.groupId);
    }
  },
  onShow() {
    this.loadGroups();
    const cropped = crop.consumeCroppedPath();
    if (cropped) {
      this._filePath = cropped;
      this._cropped = true;
      this._origPath = this._origPath || crop.peekOriginal();
      this.setData({ preview: cropped });
    }
  },
  loadGroups() {
    api
      .request({ url: "/catalog/groups", auth: false })
      .then((data) => this.setData({ groups: data.groups || [] }))
      .catch(() => {});
  },
  loadMembers(groupId) {
    if (!groupId) {
      this.setData({
        members: [],
        showMembers: false,
        membersEmpty: false,
        memberId: "",
        releases: [],
        visibleReleases: [],
        showReleases: false,
        releasesEmpty: false,
        releaseId: "",
        releaseQ: "",
      });
      return;
    }
    api
      .request({ url: `/catalog/groups/${groupId}/members`, auth: false })
      .then((data) => {
        if (this.data.groupId !== groupId) return;
        const members = (data.members || []).map(customCard.mapCatalogMember).filter(Boolean);
        const memberId = customCard.nextMemberIdOnGroupChange(this.data.memberId, members);
        this.setData({
          members,
          showMembers: true,
          membersEmpty: members.length === 0,
          memberId,
        });
      })
      .catch(() => {
        if (this.data.groupId !== groupId) return;
        this.setData({ members: [], showMembers: true, membersEmpty: true, memberId: "" });
      });
    this.loadReleases(groupId);
  },
  loadReleases(groupId) {
    if (!groupId) {
      this.setData({
        releases: [],
        visibleReleases: [],
        showReleases: false,
        releasesEmpty: false,
        releaseId: "",
        releaseQ: "",
      });
      return;
    }
    api
      .request({ url: `/catalog/groups/${groupId}/releases`, auth: false })
      .then((data) => {
        if (this.data.groupId !== groupId) return;
        const releases = (data.releases || []).map(customCard.mapCatalogRelease).filter(Boolean);
        const releaseId = customCard.nextReleaseIdOnGroupChange(this.data.releaseId, releases);
        this.setData({
          releases,
          visibleReleases: customCard.filterReleases(releases, this.data.releaseQ),
          showReleases: true,
          releasesEmpty: releases.length === 0,
          releaseId,
        });
      })
      .catch(() => {
        if (this.data.groupId !== groupId) return;
        this.setData({
          releases: [],
          visibleReleases: [],
          showReleases: true,
          releasesEmpty: true,
          releaseId: "",
        });
      });
  },
  pickAlbum() {
    this.chooseAndCrop(["album"]);
  },
  pickCamera() {
    this.chooseAndCrop(["camera"]);
  },
  pickImage() {
    this.chooseAndCrop(["album", "camera"]);
  },
  chooseAndCrop(sourceType) {
    const done = (filePath) => {
      if (!filePath) return;
      this._origPath = filePath;
      crop.beginSession(filePath);
      wx.navigateTo({ url: "/pages/image-crop/index" });
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
  onTitle(e) {
    this.setData({ title: e.detail.value || "" });
  },
  onNote(e) {
    this.setData({ note: e.detail.value || "" });
  },
  pickGroup(e) {
    const groupId = e.currentTarget.dataset.id || "";
    if (groupId === this.data.groupId) return;
    this.setData({ groupId, memberId: "", releaseId: "", releaseQ: "" });
    this.loadMembers(groupId);
  },
  pickMember(e) {
    this.setData({ memberId: e.currentTarget.dataset.id || "" });
  },
  pickRelease(e) {
    this.setData({ releaseId: e.currentTarget.dataset.id || "" });
  },
  onReleaseSearch(e) {
    const releaseQ = e.detail.value || "";
    this.setData({
      releaseQ,
      visibleReleases: customCard.filterReleases(this.data.releases, releaseQ),
    });
  },
  onBenefitName(e) {
    this.setData({ benefitName: e.detail.value || "" });
  },
  onVersionLabel(e) {
    this.setData({ versionLabel: e.detail.value || "" });
  },
  recrop() {
    const orig = this._origPath || crop.peekOriginal();
    if (!orig) {
      wx.showToast({ title: "请先选择照片", icon: "none" });
      return;
    }
    crop.beginSession(orig);
    wx.navigateTo({ url: "/pages/image-crop/index" });
  },
  pickCondition(e) {
    this.setData({ condition: e.currentTarget.dataset.value || "" });
  },
  decQty() {
    this.setData({ quantity: cardCondition.clampQuantity(this.data.quantity - 1) });
  },
  incQty() {
    this.setData({ quantity: cardCondition.clampQuantity(this.data.quantity + 1) });
  },
  save() {
    if (this.data.saving) return;
    const filePath = this._filePath;
    if (!this._cropped || !filePath) {
      wx.showToast({ title: "请先裁剪照片", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: "base64",
      success: (res) => {
        api
          .request({
            url: "/collection/custom-cards",
            method: "POST",
            data: {
              imageFrontBase64: res.data,
              mimeType: "image/jpeg",
              title: this.data.title,
              note: this.data.note,
              quantity: this.data.quantity,
              condition: this.data.condition || null,
              groupId: this.data.groupId || null,
              memberId: this.data.memberId || null,
              releaseId: this.data.releaseId || null,
              benefitName: this.data.benefitName || null,
              versionLabel: this.data.versionLabel || null,
            },
          })
          .then(() => {
            this.setData({ saving: false });
            wx.showToast({ title: `已加入${customCard.CUSTOM_BADGE}` });
            setTimeout(() => wx.navigateBack(), 400);
          })
          .catch((err) => {
            this.setData({ saving: false });
            api.handleWriteError(err);
          });
      },
      fail: () => {
        this.setData({ saving: false });
        wx.showToast({ title: "读取图片失败", icon: "none" });
      },
    });
  },
});
