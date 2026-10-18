# 原厂快速开关机协议复核（0.2.8）

本记录来自本机保存的原厂 SDK、屏幕程序和已有接口记录的静态分析，以及本版本源码复核。本次分析没有连接设备、执行电源操作或修改设备文件。文中只保留协议名称、函数地址和实现结论，不包含密码、账号、设备标识或用户文件路径。

## 结论

原厂的快速关机可以保留 Linux 运行，不能把普通熄屏、触摸、充电唤醒或屏幕进程仍在运行视为设备已经开机。原厂 SDK 同时处理设备电源事件和普通休眠事件，快速关机期间保存独立的关机状态。

本版采用原厂电源事件限制屏幕操作：收到 OFF 后保持熄屏、停止页面数据工作、丢弃未完成交互；收到明确的 ON 后才能恢复显示。最终实现包含普通屏幕阶段与快速关机阶段两种完成回执，均与实际收到的原厂事件绑定，发送前确认实际背光为零、原厂背光休眠锁已释放。没有新增 MC 关机参与者，也没有调用 MC 的取消订阅接口。

本记录最初只审计快速阶段；后续追踪原厂动画发现普通关机、重启和快速关机周期还需要普通完成通知。完整调用链与这一缺口的修复依据见 [电源操作回归分析](power-actions-regression-028.md)。下表和实现复核统一描述最终双阶段方案，不能将早期的快速阶段单项复核视为整个电源功能已经验收。

## 原厂事件与回执证据

SDK 监听 `zwrt_device_power_state_event`，其解析分支要求 `action`、`parameter` 都是字符串。现有反汇编见 [sdk-deviceui-services-disasm.txt](sdk-deviceui-services-disasm.txt)，关键地址为 `0x456cc–0x458a0`。

| action / parameter | 原厂 SDK 行为 | 插件行为 |
| --- | --- | --- |
| `mode_power_off` / `quicken` | 调用 UI 事件 `0x5a`，UI 安排普通完成通知 | 进入 OFF；记录普通完成需求；不据此新建快速完成需求 |
| `mode_power_off_quickening` / 字符串 | 调用 UI 事件 `0x5a`，随后调用快速关机完成函数 | 进入 OFF；保留普通完成需求并记录快速完成需求，各阶段每周期至多尝试一次 |
| `mode_power_off_unreal` / 字符串 | 调用 UI 事件 `0x5a`，UI 对同周期重复关机去重 | 保持 OFF；保留同周期未完成需求，已尝试的阶段不重复发送 |
| `mode_power_off` / `normal` | 调用 UI 事件 `0x55`，UI 动画发送普通完成通知 | 进入 OFF；记录普通完成需求 |
| `zwrt_mode_lcd_reboot` / 字符串 | 调用 UI 事件 `0x57`，重启动画发送普通完成通知 | 进入 OFF；记录普通完成需求，不调用重置完成接口 |
| `mode_power_on` / 字符串 | 调用 UI 事件 `0x54` | 解除事件的 OFF 门禁并取消旧回执 |
| `mode_power_off_charger`、`mode_power_off_charger_quicken` / 字符串 | 调用 UI 事件 `0x5b` | 保持 OFF，不新增完成需求；不将充电状态当成正常开机 |

`mode_power_off_quicken` 在本版作为 OFF 状态兼容项处理，不据此新建完成需求，也不清除同周期已收到事件产生的待办；不能据此声称 SDK 上述事件分支也处理这一别名。启动时读取的电源配置也接受原厂 `mode_power_on_charger`；事件的 ON 识别采用已观察到的 `mode_power_on`。

`ZTD_SetPowerOffQuickenComplete` 位于 SDK `0x23d74`，调用路由编号 **74**，构造的业务字段为：

```json
{"moduleName":"zte_topsw_devui","resetFlag":0}
```

路由编号 74 对应对象 `zwrt_mc.device.manager`、方法 `poweroff_quicken_compelte`。`compelte` 是原厂接口的实际拼写。参见 [sdk-invoke-table.txt](sdk-invoke-table.txt) 的编号 74 和 [mc-device-schemas.txt](evidence/mc-device-schemas.txt) 的方法声明。

SDK 函数的关键位置：`0x23de0` 读取编号 74，`0x23e20–0x23e28` 添加 `moduleName`，`0x23e30–0x23e40` 添加数值为零的 `resetFlag`，`0x23e50` 发送。原厂函数本身不等待 MC 业务结果，不能将其返回值解释为整个设备已完成关机。

### resetFlag 不是 zbus 的传输元数据

[zbus-touch-parser-disasm.txt](zbus-touch-parser-disasm.txt) 中，`processSocketReceiveData` 在 `0x6a38`、`0x6a9c`、`0x6aa8` 分别删除 `zbuspeer`、`pthread_id`、`zbustype`，随后在 `0x6ac0–0x6b28` 将剩余 JSON 转为 ubus 业务载荷。这一路径没有删除 `resetFlag`。

因此，虽然已有 ubus 方法声明只列出 `moduleName`，仍不能据此证明省略 `resetFlag` 与原厂完全等价。本版保留 SDK 实际发送的 `resetFlag: 0`；这不是调用设备重置接口，也没有设置设备电源状态。

## 原厂的持久关机状态与黑屏处理

SDK `UICallback`（`0x2dfe4`）先执行 UI 回调，再调用 `businessbackFun`。后者在 `0x19fec–0x1a008` 对事件 `0x5a` 设置 `g_poweroffunreally`，在 `0x1a010–0x1a028` 对事件 `0x54` 清除它；USB 唤醒分支 `0x19ec4–0x19f20` 检查该标志并在关机时跳过普通唤醒。这说明关机标志应跨越普通休眠/唤醒通知保存。

屏幕程序的事件回调在 `0x45dd30`、`0x45dd70` 将事件 `0x55`、`0x5a` 送入 `processPowerCallback`（`0x456eb0`），其关机处理进入 `TUFormShutDownMessage`（`0x4643a4`）。`displayPowerOnOffAnimation` 的快速关机分支在 `0x436a64` 调用 `closeScreenBrightness`（`0x436678`），后者在 `0x4366e8–0x4366f8` 调用 `ZTD_SetLcdOpenOrClose(0)`。

SDK 的快速完成回执发生在 UI 回调返回后，UI 的异步动画还会发送普通完成通知。模式 5 在 `0x436a60` 调用普通完成函数，随后才关闭背光。该静态路径**不能证明原厂已做实际背光与休眠锁回读**；本版增加回读条件是插件的保守实现，不能描述为原厂原本具有的保证。插件先完成自己的 LCD OFF 事务，再处理尚未完成的事件回执；两阶段同时待办时先快速、后普通，每次都重新核对黑屏。没有证据要求跨不同到达时刻的事件强制固定回执顺序，例如普通阶段已经完成后才收到 quickening 时，只补快速阶段。

## MC 订阅的生命周期与边界

`subscribePowerOffQuickenEvent`（SDK `0x17728`）实际使用路由编号 **78**，字段为原厂模块名 `zte_topsw_devui`。编号 72 和 78 都映射到 `poweroff_quicken_subscribe`，但不能把表中存在的编号当成已执行的调用。

`sendRegDoneToMC`（`0x177b8`）先检查 `g_polling_thread_running`，已初始化时直接返回；首次路径依次建立轮询、普通休眠订阅、普通关机订阅及快速关机订阅，最后一项调用位于 `0x17928`。SDK 的 MC `RUN` 通知分支在 `0x4563c–0x45640` 调用这一初始化函数。

在本次检查的 SDK 函数及直接调用中，没有找到调用 `poweroff_quicken_unsubscribe` 的执行路径。路由表编号 73 和 MC 方法声明证明接口存在，**不能证明**原厂停止时一定注销，也不能证明 MC 是否会自动清除进程退出后的记录。没有 MC 服务端实现证据，不对其注册去重、残留记录清理及所有固件版本的行为作推断。

因此本版只在自己的 ubus 连接上监听设备电源广播，不发送普通或快速关机的 subscribe / unsubscribe 方法，不擅自改变原厂模块的参与者登记。现有 `ubus_subscribe`/`ubus_unsubscribe` 是连接到原厂休眠服务的通知订阅，与 MC 关机参与者注册不是同一机制。

## 对本版实现的独立复核

| 复核项 | 实现与限制 |
| --- | --- |
| 事件解析 | [factory_bus_logic.h](../../native/factory_bus_logic.h)、[factory_bus.c](../../native/factory_bus.c) 只接受已知动作；缺少字符串字段或未知动作不会授权开屏或产生回执。 |
| OFF→ON 顺序 | [factory_bus_client.h](../../native/factory_bus_client.h) 校验递增事件序号并保留 OFF 计数，同一轮读取同时收到 OFF、ON 也不会丢失“曾经关机”的事实。 |
| 持久 OFF 门禁 | [factory_power_state.h](../../native/factory_power_state.h) 保存事件 OFF，旧的配置 ON 不能将其覆盖；明确 ON 可跨过尚未落盘的旧 OFF 配置。启动前另用固定只读 `uci get` 获取包含暂存值的有效配置。 |
| 禁止普通唤醒 | [topflow_main.c](../../native/topflow_main.c) 的关机分支清空交互、停止数据读取并排空输入；正亮度、按键、触摸、传感器准备和 HTTP 等待继续受电源门禁约束。 |
| 转换中关机 | [display_runtime.h](../../native/display_runtime.h) 在下一条显示输出命令前重查电源事件，将尚未完成的亮屏转换改为 LCD OFF。 |
| 实际保持黑屏 | 关机期间周期回读实际背光；发现被其他服务点亮时复用现有带回读的 LCD OFF 事务。现有 `off_cycle` 避免重复续租 180 秒闲置保护。 |
| 完成回执 | 普通与快速阶段分别保存事件产生的需求和已尝试标志。OFF→quickening→unreal 同一批到达不会丢失快速待办，也不会重复普通回执；后续同周期事件将未完成待办绑定到最新序号，明确 ON 清除旧周期。实际亮度为零、显示事务完成且 `zteSleepBacklight` 已释放后才请求回执。Helper 查找 MC 对象后再次校验序号，发送前记录该阶段已经尝试，不因不确定结果自动重发。 |
| 共享系统影响 | 新增逻辑不改 UCI 电源状态，不启动第二个 MC 参与者，不重启原厂服务，不操作别的模块的关机登记。关机期间保留插件监管心跳，避免仅因设备虚拟关机而触发原厂恢复。 |

本轮复核发现并纳入修正的缺口包括普通完成通知、重启事件识别，以及 quickening 后同批到达 unreal 导致快速待办丢失。源码测试覆盖协议解析、周期去重、事件排队、序号校验、查找 MC 对象期间 ON/新周期替换、回执失效和显示门禁；测试结果以本版本实际执行的验证记录为准。这份静态复核不替代真机普通关机、重启、快速关机、充电插拔和再次开机的端到端验收，也不证明未知固件的 MC 服务端行为。
