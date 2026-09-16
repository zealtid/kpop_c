const api = require("./api");

/**
 * C 端绑定/换绑入口开关。false 时「我的」「设置」不展示区块；
 * `/me/phone`、表结构与 Admin 审计不受影响，打开时改回 true 即可。
 */
const PHONE_BIND_UI_ENABLED = false;

function phoneFields(user) {
  const phoneMasked = (user && (user.phoneMasked || user.phone_masked)) || "";
  return {
    phoneMasked: String(phoneMasked || ""),
    phoneBound: !!(user && (user.phoneBound || phoneMasked)),
  };
}

function deniedMessage(detail) {
  const errMsg = String((detail && detail.errMsg) || "");
  if (/deny|cancel|fail/i.test(errMsg)) return "未授权手机号";
  return "绑定失败";
}

/** Send WeChat getPhoneNumber `code` to the server. Never treat client phoneNumber as truth. */
function bindWithWeChatDetail(detail) {
  const code = detail && detail.code;
  if (!code) {
    return Promise.reject({ message: deniedMessage(detail), code: "PHONE_BIND_DENIED" });
  }
  return api.request({ url: "/me/phone", method: "POST", data: { code: String(code) } });
}

module.exports = {
  PHONE_BIND_UI_ENABLED,
  phoneFields,
  bindWithWeChatDetail,
};
