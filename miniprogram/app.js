const api = require("./utils/api");
const analytics = require("./utils/analytics");
const onboarding = require("./utils/followOnboarding");

App({
  globalData: {
    token: "",
    user: null,
    apiBase: "",
    /** "" | "pending" | "ok" | "fail" — 登录失败时保持可浏览图鉴，不进入死循环 */
    loginState: "",
  },

  onLaunch() {
    this.globalData.apiBase = api.API_BASE;
    const stored = wx.getStorageSync("token") || "";
    if (stored) this.globalData.token = stored;
    // 后台静默登录：失败不弹窗、不阻塞 Tab。游客仍可打开「图鉴」。
    this.login({ silent: true });
  },

  /**
   * @param {{ silent?: boolean }} [opts]
   * silent：冷启动尝试；失败不 Toast、不重试。
   * 非 silent：写操作 401 / 用户点「登录」时显式触发。
   */
  login(opts) {
    const silent = !!(opts && opts.silent);
    if (this._loginPromise) return this._loginPromise;
    if (silent && this.globalData.loginState === "fail") {
      return Promise.resolve(false);
    }

    this.globalData.loginState = "pending";
    this._loginPromise = new Promise((resolve) => {
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
            this.globalData.loginState = "ok";
            wx.setStorageSync("token", data.token);
            analytics.track("login_success", { mock: !!data.mock });
            this.refreshCardbook();
            this.refreshMine();
            onboarding.maybePromptAfterLogin();
            resolve(true);
          })
          .catch(() => {
            this.globalData.loginState = "fail";
            analytics.track("login_fail", { reason: "wx-login" });
            resolve(false);
          });
      };

      if (typeof wx !== "undefined" && wx.login) {
        wx.login({
          success: (res) => finish(res.code || "mock:devtools"),
          // DevTools / 拒绝授权：仍尝试 mock code；生产环境 API 失败则进入游客态
          fail: () => finish("mock:devtools"),
        });
      } else {
        finish("mock:devtools");
      }
    }).finally(() => {
      this._loginPromise = null;
    });

    return this._loginPromise;
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

  refreshMine() {
    const pages = getCurrentPages();
    pages.forEach((page) => {
      if (page.route === "pages/mine/index" && typeof page.load === "function") {
        page.load();
      }
    });
  },
});
