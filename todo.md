# AI Team Chat — Project TODO

## 数据库 & 后端
- [x] 设计并迁移 messages 表（任务、消息历史）
- [x] 设计并迁移 tasks 表（任务状态、分工记录）
- [x] 设计并迁移 db_connections 表（用户金融数据库连接信息）
- [x] 实现 chat.submitTask tRPC procedure（用户提交任务）
- [x] 实现 chat.getMessages tRPC procedure（获取消息历史）
- [x] 实现 rpa.getStatus tRPC procedure（获取RPA状态）
- [x] 实现 dbConnect.save / dbConnect.list / dbConnect.setActive / dbConnect.delete tRPC procedure
- [x] 实现 Manus 执行层逻辑（任务分解、LLM分析）
- [x] 实现 RPA 模块（Playwright 操控 ChatGPT 浏览器）
- [x] 实现任务协作流程（Manus执行 → ChatGPT检查 → 汇总报告）

## 前端 UI
- [x] 群聊UI（消息气泡，区分用户/Manus/ChatGPT/系统）
- [x] 任务输入框（支持提交任务）
- [x] RPA状态指示器（显示正在操控ChatGPT的状态）
- [x] 数据库连接配置面板
- [x] 消息历史滚动加载
- [x] 用户认证（登录/登出）
- [x] 响应式设计

## 测试
- [x] 后端 procedure 单元测试 (9个测试全部通过)
- [x] RPA 模块集成测试

## 对话框锁定 & 底层指令- [x] RPA 模块：自动定位 ChatGPT 侧边栏中名为「投资」的对话框并锁定
- [x] RPA 模块：每次任务前先导航到「投资」对话框，确保记忆上下文完整
- [x] 后端：支持持久化存储目标对话框名称配置（rpa_config 表）
- [x] Manus 执行层：从数据库读取用户保存的底层指令，注入 system prompt
- [x] 设置页面：添加「ChatGPT 目标对话框名称」输入框
- [x] 设置页面：添加「Manus 底层指令」多行文本输入框
- [x] 后端： rpa.setConfig / rpa.getConfig tRPC procedure

## 访问控制（仅限Owner）
- [ ] 后端：所有 protectedProcedure 增加 Owner 身份校验，非Owner返回 FORBIDDEN
- [ ] 后端：新增 ownerProcedure 中间件
- [ ] 前端：登录后检查是否为 Owner，非Owner显示「无权限」页面
- [ ] 前端：Home页面未登录时显示登录入口，登录后非Owner直接跳转无权限页

## 密码访问控制 & 长久上下文记忆
- [ ] 数据库：access_codes 表（Owner生成的访问密码，含使用次数/有效期）
- [ ] 数据库：user_access 表（记录哪些用户已通过密码验证）
- [ ] 数据库：memory_context 表（全局跨任务上下文摘要，供Manus和ChatGPT读取）
- [ ] 后端：access.verify procedure（用户输入密码验证）
- [ ] 后端：access.checkAccess procedure（检查当前用户是否已有访问权限）
- [ ] 后端：access.generateCode procedure（Owner生成新密码）
- [ ] 后端：access.listCodes procedure（Owner查看所有密码）
- [ ] 后端：access.revokeCode procedure（Owner撤销密码）
- [ ] 后端：协作流程注入历史上下文（最近N条任务摘要作为记忆）
- [ ] 后端：每次任务完成后自动更新全局记忆摘要
- [ ] 前端：密码输入页面（未授权用户看到此页面）
- [ ] 前端：Owner管理面板（生成/查看/撤销访问密码）
- [ ] 前端：聊天界面显示历史任务列表，支持点击查看完整上下文
- [ ] 前端：所有tRPC调用增加访问权限检查

## UI重设计 & 对话框名称更新 & 历史对话持久化
- [ ] RPA默认：ChatGPT固定使用「投资manus」对话框
- [ ] RPA默认：Manus固定使用「金融投资」对话框
- [ ] 后端：getMessages支持加载全部历史（无分页限制）
- [ ] 后端：新增getConversations接口，按任务分组返回历史对话列表
- [ ] 前端：Gemini风格UI（深色，左侧历史对话列表，右侧主聊天区）
- [ ] 前端：左侧面板显示所有历史任务，点击可切换查看
- [ ] 前端：登录后自动加载全部历史消息，无需刷新
- [ ] 前端：Home页面登录后检查访问权限，无权限跳转密码页
- [ ] 前端：顶部导航Owner可见「管理」入口
