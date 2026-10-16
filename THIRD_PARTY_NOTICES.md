# 第三方来源与许可证

本项目的非商业用途许可只覆盖有权按该许可发布的原创内容。以下组件及其原始版权继续适用各自许可证，不能被本项目声明重新限制商业使用、改授权或抹去署名。构建时下载的组件也应保留其许可文件。

## 原生渲染与运行依赖

| 组件 | 固定来源 | 原许可证与说明 |
| --- | --- | --- |
| u60pro-devui | [33333s/u60pro-devui](https://github.com/33333s/u60pro-devui)，`d1d0856e19d58a2a98104e47afbdcfc51e1dc3d1` | MIT，Copyright (c) 2026 u60pro-devui contributors。许可保存在 `native/upstream/LICENSE`。 |
| litehtml | [litehtml/litehtml](https://github.com/litehtml/litehtml)，`8836bc1bc35ca0cfd71dc0386ef841d5cbc3bd5e` | BSD-3-Clause，Copyright (c) 2013 Yuri Kobets (tordex)。保留上游 LICENSE。 |
| Gumbo | 上述 litehtml 的 `src/gumbo/` | Apache-2.0；独立于 litehtml 的 BSD 许可，保留其 LICENSE 和原始通知。 |
| FreeType | [FreeType 官方仓库](https://gitlab.freedesktop.org/freetype/freetype)，`023fd06e3dbe84ab7327ddddd9fe851824fe1ade` | 本项目选择 FreeType License（FTL），保留 `docs/FTL.TXT` 与适用文件通知。 |
| FreeType 内含 gzip/zlib | 上述 FreeType 的 `src/gzip/` | zlib 许可；保留 `src/gzip/zlib.h` 中的版权和许可。其他 FreeType 个别文件按其原始声明。 |
| pinyin-data | [mozillazg/pinyin-data](https://github.com/mozillazg/pinyin-data)，`9193766130af24d2ac54230be979b2e98ac66223` | MIT，Copyright (c) 2016 mozillazg；`native/vendor/pinyin/LICENSE` 与来源记录覆盖生成字典的来源。 |
| ubus 头文件 | [openwrt/ubus](https://github.com/openwrt/ubus/tree/f787c97b)，`f787c97b` | LGPL-2.1；保留 `native/vendor/openwrt/LGPL-2.1.txt` 和原文件通知。 |
| libubox 头文件 | [openwrt/libubox](https://github.com/openwrt/libubox/tree/75a3b870)，`75a3b870` | 不同文件分别采用 ISC/BSD 类许可；完整通知在 `native/vendor/openwrt/openwrt-NOTICE.txt`。 |
| Zig | [Zig 0.14.1](https://ziglang.org/download/0.14.1/) | 编译器从官方获取，不提交完整工具链。其附带运行库分别遵守原许可证。 |
| musl、LLVM libc++/libc++abi | Zig 工具链对应目录 | 原生静态产物包含相关组件；发布包保留 musl COPYRIGHT 与 LLVM 许可文件。 |

This software is based in part on the work of the FreeType Team.

`native/upstream/` 只保留当前构建使用的后端及所需头文件。项目对数据访问、DRM 校验、触摸手势、字体缓存/预览和 HTML 绘制做过本地适配；原始文件及其原许可证保留。这里不是上游未修改版本，也不是将上游项目全部重授权。

若自行引入上游完整源码中的 stb 或 LVGL，则须另外保留这些组件与其可选资源的许可证。当前渲染目标未使用 LVGL，不能因此声称其示例字体、图片可无条件复制。

## UFI-TOOLS-ZWRT 与插件接口

特别鸣谢 **UFI-TOOLS-ZWRT 面板及开发者，感谢提供这么好的平台**。UFI-TOOLS-ZWRT 是设备上的宿主环境；本仓库不包含其完整面板源码，也不授予该面板新的使用或分发权限。

当前宿主接口及插件格式依据 [UFI-TOOLS-ZWRT 1.0.0 官方文档](https://tapan.top/UFITOOLS-U60Pro/1.0.0%E6%96%B0%E7%89%88%E6%9C%AC%E6%96%87%E6%A1%A3)。插件商店由设备宿主管理；公开文档没有要求本插件携带第三方遥测 SDK，也没有授权把另一平台重命名为官方服务。

v0.2.2 已移除先前接入的旧商店链接、远程版本检查、遥测 SDK 和上报。当前构建不下载或捆绑该 SDK；历史归档或分析材料涉及它时，仅描述当时实现，不表示当前运行依赖，也不改变第三方已有授权。

## 参考项目

[imshuhao/topflow-toolkit](https://github.com/imshuhao/topflow-toolkit) 的原项目采用 [MIT](https://github.com/imshuhao/topflow-toolkit/blob/main/LICENSE)，Copyright (c) 2026 imshuhao contributors。本地参考版本为 `1083ee7b4df0964e82699a0f87d60d87552d49b0`。

本项目参考其公开显示适配与资源交接思路，保留独立 litehtml 渲染架构，没有打包其原厂进程 LVGL 注入库、安装器、网络组件或启动钩子。它不是本项目运行依赖。以后如复制其代码，须同时保留其 MIT 许可和版权，不得把引用代码标成本项目独占原创。

原厂接口和已有本地数据服务的调用，不意味着获得原厂固件、字体、页面、图片或二进制的再分发许可。这些资源不包含在公开源码中；设备端只读取已经安装且当前实现所需的资源。

## 许可证正文

第三方许可证在对应源码目录或依赖下载结果中保留；原生发布包的 `licenses/` 包含运行产物所附许可。顶层 [LICENSE](LICENSE) 仅说明本项目原创部分的授权，不能替代本文件列出的各项许可证。
