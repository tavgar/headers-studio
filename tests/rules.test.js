"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const rules = require("../extension/lib/rules.js");

test("builds a request Cookie append rule", function () {
  const rule = rules.toDynamicRule(
    {
      target: "request",
      operation: "append",
      header: "Cookie",
      value: "debug=true",
      urlFilter: "||example.test/"
    },
    1001
  );

  assert.deepEqual(rule, {
    id: 1001,
    priority: 1001,
    action: {
      type: "modifyHeaders",
      requestHeaders: [
        { header: "cookie", operation: "append", value: "debug=true" }
      ]
    },
    condition: { urlFilter: "||example.test/" }
  });
});

test("allows setting an arbitrary valid request header", function () {
  const result = rules.validateOverride({
    target: "request",
    operation: "set",
    header: "X-Debug-Mode",
    value: "enabled",
    urlFilter: "|https://api.example.test/"
  });

  assert.equal(result.valid, true);
  assert.equal(result.value.header, "x-debug-mode");
});

test("rejects append for a request header outside Chrome's allowlist", function () {
  const result = rules.validateOverride({
    target: "request",
    operation: "append",
    header: "x-debug-mode",
    value: "enabled",
    urlFilter: "||example.test/"
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /Use set instead/);
});

test("allows append for response headers", function () {
  const result = rules.validateOverride({
    target: "response",
    operation: "append",
    header: "x-debug-mode",
    value: "enabled",
    urlFilter: "||example.test/"
  });

  assert.equal(result.valid, true);
});

test("rejects header values with line breaks", function () {
  const result = rules.validateOverride({
    target: "request",
    operation: "set",
    header: "x-test",
    value: "safe\r\nInjected: yes",
    urlFilter: "||example.test/"
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /line breaks/);
});

test("remove rules omit the value field", function () {
  const rule = rules.toDynamicRule(
    {
      target: "response",
      operation: "remove",
      header: "x-powered-by",
      value: "",
      urlFilter: "||example.test/"
    },
    1002
  );

  assert.deepEqual(rule.action.responseHeaders, [
    { header: "x-powered-by", operation: "remove" }
  ]);
});
