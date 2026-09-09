const { API_BASE } = require("./config");

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

function mediaUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//.test(path)) return path;
  return API_BASE + path;
}

module.exports = { request, mediaUrl, API_BASE };
