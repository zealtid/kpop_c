const api = require("./utils/api");
const analytics = require("./utils/analytics");
const onboarding = require("./utils/followOnboarding");
const session = require("./utils/session");

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
    const stored = session.readStoredSession();
    if (stored.token) this.globalData.token = stored.token;
    if (stored.user) this.globalData.user = stored.user;
    // 有 token 时先 GET /me 校验；有效则跳过 wx.login，避免 mock 换用户。
    this.login({ silent: true });
  },

  /**
   * @param {{ silent?: boolean }} [opts]
   * silent：冷启动尝试；失败不 Toast、不重试。
   * 非 silent：写操作 401 / 用户点「登录」「重试」时显式触发。
   */
  login(opts) {
    const silent = !!(opts && opts.silent);
    if (this._loginPromise) return this._loginPromise;
    if (silent && this.globalData.loginState === "fail") {
      return Promise.resolve(false);
    }
    if (silent && this.globalData.loginState === "ok") {
      return Promise.resolve(true);
    }

    this.globalData.loginState = "pending";
    this._loginPromise = this._loginFlow(silent).finally(() => {
      this._loginPromise = null;
    });
    return this._loginPromise;
  },

  _loginFlow(silent) {
    if (this.globalData.token) {
      return this._hydrateToken().then((valid) => {
        if (valid) return true;
        return this._wxLogin(silent);
      });
    }
    return this._wxLogin(silent);
  },

  /** 本地 JWT 仍有效则复用，不重新 wx-login。 */
  _hydrateToken() {
    return api
      .request({ url: "/me" })
      .then((user) => {
        this.globalData.user = user;
        this.globalData.loginState = "ok";
        session.persistUser(user);
        this.refreshCardbook();
        this.refreshMine();
        onboarding.maybePromptAfterLogin();
        return true;
      })
      .catch((err) => {
        if (session.shouldReloginAfterMeError(err) || api.isUnauthorized(err)) {
          session.clearAuth();
          this.globalData.token = "";
          this.globalData.user = null;
          return false;
        }
        // 网络等错误：保留会话，不因一次 /me 失败清掉有效 token
        this.globalData.loginState = "ok";
        return true;
      });
  },

  _wxLogin(silent) {
    return new Promise((resolve) => {
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
            session.persistLogin(data, code);
            analytics.track("login_success", { mock: !!data.mock });
            this.refreshCardbook();
            this.refreshMine();
            onboarding.maybePromptAfterLogin();
            resolve(true);
          })
          .catch((err) => {
            this.globalData.loginState = "fail";
            analytics.track("login_fail", { reason: "wx-login" });
            if (!silent) {
              wx.showToast({ title: session.loginFailToastTitle(err), icon: "none" });
              this.refreshCardbook();
              this.refreshMine();
            }
            resolve(false);
          });
      };

      const storedMock = session.readMockLoginCode();
      const devtools = session.isDevtools();
      if (storedMock || devtools) {
        const code = session.resolveWxLoginCode({
          storedMockCode: storedMock,
          isDevtools: devtools,
        });
        if (!storedMock) session.persistMockLoginCode(code);
        finish(code);
        return;
      }

      if (typeof wx !== "undefined" && wx.login) {
        wx.login({
          success: (res) => finish(res.code || session.STABLE_MOCK_CODE),
          fail: () => finish(session.STABLE_MOCK_CODE),
        });
      } else {
        finish(session.STABLE_MOCK_CODE);
      }
    });
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
