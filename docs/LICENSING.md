# 源码公开与非商用许可

Required Notice: Copyright (c) 2026 shaoxiame (TopFlow Screen contributors).

## 本次发布的许可

本项目有权授权的原创代码及文档，除另有明确声明外，按根目录 [LICENSE](../LICENSE) 中的 **PolyForm Noncommercial License 1.0.0** 发布。许可原文取自 [PolyForm 官方许可证仓库](https://github.com/polyformproject/polyform-licenses/blob/1.0.0/PolyForm-Noncommercial-1.0.0.md)，保持完整未改动。

原文文件 SHA-256：`c0ea4a896d2c8c394b29f9427589996db826cd501c512279ff0ed3ef48fabbe5`。

许可允许符合其条款的非商业使用、修改和分发；本次发布不授予商业用途许可。再分发时，须遵守原文中的通知要求，包括向接收者提供许可条款或其地址，以及本项目提供的 `Required Notice:` 行。许可原文还明确规定了个人用途、列举的非商业机构、法定权利、终止和责任范围；本说明不能改写或扩张这些条款。

特别是，原文对慈善组织、教育机构、公共研究机构、公共安全或卫生机构、环保组织及政府机构的用途有明确规定。不能用 README 的简述取消原文允许的用途。有关使用是否属于许可范围，以完整原文为准。依据：[PolyForm 官方原文](https://github.com/polyformproject/polyform-licenses/blob/1.0.0/PolyForm-Noncommercial-1.0.0.md)。

## 为什么称“源码公开”

这是有非商业用途限制的源码公开项目，不宣称属于 OSI 定义的开源软件。OSI 的开放源代码定义要求许可证不能限制软件用于商业等特定活动领域；公开源代码本身不足以满足该定义。依据：[OSI Open Source Definition，第 6 条](https://opensource.org/osd)。

PolyForm 官方项目将 Noncommercial 列为允许使用、修改、分发但限定非商业用途的许可证；Strict 是不同协议，不能因为本项目停止维护而混用。依据：[PolyForm 官方许可证对照](https://github.com/polyformproject/polyform-licenses/blob/1.0.0/README.md)。

## 第三方和既有授权不受重新限制

- `native/upstream/` 中来自 u60pro-devui 的文件继续保留 MIT 授权。对这些文件的本地修改及署名以文件和目录声明为准，不能将整个目录错误重标为非商用。
- `native/vendor/`、下载的构建依赖、字典和运行库继续适用各自的 MIT、BSD、Apache、FTL、LGPL 等许可证。完整清单见 [第三方声明](../THIRD_PARTY_NOTICES.md)。
- v0.2.2 已移除旧商店遥测 SDK、下载依赖及上报接入。历史版本中第三方组件的原有权利和义务不会因当前移除而被重新授权；旧平台不能因此被称为 UFI-TOOLS-ZWRT 的官方服务。
- 原厂固件、字体、共享库和其他闭源资源不因本仓库公开而取得新许可，也不在本仓库分发。
- 已经合法取得的早期版本或第三方许可权利，不因本次采用非商用许可而被撤销。版权人只能对其有权授权的内容作出本次授权。

根目录 LICENSE 不是对所有第三方作品的统一重授权。使用本仓库构建产物时，需要同时遵守所含各组件的适用条件。

## 最终版与维护政策

v0.2.2 为本项目最终公开版本。项目不承诺持续维护；仓库、Issues、Discussions 和 Pull Requests 保持开放，但不承诺处理反馈、合并改动或提供技术支持。源码公开是为保留和自行研究修改，不构成持续更新、兼容性或实机效果承诺，也不构成额外商业授权。
