"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const extensionRoot = path.join(projectRoot, "extension");
const manifest = JSON.parse(
  fs.readFileSync(path.join(extensionRoot, "manifest.json"), "utf8")
);

test("manifest is a Chrome Manifest V3 extension", function () {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "Headers Studio");
  assert.equal(manifest.short_name, "Headers Studio");
  assert.equal(manifest.background.service_worker, "background.js");
  assert.equal(manifest.devtools_page, "devtools.html");
});

test("manifest requests the capabilities used by the extension", function () {
  assert.ok(manifest.permissions.includes("webRequest"));
  assert.ok(
    manifest.permissions.includes("declarativeNetRequestWithHostAccess")
  );
  assert.ok(manifest.permissions.includes("storage"));
  assert.deepEqual(manifest.host_permissions, ["<all_urls>"]);
});

test("every local file referenced by the manifest exists", function () {
  const files = [
    manifest.background.service_worker,
    manifest.devtools_page,
    manifest.action.default_popup,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon)
  ];

  for (const file of new Set(files)) {
    assert.equal(
      fs.existsSync(path.join(extensionRoot, file)),
      true,
      file + " should exist"
    );
  }
});
