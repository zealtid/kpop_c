const api = require("./utils/api");
const analytics = require("./utils/analytics");
const onboarding = require("./utils/followOnboarding");

App({
  globalData: {
    token: "",
    user: null,
    apiBase: "",
  },

  onLaunch() {
    this.globalData.apiBase = api.API_BASE;
    this.login();
  },

  login() {
    const finish = (code) => {
      api
        .request({
          url: "/auth/wx-login",
          method: "POST",
          data: { code },
          auth: false,
        })
        .then((data) => {
          this.globalData.token = data.token;
          this.globalData.user = data.user;
          wx.setStorageSync("token", data.token);
          analytics.track("login_success", { mock: !!data.mock });
          this.refreshCardbook();
          onboarding.maybePromptAfterLogin();
        })
        .catch(() => {
          analytics.track("login_fail", { reason: "wx-login" });
        });
    };

    if (typeof wx !== "undefined" && wx.login) {
      wx.login({
        success: (res) => finish(res.code || "mock:devtools"),
        fail: () => finish("mock:devtools"),
      });
    } else {
      finish("mock:devtools");
    }
  },

  /** 登录完成后刷新已打开的卡册页，避免冷启动先 401 再停在空列表。 */
  refreshCardbook() {
    const pages = getCurrentPages();
    pages.forEach((page) => {
      if (page.route === "pages/cardbook/index" && typeof page.load === "function") {
        page.load();
      }
    });
  },
});
