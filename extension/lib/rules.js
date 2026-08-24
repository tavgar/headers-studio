(function attachRawHeaderRules(root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.RawHeaderRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createRawHeaderRules() {
  "use strict";

  var TARGETS = new Set(["request", "response"]);
  var OPERATIONS = new Set(["set", "append", "remove"]);
  var REQUEST_APPEND_ALLOWLIST = new Set([
    "accept",
    "accept-encoding",
    "accept-language",
    "access-control-request-headers",
    "cache-control",
    "connection",
    "content-language",
    "cookie",
    "forwarded",
    "if-match",
    "if-none-match",
    "keep-alive",
    "range",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "user-agent",
    "via",
    "want-digest",
    "x-forwarded-for"
  ]);

  function normalizeOverride(input) {
    var source = input || {};
    return {
      target: String(source.target || "request").toLowerCase(),
      operation: String(source.operation || "set").toLowerCase(),
      header: String(source.header || "").trim().toLowerCase(),
      value: String(source.value == null ? "" : source.value),
      urlFilter: String(source.urlFilter || "").trim()
    };
  }

  function validateOverride(input) {
    var value = normalizeOverride(input);
    var errors = [];

    if (!TARGETS.has(value.target)) {
      errors.push("Choose request or response headers.");
    }
    if (!OPERATIONS.has(value.operation)) {
      errors.push("Choose set, append, or remove.");
    }
    if (!/^[!#$%&'*+\-.^_\x60|~0-9A-Za-z]+$/.test(value.header)) {
      errors.push("Enter a valid HTTP header name.");
    }
    if (!value.urlFilter || /[\u0000-\u0020\u007f]/.test(value.urlFilter)) {
      errors.push("Enter a URL filter without spaces.");
    }
    if (value.urlFilter.length > 2048) {
      errors.push("The URL filter is too long.");
    }
    if (value.operation !== "remove" && !value.value) {
      errors.push("Enter a header value.");
    }
    if (/[\r\n]/.test(value.value)) {
      errors.push("Header values cannot contain line breaks.");
    }
    if (
      value.target === "request" &&
      value.operation === "append" &&
      !REQUEST_APPEND_ALLOWLIST.has(value.header)
    ) {
      errors.push(
        "Chrome only permits append for selected request headers. Use set instead."
      );
    }

    return { valid: errors.length === 0, errors: errors, value: value };
  }

  function toDynamicRule(input, id) {
    var result = validateOverride(input);
    if (!result.valid) {
      throw new Error(result.errors[0]);
    }

    var value = result.value;
    var modification = {
      header: value.header,
      operation: value.operation
    };
    if (value.operation !== "remove") {
      modification.value = value.value;
    }

    var action = { type: "modifyHeaders" };
    action[value.target + "Headers"] = [modification];

    return {
      id: Number(id),
      priority: Number(id),
      action: action,
      condition: {
        urlFilter: value.urlFilter
      }
    };
  }

  function overrideFromRule(rule) {
    var request = rule && rule.action && rule.action.requestHeaders;
    var response = rule && rule.action && rule.action.responseHeaders;
    var target = request ? "request" : "response";
    var modification = (request || response || [])[0] || {};
    return {
      id: rule && rule.id,
      target: target,
      operation: modification.operation || "set",
      header: modification.header || "",
      value: modification.value || "",
      urlFilter:
        (rule && rule.condition && rule.condition.urlFilter) || ""
    };
  }

  return {
    REQUEST_APPEND_ALLOWLIST: REQUEST_APPEND_ALLOWLIST,
    normalizeOverride: normalizeOverride,
    overrideFromRule: overrideFromRule,
    toDynamicRule: toDynamicRule,
    validateOverride: validateOverride
  };
});
