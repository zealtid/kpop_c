const api = require("../../utils/api");
const releaseDate = require("../../utils/releaseDate");
const benefitMatrix = require("../../utils/benefitMatrix");

Page({
  data: {
    id: "",
    release: {},
    versions: [],
    selectedVersion: "",
    rows: [],
    visibleRows: [],
    empty: false,
    emptyCopy: benefitMatrix.EMPTY_COPY,
    footnote: "",
    loaded: false,
  },
  onLoad(q) {
    this.setData({ id: q.id || "" });
    this.load();
  },
  load() {
    if (!this.data.id) return;
    api
      .request({ url: `/catalog/releases/${this.data.id}/benefit-matrix`, auth: false })
      .then((d) => {
        const rows = benefitMatrix.decorateRows(d.rows, (url) => api.mediaUrl(url));
        const versions = d.versions && d.versions.length ? d.versions : [benefitMatrix.DEFAULT_VERSION];
        const selectedVersion = benefitMatrix.initialVersion(versions, rows);
        this.setData({
          release: releaseDate.decorateRelease(d.release || {}),
          versions,
          selectedVersion,
          rows,
          visibleRows: benefitMatrix.rowsForVersion(rows, selectedVersion),
          empty: !!d.empty,
          footnote: benefitMatrix.footnote(d.completeness),
          loaded: true,
        });
      })
      .catch((err) => {
        this.setData({
          empty: true,
          loaded: true,
          versions: [benefitMatrix.DEFAULT_VERSION],
          selectedVersion: benefitMatrix.DEFAULT_VERSION,
          rows: [],
          visibleRows: [],
          footnote: benefitMatrix.INCOMPLETE_COPY,
        });
        if (err && err.status !== 404) api.handleWriteError(err);
      });
  },
  selectVersion(e) {
    const selectedVersion = e.currentTarget.dataset.version;
    this.setData({
      selectedVersion,
      visibleRows: benefitMatrix.rowsForVersion(this.data.rows, selectedVersion),
    });
  },
  openSlot(e) {
    const navigable = benefitMatrix.isNavigableFlag(e.currentTarget.dataset.navigable);
    if (!navigable) {
      wx.showToast({ title: benefitMatrix.PENDING_LABEL, icon: "none" });
      return;
    }
    const q = e.currentTarget.dataset.q || "";
    wx.navigateTo({
      url: `/pages/catalog-search/index?q=${encodeURIComponent(q)}`,
    });
  },
});
