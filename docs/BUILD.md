# 本地构建与验证

公开目录来自 0.2.1 最终版。构建脚本只操作电脑上的文件，不连接、安装或启动设备上的程序。源码包含真实接口实现；浏览器预览另用纯合成数据，预览代码不会进入插件 TXT。

## 不需要设备的源码检查

安装 Node.js 22 或更高版本，不需要 npm 第三方包：

```sh
npm test
npm run preview
```

预览默认只绑定 `127.0.0.1:8877`。可通过 `TF_PREVIEW_PORT` 指定其他本地端口。服务器只读取固定白名单文件，没有设备代理、执行命令、上传或遥测功能；浏览器 CSP 禁止网络连接。模式与表单操作仅在浏览器内存演示。关闭终端即停止。

`npm test` 明确运行九个公开测试文件：device-api、ui-contract、network-status、plugin-manager、production-manager、manager-cancel、aoyou-adapter、aoyou-ufi-transport、plugin-center。所有接口由 mock 提供。原始设备快照、UFI WebUI 原文未公开，对应两个历史证据测试会明确显示 SKIP；SDK未下载时，其独立哈希测试也显示 SKIP。不会把缺失私有输入当作通过。

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

## 生成插件 TXT

UFI Plugin Telemetry SDK 2.0.0 没有独立开源许可，源码仓库不包含 SDK 正文。官方插件分发指引建议内嵌固定 SDK；如需重建完整 TXT，显式下载并核验已审查字节：

```powershell
pwsh -NoProfile -File tools/bootstrap.ps1 -WithSdk
pwsh -NoProfile -File native/package-native.ps1
npm run prepare:release
npm run build
```

SDK下载地址、版本和固定 SHA-256 在 `vendor/ufi-device-sdk-provenance.json`。若上游无版本 URL 内容变动，下载步骤拒绝继续；不要删除哈希检查或把新字节冒称已审查版本。

package 会生成源码哈希、AArch64 ELF 和启动文件完整性清单，并携带适用许可证（含 FreeType gzip 的 zlib 声明）。`prepare:release` 重新运行公开 JS 检查，核对原生归档源码/二进制/启动完整性及既有发布契约后生成本地门禁。`build` 再次检查并输出 `dist/topflow-screen-0.2.1.txt`。门禁始终保留 `hardwareVerified=false` / `DEVICE_ACCEPTANCE_PENDING`；它不伪造实机验收。

本仓库的公开整理版会因许可证与清单更新而具有不同于早期私发 0.2.1 的文件哈希。重新构建亦不是历史归档字节重现承诺。已有私发同版本时，先在其旧管理页恢复原厂并完整卸载组件，再导入公开版；不要绕过归属和哈希保护。

最终 TXT 不包括合成数据、原厂字体、设备库、密码、开发日志或链接桩。可发布成品不代表支持任意固件，也不表示本次公开整理重新完成了触摸、休眠、亮度、短信和恢复原厂的实机测试。
