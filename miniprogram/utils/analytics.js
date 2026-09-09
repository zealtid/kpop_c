const { request } = require("./api");

function track(name, payload) {
  request({
    url: "/analytics/events",
    method: "POST",
    data: { name, payload: payload || {} },
    auth: true,
  }).catch(() => {});
}

function tabView(tab) {
  track("tab_view", { tab });
}

module.exports = { track, tabView };
