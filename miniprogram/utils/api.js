const { API_BASE } = require("./config");

const LOGIN_TOAST = "请先登录";

function request({ url, method = "GET", data, auth = true }) {
  const app = getApp();
  const header = { "Content-Type": "application/json" };
  const token = (app && app.globalData && app.globalData.token) || wx.getStorageSync("token");
  if (auth && token) header.Authorization = `Bearer ${token}`;
  return new Promise((resolve, reject) => {
    wx.request({
      url: API_BASE + url,
      method,
      data,
      header,
      timeout: 20000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }
        const err = (res.data && res.data.error) || { message: "请求失败", code: "HTTP" };
        err.status = res.statusCode;
        reject(err);
      },
      fail(e) {
        reject({ code: "NETWORK", message: e.errMsg || "网络错误" });
      },
    });
  });
}

function isUnauthorized(err) {
  return !!(err && err.status === 401);
}

/** 写操作 401：Toast「请先登录」并触发登录，不打断图鉴浏览。 */
function promptLoginIfUnauthorized(err) {
  if (!isUnauthorized(err)) return false;
  wx.showToast({ title: LOGIN_TOAST, icon: "none" });
  const app = getApp();
  if (app && typeof app.login === "function") {
    app.login();
  }
  return true;
}

function handleWriteError(err) {
  if (promptLoginIfUnauthorized(err)) return;
  wx.showToast({ title: (err && err.message) || "失败", icon: "none" });
}

function mediaUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//.test(path)) return path;
  return API_BASE + path;
}

/** Business code on HTTP 200 (or legacy error envelope). */
function businessCode(data) {
  if (!data) return "";
  return data.code || (data.error && data.error.code) || "";
}

function isOwnWantMutex(data) {
  return businessCode(data) === "OWN_WANT_MUTEX";
}

module.exports = {
  request,
  mediaUrl,
  API_BASE,
  businessCode,
  isOwnWantMutex,
  isUnauthorized,
  promptLoginIfUnauthorized,
  handleWriteError,
  LOGIN_TOAST,
};
