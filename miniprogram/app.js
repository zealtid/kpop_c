const api = require("./utils/api");
const analytics = require("./utils/analytics");

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
});
