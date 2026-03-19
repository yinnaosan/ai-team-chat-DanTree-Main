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
