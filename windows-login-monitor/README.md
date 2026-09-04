# Windows 登录监控服务

此独立 Go 程序每 10 分钟以增量 XPath 查询 Windows `Security` 日志中的 4624（成功）和 4625（失败）事件。它会把同一次检测的事件合并成一个 JSON webhook 请求；请求失败时，事件保存在程序目录的 `state.json`，下次成功发送前不会丢失。

首次启动时，如果系统启动时间不超过 20 分钟，会发送一条重启通知。每天 09:00 的检测周期会发送一条简短存活通知。

## 构建和安装

在 Windows 且已安装 Go 1.22+ 的管理员终端运行：

```powershell
go build -o login-monitor.exe .
Copy-Item config.example.json config.json
notepad config.json
.\login-monitor.exe install
```

`install` 注册自动启动的 Windows 服务；服务以 LocalSystem 运行，能够读取 Security 日志。请将 `webhook_url` 改为实际 webhook（例如 Gotify 的 `/message?token=...`）。程序发送：

```json
{"events":[{"time":"...","user":"...","address":"...","result":"success"}]}
```

`address` 为 `127.0.0.1` 表示本机。启动和存活通知使用 `result` 为 `startup` 或 `heartbeat`，并提供 `message`。

## 数据和维护

程序目录包含 `config.json`、发送队列及读取位置 `state.json`，以及仅记录错误的 `login-monitor.log`。日志在超过 20 MiB 时滚动一次，且超过 30 天时删除。没有检测到登录时不会写 info 日志。

卸载服务：

```powershell
.\login-monitor.exe uninstall
```
