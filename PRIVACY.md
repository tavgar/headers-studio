# Privacy

Headers Studio processes browser traffic locally inside the extension.

- It does not transmit, sell, or share request data.
- It does not include analytics, telemetry, advertising, or remote code.
- Captured headers are kept in Chrome session storage and are removed when the
  related tab closes or when you clear the capture.
- Header override rules are stored locally so they persist across browser
  restarts.
- Copied data goes only to your local clipboard.

Request headers can contain credentials, session cookies, and personal data.
Treat copied header blocks as secrets and review them before sharing.

The extension requests access to all URLs because Chrome requires host access
to observe and modify headers for those URLs. Chrome blocks extensions from
observing certain browser-internal and protected traffic.
