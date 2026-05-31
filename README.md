# Proxy Guard Blocker

[English](./README.md) | [简体中文](./README.zh-CN.md)

Chrome Manifest V3 extension that blocks:

- `anthropic.com`
- `claude.ai`
- `claude.com`

whenever Chrome appears to be using a direct connection.

## What it does

- Reads Chrome's effective proxy settings through `chrome.proxy.settings.get()`
- Treats `direct`, `auto_detect`, and unknown proxy modes as unsafe
- When Chrome reports `system`, asks a local Windows helper for the real OS proxy state
- Adds dynamic `declarativeNetRequest` block rules for the three domains while unsafe
- Removes those rules when Chrome reports a proxied mode
- Temporarily fails closed for 60 seconds after `chrome.proxy.onProxyError`

## Files

- `manifest.json`: MV3 manifest
- `background.js`: service worker that evaluates proxy state and updates dynamic rules
- `offscreen.html` / `offscreen.js`: hidden monitor that polls the local helper every 2 seconds
- `proxy-guard-helper.ps1`: local Windows helper that reads Internet Settings from the registry
- `start-helper.ps1`: launches the helper in the background
- `stop-helper.ps1`: stops the helper
- `install-helper-autostart.ps1`: registers a Scheduled Task to start the helper at logon
- `remove-helper-autostart.ps1`: removes that Scheduled Task
- `popup.html`: extension popup
- `popup.js`: popup logic
- `popup.css`: popup styling

## Load unpacked

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this folder

## Start the helper

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-helper.ps1
```

The helper serves `http://127.0.0.1:8765/state` and lets the extension tell whether Windows `System Proxy` is actually enabled while Chrome reports `system`.

If you need to stop it later:

```powershell
powershell -ExecutionPolicy Bypass -File .\stop-helper.ps1
```

## Start helper automatically at logon

If you want the helper to survive reboots without manual startup, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-helper-autostart.ps1
```

To remove the autostart task later:

```powershell
powershell -ExecutionPolicy Bypass -File .\remove-helper-autostart.ps1
```

## Notes

- The popup shows the proxy mode Chrome reports and whether the block rules are active.
- In `system` mode, if the helper is unreachable, the extension fails closed and blocks the protected domains.
- The extension keeps a hidden offscreen monitor alive so Windows proxy toggles are picked up automatically without clicking `Refresh now`.
- The helper currently treats Windows manual proxy and PAC URL as "system proxy enabled". That matches the common Clash for Windows toggle behavior.

## Acknowledgements

[Linux DO Community](https://linux.do)
