# 短信会话授权复核（0.2.8）

本记录说明“UFI 授权有效，但短信提示原厂设备会话已过期”的原因与本版处理方式。依据为已保存的 UFI 前端副本、zwrt-datad v0.10.79 参考源码，以及本仓库的原生实现。本轮开发与验证在电脑进行，没有向设备提交登录、发送短信、修改密码或关闭认证的请求。本文不包含密码、密码摘要、会话令牌、设备标识或原始登录响应。

## 两层权限分别验证

| 层级 | 作用与依据 | 不能据此推断的内容 |
| --- | --- | --- |
| UFI HTTP 授权 | `/api/session` 的 `authenticated` 表示 UFI 请求认证结果。屏幕通过已有本机 UFI 凭据和签名调用 UFI 接口。 | 不代表原厂短信使用的设备会话仍有效，也不代表两套密码相同。 |
| 原厂设备会话 | UFI 的设备登录流程及 `SEND_SMS` 后端使用的会话。设备会话过期时，短信可以返回 `device session expired`。 | 不能因 UFI 网页仍能访问，就把短信拒绝判断为发送成功或自动重发。 |

已安装 UFI 前端副本 `ufi-current-main-readonly.js` 的短信错误分支明确保留 UFI 登录，要求恢复设备侧会话；它调用 `out({clearCredentials:false})`。该函数关闭当前短信窗口并重新显示登录输入，不提交登录请求、不发送短信，也不清除仍有效的 UFI 凭据。因此，UFI 已授权与设备会话过期同时出现符合这套前端的设计。

同一前端还单独读取 UFI 口令与原厂管理密码，并分别处理验证错误。`ufi-current-requests-readonly.js` 的 `login()` 在没有原厂密码输入时只检查已有 UFI session；这个分支不等于重新执行原厂登录。

屏幕的 UFI 授权实现见 [ufi_auth.h](../../native/ufi_auth.h) 与 [ufi_local_credential.h](../../native/ufi_local_credential.h)。读取本机现有 UFI 认证摘要只用于 UFI HTTP 层。摘要不写入插件文件、日志或发布包，也不作为原厂密码的替代品。这个过程不要求先打开或登录 UFI 网页。

## 设备会话状态接口的边界

v0.10.79 参考源码中存在两套不同的设备会话路径，不能仅凭名字相似而混用：

- `server.rs` 中 `device.login`、`device.logout`、`device.session_status` 操作应用内部的 `device_session` 槽。`device.session_status.result.logged_in` 只表示这个槽是否存在，没有在该查询中实时验证原厂令牌。它不是 UFI `/api/session` 的替代品，也不是所有短信路径的完整状态判据。
- `device_session.rs` 的 `STATE` 由 `device.session.login` 更新。它另有过期标志，并在可以验证时查询原厂 ubus session。其 `active()` 区分有效、已过期和无法确定；`expired()` 只把明确过期当作过期。`control.rs` 的 `sms.send_raw` 使用这套状态检查。

两套状态没有在上述参考源码中自动合并。旧 `device.login` 的存在不能证明它一定清除另一套状态的过期标志。UFI 已编译后端的完整转发细节也没有从当前本地证据全部恢复；本版因此沿用实际安装前端使用的 UFI 登录路线，不在失败后轮流试用不同 datad 登录接口。

本地还观察到 UFI 有独立的原厂密码缓存候选字段：前端在设备登录成功后调用 `/api/update_admin_pwd`，然后清空输入中的明文。该字段不同于 UFI HTTP 的认证摘要。仅凭字段名、长度或前端调用，不能确认所保存值在所有安装版本中的编码和可复用语义；本版不读取它来猜测或恢复原厂密码，也不调用 `/api/update_admin_pwd` 更新缓存。

## 本版采用的屏幕内恢复流程

实现位于 [sms_session_restore.h](../../native/sms_session_restore.h) 与 [sms_session_pages.h](../../native/sms_session_pages.h)。当短信提示设备会话过期时，可以在屏幕中选择“恢复设备登录”，输入原厂管理密码并确认一次；不需要跳转到 UFI 网页。

恢复操作使用现有 UFI 认证，通过本机 UFI 的 goform 接口执行：

1. 读取 `psw_fail_num_str,login_lock_time`，遵守已知的原厂登录锁定状态。无法读齐可用响应时不提交登录；未明确给出锁定字段时也不据此声称设备已解锁，最终仍由原厂 LOGIN 验证。
2. 读取新鲜的 `LD`，按已安装前端算法计算 `SHA256(SHA256(password) + LD)`。两次 SHA256 都使用大写十六进制输出。
3. 仅提交一次 `goformId=LOGIN&isTest=false&password=<challenge>&user=admin&remember=0`。
4. 只在 HTTP 200、结果为数字或字符串 `0`、且没有矛盾错误字段时接受登录结果。超时、断开、未知格式或被拒绝都不自动重试，不改用其他登录方式。

这条流程不调用 `LOGIN_MULTI_USER`、`LOGOUT`、改密码接口或 datad 登录回退。正常发送继续使用 UFI `SEND_SMS` 和其 AD 签名，见 [sms_ufi.h](../../native/sms_ufi.h)。恢复登录本身绝不调用短信发送函数。

原厂密码在独立受保护的内存输入区使用；不放入普通短信表单、页面明文、磁盘文件或日志。取消、离开、锁屏及恢复操作结束时清理输入；挑战串及网络临时缓冲在调用结束时清零。Linux 下保护内存失败会拒绝打开密码输入。插件不导出或持久化登录 Cookie，也不启用“记住密码”。

本地对实际 LOGIN 提交实行每分钟最多三次的限制，原厂的登录限制仍然有效。这不是绕过原厂认证：会话过期且没有可确认复用的设备会话时，用户需要提供原厂管理密码，不能将 UFI 密码默认当作原厂密码。

登录接口确认成功只表示该次登录结果已被接受，不证明短信已经发出，也不保证设备会话永远有效。恢复后保留短信草稿，需要用户重新检查号码和内容并确认发送。若发送仍返回设备会话错误，继续显示实际错误，不以 `/api/session` 成功覆盖它。

## 本地验证与发布边界

相关回归分为三项：

- [native-sms-ufi.test.js](../../tests/native-sms-ufi.test.js)：UFI 短信请求、结果分类与每次确认最多一次发送。
- [native-sms-session-restore.test.js](../../tests/native-sms-session-restore.test.js)：实际恢复函数的固定接口、挑战算法、单次提交、错误及限流行为。
- [native-sms-session-ui.test.js](../../tests/native-sms-session-ui.test.js)：实际界面函数的独立密码状态、取消与锁定清理、保留草稿，以及恢复不重发。

三个测试文件均进入原生构建的 root proof 哈希名单和发布 gate；两个恢复头文件要求进入原生源码哈希。发布合同固定为 `explicit-UFI-LD-LOGIN`、`memory-only-wiped`、每分钟最多三次、不自动重发、不持久化 Cookie。删除或改坏这些字段不能通过正式打包验证。

上述测试使用本地模拟传输或测试桩，不连接设备。它们验证代码和协议处理，不替代实际固件后端的登录/短信验收。发布元数据继续保留 `deviceSendVerified=false` 与 `hardwareVerified=false`；旧版实机验收不自动覆盖本次新增会话恢复路径。
