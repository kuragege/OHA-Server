# OpenHisAssistant v0.4.0 首轮原油猴脚本迁移测试

## 一、服务器升级前

备份：

```text
server\config.json
server\data\openhisassistant.db
server\modules\
```

不要用完整源码包直接覆盖真实 `config.json` 和 `data`。

## 二、服务器替换

用 v0.4.0 服务器增量包覆盖：

```text
app.py
admin_users.html
modules\manifest.json
modules\suite-manager.js
modules\clinical-path.js
modules\patient-info.js
modules\inpatient-info.js
modules\diagnosis-auto-fill.js
modules\herbal-ai.js
modules\drug-ai.js
modules\outpatient-assistant.js
modules\record-print-bridge.js
```

保留原：

```text
config.json
data\
```

然后执行：

```bat
python server_admin.py refresh-module-hashes
run_server.bat
```

检查：

```text
http://服务器IP:8088/api/ping
```

应返回版本 `0.4.0`。

## 三、后台模块权限

进入：

```text
http://服务器IP:8088/admin
```

首轮默认只应开启：

```text
☑ 七脚本隔离与悬浮框管理器 3.7.3.5.4
☑ 临床路径 1.48.14
```

其余 7 个脚本默认关闭。

先用一个专门测试账号，不要一开始给所有医生账号全开。

## 四、客户端编译

客户端增量覆盖后，以：

```text
Release | Any CPU
.NET Framework 4.6.2
```

重新生成。

`bin\Release\` 全部文件一起测试。

## 五、第一轮：只测管理器 + 临床路径

登录后先验证：

1. 原“临床路径”悬浮框出现。
2. 原“七脚本隔离与悬浮框风格管理器”出现。
3. 管理器拖动、折叠、显示隐藏、排列效果与 Tampermonkey 下相同。
4. 管理器的 PatList/患者列表 999 早期补丁仍有效。
5. 临床路径组套、联想、预警设置正常。
6. DeepSeek API 正常，不要求客户端填写真实 API Key。

DevTools Console 可检查：

```javascript
OHA.version
OHA.runtime.kind
OHA.userscript.version
OHA.modules.list()
```

预期：

```text
0.4.0
userscript-compatibility
1.1.0
```

## 六、逐个开启剩余脚本

建议顺序：

```text
1. 自动填写患者信息
2. 自动填写住院信息
3. 诊断列表 AI 辅助填写
4. 中草药 AI 辅助批量录入
5. 药品 AI 辅助自动录入
6. 门诊助手
7. 住院病案首页打印与诊断桥接
```

每增加一个模块，都测试：

- 是否出现且只有一个悬浮框；
- 原管理器是否能识别；
- 拖动/折叠/排列是否正常；
- 是否出现 CSS 或 input/select 串台；
- AI 请求是否正常；
- 关闭权限、重新登录后脚本是否完全不下发。

## 七、打印桥接最后测试

打印桥接同时匹配 8003/8000。

先确认 8000 打印页打开方式：

- 若当前 WebView2 内直接导航：直接测试诊断桥接共享数据；
- 若 `window.open` 弹出独立窗口：记录该现象，下一阶段增加 OHA 子 WebView2 接管，不把它误判为脚本本体故障。

## 八、门诊助手流式显示

v0.4.0 第一阶段会在 DeepSeek 完整 SSE 返回后一次性喂给原 `onprogress` 解析逻辑。因此功能应能完成，但文字可能不再逐 token 出现。后续可升级为真正的流式桥接。
