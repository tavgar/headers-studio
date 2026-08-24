(function attachRawHeaderCore(root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.RawHeaderCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createRawHeaderCore() {
  "use strict";

  var SENSITIVE_HEADERS = new Set([
    "authorization",
    "cookie",
    "proxy-authorization",
    "set-cookie"
  ]);

  function cleanLine(value) {
    return String(value == null ? "" : value).replace(/[\r\n]+/g, " ");
  }

  function binaryHeaderValue(binaryValue) {
    if (!binaryValue) {
      return "";
    }

    var bytes;
    if (binaryValue instanceof ArrayBuffer) {
      bytes = new Uint8Array(binaryValue);
    } else if (ArrayBuffer.isView(binaryValue)) {
      bytes = new Uint8Array(
        binaryValue.buffer,
        binaryValue.byteOffset,
        binaryValue.byteLength
      );
    } else if (Array.isArray(binaryValue)) {
      bytes = Uint8Array.from(binaryValue);
    } else {
      return "";
    }

    try {
      return new TextDecoder("latin1").decode(bytes);
    } catch (_error) {
      return Array.from(bytes, function toHex(byte) {
        return "\\x" + byte.toString(16).padStart(2, "0");
      }).join("");
    }
  }

  function normalizeHeaders(headers) {
    if (!Array.isArray(headers)) {
      return [];
    }

    return headers
      .filter(function keepValid(header) {
        return header && typeof header.name === "string";
      })
      .map(function normalize(header) {
        return {
          name: cleanLine(header.name),
          value: cleanLine(
            typeof header.value === "string"
              ? header.value
              : binaryHeaderValue(header.binaryValue)
          )
        };
      });
  }

  function hasHeader(headers, name) {
    var wanted = String(name).toLowerCase();
    return normalizeHeaders(headers).some(function matches(header) {
      return header.name.toLowerCase() === wanted;
    });
  }

  function requestTarget(url) {
    try {
      var parsed = new URL(url);
      return (parsed.pathname || "/") + parsed.search;
    } catch (_error) {
      return "/";
    }
  }

  function headersWithSynthesizedHost(headers, url) {
    var normalized = normalizeHeaders(headers);
    if (hasHeader(normalized, "host")) {
      return normalized;
    }

    try {
      var parsed = new URL(url);
      if (["http:", "https:", "ws:", "wss:"].includes(parsed.protocol)) {
        return [{ name: "Host", value: parsed.host }].concat(normalized);
      }
    } catch (_error) {
      // Keep the captured list when the URL is not parseable.
    }

    return normalized;
  }

  function serializeHeaders(headers) {
    return normalizeHeaders(headers)
      .map(function serialize(header) {
        return cleanLine(header.name) + ": " + cleanLine(header.value);
      })
      .join("\r\n");
  }

  function requestToRaw(record) {
    var safeRecord = record || {};
    var method = cleanLine(safeRecord.method || "GET").toUpperCase();
    var target = requestTarget(safeRecord.url || "");
    var startLine = method + " " + target + " HTTP/1.1";
    var headers = headersWithSynthesizedHost(
      safeRecord.requestHeaders,
      safeRecord.url
    );
    var serialized = serializeHeaders(headers);
    return startLine + (serialized ? "\r\n" + serialized : "") + "\r\n\r\n";
  }

  function responseToRaw(record) {
    var safeRecord = record || {};
    var statusLine = cleanLine(
      safeRecord.statusLine ||
        ("HTTP/1.1 " + (safeRecord.statusCode || 0))
    );
    var serialized = serializeHeaders(safeRecord.responseHeaders);
    return statusLine + (serialized ? "\r\n" + serialized : "") + "\r\n\r\n";
  }

  function combinedToRaw(record) {
    return requestToRaw(record) + responseToRaw(record);
  }

  function isSensitiveHeader(name) {
    return SENSITIVE_HEADERS.has(String(name || "").toLowerCase());
  }

  function maskedValue(value) {
    var text = String(value || "");
    if (!text) {
      return "";
    }
    return "•".repeat(Math.min(Math.max(text.length, 8), 28));
  }

  return {
    cleanLine: cleanLine,
    combinedToRaw: combinedToRaw,
    hasHeader: hasHeader,
    headersWithSynthesizedHost: headersWithSynthesizedHost,
    isSensitiveHeader: isSensitiveHeader,
    maskedValue: maskedValue,
    normalizeHeaders: normalizeHeaders,
    requestTarget: requestTarget,
    requestToRaw: requestToRaw,
    responseToRaw: responseToRaw,
    serializeHeaders: serializeHeaders
  };
});
