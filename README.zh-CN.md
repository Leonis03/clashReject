# Proxy Guard Blocker

[English](./README.md) | [简体中文](./README.zh-CN.md)

这是一个 Chrome Manifest V3 扩展，会在 Chrome 看起来处于直连状态时，阻止访问以下域名：

- `anthropic.com`
- `claude.ai`
- `claude.com`

## 功能说明

- 通过 `chrome.proxy.settings.get()` 读取 Chrome 当前生效的代理模式
- 将 `direct`、`auto_detect` 和未知代理模式视为不安全状态
- 当 Chrome 只报告 `system` 时，通过本地 Windows helper 读取真实的系统代理状态
- 在不安全状态下，使用动态 `declarativeNetRequest` 规则阻止访问上述三个域名
- 在检测到代理模式恢复后，自动移除拦截规则
- 在 `chrome.proxy.onProxyError` 出现后，额外执行 60 秒 fail-closed

## 文件说明

- `manifest.json`: MV3 清单文件
- `background.js`: Service Worker，负责计算代理状态并更新动态拦截规则
- `offscreen.html` / `offscreen.js`: 隐藏监控页，每 2 秒轮询一次本地 helper
- `proxy-guard-helper.ps1`: 本地 Windows helper，从注册表读取 Internet Settings
- `start-helper.ps1`: 在后台启动 helper
- `stop-helper.ps1`: 停止 helper
- `install-helper-autostart.ps1`: 注册计划任务，在登录时自动启动 helper
- `remove-helper-autostart.ps1`: 删除上述计划任务
- `popup.html`: 扩展弹窗页面
- `popup.js`: 弹窗逻辑
- `popup.css`: 弹窗样式

## 以未打包扩展方式加载

1. 打开 `chrome://extensions`
2. 开启 `Developer mode`
3. 点击 `Load unpacked`
4. 选择当前目录

## 启动 helper

运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\start-helper.ps1
```

helper 会监听 `http://127.0.0.1:8765/state`，供扩展在 Chrome 处于 `system` 模式时读取 Windows 真正的系统代理开关状态。

如果之后需要停止它：

```powershell
powershell -ExecutionPolicy Bypass -File .\stop-helper.ps1
```

## 登录时自动启动 helper

如果你希望 helper 在重启或重新登录后自动恢复，运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\install-helper-autostart.ps1
```

如果之后想移除自动启动：

```powershell
powershell -ExecutionPolicy Bypass -File .\remove-helper-autostart.ps1
```

## 说明与限制

- 弹窗会显示 Chrome 当前代理模式，以及扩展当前是否处于阻止状态。
- 在 `system` 模式下，如果 helper 不可用，扩展会默认阻止访问，这是故意设计的 fail-closed。
- 扩展通过隐藏的 offscreen 文档持续轮询 helper，因此切换 Windows 系统代理后通常不需要手动点击 `Refresh now`。
- helper 当前将 Windows 手动代理和 PAC URL 都视为“系统代理已开启”。这与 Clash for Windows 常见的 `System Proxy` 行为一致。
