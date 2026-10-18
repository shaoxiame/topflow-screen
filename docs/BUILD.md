# 本地构建与验证

公开目录为 0.2.11 最终版。构建脚本只操作电脑上的文件，不连接、安装或启动设备上的程序。源码包含真实接口实现；浏览器预览另用纯合成数据，预览代码不会进入插件 TXT。2026-10-19，用户确认已交付 0.2.11 实机验收通过，本轮问题全部修复，包括开关机、快速开机首次亮屏及返回插件屏幕。该用户反馈与电脑检查分别记录；开发工具没有访问设备。0.2.1 验收及 0.2.9 首次亮屏异常保留为历史记录。

本次公开发布沿用用户已验收的 0.2.11 TXT、元信息及原生归档，不重新构建。以下命令用于复现电脑构建与测试，不表示发布前另行执行了一次实机测试。

## 不需要设备的源码检查

安装 Node.js 22 或更高版本，不需要 npm 第三方包：

```sh
npm test
npm run preview
```

预览默认只绑定 `127.0.0.1:8877`。可通过 `TF_PREVIEW_PORT` 指定其他本地端口。服务器只读取固定白名单文件，没有设备代理、执行命令、上传或遥测功能；浏览器 CSP 禁止网络连接。模式与表单操作仅在浏览器内存演示。关闭终端即停止。

`npm test` 明确运行十五个公开测试文件：device-api、ui-contract、network-status、plugin-manager、production-manager、manager-shell-size、manager-cancel、manager-theme、manager-confirm、manager-wallpaper、manager-wallpaper-ui、manager-wallpaper-migration、aoyou-adapter、aoyou-ufi-transport、no-remote-integration。所有接口由 mock 提供。原始设备快照未公开，对应历史证据测试明确显示 SKIP；不会把缺失私有输入当作通过。旧商店 SDK 及其下载步骤、遥测测试已移除。

### UFI 管理页外观预览

```sh
node tools/manager-preview-server.cjs
```

打开 `http://127.0.0.1:8882`，可检查当前管理页的深浅色与模拟操作状态；`?wallpaper` 使用纯 CSS 合成壁纸检验透明卡片，`?mobile` 检查窄列；使用 `TF_MANAGER_PORT` 可改本地端口。它复用管理页源码并由单独的开发适配器提供模拟响应，CSP 禁止外部连接，没有设备请求、命令执行、上传或遥测。开发适配器和测试状态不进入成品 TXT。关闭终端即停止预览。

## Windows 原生交叉编译

需要 Windows x64、PowerShell 7、Git、Node.js 22+、Python 3.9+、系统 `tar`。Python 脚本仅用标准库。

```powershell
pwsh -NoProfile -File tools/bootstrap.ps1
$env:TF_PYTHON = 'python' # 或你自己的 python.exe 完整路径
pwsh -NoProfile -File native/build.ps1
pwsh -NoProfile -File native/build-factory-bus.ps1
```

bootstrap 下载固定 litehtml / FreeType Git commit 和 SHA-256 校验的 Zig 0.14.1 Windows 归档，不执行第三方安装脚本。已有依赖 revision 不一致或存在改动时停止。`native/upstream` 是保留授权的 u60pro-devui 后端源文件及本项目改动，无需克隆另一个 upstream 仓库。上游来源见第三方声明。

主渲染器静态编译为 `aarch64-linux-musl`。factory bus helper 使用已公开的 OpenWrt 头文件和 `native/vendor/openwrt/link-imports.json` 中的必要 ABI 声明。链接桩只用于构建，绝不能部署；打包器拒绝 `.so` 和 `build-bus-import` 进入归档。运行时仍依赖设备已有的 `/lib/ld-musl-aarch64.so.1`、`libubus.so.20230605`、`libubox.so.20230523`。编译成功不证明其他固件的 ABI 或服务行为兼容。

## 原生字体与图片预览

原厂字体没有分发。提供你有权使用的 CJK TTF/TTC/OTF，例如当地安装的合法字体，或按其许可证获取 Noto Sans CJK：

```powershell
$env:TF_FONT = 'D:\Fonts\YourLicensedCJKFont.ttf'
pwsh -NoProfile -File native/build.ps1 -Preview
node native/preview/generate-pages.js
```

输出在 `native/preview/`，全部为合成值。浏览器 UI 与设备 litehtml 是不同渲染环境；替代字体的字宽与原厂字体不完全相同，不能宣称像素级复现原厂字体截图。其他 `native/preview/*.js` 与字体布局测试使用同一 `TF_FONT`。

可独立运行不依赖历史证据的原生逻辑测试，例如：

```powershell
pwsh -NoProfile -File native/test-battery.ps1
pwsh -NoProfile -File native/test-modem-source.ps1
pwsh -NoProfile -File native/test-network-status.ps1
pwsh -NoProfile -File native/test-lockscreen.ps1
```

许多原生布局测试要求先编译 Preview、生成页面及运行前置 fixture 测试（例如锁屏布局须先运行 test-pin、test-soft-lock、test-lockscreen）。`test-controls.ps1`、`test-display-preflight.ps1` 等历史证据测试还依赖未分发的设备采集输入；历史迁移测试依赖旧成品。它们保留供代码阅读，不属于 `npm test` 的可移植通过承诺。`native/test-*.ps1` 全量通配执行不是干净克隆的推荐检查命令。

### 0.2.3 电源键菜单验证边界

完成 Windows 构建依赖准备后，可单独运行：

```sh
node --test --test-concurrency=1 tests/native-power-key.test.js tests/native-power-menu.test.js
```

这些测试编译电脑本机 C 测试程序，并检查 Linux 目标编译；Windows 使用固定版本 Zig。缺少编译器会失败，不会按通过处理，也不属于上面的 `npm test` 公开入口。`prepare:release` 会再次执行这两组检查。

v0.2.3 新增实体电源键长按菜单，使用项目已有 `KEY_LONG_MS=1200` 判定和本机电源控制接口。这个数值是本插件的判定阈值，不是本次实测的原厂阈值。电脑测试须分别覆盖以下行为，不能只以界面出现或一次成功响应代替完整检查：

- 长按阈值前后、按键重复事件和释放事件：一次长按不再附带短按；亮屏不调用唤醒重锁，熄屏先按原有流程唤醒。
- PIN 锁和防误触锁：菜单可显示，电源操作禁用；取消保留原锁，不能通过直接动作或残留确认绕过锁定。
- 菜单与原页面：清除未确认业务操作、阻止背景触摸或滑动穿透、取消恢复页面及滚动位置；休眠或显示重新同步撤销菜单和过期确认。
- 请求确认：先查 `/capabilities`，选择后另行确认，再核对能力并向 `/control` 发一次 `device.reboot` 或 `device.poweroff`；能力变化、拒绝、超时和断线不得触发自动重试或完成假报。
- 更新与恢复：受信 0.2.2 以及已登记 0.2.1 归档可更新；修改过的组件仍拒绝覆盖，恢复原厂、自启动和卸载的原有保护继续检查。

测试仅使用电脑上的按键、时间、进程、文件及 HTTP 替身；不向设备发送电源请求。最终执行结果以 [公开构建记录](PUBLIC-BUILD-VERIFICATION.json) 的对应版本为准。用户对 0.2.1 的实机反馈不覆盖此次新增长按菜单；实际电源键事件、休眠唤醒和设备关机/重启仍属于实机验证范围。

### 0.2.6 锁屏壁纸验证边界

原生加载器和文件事务的电脑测试：

```sh
node --test --test-concurrency=1 tests/native-wallpaper.test.js tests/native-wallpaper-files.test.js
```

前者编译实际 C 加载器并模拟受限文件系统调用；后者执行真实 Shell 壁纸函数，对临时文件检查头部、尺寸、SHA-256、硬链接、事务完成状态和完整卸载，设备路径全部重定向到电脑临时目录。Windows 使用准备好的 Git Shell、Node.js 和 Zig；不会接触设备。原生锁屏布局另由 `native/test-lock-layout.ps1` 检查，仍需要预览编译器与合法字体。

管理端把图片裁切为固定 320×480 RGB565。设备通过 UFI 的 `run_shell` 接收受锁分块，不使用 `/upload_file` 传壁纸。最终文件 `lock-wallpaper.rgb565` 为 307,216 字节；`.lock-wallpaper.upload` 暂存整图，`.lock-wallpaper.chunk` 最多 24,576 字节，`.lock-wallpaper.pending` 保存 SHA-256、安装归档、随机 32 位十六进制 nonce 与 boot UUID。prepare、chunk、commit、abort、clear 均核对当前开机 UUID；chunk 额外核对同次开机事务、SHA、nonce、精确偏移、规范 base64 和总长度。响应未知时不自动重试或提交，可显式 abort；清理后迟到 chunk、旧 nonce、跨开机命令及卸载后命令全部拒绝，不创建目录。commit 校验完整文件头、长度、哈希、归属及原壁纸后同目录原子替换。卸载在生命周期锁内清理已识别动态文件。没有后台服务、持续日志或原厂文件修改。

## 状态同步回归

```powershell
node --test --test-concurrency=1 tests/native-wifi-state.test.js tests/native-wifi-integration.test.js tests/native-page-state-sync.test.js tests/native-band-state-sync.test.js tests/native-ufi.test.js
pwsh -NoProfile -File native/test-display-external-sync.ps1
```

这些测试执行真实 C 状态解释、页面合并与操作确认函数；网络和设备调用使用测试替身。Wi-Fi 运输按单次最多 8 KiB 非阻塞读取，其他当前页读取使用单个限时子进程及每轮最多 64 KiB 管道预算。Windows 对子进程调度注入可控运输替身；真实 POSIX fork/pipe 路径通过 ARM64 交叉编译验证，未宣称已经在设备运行。

## 生成插件 TXT

完成前述原生构建后打包，无需下载任何旧商店 SDK：

```powershell
pwsh -NoProfile -File native/package-native.ps1
npm run prepare:release
npm run build
```

v0.2.11 继续不含旧商店在线目录查询、遥测 SDK 或数据上报。官方文档入口只供用户主动阅读；没有把旧 SDK 换域名继续运行，也不自动改变 UFI 的内置商店或设备授权服务。

package 会生成源码哈希、AArch64 ELF 和启动文件完整性清单，并携带适用许可证（含 FreeType gzip 的 zlib 声明）。`prepare:release` 重新运行公开 JS 检查、Wi-Fi / 页面 / 频段 / UFI 同步测试、原生电源键/菜单与锁屏壁纸测试、外部显示配置与休眠回归，核对原生归档源码/二进制/启动完整性及发布契约后生成与源码哈希绑定的本地门禁。`build` 再次检查并输出 `dist/topflow-screen-0.2.11.txt`、稳定别名 `dist/topflow-screen.txt`，以及各自完整文件名加 `.meta.json` 的元信息旁文件。门禁保留 `hardwareVerified=false` / `DEVICE_ACCEPTANCE_PENDING` 表示本次构建未自动执行新的设备验收，不否认用户对 0.2.11 的实机验收。公开记录的 `userReportedHardwareAcceptance` 单独记录 2026-10-19 用户验收通过，历史构建标记和原始产物不作回改。

0.2.11 的管理器识别已核验的 0.2.10、0.2.9、0.2.8、0.2.7、0.2.6、0.2.5、0.2.4、0.2.3、0.2.2，以及公开版和早期私发 0.2.1 归档。导入新 TXT、在 UFI 点击“提交”并刷新后，可通过本地更新完成原厂恢复、旧组件清理及新组件启用，无需先手动卸载。未知或被修改的归档不因版本号相同而获得迁移许可。重新构建也不承诺复现历史归档的相同字节。

024 / 025 / 026 / 027 / 028 / 029 / 0210 → 0.2.11 更新通过固定分块只读导出、完整头部与 SHA 校验，在浏览器内存保留壁纸。卸载前与恢复 prepare/commit 均在现有生命周期锁内再次比对状态，防止覆盖其他管理页新上传的壁纸。恢复仍使用原有 nonce / boot / offset 绑定上传协议，不新增备份目录或后台服务。`tests/manager-wallpaper-migration.test.js` 和 `tests/manager-wallpaper-migration-audit.test.js` 分别验证内存迁移及生产 Shell 的锁内竞态。`tests/manager-migration-024.test.js` 需要从公开 v0.2.4 原始 TXT 中提取并校验内嵌的精确归档，放入 `.cache/recovery-024/topflow-native.tar.gz`；历史文件缺失不算验证通过。

## 按官方规范导入与发布

依据：[UFI-TOOLS-ZWRT 1.0.0 文档目录](https://tapan.top/UFITOOLS-U60Pro/1.0.0%E6%96%B0%E7%89%88%E6%9C%AC%E6%96%87%E6%A1%A3)，其中包含插件开发文档、API 文档和自建插件源规范。

TXT 是 UTF-8 原始插件，必须保留完整 `<script>...</script>` / 样式包装；不得添加 `KANO_META` 或商店内部安装 ID。单次插件导入上限为 4 MiB。宿主“插件功能 → 插件商店”的一键安装/更新写入编辑区，之后须点击“提交”；“仅下载”不安装。

元信息旁文件供源维护者使用，其文件名必须是完整插件文件名加 `.meta.json`，对象中 `version` 为 `0.2.11`，不是外套一个 `meta` 属性。旁文件不执行、无需导入面板，也不意味着已在官方商店上架。

官方内置商店由宿主管理；自定义源留空或“恢复内置源”可恢复该入口，本插件不会自动执行这项设置。若自行发布静态源，按规范提供 HTTPS `plugins.json`、下载根地址、`res.code:200`、`res.data.content` 及推荐的大小/SHA-256。保持文件名稳定，使用最终分发字节更新 `meta.version` 与清单；不要把文档地址或 GitHub 文件预览页当作源地址。

最终 TXT 不包括合成数据、原厂字体、设备库、密码、开发日志或链接桩。可发布成品不代表支持任意固件，也不表示本次公开整理重新完成了触摸、休眠、亮度、短信和恢复原厂的实机测试。

## v0.2.8 关机、重启与快速开机联动

运行 `pwsh -NoProfile -File native/test-factory-power.ps1` 检查原厂状态解析、MC 事件融合、假关机期间显示/输入门禁和恢复路径。`native/test-factory-bus.ps1` 与 `native/test-device-power-events.ps1` 检查实际回调、私有协议、事件绑定回执及失效/防重复路径；`native/test-display-runtime.ps1` 覆盖亮度事务中途关机。`tests/native-power-transport.test.js` 用实际同步 HTTP 循环验证发送前/部分发送/发完后取消、定长与 chunked 完整回复、半包、超时和慢响应。`tests/native-power-menu.test.js`、`tests/native-extra.test.js` 验证 UI 的一次确认、明确响应与未确认结果，不自动重复。状态文件和设备调用均由电脑测试夹具提供，不连接设备。`prepare:release` 包含这些检查及原有锁屏、显示与休眠回归。

`tests/manager-migration-025.test.js` 使用精确 v0.2.5 发布归档，放在 `.cache/recovery-025/topflow-native.tar.gz`。归档 SHA-256 必须为 `0702ffaf6ff94b0974bf617926e5232dcabc27f7d8770b87b4038c0eb885bc1c`；新增版本号本身不授予迁移权限。

### v0.2.8 短信会话恢复检查

发布检查包括 `tests/native-sms-ufi.test.js`、`tests/native-sms-session-restore.test.js`、`tests/native-sms-session-ui.test.js`：以电脑上的合成响应检查 UFI 签名、AD、LD / LOGIN、密码清理、草稿保留与单次提交。它们不调用真实登录或发送短信。

## v0.2.9 完成回执异常检查

补充实际 helper/client 的错误和超时路径验证：完成通知未确认不等同通信协议损坏，不重发；过期回执不跨越电源周期。真实 EOF、非法报文仍不能被当作成功。原厂电源键没有独占或全局屏蔽。这一修复当时依据电脑验证；用户后续确认开关机已正常，同时指出长按开机后首次亮屏仍需再按一次。此前只读连接到的另一台设备已排除，历史分析见 [记录](analysis/power-completion-029.md)。

## v0.2.11 通知处理与升级设置保留

本轮修正真实主循环中的通知消费顺序：旧 WAKE / RESYNC 在策略读取前消费，等待中到达的新通知保留到下一轮；取消先锁定 PIN、清理敏感输入，不能被当成读取成功或解锁成功。真实总线、配置、保护锁或渲染故障仍交回原厂，不放宽原厂电源门禁。原生 renderer 重新编译，helper、screenctl 与 supervisor 沿用 0.2.10 字节。

新增 native/test-wake-resume.ps1 从生产代码提取实际 vendor 等待、busy hook、策略读取、锁屏与主循环，在 OS 边界模拟通知，覆盖 15 个场景；另有原有显示、光感、PIN 与关机回归。这些是电脑验证；用户于 2026-10-19 另行确认 v0.2.11 实机验收通过，二者不混为同一测试。

已开启且两次完整回读一致的自启动设置，在新版安装、壁纸恢复、三次运行状态确认后恢复一次，并再次核验；未知、关闭、取消和失败路径不会自动开启。恢复未确认时显示独立结果，不重试更新。0210 迁移使用从已交付 TXT 提取的精确原归档，不能用本地重建归档代替。

## v0.2.10 密码遮罩、服务恢复与旧版迁移检查

`tests/native-sms-session-ui.test.js` 验证实际 ASCII 字符数与密码遮罩：空输入、1 至 7 字符、12 / 13 字符边界、1024 字符上限，以及退格、清空和大小写/符号模式切换。显示最多 12 个圆点，超出加省略号，完整字符数仍显示；测试同时检查原文不进入 HTML、密码清理、短信草稿保留和恢复后不自动发送。

```sh
node --test tests/native-sms-session-ui.test.js
node --test tests/manager-migration-029.test.js
```

0.2.9 精确迁移测试使用 `.cache/recovery-029/topflow-native.tar.gz`，SHA-256 为 `29caeea8aca38968097d4f8b11bb7577dbfb21e66985fb74afe2691f9d1ea2b1`。管理器核验归档标记、所有文件、文件类型和归属；版本号相同不代替逐文件校验。发布门禁依次执行 024 至 029 六组精确历史迁移，旧归档缺失不记为通过。

休眠服务恢复专项为 `native/test-sleep-provider-recovery.ps1`，配合 `native/test-device-power-events.ps1`、`native/test-factory-bus.ps1`、`native/test-factory-power.ps1` 和 `native/test-display-runtime.ps1`。测试分别模拟 OFF 后订阅对象移除、旧对象的迟到移除、重新注册、服务缺席期间收到 MC ON / OFF、订阅恢复与标准唤醒；MC 电源事件与服务可用性分别记录。专项还执行真实订阅函数的定时器夹具，检查期限边界、已有定时器拒绝、待处理信号清理与超时退出。只有明确 ON 才允许恢复显示，普通 WAKE、重新注册和本地按键不代替 MC 开机通知。

恢复仅针对已收到 OFF、随后确认订阅对象被移除的路径。OFF 时不增加重试轮询，只响应重新注册；明确 ON 后使用最多 3 秒的恢复窗口。对象查找使用最多 500 毫秒的短命独立连接，恢复订阅最多 1 秒，并恢复 helper 自身的信号处理及定时器状态。订阅成功即报告服务可用，OFF 状态仍只能重新同步熄屏与完成回执。完整 ubus 断连、订阅超时、无 OFF 依据的对象移除以及缺服务期间已经在途的显示命令失败，仍走原有安全回退；没有扩大为任意故障的自动重新接管。

本次重编 renderer 与 factory bus helper，`screenctl.sh` 和 `supervisor.sh` 保持 0.2.9 字节不变。自启动仍按 Linux boot ID 每次启动至多尝试一次；假关机没有新 boot ID 时不靠自启入口再次执行。新增路径让现有进程在受支持的局部服务重建期间继续存活，不新增永久观察进程或反复登录。用户对 0.2.9 开关机正常的反馈保留；当时首次亮屏与快速开机回到插件屏幕的 0.2.10 实机结果尚未获得。随后用户于 2026-10-19 确认 v0.2.11 已解决本轮问题；此处保留 0.2.10 开发阶段的历史边界。

本轮记录脚本仅解析电脑门禁与构建日志，`deviceAccess=false`、`deviceWrites=false`。执行结果以与最终 TXT 哈希对应的 [公开构建记录](PUBLIC-BUILD-VERIFICATION.json) 为准。
