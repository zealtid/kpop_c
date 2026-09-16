/**
 * 微信 getPhoneNumber 绑定（登录仍走 wx code）
 * run: node --test miniprogram/utils/phoneBind.test.js
 */
const { test, after } = require("node:test");
const assert = require("node:assert/strict");

const api = require("./api");
const origRequest = api.request;
const phoneBind = require("./phoneBind");

test("PHONE_BIND_UI_ENABLED is off so MP can hide bind entry", () => {
  assert.equal(phoneBind.PHONE_BIND_UI_ENABLED, false);
});

test("phoneFields reads masked number without inventing a bind", () => {
  assert.deepEqual(phoneBind.phoneFields({}), { phoneMasked: "", phoneBound: false });
  assert.deepEqual(phoneBind.phoneFields({ phoneMasked: "138****8000", phoneBound: true }), {
    phoneMasked: "138****8000",
    phoneBound: true,
  });
});

test("bindWithWeChatDetail posts code only; never a client phoneNumber", async () => {
  const calls = [];
  api.request = (opts) => {
    calls.push(opts);
    return Promise.resolve({ phoneMasked: "138****8000", phoneBound: true });
  };
  const user = await phoneBind.bindWithWeChatDetail({
    code: "wx-phone-code",
    phoneNumber: "13800138000",
    errMsg: "getPhoneNumber:ok",
  });
  assert.equal(user.phoneBound, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/me/phone");
  assert.equal(calls[0].data.code, "wx-phone-code");
  assert.equal(calls[0].data.phoneNumber, undefined);
});

test("bindWithWeChatDetail rejects missing code without calling API", async () => {
  const calls = [];
  api.request = (opts) => {
    calls.push(opts);
    return Promise.resolve({});
  };
  await assert.rejects(
    () => phoneBind.bindWithWeChatDetail({ errMsg: "getPhoneNumber:fail user deny" }),
    (err) => err && err.code === "PHONE_BIND_DENIED",
  );
  assert.equal(calls.length, 0);
});

after(() => {
  api.request = origRequest;
});
