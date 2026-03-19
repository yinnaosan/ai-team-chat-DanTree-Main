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
- [x] 后端 procedure 单元测试 (12个测试全部通过)
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

## 整合回复模式（单条最终回复）
- [x] 后端：修改协作流程，Manus分析和ChatGPT审查全部在后台静默执行
- [x] 后端：ChatGPT决定最终回复框架，Manus做一次校验后输出唯一一条最终消息（role: assistant）
- [x] 前端：ChatRoom只显示用户消息和最终整合回复，隐藏所有中间过程消息
- [x] 前端：任务执行中显示「Manus 分析 → ChatGPT 决策 → Manus 校验」加载状态

## 滚动到底部按鈕
- [x] 聊天区域添加浮动「↓」箭头按鈕，用户向上翻阅时出现，点击平滑滚动到最新消息

## 左侧任务栏升级（折叠/置顶/收藏）
- [ ] 数据库：tasks表添加isPinned、isFavorited字段
- [ ] 后端：pinTask / unpinTask / favoriteTask / unfavoriteTask tRPC procedure
- [ ] 后端：getTasks返回isPinned、isFavorited字段，按置顶>收藏>时间排序
- [ ] 前端：左侧栏分为「置顶」「收藏」「全部对话」三个可折叠分组
- [ ] 前端：每个任务项右键或悬停显示「置顶/取消置顶」「收藏/取消收藏」操作按钮
- [ ] 前端：置顶任务显示📌图标，收藏任务显示⭐图标

## Gemini UI完全照搬
- [ ] index.css：完全使用Gemini配色（深灰背景#1e1f20、蓝紫accent、Google Sans字体）
- [ ] 左侧栏：Gemini侧边栏风格（宽度260px、圆角hover、分组标题小字）
- [ ] 聊天区域：Gemini消息气泡样式（无边框卡片、宽松间距、markdown渲染）
- [ ] 输入框：Gemini输入框风格（圆角pill形、底部工具栏图标）
- [ ] 顶部导航：Gemini顶栏（logo居左、模型标识居中、设置居右）
- [ ] 左侧任务栏：置顶分组、收藏分组、全部对话分组，各自可折叠
- [ ] 每个任务项：悬停显示📌置顶和⭐收藏操作按钮

## Manus排版 & 下载 & 双重权限
- [ ] 后端：Manus系统提示词强制要求结构化Markdown排版（标题、表格、分隔线、代码块）
- [ ] 前端：消息气泡检测表格/文档内容，显示下载按钮（CSV/Markdown/PDF）
- [ ] 前端：下载功能实现（表格→CSV，完整回复→Markdown，富文本→PDF）
- [ ] 后端：Owner身份绑定ruiw872@gmail.com（通过openId匹配）
- [ ] 前端：访客访问页面优化，明确区分Owner登录和访客密钥入口
- [ ] 左侧任务栏：分组折叠（置顶组/收藏组/历史组）
- [ ] 左侧任务栏：悬停显示置顶/收藏/删除操作按钮
- [ ] 左侧任务栏：置顶任务置顶显示，收藏任务收藏分组显示

## 新任务对话框 & 跨任务记忆联动
- [ ] 数据库：conversations表（每次点击「新任务」创建独立会话）
- [ ] 数据库：messages表添加conversationId字段，消息归属到具体会话
- [ ] 后端：chat.createConversation procedure（创建新会话，返回conversationId）
- [ ] 后端：chat.getConversations procedure（获取当前用户所有会话列表）
- [ ] 后端：chat.getConversationMessages procedure（按conversationId获取消息）
- [ ] 后端：chat.submitTask支持conversationId参数，消息写入对应会话
- [ ] 后端：跨任务记忆联动——任务完成后自动保存摘要到memory_context表
- [ ] 后端：新任务开始时自动注入最近N条历史任务摘要作为上下文
- [ ] 前端：点击「新任务」按钮创建新会话并切换到该会话
- [ ] 前端：侧边栏按会话分组显示（每个会话显示第一条用户消息作为标题）
- [ ] 前端：切换会话只显示该会话的消息，不混入其他会话
- [ ] 前端：新会话创建后自动聚焦输入框

## 文件拖拽上传（文档/图片/视频/音频）
- [x] 数据库：attachments表（文件元数据：名称、类型、S3 URL、会话ID、消息ID）
- [x] 后端：file.upload procedure（接收文件Buffer，上传S3，返回URL和fileId）
- [ ] 后端：文件内容提取——PDF/TXT/Word提取文本，图片用LLM Vision描述，音频用Whisper转文字
- [ ] 后端：submitTask支持attachmentIds参数，将文件内容注入AI上下文
- [x] 前端：输入框底部添加附件按钮（点击选择文件）
- [x] 前端：整个聊天区域支持拖拽文件（拖入时显示高亮遗罩）
- [x] 前端：文件附件预览卡片（图片缩略图、文档图标、视频/音频播放器）
- [x] 前端：上传进度指示器
- [ ] 前端：消息中显示已附加的文件卡片
- [x] 前端：支持多文件同时上传

## 四步协作流程重构（静默内部流转）
- [ ] 后端：Step 1 — Manus 分解任务（拆解子步骤、识别数据需求、制定执行计划）
- [ ] 后端：Step 2 — Manus 执行数据收集/分析/统计，生成结构化数据报告
- [ ] 后端：Step 3 — GPT 经理审阅数据报告，给出观点、文字建议和表达框架（内部，不输出）
- [ ] 后端：Step 4 — Manus 按 GPT 经理建议整合最终回复（结构化 Markdown）
- [ ] 后端：Step 5 — GPT 最终审核，确认质量后输出唯一一条 assistant 消息
- [ ] 后端：全程内部流转不写入消息表，只写入最终 assistant 消息
- [ ] 前端：加载状态显示「分析中...」单一状态，不展示内部步骤

## 强制结构化 Markdown 输出（类 GPT 排版）
- [x] 后端：强化 Manus 系统提示词——每条回复必须有 ## 标题、**加粗**关键词、表格对比、> 引用块结论
- [x] 后端：强化 GPT 经理整合指令——最终输出必须有清晰视觉层次，禁止纯文本段落
- [x] 后端：Step 4 整合阶段加入「排版检查」步骤，确保最终回复符合格式规范

## 设置页 ChatGPT 预览窗口
- [x] 设置页新增「ChatGPT 连接」标签页
- [x] 内嵌 iframe 直接显示 ChatGPT 界面（chatgpt.com），可视化确认登录状态
- [x] 状态指示卡：显示 RPA 连接状态、当前使用的对话框名称「投资manus」
- [x] 提供「在新窗口打开」按钮，方便用户切换到正确对话项目
- [x] iframe 加载失败时显示友好提示（浏览器安全限制说明）

## 手动登录 ChatGPT 内嵌浏览器窗口
- [ ] 后端：添加 /api/browser-proxy 路由，将 Playwright 浏览器的页面内容代理给前端
- [ ] 后端：添加 rpa.openLoginWindow procedure，启动/复用 Playwright 浏览器并返回代理 URL
- [x] 前端：设置页「ChatGPT 连接」标签添加可调整大小的内嵌窗口（iframe + resize handle）
- [x] 前端：窗口内显示 chatgpt.com，用户可手动登录，登录后 RPA 自动复用该 cookie
- [x] 前端：添加「刷新连接」按钮，登录后点击让 RPA 重新检测登录状态

## 新任务弹出对话框
- [x] 前端：点击「新任务」弹出 Dialog，包含任务名称输入框和确认/取消按钮
- [x] 前端：确认后创建独立会话（conversationId），侧边栏立即显示新会话
- [x] 前端：新会话创建后自动聚焦输入框，准备接收第一条消息

## 手动登录 ChatGPT 内嵌浏览器窗口
- [x] 前端：设置页「ChatGPT 连接」标签添加可调整大小的内嵌窗口
- [x] 前端：窗口内显示 chatgpt.com，用户可手动登录
- [x] 前端：添加「刷新连接」按钮，登录后点击让 RPA 重新检测登录状态

## 任务会话完全隔离（新任务 = 新对话框）
- [ ] 后端：submitTask 接收 conversationId 参数，消息绑定到指定会话
- [ ] 后端：getMessages 支持按 conversationId 过滤，只返回该会话消息
- [ ] 前端：每个命名任务会话维护独立消息列表，切换时只显示该会话消息
- [ ] 前端：新任务创建后聊天区域清空，从空白开始
- [ ] 前端：侧边栏任务会话显示最后一条消息预览

## 设置页内嵌完整浏览器窗口
- [ ] 后端：添加通用网页代理路由 /api/web-proxy，支持任意 URL 转发并移除 X-Frame-Options
- [ ] 前端：设置页「ChatGPT 连接」标签改为内嵌浏览器，默认加载 Google 搜索
- [ ] 前端：地址栏支持输入任意 URL 并按 Enter 跳转
- [ ] 前端：快捷按钮：Google / ChatGPT / 刷新 / 新窗口
- [ ] 前端：拖拽手柄调整窗口高度（300-900px）

## 新任务=新空白对话框 + 跨任务记忆联动 + 侧边栏分组
- [x] 数据库：conversation_groups 表（id, userId, name, color, createdAt）
- [x] 数据库：conversations 表添加 groupId 字段
- [x] 后端：group.create / group.list / group.delete / group.addConversation procedure
- [x] 后端：chat.getConversationMessages 按 conversationId 隔离返回消息
- [x] 后端：chat.submitTask 传入 conversationId，消息绑定到该会话
- [x] 前端：新任务弹窗确认后立即切换到空白对话界面（清空显示消息）
- [x] 前端：发消息时携带当前 conversationId，消息只属于该会话
- [x] 前端：切换会话时调用 getConversationMessages 加载该会话消息
- [x] 前端：侧边栏支持创建分组，任务可拖入分组
- [x] 前端：分组可折叠展开，显示组内任务列表

## 修复 ChatGPT 连接面板（移除无效代理 iframe）
- [ ] 前端：移除 chatgptProxy 反代理 iframe（ChatGPT 反爬虫检测导致无法使用）
- [ ] 前端：改为「新窗口打开」引导界面，提供清晰的登录步骤说明
- [ ] 前端：显示 RPA 实时连接状态（已连接/未连接/检测中）
- [ ] 前端：提供「检测连接」按钮，触发 RPA 重新检测 ChatGPT 登录状态

## 侧边栏搜索功能
- [x] 后端：chat.searchConversations procedure（按任务名称 + 消息内容全文搜索）
- [x] 前端：侧边栏顶部添加搜索框（点击展开，输入关键字实时过滤）
- [x] 前端：搜索结果高亮匹配关键字
- [x] 前端：搜索无结果时显示空状态提示
- [x] 前端：按 Esc 或清空搜索框恢复正常列表

## 简化协作流程 + 复制按钮 + 任务中补充输入
- [ ] 后端：重构协作流程为3步——Step1 Manus拆解任务（识别哪些自己做，哪些给GPT），Step2 各自处理，Step3 Manus汇总
- [ ] 后端：删除多余的内部审核循环，减少LLM调用次数，提升响应速度
- [ ] 前端：每条AI消息右上角添加复制按钮（悬停显示，点击复制全文）
- [ ] 前端：任务进行中输入框保持可用，支持随时输入补充信息
- [ ] 前端：补充输入追加到当前任务上下文，不创建新任务
