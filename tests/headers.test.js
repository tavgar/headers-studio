"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const headers = require("../extension/lib/headers.js");

test("raw request includes a reconstructed Host and Cookie", function () {
  const raw = headers.requestToRaw({
    method: "POST",
    url: "https://api.example.test:8443/v1/items?q=green#ignored",
    requestHeaders: [
      { name: "Content-Type", value: "application/json" },
      { name: "Cookie", value: "session=abc; theme=dark" }
    ]
  });

  assert.equal(
    raw,
    [
      "POST /v1/items?q=green HTTP/1.1",
      "Host: api.example.test:8443",
      "Content-Type: application/json",
      "Cookie: session=abc; theme=dark",
      "",
      ""
    ].join("\r\n")
  );
});

test("an observed Host header is not duplicated", function () {
  const raw = headers.requestToRaw({
    method: "GET",
    url: "https://example.test/",
    requestHeaders: [
      { name: "host", value: "edge.example.test" },
      { name: "Accept", value: "*/*" }
    ]
  });

  assert.equal((raw.match(/^host:/gim) || []).length, 1);
  assert.match(raw, /host: edge\.example\.test/i);
});

test("response output preserves repeated Set-Cookie fields", function () {
  const raw = headers.responseToRaw({
    statusLine: "HTTP/2 200",
    responseHeaders: [
      { name: "set-cookie", value: "a=1; Secure" },
      { name: "set-cookie", value: "b=2; HttpOnly" }
    ]
  });

  assert.equal((raw.match(/^set-cookie:/gim) || []).length, 2);
  assert.match(raw, /^HTTP\/2 200\r\n/);
});

test("captured line breaks cannot inject extra raw header lines", function () {
  const raw = headers.serializeHeaders([
    { name: "X-Test\r\nInjected", value: "safe\r\nstill-safe" }
  ]);
  assert.equal(raw, "X-Test Injected: safe still-safe");
});

test("sensitive header detection is case-insensitive", function () {
  assert.equal(headers.isSensitiveHeader("COOKIE"), true);
  assert.equal(headers.isSensitiveHeader("Set-Cookie"), true);
  assert.equal(headers.isSensitiveHeader("Content-Type"), false);
});
