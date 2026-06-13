# ACE Remake 官网游戏主账号认证设计

日期：2026-06-14

## 1. 背景与目标

`D:\ACE_Source\AceRemakeWeb` 当前是纯静态官网，部署目标为 Netlify。现阶段需要为官网增加注册、激活、登录、忘记密码、重置密码能力，并且这套账号必须直接属于游戏主账号体系，而不是独立官网账号。

本设计的目标：

- 官网支持 `账号 + 密码` 登录。
- 邮箱只用于 `账号激活` 和 `密码重置`。
- 官网 `不直接创建游戏账号记录`，而是由游戏后端完成账号创建。
- 官网登录成功后拥有自己的 Web 会话，后续可以扩展到个人中心、下载权限、公告互动、商城等站点功能。
- 方案要兼容未来“网页登录后拉起游戏客户端”或“官网签发票据给启动器”的单点接入。

非目标：

- 本期不重写游戏原有登录协议。
- 本期不引入第二套主账号数据库。
- 本期不让第三方 Auth 服务成为主身份源。

## 2. 现状确认

### 2.1 官网现状

当前 `D:\ACE_Source\AceRemakeWeb` 只有以下核心文件：

- `index.html`
- `config.json`
- `netlify.toml`

说明当前站点是纯静态单页，没有现成的前端工程化框架，也没有现成后端。

### 2.2 游戏服务端现状

在 `D:\ACE_Source\AceOnline-ep46 src v1.2\Server` 中，已经存在和账号认证相关的旧链路语义：

- `Server\GameServer\AtumLauncher\AtumLauncherDlg.cpp`
  - 启动器登录时会发送 `MSG_PC_CONNECT_LOGIN`
  - 密码使用 `MD5_PASSWORD_ADDITIONAL_STRING + 明文密码` 后做 MD5
  - 协议中存在 `WebLoginAuthKey`
- `Server\GameServer\PreServer\Main\PreIOCPSocket.cpp`
  - 已有 `IsDirectFieldAuthLoginRequest(...)`
  - 已有基于 `WebLoginAuthKey` 的直连/网页登录认证分支
- `Server\GameServer\PreServer\Main\AtumPreDBManager.cpp`
  - 已有 `ExternalAuthentication(...)`
  - 已有 `ExecuteExtAuth2(...)`
  - 外部认证参数里已经包含 `@i_WebLoginAuthKey`

这说明“官网或外部系统认证后，再换取游戏登录语义”在服务端概念上是成立的，只是当前没有现代 Web API 层来承接官网场景。

## 3. 设计原则

- 游戏后端是唯一账号权威源。
- 官网不维护第二套真实账号表。
- 官网前端不直接调用底层游戏协议，也不直接暴露核心认证细节。
- 官网新增一个轻量 Web 认证中间层，把 Web 体验、安全策略、会话管理与旧游戏协议隔离开。
- 先完成官网认证闭环，再根据需要扩展“网页登录启动器/客户端”的单点能力。

## 4. 推荐架构

采用三层结构：

### 4.1 静态官网前端

职责：

- 展示登录、注册、激活、忘记密码、重置密码页面
- 做基础字段校验
- 调用官网认证 API
- 根据登录态切换站点导航和页面内容

不负责：

- 主账号写入
- 密码哈希
- 邮件 token 生成
- 风控决策

### 4.2 官网认证中间层

建议新增 `Node.js` 认证服务，优先独立部署，而不是直接塞进 Netlify Functions。

原因：

- 这层后续会承接 session、限流、日志、邮件回调、可能的启动器票据交换。
- 如果直接绑定在 Netlify Functions，前期可跑，但后期对长线运维、密钥管理、调试和内部服务互通不够稳。
- 独立服务更适合作为官网和游戏服务端之间的长期边界。

职责：

- 对外暴露现代 Web API
- 调游戏账号后端
- 管理官网 cookie session
- 统一错误码
- 做基础风控与审计

### 4.3 游戏账号后端

职责：

- 注册申请落库
- 账号名唯一性校验
- 邮箱唯一性和绑定规则校验
- 激活 token / 重置 token 管理
- 主账号创建和密码校验
- 返回账号唯一 ID、状态、封禁信息

## 5. 用户流程

### 5.1 注册申请

输入：

- 账号名
- 密码
- 确认密码
- 邮箱
- 同意协议

流程：

1. 前端做格式校验。
2. 调 `POST /auth/register-request`。
3. 官网认证中间层调用游戏账号后端。
4. 游戏账号后端创建待激活申请，或创建待激活账号。
5. 游戏账号后端生成激活 token。
6. 官网认证中间层触发邮件发送。
7. 前端展示统一成功提示。

要求：

- 不在响应中暴露“账号存在”还是“邮箱存在”的细粒度原因给匿名用户。
- 需要记录申请时间、来源 IP、UA，便于审计和风控。

### 5.2 邮箱激活

流程：

1. 用户点击邮件链接，进入 `/activate?token=...`
2. 前端调 `POST /auth/activate`
3. 官网认证中间层调用游戏账号后端校验 token
4. 激活成功后跳转登录页

要求：

- token 一次性使用
- token 过期可重新发送激活邮件

### 5.3 登录

流程：

1. 用户输入账号和密码
2. 前端调 `POST /auth/login`
3. 官网认证中间层调用游戏账号后端校验主账号
4. 成功后官网认证中间层签发站点 session cookie
5. 前端调用 `GET /auth/me` 刷新 UI

要求：

- 账号未激活时返回明确状态，引导重发激活邮件
- 账号封禁时返回站点可展示的封禁提示

### 5.4 忘记密码

流程：

1. 用户输入账号名或邮箱
2. 前端调 `POST /auth/forgot-password`
3. 官网认证中间层向游戏账号后端请求创建重置 token
4. 邮件发送重置链接
5. 页面始终返回统一成功文案

### 5.5 重置密码

流程：

1. 用户打开邮件链接 `/reset-password?token=...`
2. 填写新密码与确认密码
3. 前端调 `POST /auth/reset-password`
4. 官网认证中间层调用游戏账号后端更新密码
5. 成功后跳转登录页

### 5.6 登录态读取与退出

- `GET /auth/me`：读取当前官网会话
- `POST /auth/logout`：清除 session cookie

## 6. API 契约

官网前端只调用官网认证中间层，不直接调用游戏账号后端。

### 6.1 `POST /auth/register-request`

请求：

```json
{
  "accountName": "pilot001",
  "password": "Secret123!",
  "email": "pilot@example.com",
  "agreeToTerms": true
}
```

成功响应：

```json
{
  "ok": true,
  "message": "If the request is valid, an activation email has been sent."
}
```

### 6.2 `POST /auth/activate`

请求：

```json
{
  "token": "..."
}
```

成功响应：

```json
{
  "ok": true
}
```

### 6.3 `POST /auth/login`

请求：

```json
{
  "accountName": "pilot001",
  "password": "Secret123!"
}
```

成功响应：

```json
{
  "ok": true,
  "user": {
    "accountId": 12345,
    "accountName": "pilot001",
    "emailMasked": "pi***@example.com",
    "status": "active"
  }
}
```

副作用：

- 服务端写入 `HttpOnly` session cookie

### 6.4 `POST /auth/forgot-password`

请求：

```json
{
  "accountOrEmail": "pilot001"
}
```

成功响应：

```json
{
  "ok": true,
  "message": "If the account exists, a reset email has been sent."
}
```

### 6.5 `POST /auth/reset-password`

请求：

```json
{
  "token": "...",
  "newPassword": "NewSecret123!"
}
```

成功响应：

```json
{
  "ok": true
}
```

### 6.6 `POST /auth/logout`

成功响应：

```json
{
  "ok": true
}
```

### 6.7 `GET /auth/me`

成功响应：

```json
{
  "authenticated": true,
  "user": {
    "accountId": 12345,
    "accountName": "pilot001",
    "status": "active"
  }
}
```

未登录响应：

```json
{
  "authenticated": false
}
```

## 7. 错误码分层

对前端暴露有限、稳定的 Web 错误码，不泄露底层数据库或旧协议细节。

建议：

- `AUTH_INVALID_CREDENTIALS`
- `AUTH_ACCOUNT_NOT_ACTIVATED`
- `AUTH_ACCOUNT_BLOCKED`
- `AUTH_TOKEN_EXPIRED`
- `AUTH_TOKEN_INVALID`
- `AUTH_RATE_LIMITED`
- `AUTH_SERVICE_UNAVAILABLE`
- `AUTH_VALIDATION_FAILED`

内部可保留游戏后端原始错误，写入日志映射，不直接回传给匿名前端。

## 8. 会话与安全策略

### 8.1 会话

- 使用服务端 session
- cookie 设置：
  - `HttpOnly`
  - `Secure`
  - `SameSite=Lax`
- 不把长期认证 token 放进 `localStorage`

### 8.2 密码

- 前端不缓存密码
- 官网认证中间层只短暂处理明文，转发给游戏账号后端后立即丢弃
- 如果游戏后端仍使用现有密码摘要规则，应由后端统一处理，不在前端复制旧哈希逻辑

### 8.3 风控

- 注册、登录、忘记密码接口做 IP 级限流
- 同一账号连续失败登录次数限制
- 激活邮件、重置邮件加发送冷却
- 保留未来接入验证码的扩展位

### 8.4 审计

记录：

- 时间
- 来源 IP
- User-Agent
- accountName
- 操作类型
- 结果
- 失败原因映射码

## 9. 与旧游戏链路的衔接

一期官网认证完成后，只解决“官网登录态”和“游戏主账号”的一致性问题。

二期可以新增：

- 官网已登录后生成一次性游戏启动票据
- 启动器或客户端携带票据换取 `WebLoginAuthKey`
- 服务端继续复用 `PreServer` 已有外部认证语义

这样可以避免现在就直接改动客户端登录协议，同时保留后续 SSO 路线。

## 10. 实施拆分

### 阶段 A：官网认证中间层

- 新建独立 Node.js 服务
- 完成 session、中间件、错误处理、基础日志
- 对接游戏账号后端占位接口

### 阶段 B：官网前端接入

- 在现有静态官网中新增认证 UI
- 增加登录态读取和导航切换
- 完成注册/激活/登录/重置全链路页面

### 阶段 C：游戏账号后端 Web 化

- 将现有账号能力封装成 Web 可调用接口
- 明确账号创建、激活、重置、登录校验边界
- 增加邮件 token 能力

### 阶段 D：联调与上线

- 验证完整邮件链路
- 验证 cookie、CORS、反向代理
- 验证风控和审计

## 11. 当前建议的代码落点

### 官网仓库 `D:\ACE_Source\AceRemakeWeb`

- 增加认证页面结构
- 增加前端脚本模块
- 增加认证 API 配置

### 新认证服务仓库或目录

建议在 `D:\ACE_Source\AceRemakeWeb` 下新增独立目录，例如：

- `auth-service/`

原因：

- 与静态站点同仓便于一起演进
- 但与纯静态资源明确隔离

### 游戏服务端 `D:\ACE_Source\AceOnline-ep46 src v1.2\Server`

后续重点检查和改造位置：

- `GameServer\PreServer\Main\PreIOCPSocket.cpp`
- `GameServer\PreServer\Main\AtumPreDBManager.cpp`
- 以及账号数据库相关存储过程或访问层

## 12. 关键风险

- 当前服务端已有外部认证语义，但不等于已经具备现代 Web API。
- 邮件激活与密码重置很可能需要新增数据库表、存储过程或服务。
- 如果旧密码规则只能通过客户端兼容逻辑完成，需要把规则收口到后端，不能复制到前端。
- 如果当前账号数据库没有邮箱唯一性或激活状态字段，需要先补齐数据模型。

## 13. 结论

推荐方案是：

- 官网继续保持静态前端
- 新增独立官网认证中间层
- 游戏后端继续作为唯一主账号权威源
- 先完成官网注册/激活/登录/重置闭环
- 再在下一阶段扩展网页登录与游戏启动器票据互通

这是当前约束下风险最低、可演进性最好的落地路径。
