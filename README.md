<p align="center">
  <img src="extension/icons/icon128.png" width="112" height="112" alt="Headers Studio logo">
</p>

<h1 align="center">Headers Studio</h1>

<p align="center">
  A full-page Chrome extension for viewing, copying, and overriding HTTP
  request and response headers — including <strong>Cookie</strong> and
  <strong>Set-Cookie</strong>.
</p>

<p align="center">
  <a href="https://github.com/tavgar/headers-studio/actions/workflows/test.yml"><img src="https://github.com/tavgar/headers-studio/actions/workflows/test.yml/badge.svg" alt="Tests"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-62e6a7.svg" alt="MIT License"></a>
</p>

## What it does

- Captures request and response headers for the selected website tab.
- Opens as a normal browser tab from the Chrome toolbar — no DevTools or F12.
- Switches between open website tabs from an in-app target selector.
- Includes Cookie and Set-Cookie by using Chrome's extraHeaders access.
- Copies a request, a response, or both as CRLF-delimited raw HTTP headers.
- Reconstructs the Host header when Chrome omits it from the observable list.
- Sets, appends, or removes request and response headers with persistent
  Manifest V3 dynamic rules.
- Filters captured traffic by URL, method, status, and resource type.
- Keeps all captured data local. There are no analytics or network services.

## Install it in Chrome

1. Download or clone this repository.
2. Open **chrome://extensions**.
3. Turn on **Developer mode**.
4. Select **Load unpacked**.
5. Choose the **extension** directory in this repository.
6. Pin **Headers Studio** to the Chrome toolbar.
7. Open a website, then click the Headers Studio logo.
8. Headers Studio opens in a normal tab with that website selected.
9. Reload the selected website tab to capture traffic.

## Copying raw headers

Select a request and use one of the three copy actions:

- **Copy request** produces a request line plus all Chrome-visible request
  headers.
- **Copy response** produces a status line plus all Chrome-visible response
  headers.
- **Copy all raw** places both blocks on the clipboard.

Cookie and Set-Cookie values are included in the copied output even when
**Mask secrets** is enabled in the interface.

## Header overrides

Open the **Overrides** view and provide:

- a Chrome declarativeNetRequest URL filter, such as ||example.com/;
- whether to change request or response headers;
- a set, append, or remove operation;
- the header name and, when needed, its new value.

Rules are active immediately and persist across Chrome restarts. Reload the
target page after adding a rule.

Chrome only allows append on a defined set of request headers. Headers Studio
validates that allowlist and suggests **set** for other request headers.
Set and remove errors from Chrome are surfaced in the interface.

## Important accuracy boundary

This tool exports a useful normalized representation, not literal bytes from
the network:

- Chrome's webRequest API is an abstraction of its network stack and does not
  expose every computed, cache-related, or transport-level header.
- HTTP/2 and HTTP/3 do not use HTTP/1.1 text framing. The extension exports
  those requests in familiar HTTP/1.1-style syntax so the result can be read
  and pasted easily.
- Host is reconstructed from the URL when Chrome does not expose it.
- Requests fulfilled entirely by a page service worker or in-memory cache may
  not appear. Header rules also cannot reverse security decisions Chrome has
  already made.

## Permissions

| Permission | Why it is needed |
| --- | --- |
| All URLs | Observe and modify headers on the sites you inspect |
| webRequest | Observe request and response lifecycle events |
| declarativeNetRequestWithHostAccess | Apply Manifest V3 header overrides |
| storage | Keep tab captures for the session and persist override metadata |
| clipboardWrite | Copy complete raw header blocks |

See [PRIVACY.md](PRIVACY.md) for the complete local-data policy.

## Development

There are no runtime dependencies or build step.

    npm test
    npm run check

To make a distributable archive:

    cd extension
    zip -r ../headers-studio.zip .

## License

MIT
