"use strict";

function send(type, payload) {
  return new Promise(function sendMessage(resolve) {
    chrome.runtime.sendMessage(
      Object.assign({ type: type }, payload || {}),
      function receive(response) {
        if (chrome.runtime.lastError || !response || !response.ok) {
          resolve(null);
          return;
        }
        resolve(response);
      }
    );
  });
}

void chrome.tabs.query({ active: true, currentWindow: true }).then(
  async function loadSummary(tabs) {
    const tab = tabs[0];
    const captureResponse = tab
      ? await send("GET_CAPTURE", { tabId: tab.id })
      : null;
    const rulesResponse = await send("GET_RULES");
    document.querySelector("#captureCount").textContent = captureResponse
      ? String(captureResponse.captures.length)
      : "0";
    document.querySelector("#ruleCount").textContent = rulesResponse
      ? String(rulesResponse.rules.length)
      : "0";
  }
);
