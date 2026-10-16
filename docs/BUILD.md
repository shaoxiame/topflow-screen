# 本地构建与验证

公开目录为 0.2.4 最终版。构建脚本只操作电脑上的文件，不连接、安装或启动设备上的程序。源码包含真实接口实现；浏览器预览另用纯合成数据，预览代码不会进入插件 TXT。用户对 0.2.1 的实机验收与本次 0.2.4 的电脑检查分别记录。

## 不需要设备的源码检查

安装 Node.js 22 或更高版本，不需要 npm 第三方包：

```sh
npm test
npm run preview
```

预览默认只绑定 `127.0.0.1:8877`。可通过 `TF_PREVIEW_PORT` 指定其他本地端口。服务器只读取固定白名单文件，没有设备代理、执行命令、上传或遥测功能；浏览器 CSP 禁止网络连接。模式与表单操作仅在浏览器内存演示。关闭终端即停止。

`npm test` 明确运行十三个公开测试文件：device-api、ui-contract、network-status、plugin-manager、production-manager、manager-cancel、manager-theme、manager-confirm、manager-wallpaper、manager-wallpaper-ui、aoyou-adapter、aoyou-ufi-transport、no-remote-integration。所有接口由 mock 提供。原始设备快照未公开，对应历史证据测试明确显示 SKIP；不会把缺失私有输入当作通过。旧商店 SDK 及其下载步骤、遥测测试已移除。

### UFI 管理页外观预览

```sh
node tools/manager-preview-server.cjs
```

打开 `http://127.0.0.1:8882`，可检查当前管理页的深浅色与模拟操作状态；使用 `TF_MANAGER_PORT` 可改本地端口。它复用管理页源码并由单独的开发适配器提供模拟响应，CSP 禁止外部连接，没有设备请求、命令执行、上传或遥测。开发适配器和测试状态不进入成品 TXT。关闭终端即停止预览。

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

### 0.2.4 锁屏壁纸验证边界

原生加载器和文件事务的电脑测试：

```sh
node --test --test-concurrency=1 tests/native-wallpaper.test.js tests/native-wallpaper-files.test.js
```

前者编译实际 C 加载器并模拟受限文件系统调用；后者执行真实 Shell 壁纸函数，对临时文件检查头部、尺寸、SHA-256、硬链接、事务完成状态和完整卸载，设备路径全部重定向到电脑临时目录。Windows 使用准备好的 Git Shell、Node.js 和 Zig；不会接触设备。原生锁屏布局另由 `native/test-lock-layout.ps1` 检查，仍需要预览编译器与合法字体。

管理端把图片裁切为固定 320×480 RGB565。设备通过 UFI 的 `run_shell` 接收受锁分块，不使用 `/upload_file` 传壁纸。最终文件 `lock-wallpaper.rgb565` 为 307,216 字节；`.lock-wallpaper.upload` 暂存整图，`.lock-wallpaper.chunk` 最多 24,576 字节，`.lock-wallpaper.pending` 保存 SHA-256、安装归档、随机 32 位十六进制 nonce 与 boot UUID。prepare、chunk、commit、abort、clear 均核对当前开机 UUID；chunk 额外核对同次开机事务、SHA、nonce、精确偏移、规范 base64 和总长度。响应未知时不自动重试或提交，可显式 abort；清理后迟到 chunk、旧 nonce、跨开机命令及卸载后命令全部拒绝，不创建目录。commit 校验完整文件头、长度、哈希、归属及原壁纸后同目录原子替换。卸载在生命周期锁内清理已识别动态文件。没有后台服务、持续日志或原厂文件修改。

## 生成插件 TXT

完成前述原生构建后打包，无需下载任何旧商店 SDK：

```powershell
pwsh -NoProfile -File native/package-native.ps1
npm run prepare:release
npm run build
```

v0.2.4 继续不含旧商店在线目录查询、遥测 SDK 或数据上报。官方文档入口只供用户主动阅读；没有把旧 SDK 换域名继续运行，也不自动改变 UFI 的内置商店或设备授权服务。

package 会生成源码哈希、AArch64 ELF 和启动文件完整性清单，并携带适用许可证（含 FreeType gzip 的 zlib 声明）。`prepare:release` 重新运行公开 JS 检查、原生电源键/菜单测试及锁屏壁纸加载/事务测试，核对原生归档源码/二进制/启动完整性及发布契约后生成与源码哈希绑定的本地门禁。`build` 再次检查并输出 `dist/topflow-screen-0.2.4.txt`、稳定别名 `dist/topflow-screen.txt`，以及各自完整文件名加 `.meta.json` 的元信息旁文件。门禁保留 `hardwareVerified=false` / `DEVICE_ACCEPTANCE_PENDING` 表示本次构建未自动执行新的设备验收，不否认用户对旧版的实机反馈。

0.2.4 的管理器识别已核验的 0.2.3、0.2.2，以及公开版和早期私发 0.2.1 归档。导入新 TXT、在 UFI 点击“提交”并刷新后，可通过本地更新完成原厂恢复、旧组件清理及新组件启用，无需先手动卸载。未知或被修改的归档不因版本号相同而获得迁移许可。重新构建也不承诺复现历史归档的相同字节。

## 按官方规范导入与发布

依据：[UFI-TOOLS-ZWRT 1.0.0 文档目录](https://tapan.top/UFITOOLS-U60Pro/1.0.0%E6%96%B0%E7%89%88%E6%9C%AC%E6%96%87%E6%A1%A3)，其中包含插件开发文档、API 文档和自建插件源规范。

TXT 是 UTF-8 原始插件，必须保留完整 `<script>...</script>` / 样式包装；不得添加 `KANO_META` 或商店内部安装 ID。单次插件导入上限为 4 MiB。宿主“插件功能 → 插件商店”的一键安装/更新写入编辑区，之后须点击“提交”；“仅下载”不安装。

元信息旁文件供源维护者使用，其文件名必须是完整插件文件名加 `.meta.json`，对象中 `version` 为 `0.2.4`，不是外套一个 `meta` 属性。旁文件不执行、无需导入面板，也不意味着已在官方商店上架。

官方内置商店由宿主管理；自定义源留空或“恢复内置源”可恢复该入口，本插件不会自动执行这项设置。若自行发布静态源，按规范提供 HTTPS `plugins.json`、下载根地址、`res.code:200`、`res.data.content` 及推荐的大小/SHA-256。保持文件名稳定，使用最终分发字节更新 `meta.version` 与清单；不要把文档地址或 GitHub 文件预览页当作源地址。

最终 TXT 不包括合成数据、原厂字体、设备库、密码、开发日志或链接桩。可发布成品不代表支持任意固件，也不表示本次公开整理重新完成了触摸、休眠、亮度、短信和恢复原厂的实机测试。
