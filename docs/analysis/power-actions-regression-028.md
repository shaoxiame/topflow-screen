# 电源操作未确认：接口与原厂完成通知复核（0.2.8）

本记录补充正常关机、重启与快速关机的原厂屏幕生命周期。依据为本机已有 UFI 前端副本、zwrt-datad v0.10.79 源码、原厂 SDK/屏幕程序静态分析，以及本轮维护者提供的只读核对结果；没有执行关机、重启或试探性控制请求。本记录不含密码、设备标识、登录响应或原始私有日志。

## 接口合同没有写错，但原有提示丢失了失败分类

原生屏幕的 `power_device_submit` 向本机 datad 的 `POST /control` 提交以下 JSON，动作名称与空参数对象符合 v0.10.79 的合同：

```json
{"action":"device.reboot","params":{}}
{"action":"device.poweroff","params":{}}
```

参考源码 `rust/src/control.rs:200–220`：先刷新活动历史，再分别调用 `zwrt_mc.device.manager` 的 `device_reboot` / `device_poweroff`，业务参数均固定为 `{"moduleName":"web"}`。这两个控制动作不要求额外的 `confirmed` 或密码字段。

`rust/src/server.rs:2001–2056` 的成功响应是 HTTP 200 与 `{"ok":true,"action":"对应动作","result":...}`；ubus 调用失败为 HTTP 502 与 `error.code="device_call_failed"`。原生 `tf_control_success` 对成功响应的动作回显检查与该合同匹配。

UFI 前端当前关机按钮走 `POST /api/device/poweroff`、空 JSON、10 秒等待，检查 HTTP `response.ok` 与解析后的 JSON `res.success === true`；该前端注释注明后端使用 datad `device.poweroff`。重启按钮走表单 `goformId=REBOOT_DEVICE` 并检查 JSON `result == "success"`。证据为本机 `ufi-current-main-readonly.js:4178–4190、5578、5632–5638` 及 `ufi-current-requests-readonly.js:506–510`。这两个 UFI 响应格式不能直接套到 datad `/control`。

原有屏幕提示“电源操作结果未知”将以下情况合并：HTTP 非 200、后端拒绝、JSON 不符合合同、等待超时、连接中断，以及显示生命周期取消等待。它不证明请求未发送，也不能单凭这一提示确定请求已执行。原生等待为 5 秒，而 datad 的 ubus socket 与 CLI 路径各有 8 秒期限，另有请求排队和前置刷新耗时；客户端可能早于后端返回结束等待。

本轮只读核对确认设备 datad 版本为 0.10.79，capabilities 列出两个动作，MC schema 声明 `device_reboot`、`device_poweroff` 及完成通知方法。当前快速开机设置为关闭，状态为正常开机。没有触发控制请求，也没有可用日志证明具体一次失败的响应码，因此不能把某一种超时或参数差异认定为已经实证的唯一根因。

## 已确认的兼容缺口：正常关机与重启的屏幕完成通知

### 原厂注册正常关机参与者

SDK `sendRegDoneToMC` 在 `0x1791c` 调用 `subscribePowerOffNormalEvent`（`0x17698`）。该函数从常量 `0x49328` 取得路由编号 **69**，向 `zwrt_mc.device.manager / poweroff_subscribe` 发送原厂模块名 `zte_topsw_devui`。

普通完成函数 `ZTD_SetPowerOffComplete` 位于 SDK `0x23c5c`：`0x23cc8` 读取常量 `0x4b1b8`，其数值为 **71**；`0x23d08–0x23d28` 构造 `moduleName="zte_topsw_devui"` 与 `resetFlag=0`；`0x23d38` 发送。编号 71 对应实际方法拼写 `poweroff_compelte`。该回执与编号 74 的 `poweroff_quicken_compelte` 是不同阶段，不能互相替代。

### 普通关机

SDK 的 `zwrt_device_power_state_event` 分支将 `action="mode_power_off"`、`parameter="normal"` 映射为 UI 事件 `0x55`（`0x45824–0x45848`）。原厂 UI 在 `0x45dd30–0x45dd9c` 进入 `processPowerCallback`（`0x456eb0`），安排关机提示及动画。动画 `displayPowerOnOffAnimation`（`0x43679c`）的模式 2 或 4 在 `0x436a00` 调用普通完成函数。

本次审计起点的插件只把普通 OFF 当作熄屏门禁，缺少与该事件绑定的普通完成通知。停止原厂 UI 后，缺失其屏幕阶段完成通知是明确的协议覆盖缺口；MC 是否会等待到超时以及等待多久，仍须结合服务端实现或运行证据确认。

### 重启

原厂 SDK 还处理 `action="zwrt_mode_lcd_reboot"`，在 `0x458c4–0x458e0` 调用 UI 事件 `0x57`。审计起点的插件没有识别这个动作。

已核对的原厂调用链为：

1. UI `0x45dd68` 识别 `0x57`，从 `0x45e164` 经 GOT `0xef93f8` 进入 `processPoweroffRebootCallback`（`0x4571f0`）。
2. 回调在 `0x457308` 传提示类型 2，经 GOT `0xef9430` 进入 `TUFormShutDownMessage`（`0x4643a4`）。
3. `0x464874` 分支显示重启提示；`0x464934–0x464944` 安排约 1.5 秒后的 `startAnimationTimerEvent`（GOT `0xef99e8`，目标 `0x463e08`）。
4. 定时回调在 `0x463f40–0x463fe0` 按快速开机配置与当前主状态选择动画模式 5 或 2。
5. 两条动画路径分别在 `0x436a60` / `0x436a00` 调用 **普通** `ZTD_SetPowerOffComplete`。

这里的“提示类型 2”与“动画模式 2/5”是不同参数。虽然动画模式 4 也共用普通完成分支，本调用链没有证明重启必须进入模式 4。也不能因名字包含重启，就改发 `power_reset_compelte`：该 SDK 方法属于编号 77 的另一条接口，不是上述重启屏幕完成链的结论。

## 快速关机周期包含两个阶段的回执

SDK 将以下事件都交给 UI `0x5a`：`mode_power_off / quicken`、`mode_power_off_quickening`、`mode_power_off_unreal`，见 `0x45788–0x457f0`。但仅 `action="mode_power_off_quickening"` 在 UI 回调返回后，于 `0x4580c` 调用快速完成函数。

UI 回调 `processPowerCallback` 在 `0x456f2c–0x456f4c` 检查 `m_IsPowerOff` 与 `m_IsReboot`；已开始处理时跳过重复创建，否则先置关机标志再安排提示。异步动画模式 5 结束时，`0x436a60` 仍调用普通完成函数。因此原厂一次快速关机周期可以包含：

- SDK 在收到 quickening 后发送快速阶段完成回执。
- UI 的异步关机动画完成后发送普通屏幕阶段完成回执。

不能把一个周期内的 `off/quicken → quickening → unreal` 当作三次独立普通完成请求。普通完成通知应跨这些阶段去重；明确 ON 才开始下一周期。事件没有到达时，不应仅凭用户点过按钮或读到某个 OFF 配置就合成回执。

## 最小实现方向与边界

补齐原厂事件与对应完成通知比修改正确的 HTTP action 更有依据：正常关机和 `zwrt_mode_lcd_reboot` 需要独立的普通完成待办；快速事件仍保留快速阶段待办，并在周期内去重。复用现有 LCD OFF 事务，在实际亮度为零、背光休眠锁已释放后才能发送；与明确事件序号/周期绑定，ON 取消旧待办，回执结果不确定时不盲目重发。

电源提交响应应区分“明确拒绝”“尚未发出”“已经发出但连接中断/超时”“请求接受但设备完成状态未确认”，保留已知的后端错误分类。原厂 OFF/重启事件已经到达时应转入相应电源状态，避免只留一个笼统的 HTTP 错误页面。不得为追求成功提示自动重试不可逆操作。

仍不新增或删除 MC 关机参与者，不改电源状态配置。原厂 UI 路径中的驱动移除脚本与系统操作不属于本插件需要照搬的接口。`moduleName` 在 SDK 与 datad 中不同是已知实现差异，但现有证据没有证明它导致失败；不应盲改 datad 或绕开其接口。

本记录是修复依据，不是修复后的真机验收报告。对应实现、自动测试与打包结果应以最终版本验证记录为准。
