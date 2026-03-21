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

## 协作流程重构（新三步逻辑：Manus分工 + GPT汇总）
- [x] 后端：重构 runCollaborationFlow 为新三步逻辑
- [x] 后端：Step1 — Manus 接收任务，做能力评估，将任务拆分为「Manus负责部分」和「GPT负责部分」
- [x] 后端：Step2 — Manus 执行自己负责的部分（数据/计算/结构化分析），同时将GPT负责部分发给ChatGPT
- [x] 后端：Step3 — GPT 接收 Manus 报告 + 自己处理的部分，决定最终回复框架，输出最终整合回复
- [x] 前端：更新加载动画文案（Manus 分析擅长领域 → GPT 处理主观判断 → GPT 汇总输出）
- [x] 测试：12 个测试全部通过

## ChatGPT API 替代 RPA（方案A）
- [ ] 后端：添加 openaiApiKey 存储到 settings 表
- [ ] 后端：新增 callOpenAI(prompt) 函数，使用 OpenAI API 调用 GPT-4
- [ ] 后端：修改 runCollaborationFlow，优先用 OpenAI API，其次 RPA，最后内置 LLM 降级
- [ ] 后端：新增 rpa.setOpenAIKey / rpa.getOpenAIStatus procedure
- [ ] 前端：设置页 RPA 连接标签添加 OpenAI API Key 输入框
- [ ] 前端：显示 API Key 连接状态（已配置/未配置）
- [ ] 测试：验证 API Key 存储和调用逻辑

## 本地 ChatGPT 浏览器中转方案
- [x] 生成本地中转脚本 chatgpt-bridge.mjs（Node.js + Playwright）
- [x] 后端：在 rpa_configs 添加 localProxyUrl 字段
- [x] 后端：修改 sendToChatGPT，优先通过 HTTP 调用本地中转服务
- [x] 后端：新增 rpa.setProxyUrl / rpa.testProxy procedure
- [x] 前端：设置页添加本地代理 URL 输入框和测试按钮
- [x] 交付：提供完整使用说明

## OpenAI API 接入（GPT 作为主大脑）
- [ ] 后端：rpa_configs 表添加 openaiApiKey 和 openaiModel 字段
- [ ] 后端：添加 callOpenAI 函数（支持多轮对话）
- [ ] 后端：重构 runCollaborationFlow，GPT 主导多轮对话，Manus 作为执行工具
- [ ] 后端：rpa.setConfig 支持保存 openaiApiKey 和 openaiModel
- [ ] 前端：设置页添加 OpenAI API Key 输入框（密码类型）和模型选择下拉菜单
- [ ] 前端：显示 API Key 连接状态（已配置/未配置）

## Bug 修复：rpa.getStatus 路由不存在
- [x] 修复 ChatRoom.tsx：trpc.rpa.getStatus → trpc.rpa.getConfig（rpa.getStatus 路由已废弃）
- [x] 修复 routers.ts：移除 getRpaStatus/sendToChatGPT 调用，改为 callOpenAI
- [x] 修复 db.ts：upsertRpaConfig 类型签名添加 openaiModel 字段
- [x] 更新 chat.test.ts：mock 适配新的 OpenAI API 架构，12 个测试全部通过

## 协作流程 A+B+C 全结合重构
- [x] 后端：重构 runCollaborationFlow 为两步最优架构：Manus数据分析 → GPT整合输出（节约算力）
- [x] 后端：新增 task status: gpt_planning（数据库迁移完成）
- [x] 前端：ChatRoom 进度显示两阶段（数据收集中 / 顾问整合中）
- [x] 前端：进度动画实时轮询任务状态并更新阶段
- [x] 后端：注入用户核心规则（投资理念+市场范围+回复格式）到每次任务的 system prompt
- [x] 后端：任务间关联记忆（历史任务摘要自动注入到 GPT 上下文）
- [x] 后端：GPT 主角对话者定位，回复末尾必须提出 2-3 个跟进问题
- [x] 后端：每次任务完成后自动保存摘要到记忆表，下次任务自动关联

## 三步并行协作流程重构
- [x] 后端：Step1 Manus完善任务 + GPT分配指令（并行，节约时间）
- [x] 后端：Step2 Manus按GPT指令执行数据分析
- [x] 后端：Step3 GPT整合输出并与用户对话
- [x] 前端：用户消息气泡添加复制按钮（悬停显示）
- [x] 前端：进度显示三阶段（规划分析中 / 数据执行中 / 顾问整合中）
- [x] 后端：每个步骤的 user prompt 均注入投资理念约束（段永平体系）

## 跟进问题快捷按钮
- [x] 后端：GPT 回复中的跟进问题用 %%FOLLOWUP%%...%%END%% 标记包裹
- [x] 前端：解析标记，渲染为可点击圆角按钮，点击后直接发送并触发任务

## 双重访问权限完善
- [x] Owner：通过 Manus 账号登录后直接进入，无需密码
- [x] 访客：登录后显示密码验证页，输入 Owner 生成的一次性密码才能进入
- [x] 前端：访客密码验证页（登录后自动跳转，输入密码验证）
- [x] 前端：Owner 设置页「访问管理」Tab——生成一次性密码、查看已生成密码列表、撤销密码
- [x] 后端：access.generateCode、access.listCodes、access.revokeCode procedure 完善
- [x] 后端：access.verify procedure 完善
- [x] 一次性密码使用后即失效（防止分享）

## 访客验证页面完善
- [x] 前端：AccessGate.tsx 增加登录状态检查（未登录先跳转登录）
- [x] 前端：AccessGate.tsx 增加已有权限检查（已验证直接跳转 /chat）
- [x] 前端：AccessGate.tsx 增加 Owner 检查（Owner 直接跳转 /chat）
- [x] 前端：Home.tsx 登录后自动检查访问权限，Owner 跳 /chat，访客跳 /access

## LLM 稳定性修复
- [x] 给 invokeLLM 调用加上自动重试（最多2次，间隔2秒），处理上游临时500错误
- [x] 修复 Settings.tsx：Owner 访问管理 Tab 因异步 isOwner 加载时序问题不可见

## 协作流程重构（GPT主导框架- [x] 后端：Step1 改为 GPT 主导——读取任务，制定完整分析框架，同时对擅长部分开始处理
- [x] 后端：Step2 改为 Manus 执行——在 GPT 框架基础上完善任务细节、收集数据、整理表格，根据任务量调整输出长度
- [x] 后端：Step3 GPT 整合——接收 Manus 数据报告，深度思考分析，输出最终回复
- [x] 前端：更新三阶段进度显示文案（GPT规划中 → Manus数据执行中 → GPT整合输出中）
## 任务连续性（同对话框内默认延续）
- [x] 后端：submitTask 时读取当前对话框最近的消息历史（最近5轮），注入到 GPT 上下文
- [x] 后端：GPT Step1 prompt 中明确告知「这是同一对话框的延续，除非用户明确说新任务，否则视为跟进」
- [x] 后端：Manus Step2 也接收对话历史，理解当前任务是延续还是新任务

## 「关于」页面同步规则
- [x] 每次更新处理逻辑后，同步更新「关于」页面中的流程说明（当前：重构为GPT主导框架的三步流程 + 对话框任务连续性）

## UI 调整
- [x] 左侧任务栏任务标题字体加粗加大，更显目易找

## 稳定性和性能优化
- [ ] 后端：Step2 Manus LLM失败时自动降级用GPT完成数据收集，不再直接报错
- [ ] 前端：删除listConversations和listGroups的refetchInterval（非必要轮询）
- [ ] 前端：消息轮询从3秒放宽到5秒

## 稳定性和性能优化（不改变原有逻辑）
- [ ] 后端：Step2 Manus失败时自动降级GPT兜底，不报错中断任务
- [ ] 后端：重试策略优化（首次重试1秒，第二次3秒，更快恢复）
- [x] 前端：删除listConversations和listGroups的后台轮询（非必要）
- [ ] 前端：消息轮询从3秒放宽到5秒

## 纯防御性优化（不改变原有逻辑）
- [x] 后端：重试策略改为指数退避（1s→3s，最多3次）
- [x] 前端：删除listConversations和listGroups的后台轮询
- [x] 前端：消息轮询从3秒改为5秒
- [x] 前端：任务状态轮询从2秒改为3秒

## 跟进问题修复
- [x] 统一跟进问题发送路径：handleSubmit接受可选text参数，跟进问题直接调用handleSubmit(q)

## 跟进问题格式修复
- [ ] 后端：Step3 prompt明确禁止在%%FOLLOWUP%%标记外写列表，问题内容必须完整在标记内
- [ ] 前端：parseFollowups增强容错，处理GPT在标记内外混写的情况

## 任务栏排序
- [ ] 后端：listConversations 按最近消息时间（lastMessageAt）降序排列
- [ ] 后端：数据库 conversations 表增加 lastMessageAt 字段，每次发消息时更新
- [ ] 前端：任务栏列表按 lastMessageAt 排序，最新对话排最上面

## 对话框置顶功能
- [ ] 前端：ConvItem 右键菜单或长按菜单加入「置顶/取消置顶」选项
- [ ] 前端：置顶的对话框显示金色星星标记
- [ ] 前端：列表排序：置顶 > 按updatedAt降序
- [ ] 后端：setConversationPinned 已存在，直接复用

## ConvItem 菜单完善
- [ ] 后端：新增 deleteConversation procedure（删除会话及其消息）
- [ ] 前端：ConvItem 菜单加入「置顶/取消置顶」（星星）、「收藏/取消收藏」、「删除」、「移入分组」
- [ ] 前端：置顶的对话框在标题旁显示金色星星图标
- [ ] 前端：按 isPinned > updatedAt 降序排列

## 守则自定义保存
- [x] 后端：rpa_configs 表加入 userCoreRules 字段，存储用户自定义守则
- [x] 后端：getRpaConfig 返回 userCoreRules，upsertRpaConfig 支持更新
- [x] 后端：runCollaborationFlow 优先使用 userCoreRules，fallback 到默认 USER_CORE_RULES
- [x] 前端：Settings.tsx 「投资理念 & 任务守则」区域改为可编辑 textarea，加保存按鈕

## 对话删除功能
- [x] 后端：conversation.delete procedure 已存在（deleteConversationAndMessages）
- [x] 前端：ConvItem 菜单加入「删除对话」选项，带内联确认弹窗
- [x] 前端：删除时若为当前活跃对话则清除选中状态
- [x] 前端：GroupSection 内的 ConvItem 也支持删除

## 对话置顶 + 按最近消息时间排序
- [ ] 数据库：conversations 表添加 lastMessageAt 字段（bigint，默认 createdAt）
- [ ] 后端：insertMessage 时更新 conversations.lastMessageAt
- [ ] 后端：getConversationsByUser 按 isPinned DESC, lastMessageAt DESC 排序
- [ ] 后端：conversation.pin procedure 已存在（setConversationPinned），直接复用
- [ ] 前端：ConvItem 菜单加入「置顶/取消置顶」选项
- [ ] 前端：置顶对话标题旁显示金色图钉图标
- [ ] 前端：列表渲染顺序：置顶 > lastMessageAt 降序（后端已排序，前端无需额外处理）

## 消息导出功能（Markdown/PDF/纯文本）
- [ ] 前端：每条 AI 回复右上角添加导出按钮（悬停显示，下拉选择格式）
- [ ] 前端：导出 Markdown（直接下载 .md 文件）
- [ ] 前端：导出纯文本（去除 Markdown 标记，下载 .txt）
- [ ] 前端：导出 PDF（使用 html2canvas + jsPDF 或 window.print 方式）
- [ ] 前端：整个对话导出（侧边栏或顶部按钮，导出当前会话所有消息）

## 数据图表绘制能力（Chart.js）
- [ ] 后端：Manus Step2 识别图表需求，在回复中嵌入 %%CHART%%...%%END_CHART%% 标记（JSON格式的Chart.js配置）
- [ ] 后端：系统提示词中加入图表绘制指令（当用户要求图表/走势图/对比图时触发）
- [ ] 前端：安装 chart.js + react-chartjs-2
- [ ] 前端：消息渲染时解析 %%CHART%% 标记，提取 Chart.js 配置并渲染为交互式图表
- [ ] 前端：支持折线图、柱状图、饼图、散点图等常见类型
- [ ] 前端：图表下方显示导出按钮（下载为 PNG）

## Settings页UI合并
- [x] 将「投资理念 & 任务守则」和「Manus 数据引擎指令（高级）」合并为同一个卡片区域，统一一个保存按鈕

## Bug修复：任务排序和卡住问题
- [x] 修复对话列表排序（回填 lastMessageAt + 移除前端 reverse）
- [x] 修复任务执行卡住问题（客户端 5 分钟超时保护 + 轮询加速至 2s + Manus LLM 180s 超时）

## GPT Step3 Prompt优化
- [x] 修改Step3 prompt：从"浓缩总结"改为"整合Manus数据+完整推理+明确投资判断"

## 三步协作专业性全面升级
- [ ] 升级gptSystemPrompt：专业投资分析师身份定位，明确禁止模糊表述
- [ ] 升级Step1 prompt：精确分析框架、量化数据需求清单、明确投资角度
- [ ] 升级Step2 Manus prompt：精确数据收集要求、实时指标、来源标注
- [ ] 升级Step3 prompt：完整推理链、明确买卖判断、量化结论、不允许"大概方向"

## 状态标志重命名
- [ ] 将「Manus · 金融投资」改为「数据引擎 · 金融投资」（体现Manus的数据收集分工）
- [ ] 将「ChatGPT · 投资manus」改为「首席顾问 · 投资」（体现GPT的分析决策分工）

## 状态面板实时显示
- [x] 顶部状态面板改为实时显示：数据引擎（Manus）和首席顾问（GPT）各自的接入状态+工作状态
- [x] 工作中显示动态脉冲动画，空闲显示静态绳点，未接入显示灰点

## 三段式任务进度条
- [x] 消息区顶部添加三段式进度条：规划中→数据收集中→分析整合中
- [x] 任务完成后进度条自动消失

## 右上角状态标志修复
- [x] 右上角只显示固定职责名称（数据引擎 / 首席顾问），移除动态工作状态文字，只用点颜色区分工作/空闲

## 任务失败重试功能
- [ ] 后端：添加task.retry procedure，重置任务状态并重新执行runCollaborationFlow
- [ ] 前端：任务失败时在消息区显示重试按钮，点击重新执行并更新UI状态

## Step2 Manus输出长度优化
- [ ] 移除Step2固定字数限制（500/2000字），改为按需精炼输出（Manus自主决定，避免冗余重复）

## GPT 流式输出（Streaming）+ AI 协作模式优化
- [x] 后端：rpa.ts 新增 callOpenAIStream 函数（AsyncGenerator，逐 token 生成）
- [x] 后端：routers.ts Step3 改为流式输出——先写入空占位消息，streaming 逐步追加内容到数据库
- [x] 后端：db.ts 新增 updateMessageContent 函数（用于流式追加）
- [x] 数据库：tasks.status 枚举新增 streaming 状态
- [x] 前端：ChatRoom 新增 isStreaming 状态，streaming 时 500ms 高频轮询消息
- [x] 前端：streaming 状态显示打字光标动画（蓝色闪烁竖线）
- [x] 前端：streaming 阶段隐藏 TypingIndicator，直接展示实时生成内容
- [x] 后端：Step2 Manus 指令优化——明确告知 Manus 正在与 GPT 内部协作，输出纯数据结构（无废话）
- [x] 后端：Step3 GPT 指令明确——最终报告完整详细，这是给用户看的
- [x] 后端：移除 Step3 Manus 报告截断逻辑，改为从源头约束输出格式

## PDF 完整报告导出
- [x] 安装 html2canvas + jsPDF 依赖
- [x] 升级 exportMessage.ts，新增 exportConversationAsPDF 函数（截图所有AI消息+图表，合成带封面的PDF）
- [x] ChatRoom 顶部工具栏添加「导出报告」按钮（有AI回复时显示）
- [x] 导出时显示 loading 状态（百分比进度），完成后自动下载
- [x] PDF 包含：封面页（标题+时间戳）、所有 AI 回复（文字+图表截图）、页脚页码
- [x] 单条消息「导出」菜单保留 PDF 选项（单条导出）
- [x] 给 AIMessage 容器添加 data-pdf-message 标记，供批量截图识别

## 全局任务指令修复（GPT & Manus 共同遵守）
- [ ] 设置页：将「Manus 数据引擎专属指令」改为「全局任务指令（GPT & Manus 共同遵守）」
- [ ] 数据库：字段名/描述同步更新
- [ ] routers.ts：确保 Step1 GPT、Step2 Manus、Step3 GPT 都注入全局任务指令
- [ ] 说明文字更新：体现两个 AI 都遵守

## 投资守则升级
- [ ] 升级默认守则内容：完整专业版（估值/护城河/风险/行业框架）
- [ ] 文本框 UI 优化：高度加大，字数统计，支持长内容编辑
- [ ] 「使用默认守则」按钮：点击后填入完整默认守则（而非清空）

## 分析深度模式（快速 / 标准 / 深度）
- [ ] 数据库：tasks 表添加 analysisMode 字段（quick/standard/deep，默认 standard）
- [ ] 后端：routers.ts 根据模式调整 GPT/Manus 指令深度和输出要求
- [ ] 前端：ChatRoom 输入框添加三档模式切换器 UI（图标+标签，紧凑设计）
- [ ] 前端：发送任务时传入 analysisMode 参数
- [ ] 前端：消息气泡顶部显示当前任务使用的分析模式标签

## 文件上传分析（PDF/Excel AI 读取）
- [ ] 后端安装 pdf-parse + xlsx 依赖
- [ ] 新增 parseFileContent 函数，支持 PDF/Excel/CSV/TXT 文本提取
- [ ] 附件上传时自动提取文本，存入 attachments.extractedText 字段
- [ ] submitTask 时将附件文本注入 AI 上下文（Step1/Step2/Step3 都能看到）
- [ ] 前端：附件卡片显示「已解析」标记

## 对话框记忆功能（每个对话框独立记忆）
- [ ] 数据库：conversations 表新增 contextMemory 字段（存储关注标的/行业背景）
- [ ] 后端：每次任务完成后，AI 自动提取并更新对话框的背景记忆
- [ ] 后端：submitTask 时将 contextMemory 注入 AI 上下文（Step1/Step2/Step3）
- [ ] 前端：对话框侧边栏显示记忆摘要（悬停提示），支持手动编辑

## 图表升级（K线图+热力图）
- [ ] InlineChart：K 线图添加成交量柱（底部）+ MA5/MA20 均线
- [ ] InlineChart：新增 heatmap 类型（板块涨跌热力图）
- [ ] GPT Step3 指令：新增热力图和K线图的输出格式说明

## 三大功能升级（2026-03-20）
- [x] 文件上传分析：upload.ts 升级，上传时同时保存到 attachments 表并返回 attachmentId
- [x] 文件上传分析：ChatRoom.tsx PendingFile 添加 attachmentId 字段，上传时传入 conversationId
- [x] 对话记忆功能：memory_context 表添加 conversationId 字段，实现对话级记忆隔离
- [x] 对话记忆功能：getRecentMemory 支持按 conversationId 过滤，对话内记忆优先
- [x] 对话记忆功能：getMemory tRPC 接口支持 conversationId 参数
- [x] 对话记忆功能：ChatRoom.tsx 添加记忆面板（右侧抽屉），显示当前对话的记忆条目
- [x] 对话记忆功能：任务完成后自动刷新记忆面板
- [x] 图表增强：InlineChart.tsx 添加热力图（heatmap/treemap）——板块涨跌可视化
- [x] 图表增强：K线图升级——添加 MA5/MA20 均线、成交量副图
- [x] 图表增强：routers.ts 提示词更新，AI 知道可生成热力图和带成交量的K线图

## PWA 桌面安装支持（2026-03-20）
- [x] 生成 PWA 图标（96/144/192/512px），上传 CDN
- [x] 创建 manifest.json（name/short_name/icons/theme_color/display:standalone）
- [x] 创建 Service Worker（sw.js）：离线缓存 + 网络优先策略
- [x] 更新 index.html：添加 manifest 链接、Apple Touch Icon、theme-color、SW 注册脚本

## PWA 品牌升级（2026-03-20）
- [x] 替换品牌图标：使用用户提供的 logo 生成各尺寸图标并上传 CDN
- [x] 添加 PWA 安装引导横幅（底部提示条，检测 beforeinstallprompt 事件）
- [x] 制作专属离线页面（offline.html）并更新 Service Worker

## 图标修复 + 品牌命名（2026-03-20）
- [x] 修复图标裁剪：只保留圆角矩形内容区域，去掉黑色背景边缘
- [x] 全局应用名称改为 DanTree（manifest、index.html、App.tsx、侧边栏等）

## 投资守则三部分重构（2026-03-20）
- [x] 数据库：rpa_configs 新增 investment_rules / task_instruction / data_library 三个字段
- [x] 后端：三部分内容注入 AI 提示词，data_library 作为最高优先级数据来源
- [x] 前端：设置页面重构为三个独立 Tab（投资守则 / 全局任务指令 / 资料数据库）

## 全局品牌名称彻底替换（2026-03-20）
- [ ] 全局搜索所有旧名称（AI Team Chat、智能协作平台、ai-team-chat等）并替换为DanTree

## PWA图标和名称修复（2026-03-20）
- [ ] 重新处理图标：直接使用原始logo（不裁剪），生成各尺寸并上传CDN
- [ ] manifest.json名称改为DanTree，更新图标链接，更新SW版本强制刷新缓存

## 图标精确裁剪（2026-03-20）
- [ ] 精确裁剪图标至圆角矩形边缘（去掉外层黑色背景），透明背景
- [ ] 上传CDN并更新manifest.json、index.html、Service Worker版本

## 图标更新 & 安装App按钮
- [x] 使用新版logo（白底圆角矩形，K线+光标图案）生成96/144/192/512/1024px各尺寸图标并上传CDN
- [x] 更新manifest.json所有图标引用为v7版本
- [x] 更新index.html所有图标引用为v7版本
- [x] 更新offline.html图标引用为v7版本
- [x] Service Worker升级为dantree-v4，强制清除旧缓存
- [x] 侧边栏底部添加「安装桌面App」按钮（蓝色高亮，触发PWA安装提示；已安装时自动隐藏）

## 实时数据源三合一接入（2026-03-20）
- [x] 接入 Yahoo Finance API（内置callDataApi，股价/财务/技术指标，支持美股/港股/A股）
- [x] 接入 FRED 宏观数据 API（CPI、利率、GDP、非农等，需FRED_API_KEY）
- [x] 接入 Tavily 搜索 API（网页内容实时搜索，需TAVILY_API_KEY，未配置时静默跳过）
- [x] 重构 Step2 数据引擎：三源并行预取（Yahoo Finance + FRED + Tavily），真实数据注入Manus LLM上下文
- [x] 在设置页面「资料数据库」Tab 展示四个Key实时状态和数据源健康监控

## Tavily 双Key轮换（2026-03-20）
- [ ] 保存第二个 Tavily API Key 为 TAVILY_API_KEY_2
- [ ] tavilySearch.ts 实现双Key轮换：第一个Key返回429/403时自动切换第二个Key

## Tavily 四Key轮换 + 状态监控（2026-03-20）
- [x] 保存四个 Tavily Key（TAVILY_API_KEY / _2 / _3 / _4）到环境变- [x] tavilySearch.ts：四Key顺序轮换，单Key失败（429/403/401）自动切换下一个Key- [x] tavilySearch.ts：全部四个Key失败时调用 notifyOwner 发站内通知
- [x] 设置页「资料数据库」Tab：显示四个Key的实时状态（正常/已切换/已耗尽）
- [x] 后端：新增 tRPC procedure 返回四个Key的当前状态

## 数据流端到端验证与修复（2026-03-20）
- [x] 审查：用户数据库链接是否被正确读取并传入 Tavily
- [x] 审查：Tavily 抓取结果是真正注入 Step2 AI 上下文
- [x] 修复：确保 dataLibrary 链接解析逻辑正确（换行/逗号分隔均支持）
- [x] 修复：Step2 系统提示词明确要求使用已注入的真实数据，禁止编造
- [x] 设置页显示四个 Tavily Key 实时状态（正常/已切换/已耗尽）
- [x] 端到端测试：40个测试全部通过，三源均正常返回真实数据

## Jina AI Reader 接入（2026-03-21）
- [ ] 创建 server/jinaReader.ts：用 r.jina.ai 抓取公开网页内容（无需API Key）
- [ ] 集成到数据流：用 Jina 替换 Tavily Extract 抓取用户数据库链接
- [ ] 测试验证：确认能抓取雪球、东方财富等动态网站内容

## 智能URL生成器 + 深度抓取（2026-03-21）
- [ ] 创建 server/smartUrlGenerator.ts：用LLM根据任务内容+用户数据库域名生成精确URL列表（如分析苹果→xueqiu.com/S/AAPL）
- [ ] 集成到Step2数据流：先生成精确URL，再用Jina深入抓取具体内容页（非首页）
- [ ] 严格禁止AI用训练记忆填充数据，无真实来源必须标注"数据未获取"
- [ ] 测试：验证分析苹果时能自动生成并抓取精确URL的真实内容

## Tavily 限定域名搜索策略（2026-03-20）
- [x] 重写 searchFromUserLibrary：改为 Tavily include_domains 限定域名搜索，返回真实存在的相关页面URL
- [x] 移除旧的 Tavily Extract 直接抓取首页方式（首页内容与任务无关）
- [x] 新流程：Tavily 限定域名搜索 → 获取真实URL → Jina 深度抓取完整页面内容
- [x] 兜底策略：仅当用户数据库域名内无结果时，才回退到通用金融新闻搜索
- [x] URL 100% 来自 Tavily 搜索结果，绝不由 LLM 生成，确保链接真实有效
- [x] TypeScript 0 错误，40 个测试全部通过

## Bug修复：React多实例冲突 + Vite HMR（2026-03-21）
- [x] 修复 Invalid hook call：vite.config.ts 添加 resolve.dedupe + optimizeDeps.include 确保 React 单实例
- [x] 清除 Vite deps 缓存（node_modules/.vite），强制重新生成一致的 chunk 哈希
- [x] 修复 Service Worker cache-first 缓存旧 JS 问题：升级到 v5，Vite 资源改为 network-first
- [x] index.html 添加 SW 强制更新逻辑，新 SW 安装后自动刷新页面
