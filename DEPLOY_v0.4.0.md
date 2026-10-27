# OpenHisAssistant v0.4.0 部署

## 服务器

推荐使用“服务器增量替换包”，不要覆盖真实：

```text
server\config.json
server\data\
```

替换 `app.py`、`admin_users.html`、`server_admin.py` 和本版 `modules\` 中的模块/manifest 后执行：

```bat
cd /d E:\OpenHisAssistant\OpenHisAssistant_v0.4.0\server
python server_admin.py refresh-module-hashes
run_server.bat
```

检查：

```text
http://127.0.0.1:8088/api/ping
```

应显示 `0.4.0`。

后台 `/admin` 中默认仅“悬浮框管理器 + 临床路径”启用，其余迁入脚本按测试账号逐个开启。

## 客户端

使用客户端增量包覆盖源码后重新 Visual Studio：

```text
Release | Any CPU | .NET Framework 4.6.2
```

生成。

本版新增 `UserscriptStorage.cs`，所以务必同时覆盖 `OpenHisAssistant.Client.csproj`，不能只替换 `RuntimeBridge.js`。

## 回退

若首轮测试异常：

1. 关闭 v0.4.0 Server；
2. 恢复部署前备份的 `app.py / admin_users.html / modules`；
3. 数据库表仍兼容，无需删除；
4. 客户端恢复上一版 Release 即可。

GM 新存储位于 `%LOCALAPPDATA%\OpenHisAssistant\UserscriptStorage\`，回退旧客户端不会读取它，也不会影响 HIS 原数据。
