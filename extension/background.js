importScripts("lib/headers.js", "lib/rules.js");

"use strict";

const MAX_REQUESTS_PER_TAB = 400;
const capturesByTab = new Map();
const hydrationByTab = new Map();
const activeRequestKeys = new Map();
const persistTimers = new Map();
let sequence = 0;

function captureStorageKey(tabId) {
  return "headers-studio-capture:" + tabId;
}

function isCapturable(details) {
  return details && Number.isInteger(details.tabId) && details.tabId >= 0;
}

async function getTabCaptures(tabId) {
  if (capturesByTab.has(tabId)) {
    return capturesByTab.get(tabId);
  }
  if (hydrationByTab.has(tabId)) {
    return hydrationByTab.get(tabId);
  }

  const pending = chrome.storage.session
    .get(captureStorageKey(tabId))
    .then(function hydrate(stored) {
      const rows = stored[captureStorageKey(tabId)] || [];
      const captures = new Map(
        rows
          .filter(function hasId(row) {
            return row && row.id;
          })
          .map(function asEntry(row) {
            return [row.id, row];
          })
      );
      capturesByTab.set(tabId, captures);
      hydrationByTab.delete(tabId);
      return captures;
    })
    .catch(function recover() {
      const captures = new Map();
      capturesByTab.set(tabId, captures);
      hydrationByTab.delete(tabId);
      return captures;
    });

  hydrationByTab.set(tabId, pending);
  return pending;
}

function activeKey(details) {
  return details.tabId + ":" + details.requestId;
}

function newCapture(details) {
  sequence += 1;
  return {
    id: details.requestId + ":" + Date.now() + ":" + sequence,
    requestId: details.requestId,
    tabId: details.tabId,
    method: details.method || "GET",
    url: details.url || "",
    type: details.type || "other",
    initiator: details.initiator || details.originUrl || "",
    timeStamp: details.timeStamp || Date.now(),
    requestHeaders: [],
    responseHeaders: [],
    statusCode: null,
    statusLine: "",
    ip: "",
    fromCache: false,
    completed: false,
    error: ""
  };
}

function getOrCreateCapture(captures, details) {
  const requestKey = activeKey(details);
  const captureId = activeRequestKeys.get(requestKey);
  if (captureId && captures.has(captureId)) {
    return captures.get(captureId);
  }

  const capture = newCapture(details);
  captures.set(capture.id, capture);
  activeRequestKeys.set(requestKey, capture.id);
  trimCaptures(captures);
  return capture;
}

function trimCaptures(captures) {
  while (captures.size > MAX_REQUESTS_PER_TAB) {
    const oldestKey = captures.keys().next().value;
    captures.delete(oldestKey);
  }
}

function schedulePersist(tabId, captures) {
  clearTimeout(persistTimers.get(tabId));
  persistTimers.set(
    tabId,
    setTimeout(function persistSoon() {
      persistTimers.delete(tabId);
      const rows = Array.from(captures.values());
      chrome.storage.session
        .set({ [captureStorageKey(tabId)]: rows })
        .catch(function ignoreStorageFailure() {});
    }, 180)
  );
}

function broadcast(tabId, capture) {
  chrome.runtime.sendMessage(
    {
      type: "NETWORK_EVENT",
      tabId: tabId,
      capture: capture
    },
    function ignoreMissingReceiver() {
      void chrome.runtime.lastError;
    }
  );
}

function updateCapture(details, updater) {
  if (!isCapturable(details)) {
    return;
  }

  void getTabCaptures(details.tabId).then(function applyUpdate(captures) {
    const capture = getOrCreateCapture(captures, details);
    updater(capture);
    schedulePersist(details.tabId, captures);
    broadcast(details.tabId, capture);
  });
}

chrome.webRequest.onBeforeRequest.addListener(
  function onBeforeRequest(details) {
    updateCapture(details, function update(capture) {
      capture.method = details.method || capture.method;
      capture.url = details.url || capture.url;
      capture.type = details.type || capture.type;
      capture.initiator =
        details.initiator || details.originUrl || capture.initiator;
      capture.timeStamp = details.timeStamp || capture.timeStamp;
    });
  },
  { urls: ["<all_urls>"] }
);

chrome.webRequest.onSendHeaders.addListener(
  function onSendHeaders(details) {
    updateCapture(details, function update(capture) {
      capture.method = details.method || capture.method;
      capture.url = details.url || capture.url;
      capture.requestHeaders = RawHeaderCore.normalizeHeaders(
        details.requestHeaders
      );
    });
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders", "extraHeaders"]
);

chrome.webRequest.onHeadersReceived.addListener(
  function onHeadersReceived(details) {
    updateCapture(details, function update(capture) {
      capture.url = details.url || capture.url;
      capture.statusCode = details.statusCode || capture.statusCode;
      capture.statusLine = details.statusLine || capture.statusLine;
      capture.responseHeaders = RawHeaderCore.normalizeHeaders(
        details.responseHeaders
      );
      capture.ip = details.ip || capture.ip;
      capture.fromCache = Boolean(details.fromCache);
    });
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders", "extraHeaders"]
);

chrome.webRequest.onResponseStarted.addListener(
  function onResponseStarted(details) {
    updateCapture(details, function update(capture) {
      capture.statusCode = details.statusCode || capture.statusCode;
      capture.statusLine = details.statusLine || capture.statusLine;
      capture.responseHeaders = RawHeaderCore.normalizeHeaders(
        details.responseHeaders
      );
      capture.ip = details.ip || capture.ip;
      capture.fromCache = Boolean(details.fromCache);
    });
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders", "extraHeaders"]
);

chrome.webRequest.onBeforeRedirect.addListener(
  function onBeforeRedirect(details) {
    updateCapture(details, function update(capture) {
      capture.statusCode = details.statusCode || capture.statusCode;
      capture.statusLine = details.statusLine || capture.statusLine;
      capture.responseHeaders = RawHeaderCore.normalizeHeaders(
        details.responseHeaders
      );
      capture.redirectUrl = details.redirectUrl || "";
      capture.completed = true;
      capture.completedAt = details.timeStamp || Date.now();
      activeRequestKeys.delete(activeKey(details));
    });
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders", "extraHeaders"]
);

chrome.webRequest.onCompleted.addListener(
  function onCompleted(details) {
    updateCapture(details, function update(capture) {
      capture.statusCode = details.statusCode || capture.statusCode;
      capture.statusLine = details.statusLine || capture.statusLine;
      if (details.responseHeaders) {
        capture.responseHeaders = RawHeaderCore.normalizeHeaders(
          details.responseHeaders
        );
      }
      capture.fromCache = Boolean(details.fromCache);
      capture.ip = details.ip || capture.ip;
      capture.completed = true;
      capture.completedAt = details.timeStamp || Date.now();
      activeRequestKeys.delete(activeKey(details));
    });
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders", "extraHeaders"]
);

chrome.webRequest.onErrorOccurred.addListener(
  function onError(details) {
    updateCapture(details, function update(capture) {
      capture.error = details.error || "Request failed";
      capture.completed = true;
      capture.completedAt = details.timeStamp || Date.now();
      activeRequestKeys.delete(activeKey(details));
    });
  },
  { urls: ["<all_urls>"] }
);

async function getRules() {
  const rules = await chrome.declarativeNetRequest.getDynamicRules();
  const stored = await chrome.storage.local.get("overrideMetadata");
  const metadata = stored.overrideMetadata || {};
  return rules
    .map(function withMetadata(rule) {
      return Object.assign(
        {},
        RawHeaderRules.overrideFromRule(rule),
        metadata[String(rule.id)] || {}
      );
    })
    .sort(function newestFirst(a, b) {
      return Number(b.id) - Number(a.id);
    });
}

async function updateRuleBadge() {
  const rules = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.action.setBadgeBackgroundColor({ color: "#36D399" });
  await chrome.action.setBadgeText({
    text: rules.length ? String(rules.length) : ""
  });
}

async function addRule(input) {
  const validation = RawHeaderRules.validateOverride(input);
  if (!validation.valid) {
    throw new Error(validation.errors[0]);
  }

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const nextId = Math.max(
    1000,
    existing.reduce(function maxId(maximum, rule) {
      return Math.max(maximum, Number(rule.id) || 0);
    }, 999) + 1
  );
  const rule = RawHeaderRules.toDynamicRule(validation.value, nextId);

  await chrome.declarativeNetRequest.updateDynamicRules({
    addRules: [rule],
    removeRuleIds: []
  });

  const stored = await chrome.storage.local.get("overrideMetadata");
  const metadata = stored.overrideMetadata || {};
  metadata[String(nextId)] = {
    createdAt: new Date().toISOString()
  };
  await chrome.storage.local.set({ overrideMetadata: metadata });
  await updateRuleBadge();
  return Object.assign(
    {},
    RawHeaderRules.overrideFromRule(rule),
    metadata[String(nextId)]
  );
}

async function deleteRule(ruleId) {
  const id = Number(ruleId);
  await chrome.declarativeNetRequest.updateDynamicRules({
    addRules: [],
    removeRuleIds: [id]
  });
  const stored = await chrome.storage.local.get("overrideMetadata");
  const metadata = stored.overrideMetadata || {};
  delete metadata[String(id)];
  await chrome.storage.local.set({ overrideMetadata: metadata });
  await updateRuleBadge();
}

async function clearRules() {
  const rules = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    addRules: [],
    removeRuleIds: rules.map(function id(rule) {
      return rule.id;
    })
  });
  await chrome.storage.local.set({ overrideMetadata: {} });
  await updateRuleBadge();
}

async function clearCapture(tabId) {
  capturesByTab.set(tabId, new Map());
  for (const requestKey of activeRequestKeys.keys()) {
    if (requestKey.startsWith(tabId + ":")) {
      activeRequestKeys.delete(requestKey);
    }
  }
  await chrome.storage.session.remove(captureStorageKey(tabId));
  broadcast(tabId, null);
}

chrome.runtime.onMessage.addListener(function handleMessage(
  message,
  _sender,
  sendResponse
) {
  if (!message || typeof message.type !== "string") {
    return false;
  }

  void (async function routeMessage() {
    switch (message.type) {
      case "GET_CAPTURE": {
        const captures = await getTabCaptures(Number(message.tabId));
        return {
          ok: true,
          captures: Array.from(captures.values()).sort(function latest(a, b) {
            return Number(b.timeStamp) - Number(a.timeStamp);
          })
        };
      }
      case "CLEAR_CAPTURE":
        await clearCapture(Number(message.tabId));
        return { ok: true };
      case "GET_RULES":
        return { ok: true, rules: await getRules() };
      case "ADD_RULE":
        return { ok: true, rule: await addRule(message.rule) };
      case "DELETE_RULE":
        await deleteRule(message.ruleId);
        return { ok: true };
      case "CLEAR_RULES":
        await clearRules();
        return { ok: true };
      default:
        return { ok: false, error: "Unknown message." };
    }
  })()
    .then(sendResponse)
    .catch(function respondWithError(error) {
      sendResponse({
        ok: false,
        error: error && error.message ? error.message : String(error)
      });
    });

  return true;
});

chrome.tabs.onRemoved.addListener(function cleanClosedTab(tabId) {
  capturesByTab.delete(tabId);
  hydrationByTab.delete(tabId);
  clearTimeout(persistTimers.get(tabId));
  persistTimers.delete(tabId);
  void chrome.storage.session.remove(captureStorageKey(tabId));
});

chrome.runtime.onInstalled.addListener(function initialize() {
  void updateRuleBadge();
});

void updateRuleBadge();
