"use strict";

let inspectedTabId = null;
let currentDashboardTab = null;
let availableTabs = [];
let tabRefreshTimer;
const state = {
  captures: new Map(),
  selectedId: null,
  search: "",
  type: "all",
  maskSensitive: false,
  rules: []
};

const elements = {
  trafficView: document.querySelector("#trafficView"),
  overridesView: document.querySelector("#overridesView"),
  viewTabs: Array.from(document.querySelectorAll(".view-tab")),
  searchInput: document.querySelector("#searchInput"),
  typeFilter: document.querySelector("#typeFilter"),
  requestCount: document.querySelector("#requestCount"),
  requestList: document.querySelector("#requestList"),
  clearCaptureButton: document.querySelector("#clearCaptureButton"),
  targetTabSelect: document.querySelector("#targetTabSelect"),
  focusTargetButton: document.querySelector("#focusTargetButton"),
  liveIndicator: document.querySelector("#liveIndicator"),
  emptyDetail: document.querySelector("#emptyDetail"),
  emptyTitle: document.querySelector("#emptyTitle"),
  emptyMessage: document.querySelector("#emptyMessage"),
  requestDetail: document.querySelector("#requestDetail"),
  detailMethod: document.querySelector("#detailMethod"),
  detailStatus: document.querySelector("#detailStatus"),
  detailUrl: document.querySelector("#detailUrl"),
  metadataRow: document.querySelector("#metadataRow"),
  requestHeaderCount: document.querySelector("#requestHeaderCount"),
  responseHeaderCount: document.querySelector("#responseHeaderCount"),
  requestHeaders: document.querySelector("#requestHeaders"),
  responseHeaders: document.querySelector("#responseHeaders"),
  copyRequestButton: document.querySelector("#copyRequestButton"),
  copyResponseButton: document.querySelector("#copyResponseButton"),
  copyAllButton: document.querySelector("#copyAllButton"),
  maskSensitiveInput: document.querySelector("#maskSensitiveInput"),
  ruleCountBadge: document.querySelector("#ruleCountBadge"),
  ruleForm: document.querySelector("#ruleForm"),
  urlFilterInput: document.querySelector("#urlFilterInput"),
  targetInput: document.querySelector("#targetInput"),
  operationInput: document.querySelector("#operationInput"),
  headerInput: document.querySelector("#headerInput"),
  valueInput: document.querySelector("#valueInput"),
  valueField: document.querySelector("#valueField"),
  ruleError: document.querySelector("#ruleError"),
  clearRulesButton: document.querySelector("#clearRulesButton"),
  rulesEmpty: document.querySelector("#rulesEmpty"),
  rulesList: document.querySelector("#rulesList"),
  toast: document.querySelector("#toast")
};

let toastTimer;

function message(type, payload) {
  return new Promise(function send(resolve, reject) {
    chrome.runtime.sendMessage(
      Object.assign({ type: type }, payload || {}),
      function handleResponse(response) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response || !response.ok) {
          reject(new Error((response && response.error) || "Request failed."));
          return;
        }
        resolve(response);
      }
    );
  });
}

function showToast(text, isError) {
  clearTimeout(toastTimer);
  elements.toast.textContent = text;
  elements.toast.classList.toggle("is-error", Boolean(isError));
  elements.toast.classList.add("is-visible");
  toastTimer = setTimeout(function hideToast() {
    elements.toast.classList.remove("is-visible");
  }, 2400);
}

function requestedTabId() {
  const raw = new URLSearchParams(location.search).get("tabId");
  if (!raw) {
    return null;
  }
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function tabUrl(tab) {
  return String((tab && (tab.url || tab.pendingUrl)) || "");
}

function isInspectableTab(tab) {
  return (
    tab &&
    Number.isInteger(tab.id) &&
    /^https?:\/\//i.test(tabUrl(tab))
  );
}

function sortInspectableTabs(tabs) {
  const dashboardWindowId = currentDashboardTab && currentDashboardTab.windowId;
  return tabs.sort(function byRelevance(a, b) {
    const aSameWindow = a.windowId === dashboardWindowId ? 1 : 0;
    const bSameWindow = b.windowId === dashboardWindowId ? 1 : 0;
    if (aSameWindow !== bSameWindow) {
      return bSameWindow - aSameWindow;
    }
    if (Boolean(a.active) !== Boolean(b.active)) {
      return Number(b.active) - Number(a.active);
    }
    return Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0);
  });
}

function tabOptionLabel(tab) {
  const url = tabUrl(tab);
  let host = url;
  try {
    host = new URL(url).host;
  } catch (_error) {
    // Keep the full URL as a fallback label.
  }
  const title = String(tab.title || host || "Untitled page").trim();
  return title === host ? title : title + " — " + host;
}

function setEmptyState(title, messageText) {
  elements.emptyTitle.textContent = title;
  elements.emptyMessage.textContent = messageText;
}

function renderTargetOptions() {
  elements.targetTabSelect.replaceChildren();
  if (!availableTabs.length) {
    const option = document.createElement("option");
    option.textContent = "No website tabs open";
    option.value = "";
    elements.targetTabSelect.append(option);
    elements.targetTabSelect.disabled = true;
    elements.focusTargetButton.disabled = true;
    elements.liveIndicator.classList.add("is-idle");
    elements.liveIndicator.title = "Open an HTTP or HTTPS website tab to inspect";
    return;
  }

  for (const tab of availableTabs) {
    const option = document.createElement("option");
    option.value = String(tab.id);
    option.textContent = tabOptionLabel(tab);
    option.title = tabUrl(tab);
    elements.targetTabSelect.append(option);
  }
  elements.targetTabSelect.disabled = false;
  elements.focusTargetButton.disabled = inspectedTabId === null;
  if (inspectedTabId !== null) {
    elements.targetTabSelect.value = String(inspectedTabId);
  }
  elements.liveIndicator.classList.toggle(
    "is-idle",
    inspectedTabId === null
  );
  elements.liveIndicator.title =
    inspectedTabId === null
      ? "Choose a website tab to inspect"
      : "Listening for the selected website tab";
}

async function loadCaptureForTarget() {
  if (inspectedTabId === null) {
    state.captures.clear();
    state.selectedId = null;
    renderRequestList();
    renderDetail();
    return;
  }

  const targetAtStart = inspectedTabId;
  try {
    const response = await message("GET_CAPTURE", { tabId: targetAtStart });
    if (targetAtStart !== inspectedTabId) {
      return;
    }
    state.captures = new Map(
      (response.captures || []).map(function toEntry(capture) {
        return [capture.id, capture];
      })
    );
    const first = filteredCaptures()[0];
    state.selectedId = first ? first.id : null;
    renderRequestList();
    renderDetail();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function selectTargetTab(tabId) {
  const target = availableTabs.find(function matchingTab(tab) {
    return tab.id === Number(tabId);
  });

  inspectedTabId = target ? target.id : null;
  state.captures.clear();
  state.selectedId = null;
  renderTargetOptions();
  renderRequestList();
  renderDetail();

  if (!target) {
    history.replaceState(null, "", "panel.html");
    document.title = "Headers Studio";
    return;
  }

  history.replaceState(
    null,
    "",
    "panel.html?tabId=" + encodeURIComponent(String(target.id))
  );
  document.title = "Headers Studio — " + (target.title || targetUrl(target));
  await loadCaptureForTarget();
}

function targetUrl(tab) {
  return tabUrl(tab) || "Website";
}

async function refreshWebsiteTabs(preferredTabId) {
  const results = await Promise.all([
    chrome.tabs.getCurrent(),
    chrome.tabs.query({})
  ]);
  currentDashboardTab = results[0] || null;
  availableTabs = sortInspectableTabs(
    results[1].filter(function excludeDashboard(tab) {
      return (
        isInspectableTab(tab) &&
        (!currentDashboardTab || tab.id !== currentDashboardTab.id)
      );
    })
  );

  const preferredIds = [
    preferredTabId,
    inspectedTabId,
    currentDashboardTab && currentDashboardTab.openerTabId
  ]
    .filter(function present(id) {
      return id !== null && id !== undefined && id !== "";
    })
    .map(Number)
    .filter(function validId(id) {
      return Number.isInteger(id) && id >= 0;
    });
  const target =
    availableTabs.find(function preferred(tab) {
      return preferredIds.includes(tab.id);
    }) || availableTabs[0] || null;

  if (!target || target.id !== inspectedTabId) {
    await selectTargetTab(target && target.id);
  } else {
    renderTargetOptions();
  }
}

function scheduleTabRefresh() {
  clearTimeout(tabRefreshTimer);
  tabRefreshTimer = setTimeout(function refreshSoon() {
    void refreshWebsiteTabs(inspectedTabId).catch(function showRefreshError(
      error
    ) {
      showToast(error.message, true);
    });
  }, 180);
}

function safeUrlParts(value) {
  try {
    const parsed = new URL(value);
    return {
      host: parsed.host,
      path: (parsed.pathname || "/") + parsed.search
    };
  } catch (_error) {
    return { host: value || "Unknown URL", path: "" };
  }
}

function statusClass(status, error) {
  if (error || Number(status) >= 400) {
    return "status-error";
  }
  if (Number(status) >= 300) {
    return "status-warn";
  }
  if (Number(status) >= 200) {
    return "status-ok";
  }
  return "";
}

function filteredCaptures() {
  const needle = state.search.trim().toLowerCase();
  return Array.from(state.captures.values())
    .filter(function matchesType(capture) {
      if (state.type === "all") {
        return true;
      }
      if (state.type === "other") {
        return !["main_frame", "xmlhttprequest", "script", "image"].includes(
          capture.type
        );
      }
      return capture.type === state.type;
    })
    .filter(function matchesSearch(capture) {
      if (!needle) {
        return true;
      }
      return [
        capture.method,
        capture.url,
        capture.statusCode,
        capture.type,
        capture.error
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    })
    .sort(function newestFirst(a, b) {
      return Number(b.timeStamp) - Number(a.timeStamp);
    });
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function renderRequestList() {
  const captures = filteredCaptures();
  const total = state.captures.size;
  elements.requestCount.textContent =
    captures.length === total
      ? total + (total === 1 ? " request" : " requests")
      : captures.length + " of " + total + " requests";
  elements.requestList.replaceChildren();

  if (!captures.length) {
    elements.requestList.append(
      createElement(
        "div",
        "list-empty",
        total
          ? "No requests match the current filters."
          : inspectedTabId === null
            ? "Open an HTTP or HTTPS website tab, then select it above."
            : "Reload the selected website tab to begin capturing traffic."
      )
    );
    return;
  }

  for (const capture of captures) {
    const parts = safeUrlParts(capture.url);
    const button = createElement("button", "request-row");
    button.type = "button";
    button.dataset.id = capture.id;
    button.setAttribute("role", "option");
    button.setAttribute(
      "aria-selected",
      String(capture.id === state.selectedId)
    );
    button.classList.toggle("is-selected", capture.id === state.selectedId);

    button.append(
      createElement(
        "span",
        "request-method",
        String(capture.method || "GET").toUpperCase()
      )
    );

    const main = createElement("span", "request-main");
    main.append(
      createElement("span", "request-host", parts.host),
      createElement("span", "request-path", parts.path)
    );
    button.append(main);

    const meta = createElement("span", "request-meta");
    const statusText =
      capture.statusCode ||
      (capture.error ? "ERR" : capture.completed ? "—" : "···");
    const status = createElement(
      "span",
      "request-status " + statusClass(capture.statusCode, capture.error),
      statusText
    );
    meta.append(
      status,
      createElement("span", "request-type", capture.type || "other")
    );
    button.append(meta);
    elements.requestList.append(button);
  }
}

function metadataItem(label, value) {
  const item = createElement("span", "metadata-item");
  item.append(
    createElement("strong", "", label),
    document.createTextNode(String(value))
  );
  return item;
}

function formatTime(timestamp) {
  if (!timestamp) {
    return "—";
  }
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3
  });
}

function renderHeaderTable(container, headers) {
  container.replaceChildren();
  if (!headers.length) {
    container.append(
      createElement("div", "header-empty", "No headers captured yet.")
    );
    return;
  }

  for (const header of headers) {
    const sensitive = RawHeaderCore.isSensitiveHeader(header.name);
    const row = createElement("div", "header-row");
    const name = createElement(
      "div",
      "header-name" + (sensitive ? " sensitive" : ""),
      header.name
    );
    const masked = sensitive && state.maskSensitive;
    const value = createElement(
      "div",
      "header-value" + (masked ? " is-masked" : ""),
      masked ? RawHeaderCore.maskedValue(header.value) : header.value
    );
    if (masked) {
      value.title = "Sensitive value masked in the view. Raw copy remains complete.";
    }
    row.append(name, value);
    container.append(row);
  }
}

function selectedCapture() {
  return state.selectedId ? state.captures.get(state.selectedId) : null;
}

function renderDetail() {
  const capture = selectedCapture();
  elements.emptyDetail.hidden = Boolean(capture);
  elements.requestDetail.hidden = !capture;
  if (!capture) {
    if (inspectedTabId === null) {
      setEmptyState(
        "Choose a website tab",
        "Open an HTTP or HTTPS page in Chrome, then select it from the Inspecting menu."
      );
    } else {
      setEmptyState(
        "Waiting for a request",
        "Reload the selected website tab. Request and response headers will appear here, including Cookie and Set-Cookie."
      );
    }
    return;
  }

  const requestHeaders = RawHeaderCore.headersWithSynthesizedHost(
    capture.requestHeaders,
    capture.url
  );
  const responseHeaders = RawHeaderCore.normalizeHeaders(
    capture.responseHeaders
  );

  elements.detailMethod.textContent = String(
    capture.method || "GET"
  ).toUpperCase();
  elements.detailStatus.textContent =
    capture.statusCode ||
    (capture.error ? "Error" : capture.completed ? "Complete" : "Pending");
  elements.detailStatus.className =
    "status-pill " + statusClass(capture.statusCode, capture.error);
  elements.detailUrl.textContent = capture.url || "Unknown URL";
  elements.detailUrl.title = capture.url || "";

  elements.metadataRow.replaceChildren(
    metadataItem("Type", capture.type || "other"),
    metadataItem("Started", formatTime(capture.timeStamp)),
    metadataItem(
      "Duration",
      capture.completedAt
        ? Math.max(0, capture.completedAt - capture.timeStamp).toFixed(0) + " ms"
        : "pending"
    ),
    metadataItem("Remote", capture.ip || "not exposed"),
    metadataItem("Cache", capture.fromCache ? "yes" : "no")
  );
  if (capture.redirectUrl) {
    elements.metadataRow.append(
      metadataItem("Redirect", capture.redirectUrl)
    );
  }
  if (capture.error) {
    elements.metadataRow.append(metadataItem("Error", capture.error));
  }

  elements.requestHeaderCount.textContent =
    requestHeaders.length + (requestHeaders.length === 1 ? " header" : " headers");
  elements.responseHeaderCount.textContent =
    responseHeaders.length +
    (responseHeaders.length === 1 ? " header" : " headers");
  renderHeaderTable(elements.requestHeaders, requestHeaders);
  renderHeaderTable(elements.responseHeaders, responseHeaders);
}

function selectCapture(id) {
  if (!state.captures.has(id)) {
    return;
  }
  state.selectedId = id;
  renderRequestList();
  renderDetail();
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_error) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  showToast(successMessage);
}

function copySelected(kind) {
  const capture = selectedCapture();
  if (!capture) {
    return;
  }
  if (kind === "request") {
    void copyText(
      RawHeaderCore.requestToRaw(capture),
      "Raw request copied — Cookie included."
    );
  } else if (kind === "response") {
    void copyText(
      RawHeaderCore.responseToRaw(capture),
      "Raw response copied — Set-Cookie included."
    );
  } else {
    void copyText(
      RawHeaderCore.combinedToRaw(capture),
      "Request and response copied as raw headers."
    );
  }
}

function switchView(name) {
  elements.viewTabs.forEach(function updateTab(tab) {
    tab.classList.toggle("is-active", tab.dataset.view === name);
  });
  elements.trafficView.classList.toggle("is-active", name === "traffic");
  elements.overridesView.classList.toggle("is-active", name === "overrides");

  if (name === "overrides") {
    const capture = selectedCapture();
    if (capture && !elements.urlFilterInput.value) {
      try {
        elements.urlFilterInput.value = "||" + new URL(capture.url).hostname + "/";
      } catch (_error) {
        // Leave the form untouched for non-HTTP URLs.
      }
    }
    void refreshRules();
  }
}

function setRuleError(text) {
  elements.ruleError.textContent = text || "";
  elements.ruleError.hidden = !text;
}

function updateValueField() {
  const removing = elements.operationInput.value === "remove";
  elements.valueField.hidden = removing;
  elements.valueInput.disabled = removing;
}

function ruleInput() {
  return {
    urlFilter: elements.urlFilterInput.value,
    target: elements.targetInput.value,
    operation: elements.operationInput.value,
    header: elements.headerInput.value,
    value: elements.valueInput.value
  };
}

function renderRules() {
  elements.ruleCountBadge.textContent = String(state.rules.length);
  elements.rulesEmpty.hidden = Boolean(state.rules.length);
  elements.clearRulesButton.hidden = !state.rules.length;
  elements.rulesList.replaceChildren();

  for (const rule of state.rules) {
    const card = createElement("article", "rule-card");
    const content = createElement("div");
    const badges = createElement("div", "rule-badges");
    badges.append(
      createElement("span", "rule-badge target", rule.target),
      createElement("span", "rule-badge", rule.operation),
      createElement("span", "rule-badge", "#" + rule.id)
    );

    const expression = createElement("div", "rule-expression");
    const headerText =
      rule.operation === "remove"
        ? rule.header
        : rule.header + ": " + rule.value;
    expression.append(
      createElement("code", "", headerText),
      createElement("code", "filter", rule.urlFilter)
    );
    content.append(badges, expression);

    const remove = createElement("button", "delete-rule", "×");
    remove.type = "button";
    remove.dataset.ruleId = String(rule.id);
    remove.title = "Remove this override";
    remove.setAttribute("aria-label", "Remove override " + rule.id);
    card.append(content, remove);
    elements.rulesList.append(card);
  }
}

async function refreshRules() {
  try {
    const response = await message("GET_RULES");
    state.rules = response.rules || [];
    renderRules();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function initialize() {
  try {
    await refreshWebsiteTabs(requestedTabId());
  } catch (error) {
    showToast(error.message, true);
  }
  await refreshRules();
}

elements.requestList.addEventListener("click", function chooseRequest(event) {
  const button = event.target.closest("[data-id]");
  if (button) {
    selectCapture(button.dataset.id);
  }
});

elements.searchInput.addEventListener("input", function updateSearch(event) {
  state.search = event.target.value;
  renderRequestList();
});

elements.typeFilter.addEventListener("change", function updateType(event) {
  state.type = event.target.value;
  renderRequestList();
});

elements.targetTabSelect.addEventListener(
  "change",
  function changeTarget(event) {
    void selectTargetTab(Number(event.target.value));
  }
);

elements.focusTargetButton.addEventListener(
  "click",
  async function focusTarget() {
    if (inspectedTabId === null) {
      return;
    }
    try {
      const tab = await chrome.tabs.get(inspectedTabId);
      await chrome.tabs.update(inspectedTabId, { active: true });
      if (Number.isInteger(tab.windowId)) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
    } catch (error) {
      showToast(error.message, true);
      scheduleTabRefresh();
    }
  }
);

elements.clearCaptureButton.addEventListener("click", async function clear() {
  if (inspectedTabId === null) {
    return;
  }
  try {
    await message("CLEAR_CAPTURE", { tabId: inspectedTabId });
    state.captures.clear();
    state.selectedId = null;
    renderRequestList();
    renderDetail();
    showToast("Captured traffic cleared.");
  } catch (error) {
    showToast(error.message, true);
  }
});

elements.copyRequestButton.addEventListener("click", function copyRequest() {
  copySelected("request");
});
elements.copyResponseButton.addEventListener("click", function copyResponse() {
  copySelected("response");
});
elements.copyAllButton.addEventListener("click", function copyAll() {
  copySelected("all");
});
document.querySelectorAll("[data-copy]").forEach(function bindCopy(button) {
  button.addEventListener("click", function copySection() {
    copySelected(button.dataset.copy);
  });
});

elements.maskSensitiveInput.addEventListener("change", function toggleMask(event) {
  state.maskSensitive = event.target.checked;
  renderDetail();
});

elements.viewTabs.forEach(function bindView(tab) {
  tab.addEventListener("click", function activate() {
    switchView(tab.dataset.view);
  });
});

elements.operationInput.addEventListener("change", updateValueField);

elements.ruleForm.addEventListener("submit", async function submitRule(event) {
  event.preventDefault();
  setRuleError("");
  const validation = RawHeaderRules.validateOverride(ruleInput());
  if (!validation.valid) {
    setRuleError(validation.errors[0]);
    return;
  }

  const submit = elements.ruleForm.querySelector("[type=submit]");
  submit.disabled = true;
  submit.textContent = "Adding…";
  try {
    await message("ADD_RULE", { rule: validation.value });
    elements.headerInput.value = "";
    elements.valueInput.value = "";
    await refreshRules();
    showToast("Header override is active.");
  } catch (error) {
    setRuleError(error.message);
  } finally {
    submit.disabled = false;
    submit.textContent = "Add override";
  }
});

elements.rulesList.addEventListener("click", async function removeRule(event) {
  const button = event.target.closest("[data-rule-id]");
  if (!button) {
    return;
  }
  button.disabled = true;
  try {
    await message("DELETE_RULE", { ruleId: Number(button.dataset.ruleId) });
    await refreshRules();
    showToast("Override removed.");
  } catch (error) {
    button.disabled = false;
    showToast(error.message, true);
  }
});

elements.clearRulesButton.addEventListener("click", async function removeAll() {
  if (!confirm("Remove every active header override?")) {
    return;
  }
  try {
    await message("CLEAR_RULES");
    await refreshRules();
    showToast("All overrides removed.");
  } catch (error) {
    showToast(error.message, true);
  }
});

chrome.runtime.onMessage.addListener(function receiveCapture(message) {
  if (!message || message.type !== "NETWORK_EVENT") {
    return;
  }
  if (Number(message.tabId) !== inspectedTabId) {
    return;
  }

  if (!message.capture) {
    state.captures.clear();
    state.selectedId = null;
  } else {
    state.captures.set(message.capture.id, message.capture);
    if (!state.selectedId) {
      state.selectedId = message.capture.id;
    }
  }
  renderRequestList();
  renderDetail();
});

chrome.tabs.onCreated.addListener(scheduleTabRefresh);
chrome.tabs.onRemoved.addListener(scheduleTabRefresh);
chrome.tabs.onUpdated.addListener(function trackTabUpdates(
  _tabId,
  changeInfo
) {
  if (changeInfo.title !== undefined || changeInfo.url !== undefined) {
    scheduleTabRefresh();
  }
});

updateValueField();
void initialize();
