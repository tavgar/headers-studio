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
  assert.equal(manifest.version, "1.1.0");
  assert.equal("devtools_page" in manifest, false);
  assert.equal("default_popup" in manifest.action, false);
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
    "panel.html",
    "panel.css",
    "panel.js",
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

test("the toolbar opens a full-page dashboard with website tab selection", function () {
  const background = fs.readFileSync(
    path.join(extensionRoot, "background.js"),
    "utf8"
  );
  const panel = fs.readFileSync(
    path.join(extensionRoot, "panel.html"),
    "utf8"
  );

  assert.match(background, /chrome\.action\.onClicked/);
  assert.match(background, /chrome\.tabs\.create/);
  assert.match(panel, /id="targetTabSelect"/);
  assert.doesNotMatch(panel, /chrome\.devtools/);
  assert.equal(fs.existsSync(path.join(extensionRoot, "devtools.html")), false);
  assert.equal(fs.existsSync(path.join(extensionRoot, "popup.html")), false);
});

test("every dashboard element queried by id exists in the page", function () {
  const panel = fs.readFileSync(
    path.join(extensionRoot, "panel.html"),
    "utf8"
  );
  const script = fs.readFileSync(
    path.join(extensionRoot, "panel.js"),
    "utf8"
  );
  const queriedIds = Array.from(
    script.matchAll(/document\.querySelector\("#([^"]+)"\)/g),
    function id(match) {
      return match[1];
    }
  );

  for (const id of queriedIds) {
    assert.match(panel, new RegExp('id="' + id + '"'), "#" + id + " should exist");
  }
});
