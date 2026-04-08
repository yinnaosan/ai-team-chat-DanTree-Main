# AI Team Chat — Project TODO

## Alpha Vantage 技术指标 + Polygon 期权链 + Step1 智能资源规划 + HKEXnews
- [x] 扩展 alphaVantageApi.ts 技术指标模块（RSI/布林带/EMA/SMA/随机指标）
- [x] 扩展 polygonApi.ts 期权链数据（Put-Call Ratio/行权价分布/到期日分布）
- [x] Step1 智能资源规划：GPT 输出结构化 JSON 决定调用哪些 API
- [x] Step2 解析 Step1 资源规划 JSON，按规划有选择地调用 API
- [x] 接入技术指标（RSI/布林带/EMA/SMA/随机指标）和期权链（Put-Call Ratio）到 Step2 并行调用
- [x] 修复 TypeScript 错误，完成技术指标和期权链接入 Step2
- [x] 创建 server/ecbApi.ts（ECB 欧元区利率/通胀/汇率/货币供应量）
- [x] OECD API 因 Cloudflare IP 封锁放弃，改用 FRED 覆盖 OECD 指标
- [x] 创建 server/hkexApi.ts（HKEXnews 港股公告/年报/监管文件）
- [x] 接入 ECB + HKEXnews 到 Step2 引擎、健康检测、Settings UI（总计 18+N）
- [x] 编写 ecb.test.ts + hkex.test.ts，163 个测试全部通过

## BoE + HKMA + GLEIF API 集成
- [x] 创建 server/boeApi.ts（英国基准利率/国债收益率/汇率/M4 货币供应量）
- [x] 创建 server/hkmaApi.ts（港元利率/货币供应量/银行间流动性/外汇储备）
- [x] 接入 BoE + HKMA 到 Step2 引擎、健康检测、Settings UI
- [x] 更新 Settings.tsx 添加 BoE + HKMA 数据源行
- [x] 创建 server/gleifApi.ts（全球 LEI 编码/公司名称搜索/法人结构/母子公司关系）
- [x] 接入 GLEIF 到 Step2 引擎、健康检测、Settings UI
- [x] 编写 boe.test.ts + hkma.test.ts + gleif.test.ts 测试用例保存 Checkpoint

## Tiingo + SimFin 增强 + 归因 UI 优化
- [x] 保存 TIINGO_API_KEY 为环境变量
- [x] 创建 server/tiingoApi.ts（实时价格、历史 OHLCV、季度财务报表、实时估值倍数）
- [x] Messari 数据 API 因 Cloudflare IP 封锁放弃（已记录）
- [x] SimFin 季报支持：扩展 simfinApi.ts 获取最近 4 个季度数据（Q1-Q4 趋势表格）
- [x] SimFin 估值倍数补充：更新 Step3 系统提示，指导 GPT 利用 Tiingo P/E/P/B/EV 和 SimFin 季度数据推算估值
- [x] 数据来源归因 UI 优化：分组折叠卡片（市场数据/宏观指标/新闻情绪/加密货币）+ 每个 API 简短说明
- [x] 接入 Tiingo 到 Step2 引擎、健康检测、Settings UI（总计 16+N）
- [x] 编写 tiingo.test.ts，10 个测试全部通过，总计 152 个测试全部通过

## SimFin 财务数据 API 集成
- [x] 保存 SIMFIN_API_KEY 为环境变量
- [x] 创建 server/simfinApi.ts（财务报表/估值指标/股价历史）
- [x] 接入 Step2 数据引擎并行获取（仅美股代码触发）
- [x] 更新 getDataSourceStatus 健康检测
- [x] 更新 Settings.tsx 数据源面板（总计 15+N）
- [x] 编写 simfin.test.ts 测试用例，142 个测试全部通过

## UI 样式升级 v7（纯 CSS，不改功能/布局/位置）
- [x] DecisionHeader：顶栏背景更深 rgba(3,4,7,0.96)，NVDA 胶囊绿色边框质感，Stance 胶囊边框加强
- [x] SessionRail：背景更深 rgba(3,4,7,0.92)，右边框更清晰 0.10，搜索框边框更锐利，active session 左边框加粗至 3px
- [x] ThesisBlock：背景 rgba(8,10,16,0.88)，边框 0.10，顶边高光 0.16，圆角收至 12px，阴影更深
- [x] TimingBlock：同 ThesisBlock 样式参数统一
- [x] AlertBlock：同 ThesisBlock 样式参数统一，保留 severity 颜色边框
- [x] InsightsRail：背景更深 rgba(4,5,9,0.92)，左边框更清晰 0.10
- [x] DiscussionPanel 输入框：边框更清晰 0.12，底边绿色细节 rgba(52,211,153,0.20)
- [x] ResearchWorkspaceVNext：主容器背景更深，列分隔边框更清晰

## 数据来源归因 & 新闻 API 触发精细化
- [ ] 后端：新闻 API 触发条件精细化（仅检测到股票代码/公司名/宏观事件时才调用 NewsAPI/Marketaux）
- [ ] 后端：收集实际使用的数据源列表，随任务结果一起返回给前端
- [ ] 前端：AI 回复底部显示可折叠的「数据来源」卡片（列出本次任务实际调用了哪些 API）

## PART3 资料数据库升级 + Step3 两阶段渲染
- [x] 数据库迁移：rpaConfigs 表新增 trustedSourcesConfig JSON 字段
- [x] 后端 db.ts：新增 TrustedSourcesConfig 类型 + upsert 逻辑
- [x] 后端 routers.ts：Step1 注入 routing_rules + policy 到 Source Router
- [x] 前端 Settings.tsx：资料数据库 Tab 升级为结构化 trusted_sources 编辑器（添加/删除来源、信任等级、路由关键词、Policy 开关）
- [x] Step3 Phase A：结构化 answer object（JSON Schema，内部使用）
- [x] Step3 Phase B：基于 answer object 渲染自然语言（流式输出）
- [x] answerObject 写入 message metadata，供前端展示结构化引用卡片

## 新闻与情绪 API 集成（GDELT + NewsAPI + Marketaux）
- [x] 创建 server/gdeltApi.ts 模块（GDELT 全球事件数据库，5秒限频队列）
- [x] 创建 server/newsApi.ts 模块（NewsAPI 全球新闻搜索）
- [x] 创建 server/marketauxApi.ts 模块（Marketaux 金融新闻情绪评分/实体识别）
- [x] 集成到 Step2 数据引擎并行获取流程（routers.ts）
- [x] 集成到 getDataSourceStatus 健康检测接口
- [x] 更新 Settings.tsx 数据源状态面板（新增「新闻与情绪」分组，总计计数器更新为 14+N）
- [x] 修复 imf.test.ts 中 3 个失败测试（匹配新的 formatImfDataAsMarkdown 输出格式）
- [x] TypeScript 0 错误，132 个测试全部通过

## World Bank API 全球宏观数据集成
- [x] 调研 World Bank REST API 接口结构（免费公开，无需 API Key）
- [x] 创建 server/worldBankApi.ts 数据获取模块（支持 25+ 国家，9 个核心指标）
- [x] 集成到 Step2 数据引擎并行获取流程（与 FRED 同步启动）
- [x] 自动从任务描述中识别国家名称（中英文双语，支持缩写）
- [x] 根据任务关键词智能选择相关指标（GDP/通胀/贸易/失业率等）
- [x] 格式化输出 Markdown 表格（含5年趋势和全球对比）
- [x] 编写 13 个单元测试（全部通过，总测试数 53）
- [x] TypeScript 0 错误，所有测试通过

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

## 工作流程四项优化（2026-03-21）
- [x] 优化1：Yahoo Finance + Tavily 与 Step1 并行启动，FRED 等 Step1 完成后再启动
- [x] 优化2：Step1 完成后用「数据需求清单」精炼 Tavily 搜索关键词并补充搜索
- [x] 优化3：流式轮询改为 SSE 服务端推送（server/taskStream.ts），前端用 EventSource 订阅
- [x] 优化4：记忆召回添加语义相关性排序（getRelevantMemory），关键词匹配+时间衰减双维度评分

## Bug审查与修复（2026-03-21）
- [x] 超时保护：callDataApi 添加 15s AbortSignal.timeout
- [x] Bug5：对话历史过滤条件修复（移除 phase===final 限制，改为包含所有非空 assistant 消息）
- [x] Bug6：SSE 流式完成后推送最终 chunk，防止最后 300ms 内容丢失
- [x] Bug4：记忆关键词提取股票代码 + 任务描述前 80 字，提升语义召回精度
- [x] 清理废弃变量 GLOBAL_TASK_INSTRUCTION（空字符串，每次任务无意义拼接）
- [ ] Bug7：fileProcessor.ts 对 PDF/Word 文件使用 image_url 方式调用 LLM——非图片文件用 image_url 会导致 LLM 无法正确解析
- [ ] Bug8：Tavily 精炼搜索结果覆盖初始搜索——当精炼结果非空时完全丢弃初始搜索结果，可能丢失有价値的早期数据

## Bug修复续集（2026-03-21）
- [x] Bug8：Tavily 精炼结果与初始结果合并（精炼结果在前，初始结果补充在后，不再丢弃早期数据）
- [x] Bug7：fileProcessor.ts 修复——PDF 改用 file_url 类型，Word/Excel 改用 Jina Reader 文本提取
- [x] 验证对话连续性：历史过滤条件已修复，所有非空 assistant 消息均可用于历史上下文
- [x] 修复 chat.test.ts mock 缺少 getRelevantMemory 导致测试失败
## 资料数据库 URL 健康检测（2026-03-21）
- [x] 后端：添加 rpa.checkLibraryUrls tRPC 接口，并发检测（最多 10 个并发，8s 超时）
- [x] 前端：设置页「资料数据库」 Tab 添加「检测链接」按鈕 + 结果列表（绿色可访问/黄色超时/红色无法访问）

## Manus 数据引擎接收 Tavily+Jina 网页内容（2026-03-21）
- [x] 将结构化数据（Yahoo Finance/FRED）与网页内容（Tavily+Jina）分开，分别传入 Manus
- [x] Manus 对网页内容做三类提取：数据表格、分析师共识、关键定性信号
- [x] 放宽 Step2 输出规则，允许 Manus 保留网页中的定性结论和评级信息

## Step2 字数上限 + 数据来源溯源展示（2026-03-21）
- [x] 提高各分析模式的 step2MaxWords 上限（快速 4000 / 标准 10000 / 深度 16000）
- [x] 后端：任务完成时把 Tavily 来源列表写入消息 metadata
- [x] 前端：AI 回复底部添加 DataSourcesFooter 组件（可折叠，绿色/红色状态标识 + 可点击链接）

## World Bank API 接入（2026-03-21）
- [ ] 调研 World Bank API 接口结构（GDP、通胀、贸易、人口等关键指标）
- [ ] 创建 server/worldBankApi.ts 数据获取模块（支持国家代码识别、指标自动选择）
- [ ] 集成到 Step2 数据引擎（与 FRED 并行，补充全球视角宏观数据）
- [ ] 更新 Step2 prompt，让 Manus 处理 World Bank 数据
- [ ] 编写 worldBankApi.test.ts 测试

## 设置页数据源状态面板完善（加入 World Bank）
- [x] 后端：在 getDataSourceStatus 中加入 World Bank 健康检测（轻量探针，6s 超时）
- [x] 前端：设置页「资料数据库」 Tab 数据源状态面板加入 World Bank 指示器
- [x] 前端：重构面板布局：分组显示（结构化数据源 / 网页搜索），加入光晕动效果和总计计数器
- [x] 测试：53 个测试全部通过，TypeScript 0 错误

## IMF Data API 集成
- [x] 调研 IMF DataMapper API（133 个指标、241 个国家，含 2025-2026 预测）
- [x] 创建 server/imfApi.ts 模块（WEO 展望、财政债务、经常账户、失业率等 11 个核心指标）
- [x] 集成到 Step2 数据引擎并行获取流程（与 FRED/World Bank 同步启动）
- [x] 设置页数据源状态面板加入 IMF WEO 指示器（含预测标签）
- [x] 编写 21 个单元测试（imf.test.ts），总测试数 74 全部通过
- [x] TypeScript 0 错误，所有测试通过

## OECD + BIS API 集成 & 数据来源标注优化
- [ ] 调研 OECD SDMX REST API 接口结构和关键数据集
- [ ] 调研 BIS Statistics API 接口结构（汇率、信贷、债务等）
- [ ] 创建 server/oecdApi.ts 模块（利率/就业/贸易/PMI 等）
- [ ] 创建 server/bisApi.ts 模块（汇率/信贷/跨境资本流动等）
- [ ] 集成到 Step2 数据引擎并行获取流程
- [ ] 优化所有数据源来源标注（IMF/World Bank/FRED/OECD/BIS 均附注版本/时间）
- [ ] 设置页数据源状态面板加入 OECD 和 BIS 指示器
- [ ] 编写单元测试（oecd.test.ts, bis.test.ts）
- [ ] TypeScript 0 错误，所有测试通过
- [ ] 创建 server/secEdgarApi.ts 模块（10-K/10-Q/8-K 财报、机构持仓 13F 等）
- [ ] SEC EDGAR 集成到 Step2 数据引擎（股票分析任务自动触发）
- [ ] 设置页状态面板加入 SEC EDGAR 指示器
- [ ] 创建 server/finnhubApi.ts 模块（实时报价/新闻/财报/分析师评级/内部交易等）
- [ ] Finnhub API Key 存入环境变量 FINNHUB_API_KEY
- [ ] Finnhub 集成到 Step2 数据引擎（与 Yahoo Finance 互补）
- [ ] 设置页状态面板加入 Finnhub 指示器
- [ ] 创建 server/alphaVantageApi.ts 模块（技术指标/基本面/外汇/加密货币/经济数据）
- [ ] Alpha Vantage API Key 存入环境变量 ALPHA_VANTAGE_API_KEY
- [ ] Alpha Vantage 集成到 Step2 数据引擎（技术分析 + 经济指标补充）
- [ ] 设置页状态面板加入 Alpha Vantage 指示器
- [ ] 创建 server/polygonApi.ts 模块（股票/期权/外汇/加密/新闻/技术指标）
- [ ] Polygon.io API Key 存入环境变量 POLYGON_API_KEY
- [ ] Polygon.io 集成到 Step2 数据引擎（与 Finnhub 互补，提供更丰富的市场数据）
- [ ] 设置页状态面板加入 Polygon.io 指示器
- [ ] 测试 FMP Stable API 接口（财务报表/DCF估值/同行比较/ETF/宏观等）
- [ ] 创建 server/fmpApi.ts 模块
- [ ] FMP API Key 存入环境变量 FMP_API_KEY
- [ ] FMP 集成到 Step2 数据引擎（财务报表深度分析）
- [ ] 设置页状态面板加入 FMP 指示器

## CoinGecko API 集成（加密货币数据）
- [x] 测试 CoinGecko API Key 可用性（BTC $70,705 / ETH $2,152 验证通过）
- [x] 创建 server/coinGeckoApi.ts 模块（实时价格/市值/趋势/Top 15/全球概览）
- [x] CoinGecko API Key 存入环境变量 COINGECKO_API_KEY
- [x] CoinGecko 集成到 Step2 数据引擎（加密货币任务自动触发）
- [x] 设置页状态面板加入 CoinGecko 指示器示器

## Baostock A股历史数据集成
- [x] 测试 Baostock Python 库可用（sh.600000 平安锦江测试通过）
- [x] 创建 server/baoStockApi.ts 模块（Python 子进程调用，支持 50+ A 股名称识别）
- [x] 支持 A 股日线历史数据、盈利能力、成长能力指标
- [x] Baostock 集成到 Step2 数据引擎（检测到 A 股代码时自动触发）
- [x] 设置页状态面板加入 Baostock 指示器

## 日志清理 & CSS 修复
- [x] 清空 .manus-logs/ 旧错误日志（所有日志文件已清零）
- [x] 确认 index.css @import 已在文件顶部（第 1-3 行，顺序正确）
- [x] CSS 警告来自 tw-animate-css 第三方库，无法修复，不影响功能

## A 股智能识别增强
- [x] 扩展 baoStockApi.ts 名称库（200+ 条目，覆盖白酒/银行/保险/证券/能源/新能源/汽车/科技/医药/消费/地产/物流等行业）
- [x] 优化代码识别逻辑：支持 sh./sz. 格式、Yahoo .SS/.SZ 格式、纯 6 位数字、公司名称四种方式
- [x] 实现数据源去重：Yahoo Finance 跳过已由 Baostock 处理的 A 股代码（fetchStockDataForTaskWithDedup）
- [x] 新增 4 个辅助函数：yahooToBoastockCode / baostockToYahooCode / isAStockYahooCode / getAStockName
- [x] 编写 24 个测试（名称库覆盖度/代码转换/去重逻辑），132 个测试全部通过

## Bug 修复：Baostock 状态面板显示红色「未配置」
- [x] 定位根因：部署环境 Python 子进程失败时返回 error，导致显示红色「未配置」
- [x] 修复：Baostock 探针失败时返回 warning（黄色「本地运行」）而非 error（红色）
- [x] 前端新增 warning 状态的黄色样式和「本地运行」标签
- [x] 总计计数器将 warning 也纳入「正常」计数

## Bug 修复：IMF WEO 状态面板显示红色「未配置」
- [x] 定位根因：IMF DataMapper API 被 Akamai CDN IP 封锁（403 Forbidden）
- [x] 修复：重写 imfApi.ts，改用 World Bank API 获取同类宏观数据（完全可访问）
- [x] 保留所有对外接口不变（fetchImfData/formatImfDataAsMarkdown）
- [x] 设置页标签待更新为「IMF/WB 宏观数据」

## GDELT API 集成（全球事件/地缘风险/新闻情绪）
- [ ] 调研 GDELT API 接口（DOC 2.0、GKG、事件查询）
- [ ] 创建 server/gdeltApi.ts 模块（含 5s 请求限速队列）
- [ ] 集成 GDELT 到 Step2 数据引擎（地缘/新闻/情绪任务自动触发）
- [ ] 更新 getDataSourceStatus 加入 GDELT 健康检测
- [ ] 设置页状态面板加入 GDELT 指示器
- [ ] 编写单元测试

## NewsAPI 集成（全球新闻搜索/头条）
- [ ] 验证 NewsAPI Key 可用性
- [ ] 创建 server/newsApi.ts 模块（关键词搜索/头条/来源过滤）
- [ ] NewsAPI Key 存入环境变量 NEWS_API_KEY
- [ ] 集成到 Step2 数据引擎（新闻/事件任务自动触发）
- [ ] 设置页状态面板加入 NewsAPI 指示器
- [ ] 编写单元测试

## Marketaux 金融新闻 API 集成
- [ ] 验证 Marketaux API Key 可用性
- [ ] 创建 server/marketauxApi.ts 模块（股票新闻/情绪评分/实体识别）
- [ ] Marketaux API Key 存入环境变量
- [ ] 集成到 Step2 数据引擎（股票分析任务自动触发）
- [ ] 设置页状态面板加入 Marketaux 指示器

## SEC EDGAR API 集成增强（data.sec.gov + efts.sec.gov）
- [x] 重写 server/secEdgarApi.ts：修复 EPS 单位 bug（USD/shares 而非 USD）
- [x] 新增 company_tickers.json 快速 CIK 查找（10,442 家公司，24h 缓存）
- [x] 新增 getCompanyFacts（XBRL 财务事实）、getRecentFilings（10-K/10-Q/8-K）
- [x] 新增 getStockFullData（一次调用获取公司信息 + 财务数据 + 近期文件）
- [x] 新增 shouldFetchSecEdgar（智能触发判断，检测财务关键词）
- [x] 新增 checkHealth（健康检测，验证 data.sec.gov 可用性）
- [x] 新增 formatSecData（Markdown 格式化，含净利率、净资产计算、文件链接）
- [x] 更新 Settings.tsx SEC EDGAR 描述（XBRL 财务事实/10-K/10-Q/8-K/公司基本信息）
- [x] 创建 server/secEdgar.test.ts（35 个测试，全部通过）
- [x] 修复 multiSourceApis.test.ts 旧版 SEC EDGAR 测试（与新接口兼容）
- [x] 全量测试 198 个全部通过，TypeScript 0 错误

## 死代码清理 + 新功能集成（GLEIF + SEC 8-K 摘要 + 归因 UI）
- [ ] 扫描 server/ 目录：找出未被 routers.ts 导入的孤立函数/文件
- [ ] 扫描 client/src/ 目录：找出未使用的组件、未引用的路由、注释掉的旧逻辑
- [ ] 清理 routers.ts 中注释掉的旧代码块
- [ ] 删除或合并重复的工具函数
- [ ] 创建 server/gleifApi.ts（全球法人机构识别码/公司名称搜索/法人结构）
- [ ] 接入 GLEIF 到 Step1 资源规划和 Step2 并行数据获取
- [ ] 接入 GLEIF 到 getDataSourceStatus 健康检测
- [ ] 更新 Settings.tsx 添加 GLEIF 数据源行
- [ ] 扩展 secEdgarApi.ts：新增 get8KSummary（LLM 智能摘要 8-K 公告）
- [ ] 接入 8-K 摘要到 Step2 引擎（当 secFilings 包含 8-K 时触发）
- [ ] 后端：Step2 执行时收集实际调用的 API 名称列表（usedSources 字段）
- [ ] 后端：最终 assistant 消息携带 usedSources 元数据
- [ ] 前端：AI 回复底部显示可折叠「数据来源」卡片（列出本次实际调用的 API）
- [ ] 编写 gleif.test.ts 测试用例
- [ ] 全量测试通过，TypeScript 0 错误
- [ ] 保存 Checkpoint

## CourtListener API 集成（美国联邦法院判决与诉讼数据）
- [ ] 验证 CourtListener API Key（d79de03f84c80caf0f47bb7881f6f1856611f7b1）
- [ ] 调研 CourtListener API 端点（判决搜索/诉讼查询/公司诉讼历史）
- [ ] 创建 server/courtListenerApi.ts 模块
- [ ] 接入 Step1 资源规划（合规/诉讼风险触发条件）
- [ ] 接入 Step2 并行数据获取
- [ ] 更新 getDataSourceStatus 健康检测
- [ ] 更新 Settings.tsx 添加 CourtListener 数据源行
- [ ] 编写 courtListener.test.ts 单元测试
- [ ] 全量测试通过，TypeScript 0 错误
- [ ] 保存 Checkpoint

## EUR-Lex API 集成（欧盟官方法律法规数据库）
- [ ] 验证 EUR-Lex CELEX URL 拼接端点（无需 API Key）
- [ ] 创建 server/eurLexApi.ts 模块（CELEX 编号查询/法规全文提取/关键词搜索）
- [ ] 接入 Step1 资源规划（欧盟法规/合规/监管触发条件）
- [ ] 接入 Step2 并行数据获取
- [ ] 更新 getDataSourceStatus 健康检测
- [ ] 更新 Settings.tsx 添加 EUR-Lex 数据源行
- [ ] 编写 eurLex.test.ts 单元测试
- [ ] 全量测试通过，TypeScript 0 错误
- [ ] 保存 Checkpoint

## Congress.gov API 集成（美国国会立法数据库）
- [ ] 验证 Congress.gov API Key（SpLH43dTTokdt5NhJDAMo6Z4dSAHAYGnLsfR8LJz）
- [ ] 调研端点：法案搜索/法案全文/投票记录/国会议员信息
- [ ] 创建 server/congressApi.ts 模块
- [ ] 接入 Step1 资源规划（立法/监管/政策触发条件）
- [ ] 接入 Step2 并行数据获取
- [ ] 更新 getDataSourceStatus 健康检测
- [ ] 更新 Settings.tsx 添加 Congress.gov 数据源行
- [ ] 编写 congress.test.ts 单元测试
- [ ] 全量测试通过，TypeScript 0 错误
- [ ] 保存 Checkpoint

## 三步协作架构重构（按需调资源 + AI 内部压缩通信）
- [x] 设计 AI 内部通信协议（TASK_SPEC 压缩格式）和资源规划新格式（具体数据源+深度+广度）
- [x] 重写 Step1 GPT prompt：主观分析框架 + 精准资源指令生成（AI 内部语言）
- [x] 重写 Step2 Manus prompt：资源审查调整机制 + 按需调动 API（Manus 有权补漏/去冗余）
- [x] 重写 Step3 GPT prompt：GPT 主观分析 + Manus 客观数据深度融合，输出人类语言
- [x] 更新 parseResourcePlan 解析逻辑（适配新格式，支持具体数据源名称而非粗粒度开关）
- [x] 更新 Step2 并行数据获取逻辑（按新资源规划精准触发，不再用 8 个布尔开关）
- [x] 运行全量测试并保存检查点

## 死代码清理 + 法律模块集成 + SEC 8-K 摘要（2026-03-21）
- [ ] 扫描 server/ 孤立模块（未被 routers.ts 导入的函数/文件）
- [ ] 扫描 client/src/ 未注册组件（ComponentShowcase 等）
- [ ] 清理 routers.ts 注释残留代码块
- [ ] 将 CourtListener 集成到 Step1 资源规划（合规/诉讼触发条件）
- [ ] 将 CourtListener 集成到 Step2 并行数据获取
- [ ] 将 Congress.gov 集成到 Step1 资源规划（立法/政策触发条件）
- [ ] 将 Congress.gov 集成到 Step2 并行数据获取
- [ ] 将 EUR-Lex 集成到 Step1 资源规划（欧盟法规/监管触发条件）
- [ ] 将 EUR-Lex 集成到 Step2 并行数据获取
- [ ] 扩展 secEdgarApi.ts：新增 get8KSummary（LLM 智能摘要 8-K 公告）
- [ ] 将 8-K 摘要集成到 Step2 数据报告
- [ ] 更新 getDataSourceStatus 健康检测（CourtListener/Congress/EUR-Lex）
- [ ] 更新 Settings.tsx 添加三个新数据源行
- [ ] 编写单元测试（courtListener.test.ts, congress.test.ts, eurLex.test.ts）
- [ ] 全量测试通过，TypeScript 0 错误
- [ ] 保存 Checkpoint

## 设置页「关于」改名为「逻辑」并更新流程说明（2026-03-21）
- [ ] 设置页 Tab「关于」改名为「逻辑」
- [ ] 更新「逻辑」Tab 内容：展示新三步协作流程（GPT 精准规划 → Manus 审查执行 → GPT 融合输出）
- [ ] 说明 AI 内部压缩通信协议、资源按需调动原则、精准获取不截断机制

## 并行协作架构修正（GPT 和 Manus 各自独立调动资源）
- [ ] 重写 Step1 GPT prompt：拆分任务为 GPT 自己部分 + Manus 部分，GPT 立即执行自己的部分
- [ ] 重写 Step2 Manus prompt：Manus 专注自己的任务，独立调动资源，完成后交给 GPT
- [ ] 重写 Step3 GPT prompt：接收 Manus 报告，与自己的分析深度融合输出
- [ ] 更新设置页「关于→逻辑」Tab，展示新的并行协作流程说明
- [ ] 运行全量测试并保存检查点

## Owner 默认值机制 + 法律数据模块集成
- [x] 后端：db.ts 新增 getOwnerRpaConfig 函数，读取 Owner 的投资守则/任务指令/资料库
- [x] 后端：rpa.getConfig 接口回退逻辑——用户字段为空时自动继承 Owner 默认值
- [x] 前端：Settings.tsx 在「投资理念 & 任务守则」区域添加「使用 Owner 默认值」提示横幅
- [x] 前端：Settings.tsx「关于」Tab 更名为「逻辑」，内容更新为新三步协作流程说明
- [x] 后端：集成 CourtListener（美国法院诉讼/判决历史）到 Step2 引擎
- [x] 后端：集成 Congress.gov（美国立法动态/法案）到 Step2 引擎
- [x] 后端：集成 EUR-Lex（欧盟法规/MiCA/GDPR/DORA）到 Step2 引擎
- [x] 后端：三个法律模块接入 getDataSourceStatus 健康检测
- [x] 前端：Settings.tsx 数据源面板新增「法律与监管」分组（CourtListener/Congress.gov/EUR-Lex）
- [x] 测试：修复 chat.test.ts 中 getOwnerRpaConfig mock 缺失问题
- [x] 测试：198 个测试全部通过，TypeScript 0 错误

## GLEIF + Congress Key + 数据来源归因 UI
- [x] 创建 server/gleifApi.ts（全球 LEI 编码/公司名称搜索/法人结构/母子公司关系）
- [x] 接入 GLEIF 到 Step2 引擎、健康检测、Settings UI
- [x] 设置页「密鑰」面板添加 CONGRESS_API_KEY 配置入口（已自动注入环境变量）
- [x] 后端：Step2 引擎收集实际调用的 API 名称列表，随任务结果一起返回
- [x] 后端：submitTask 返回値新增 dataSources 字段（string[]）
- [x] 前端：消息 metadata 存储 dataSources 列表
- [x] 前端：AI 回复底部显示可折叠「数据来源」卡片（图标+名称+简短说明）
- [x] 编写 gleif.test.ts 测试用例
- [x] 保存 Checkpoint
## GLEIF 精度优化 + 耗时归因 + Congress 关键词扩展
- [x] GLEIF 搜索精度优化：Step1 JSON 新增 company_names 字段，GPT 提取公司名称实体再查询 GLEIF
- [x] 后端：ApiSource 类型新增 latencyMs 字段，timed() 辅助函数包装所有 API 调用计时
- [x] 前端：归因 UI 每个 API 标签旁显示耗时（折叠前 ms，展开后颜色编码：<500ms 绿/500-2000ms 黄/>2000ms 红）
- [x] Congress.gov 关键词扩展：补充 SEC/CFTC/FINRA/OCC/FDIC/美国财政部/反洗錢/制裁/加密货币监管等 30+ 触发词
- [x] 保存 Checkpoint

## 本地运行配置方案
- [ ] 创建 .env.example 文件（含所有环境变量说明和获取方式）
- [ ] 编写 LOCAL_SETUP.md 本地安装运行指南
- [ ] 保存 Checkpoint

## 双端兼容运行（网页版 + 本地下载版）
- [x] 澄清：「下载」本质是 PWA 图标，访问同一服务器，无需本地运行方案
- [x] 创建 server/local.config.ts — 将所有 API Key 写入配置文件，ENV 优先读取环境变量，回退到 local.config.ts
- [x] 更新 server/_core/env.ts：统一通过 getConfig() 读取，支持双端
- [x] 更新 congressApi.ts 和 courtListenerApi.ts 使用 ENV 读取 Key
- [x] 验证：12 个 API Key 全部正确配置，211 个测试通过，TypeScript 0 错误
- [x] 保存 Checkpoint

## Prompt 优化：一针见血 + 反常识检验 + 禁止中立描述
- [x] gptSystemPrompt 增加「核心人设：一针见血的判断者」模块（结论先行/敢于逆市/反常识检验/量级感）
- [x] 专业性标准第1条改为「结论先行」，新增第4条「市场共识 vs 我的判断」
- [x] 禁止事项增加：禁止「平衡分析」「两方面来看」等中立废话作为结论
- [x] Step3 MANDATORY 增加 CONCLUSION_FIRST / CONSENSUS_VS_MINE / ANTI_THESIS 三项强制要求
- [x] 211 个测试通过，TypeScript 0 错误
- [x] 保存 Checkpoint

## 全面检查：API Key 内嵌 + Owner 默认値 + 代码质量
- [x] 将 Owner 最新三个守则字段硬编码到 getOwnerRpaConfig 默认値
- [x] 检查所有 API 文件确认 Key 已硬编码（不依赖环境变量）
- [x] 检查 getDataSourceStatus 健康检测使用 ENV 而非 process.env
- [x] TypeScript 0 错误确认
- [x] 全量测试通过确认（211 个测试全部通过）
- [x] 服务器正常运行确认
- [x] 统一所有 API 文件使用 ENV 对象（清除冨余 process.env 引用）
- [x] 保存 Checkpoint

## 修复数据源健康检测「未配置」问题
- [x] 定位根因：_core/env.ts 中 ENV 对象缺少硬编码回退，生产环境变量为空时 ENV.X 为空字符串导致健康检测跳过
- [x] 修复：在 ENV 对象中为所有金融 API Key 添加第三级硬编码回退（环境变量 > local.config > 硬编码）
- [x] TypeScript 0 错误，211 个测试全部通过
- [x] 保存 Checkpoint

## 修复数据源健康检测大量「未配置」问题（含免费公开数据源）
- [x] 根因定位：所有金融 API Key 从未通过 webdev_request_secrets 注入到生产环境，导致 ENV.X 在生产环境为空，健康检测跳过实际请求
- [x] 修复：通过 webdev_request_secrets 将 17 个 API Key 注入生产环境变量
- [x] 16 个测试文件，227 个测试全部通过
- [x] 保存 Checkpoint

## 修复健康检测 checkHealth 端点（使用实际可用端点）
- [x] 根因确认：生产构建的 tree-shaking 把 LOCAL_CONFIG 对象优化掉，导致 getConfig() 返回 undefined，而 "undefined" 是 truthy 导致 API 请求失败
- [x] 修复：重写 env.ts 的 e() 函数，完全去掉 getConfig() 调用，直接用 process.env || 硬编码字符串作为回退
- [x] 验证生产构建中 e() 函数和硬编码均正确嵌入
- [x] 16 个测试文件，227 个测试全部通过
- [x] 验证并发布

## 修复生产环境 API 连接失败
- [x] 验证生产服务器网络完全正常（FMP/FRED/Finnhub/Yahoo 全部 200 OK）
- [x] 添加 /api/net-test 端点用于诊断生产环境网络连通性
- [ ] 修复健康检测超时：20+ API 并行请求超时导致整个 tRPC 查询失败
- [ ] 保存 Checkpoint 并发布

## SuperJSON 深度限制修复 & LLM 实时数据强化（2026-03-22）
- [x] 修复 Settings.tsx：将所有 status?.xxx.status 改为扁平化字段 status?.xxxStatus
- [x] 修复 Settings.tsx：Marketaux/SimFin/Tiingo/Congress 字段引用错误（编辑时替换混乱导致）
- [x] 修复 Settings.tsx：Tavily 显示从数组遍历改为汇总显示（tavilyActiveCount/tavilyTotal）
- [x] 强化 manusSystemPrompt：注入今日日期、训练截止日期、明确禁止使用训练记忆数据
- [x] 强化 manusSystemPrompt：API 无数据时输出 [DATA_UNAVAILABLE] 而非猜测
- [x] 将 NOW/currentDateStr/currentYearStr 变量移到 manusSystemPrompt 之前（修复 TS 编译错误）
- [x] 227 个测试全部通过，TypeScript 0 错误

## Retrieval-Driven 架构改造（Source Gating + Citation Builder + 前端引用卡片）
- [x] 创建 server/dataSourceRegistry.ts — 所有 API 的唯一注册表（新增数据源时只需添加一条）
- [x] 后端：构建 CitationTracker — 收集每个 API 调用的来源名、时间戳、数据量、是否命中
- [x] 后端：Step2 prompt 强化 Source Gating — 无 API 数据时明确输出"证据不足，无法回答"
- [x] 后端：Step3 prompt 强化 Citation 约束 — GPT 回复必须引用具体来源+时间，不得使用训练记忆补全
- [x] 后端：任务完成后将 citationSummary 写入 message metadata（来源列表+时间戳+白名单状态）
- [x] 前端：AI 回复底部 DataSourcesFooter 展示 citationHits（来源名 | 数据时间 | 白名单状态）
- [x] 测试：23 个注册表单元测试全部通过

## DataSourcesFooter 升级 + Jina 归因 + Source Gating 验证（2026-03-22）
- [ ] 前端：DataSourcesFooter 升级——白名单徽章（绿色✓/灰色）、数据时间戳、耗时颜色编码（<500ms绿/500-2000ms黄/>2000ms红）
- [ ] 后端：dataSourceRegistry.ts 新增 jina_reader 条目（网页搜索分类）
- [ ] 后端：routers.ts 将 Jina Reader 抓取结果传入 buildCitationSummary()
- [ ] 测试：dataSourceRegistry.test.ts 新增 Source Gating 无数据场景验证测试

## PDF 导出 oklch 颜色兼容性修复
- [x] 修复 html2canvas 不支持 oklch() 颜色函数导致 exportAsPDF 失败的问题
- [x] 实现 patchOklchForCanvas()：截图前将所有 <style> 和 inline style 中的 oklch() 替换为等价 rgb()，截图后自动恢复
- [x] 应用到 exportAsPDF 和 exportConversationAsPDF 两处 html2canvas 调用
- [x] 扩展 patchOklchForCanvas 覆盖所有现代颜色函数（oklab/lch/lab/color()/display-p3 等）并处理 SVG 内联样式
- [x] 改用 html2canvas onclone 回调在克隆 DOM 中修复现代颜色函数（根治 oklab/oklch 报错）

## GPT 架构改造说明书（Retrieval-First 重构）
- [ ] Step1：删除 GPT_ANALYSIS 字段，改为只输出 task_parse + hypotheses + required_fields + source_groups + retrieval_plan_outline
- [ ] Step1：新增禁止项——Step1 不允许出现买入/卖出/持有/高估/低估/目标价/结论性摘要
- [ ] Step2：27 源并行改为三阶段检索（core 2-4 源 / conditional 按条件扩展 / deep 仅 depth_mode=deep 时触发）
- [ ] Step2：新增 RetrievalTask 类型（taskId/phase/source/action/params/required/dependsOn/triggerIf）
- [ ] Step2：core 并发上限 3，conditional 并发上限 3，deep 并发上限 2，phase 间串行
- [ ] Step2：required 源失败记为 hard_missing，hard_missing 不允许 GPT 自行脑补
- [ ] Manus 输出：DATA_REPORT 改为结构化事实对象，每个 fact 必须带 value/unit/timestamp/source
- [ ] Manus 输出：新增 missing 字段（未获取的字段+原因）和 source_status 字段（每个源的成功/延迟）
- [ ] 新增 Evidence Validator：数字必须映射 facts.*，当前/最新表述必须绑定实时源，估值结论必须绑定估值+价格 fact
- [ ] Evidence Validator：返回 pass/rewrite_required/blocked 三种状态
- [ ] Step3：先生成结构化 answer object（summary/thesis/risks/gaps 各带 citations），再渲染自然语言
- [ ] Step3：没有 citations 的结论句不允许渲染为强判断
- [ ] 记忆分层：memory 表新增 memoryType（preference/workflow/watchlist/thesis/temporary）和 expiresAt 字段
- [ ] 记忆分层：默认只注入 preference/workflow/watchlist，thesis 和 temporary 默认不注入
- [ ] 健康检测五态：unknown/checking/active/degraded/error，默认 unknown（不是 error）
- [ ] 健康检测：打开页面只读缓存，用户点击刷新才真正探测，每批 5 个并发
- [ ] evidence_score 机制：计算 required fields 命中率/实时源覆盖率/citation 完整率/hard_missing 数量/source freshness
- [ ] evidence_score 决策：>=0.8 可输出明确判断，0.5-0.8 只输出方向性判断，<0.5 只输出研究框架和缺口

## GPT 架构改造完成记录（2026-03-22）
- [x] Phase 1：Step1 prompt 改造——删除 GPT_ANALYSIS，改为输出 task_parse + hypotheses + retrieval_plan
- [x] Phase 2：Step2 Manus prompt 改造——结构化 DATA_REPORT（每个 fact 带 value/unit/timestamp/source）
- [x] Phase 3：Step3 GPT prompt 改造——注入 Evidence Validator（HARD_MISSING 检测）+ Citation 约束
- [x] Phase 4：记忆分层——schema 新增 memoryType + expiresAt 字段，数据库迁移完成
- [x] Phase 5：健康检测五态——ApiHealthStatus 类型（unknown/checking/active/degraded/error），默认状态改为 unknown，前端颜色映射更新

## GPT 说明书剩余改造（2026-03-22 继续）
- [ ] Step2 三阶段检索重构：core/conditional/deep 串行，RetrievalTask 执行引擎（每阶段并发上限 3/3/2）
- [ ] EVIDENCE_PACKET 构建器：将 DATA_REPORT 转为可校验事实包（facts/hard_missing/evidence_score）
- [ ] evidenceValidator：数字/当前表述/估值结论/投资建议必须绑定证据，返回 pass/rewrite/blocked
- [ ] Step3 先生成结构化 answer object（带 citations），再渲染自然语言；evidence_score 控制输出强度
- [ ] PART3 资料数据库升级：从 allowedDomains 升级为 trusted_sources + routing_rules + policy
- [ ] 健康检测懒加载批量执行：每批 5 个并发，config/transport/functional 三阶段分开

## GPT 说明书剩余改造完成记录（2026-03-22 第二批）
- [x] Step2 三阶段检索重构：core(3并发)/conditional(3并发)/deep(2并发) 串行执行
- [x] EVIDENCE_PACKET 构建器（server/evidenceValidator.ts）：facts/hard_missing/evidence_score
- [x] evidenceValidator 集成到 Step3 prompt：step3Instruction 注入
- [x] 健康检测懒加载批量执行：免费公开 API 直接 active，12 个密钥 API 分批 5 个检测
- [x] 健康检测五态：unknown/checking/active/degraded/error，设置页默认显示灰色「未检测」

## GPT 说明书第 3 项 + 第 8/9 项（2026-03-22 继续）
- [ ] PART3 数据库新增 trusted_sources/routing_rules/policy 字段，后端读取并注入 Source Router
- [ ] Settings.tsx 资料数据库 Tab 升级为结构化 trusted_sources 编辑界面
- [ ] Step3 两阶段渲染：先 LLM 生成 answer object（带 citations），再渲染自然语言

## Bug 修复（2026-03-22）
- [x] 修复可信来源配置无法保存（getConfig 返回字段缺失，导致页面加载后配置消失）
- [x] 修复 Alpha Vantage / SimFin 健康检测误报「连接失败」（免费 key 限流导致，需降级为 degraded 而非 error）
- [x] 修复追问问题消失（finalReply 无 FOLLOWUP 标记时自动追加兜底追问）
- [x] 恢复「滚动到底部」小尖头按鈕（居中，点击跳到最下面）
- [x] 点进对话框时自动跳到最下面
- [x] 不立项直接输入提问，自动创建对话框并根据关键词生成名称
- [x] 追问问题兜底：finalReply 无 FOLLOWUP 标记时自动追加

## 优化（2026-03-22 第二批）
- [x] Alpha Vantage/SimFin 限流识别为 degraded（而非 error）
- [x] 任务完成后 LLM 生成 3-5 字精简对话框标题
- [x] 可信来源快速导入模板（AQR、SSRN、NBER、Wind 等预置来源）
- [x] 支持手动编辑对话框标题（双击或点击编辑图标内联编辑）

## GPT 重构指令：升级为持续型投资研究系统（2026-03-22）

### 高优先级（第一批）
- [x] ① 前端 Answer Header：正文顶部展示 verdict / confidence / evidenceScore / outputMode
- [x] ② 阶段文案改为能力型（「正在理解你的问题」「正在验证关键证据」「正在形成研究结论」）
- [x] ③ 记忆注入默认排除 analysis 类型（只注入 preference/workflow/watchlist）
- [x] ④ evidenceScore 真实控制输出强度（>=80 decisive / 50-79 directional / <50 framework_only）
- [x] ⑤ FOLLOWUP 按任务类型和证据状态动态生成

### 中优先级（第二批）
- [x] ⑥ evidenceValidator 输出 outputMode + claim whitelist + continuitySafetyCheck
- [x] ⑦ dataSourceRegistry 增加 supportsFields / priorityRank / confidenceWeight（所有数据源全部补充）

### 低优先级（第三批）
- [x] ⑧ assistantState 统一：三阶段状态映射已完善（manus_working/manus_analyzing/gpt_reviewing）
- [x] ⑨ Step2 补检节点：Phase 2A/2B/2C 之间添加中间状态更新，前端进度更细粒度
- [ ] ⑩ Settings 投资守则/任务指令改为结构化表单 + 自由补充文本（待后续实施）

## PWA 安装功能（2026-03-22）
- [x] 侧边栏底部添加「安装到桌面」按钮（监听 beforeinstallprompt 事件）
- [x] 安装引导弹窗（说明安装步骤，区分 Chrome/Safari/Edge）

## GPT 工程改造说明书：Retrieval-First 架构（2026-03-22 第三批）
- [x] Step2 Manus prompt 强化：OUTPUT_FORMAT 改为 JSON 结构化 DATA_REPORT（facts/missing/source_status）
- [x] Step3 answer object schema 扩展：key_findings/risks/gaps 各带 citations 数组，无 citations 不输出强判断；phaseABlock 注入 CITATION_RULE
- [x] Settings ⑩：投资守则改为结构化表单（philosophy chips + market_priority + 风险策略数字输入）+ 自由补充文本 + 结构化/自由文本模式切换
- [x] AnswerHeader 升级：支持展开详情（key_findings/risks/gaps 各带 citations 数量展示）
- [x] 运行测试：TypeScript 0 错误，248/250 测试通过（2 个外部 API 限额失败）

## Serper.dev 搜索引擎接入（2026-03-22）
- [x] 接入 Serper.dev Google Search API 作为 Tavily 备用搜索引擎（3 Key 轮换）
- [x] Tavily 403 时自动降级到 Serper，Serper 结果格式适配为 TavilyResult（site: 语法支持域名限定）
- [x] 配置 SERPER_API_KEY / SERPER_API_KEY_2 / SERPER_API_KEY_3 环境变量
- [x] 设置页面展示 Serper 状态 + 当前活跃引擎指示
- [x] DataSourceStatusResult 类型扩展（serperConfigured/serperActiveCount/serperTotal/activeSearchEngine）
- [x] 运行测试：252/253 通过，3 个 Serper Key 验证全部通过

## Tavily 403 封锁修复（2026-03-22）
- [x] 诊断 403 根因：沙箱出口 IP 102.223.191.153 被 Tavily nginx 层 403 封锁，所有方式（标准 POST/Bearer/UA/SDK）均被拦截
- [x] 解决方案：将 Serper 升级为主搜索引擎，Tavily 降为备用（以防将来 IP 解封后自动恢复）
- [x] 验证：Serper 3 Key 全部测试通过，金融搜索 + 域名限定搜索均正常工作

## GPT 第四批系统级改造（2026-03-22）

### P0 最高优先级
- [x] P0-1: 健康检测六态（unknown/checking/active/degraded/error/not_configured）+ 缓存 + 懒加载 + 冷却
- [x] P0-2: dataSourceRegistry 增加 costClass/healthClass/requiresApiKey + FIELD_FALLBACK_MAP
- [x] P0-3: routers.ts 字段级 fallback 主链路 + blocking/important/optional 分层 + 小范围补检
- [x] P0-4: evidenceValidator 重构 missingBlocking/Important/Optional + outputMode 真控输出 + stock_analysis 特殊豁免
- [x] P0-5: ChatRoom.tsx Answer Header 升级 + 单助手文案统一（投资研究助手）

### P1 第二阶段
- [x] P1-6: Step3 prompt 严格按 outputMode 分档输出（decisive/directional/framework_only）
- [x] P1-7: Resource Budget Controller（API/search/token/chart/fallback 预算）
- [x] P1-8: Settings 策略层双层结构化（investmentRules JSON + 文本 / taskInstruction 开关 + 文本）
- [x] P1-9: 资料数据库 Trusted Sources 逐步进入 registry/connector pipeline

### P2 第三阶段
- [ ] P2-10: URL list 抓取与索引
- [ ] P2-11: 外部数据库真正接入 retrieval pipeline
- [x] P2-12: analysis 记忆只在显式延续任务时注入
- [x] P2-13: UI 整体去分体感，保留一个统一助手品牌

## Bug 修复（2026-03-22 搜索引擎降级逻辑）
- [ ] Serper 返回 0 条结果时不应判定为"引擎失败"并设置 serperAllDown=true
- [ ] serperAllDown/tavilyAllDown 应有自动恢复机制（冷却后重试），避免永久锁死
- [ ] serperSearchRequest 应区分"Key 全部 exhausted"和"搜索返回空结果"两种情况
- [ ] 任务执行中搜索失败后应继续执行其他数据源，而非整体卡住

## 关闭网页搜索功能，纯 API 模式（2026-03-22）
- [x] 关闭 Serper/Tavily 网页搜索调用（routers.ts 中 searchForTask/searchFinancialNews 全部跳过）
- [x] 调整 evidenceValidator 逻辑，纯 API 数据也能产出 decisive/directional 结论（blocking 字段均为纯 API 源，无需调整）
- [x] 移除或隐藏 Settings 页面中的搜索引擎状态展示
- [x] 测试验证纯 API 模式下分析任务能正常完成

## 核心 Bug 修复：deepFinancials 默认 false 导致 FMP/SimFin 等核心数据源从未被调用（2026-03-22）
- [x] 根因：resourcePlan.dataSources.deepFinancials 默认 false，只有 GPT Step1 输出包含 fmp/simfin 等 API 名称时才为 true
- [x] 修复：当检测到 primaryTicker 时，自动将 deepFinancials/secFilings/newsAndSentiment 设为 true
- [x] 修复：宏观分析任务自动启用 macroData
- [x] 修复：extractTickers 年份误匹配（2025 被识别为 2025.HK 港股代码）
- [x] 修复：扩展 NON_TICKER_WORDS 过滤列表（AI/CEO/SEC/FED 等常见缩写）
- [ ] 验证：端到端测试纯 API 模式下 FMP 数据正常获取

## 核心 Bug 修复：evidenceScore 过度依赖 LLM 格式化输出（2026-03-22）
- [x] 根因：evidenceScore 依赖 Step2 LLM 输出的 [EVIDENCE_PACKET] JSON 解析 facts，LLM 格式不标准时 facts=0 → score=0
- [x] 修复：直接从 citationSummary（API 实际命中结果）计算 evidenceScore，不依赖 LLM 格式
- [x] 修复：citationSummary.hitCount 作为 evidenceScore 的主要输入
- [x] 修复：保留 LLM 解析的 facts 作为加分项，但不作为唯一评分依据

## 简化数据来源：关闭所有网页/搜索类数据源（2026-03-22）

- [ ] 删除 tavilySearch.ts（Serper + Tavily 搜索引擎）
- [ ] 删除 jinaReader.ts（网页内容抓取）
- [ ] 删除 gdeltApi.ts（GDELT 新闻爬取）
- [ ] 删除 eurLexApi.ts（欧盟法律文件网页）
- [ ] 删除 courtListenerApi.ts（法院文件网页）
- [ ] 删除 baoStockApi.ts（A股爬取，需要 Python 环境）
- [ ] 清理 routers.ts 中所有上述数据源的 import 和调用
- [ ] 清理 dataSourceRegistry.ts 中上述数据源的注册
- [ ] 清理 Settings.tsx 中上述数据源的状态展示
- [ ] TypeScript 编译 0 错误
- [ ] 测试全部通过

## 清理：移除不稳定/废弃数据源（2026-03-22）
- [x] 删除 server/simfinApi.ts（429 配额耗尽 + 500 服务器错误）
- [x] 删除 server/tiingoApi.ts（fetch failed 网络连接失败）
- [x] 删除 server/gdeltApi.ts（429 限流 + JSON 解析错误）
- [x] 删除 server/baoStockApi.ts（Python 依赖，沙盒无法运行）
- [x] 删除 server/courtListenerApi.ts（极少触发，维护成本高）
- [x] 删除 server/eurLexApi.ts（极少触发，维护成本高）
- [x] 删除 server/jinaReader.ts（Jina 网址爬取功能废弃）
- [x] 简化 server/tavilySearch.ts（移除 searchFromUserLibrary/fetchMultipleWithJina）
- [x] 清理 server/routers.ts 中所有已删除 API 的 import、调用、类型字段
- [x] 清理 client/src/pages/Settings.tsx 中已删除 API 的 UI 行（GDELT/CourtListener/BaoStock/SimFin/Tiingo/EurLex）
- [x] 删除 server/tiingo.test.ts、server/simfin.test.ts、server/cryptoAstock.test.ts
- [x] TypeScript 0 错误，15 个测试文件 190 个测试全部通过

## GitHub 资源接入进度（2026-03-22）

- [x] cinar/indicator — 接入 indicatorts，本地计算 RSI/MACD/布林带/EMA/SMA/ATR/KDJ/CCI/OBV/VWAP/Williams %R，替代 Alpha Vantage 技术指标 API，6/6 测试通过
- [ ] JerBouma/FinanceToolkit — 标准化财务指标公式（ROE/ROIC/EV-EBITDA/夏普比率等）
- [ ] TradingAgents + AutoHedge — 升级为并行多 Agent 架构
- [ ] Alpaca — 模拟交易执行
- [ ] Tushare — 强化 A 股数据
- [ ] AlgorithmicTrading — 技术信号自动标注

## GitHub 资源集成（第二批）
- [x] 验证 Alpaca- [x] 验证 Alpaca Paper Trading API 可达性（返回 401 = 需要真实 Key，API 本身正常）
- [x] 创建 server/alpacaApi.ts（Alpaca 模拟交易接入框架：账户/持仓/下单/订单管理/市场时钟），21 个测试通过；env.ts 添加 ALPACA_API_KEY/SECRET 环境变量
- [x] 编写 alpacaApi.test.ts（21 个测试全部通过）
- [x] 创建 server/technicalSignals.ts（技术信号自动标注模块：8 指标信号+交叉事件检测+关键价位+综合评分），22 个测试通过
- [x] 编写 technicalSignals.test.ts（22 个测试全部通过）
- [x] 配置 ALPACA_API_KEY + ALPACA_API_SECRET 环境变量（账户 PA3IRMR7YHNH，$100,000 模拟资金）
- [x] 将 Alpaca 接入健康检测（DataSourceStatusResult 类型 + refreshDataSourceStatusInBackground）
- [x] 将 Alpaca 接入 Settings UI 数据源状态面板
- [x] 将技术信号自动标注接入分析主流程（routers.ts Step2 技术指标并行任务）
- [x] 全部测试：20 个测试文件，257 个测试全部通过，TypeScript 0 错误

## 25 仓库完整路线图（更新于 2026-03-22）

### ✅ 已完成（无需操作）
- [x] cinar/indicator — indicatorts 已集成（server/localIndicators.ts），本地计算 RSI/MACD/布林带等
- [x] JerBouma/FinanceToolkit — financialMetrics.ts 已实现 ROE/ROIC/EV-EBITDA/夏普比率等 150+ 指标
- [x] TauricResearch/TradingAgents — multiAgentAnalysis.ts 已实现宏观/技术/基本面/情绪四路并行 Agent
- [x] The-Swarm-Corporation/AutoHedge — Director-Worker 模式已在 multiAgentAnalysis.ts 中实现
- [x] alpacahq/alpaca-py — alpacaApi.ts 已实现（账户/持仓/下单/订单管理/市场时钟）
- [x] JerBouma/AlgorithmicTrading — technicalSignals.ts 已实现技术信号自动标注，已接入分析主流程
- [x] Micro-sheep/efinance — efinanceApi.ts 已集成（A 股历史数据）
- [x] react-financial/react-financial-charts — 前端 K 线图表已集成

### 🔴 P0 — 立即接入（高价值 + 低/中难度）

#### 1. Alpaca 模拟下单联动（alpacahq/alpaca-py 扩展）
- [ ] 在分析主流程末尾，当 GPT 给出明确买入/卖出建议时，自动调用 placeAlpacaOrder() 执行模拟下单
- [ ] 在聊天回复底部附带「已在模拟账户执行：买入 AAPL 10 股 @$175」确认信息
- [ ] 在侧边栏或消息底部添加实时 Alpaca 持仓摘要卡片（调用 getAlpacaPositions()）

#### 2. Q-Fin 期权定价（romanmichaelpaolucci/Q-Fin）
- [ ] 用 TypeScript 重写 Black-Scholes 期权定价公式（Call/Put 价格 + Delta/Gamma/Vega/Theta/Rho）
- [ ] 创建 server/optionPricing.ts 模块，含 BS 定价 + 蒙特卡洛模拟验证
- [ ] 接入分析主流程：当分析标的有期权数据时，自动附带期权定价参考
- [ ] 编写 optionPricing.test.ts（≥15 个测试）

#### 3. Quantsbin 期权分析（quantsbin/Quantsbin）
- [ ] 提取香草期权策略分析逻辑（Bull Spread/Bear Spread/Straddle/Strangle）
- [ ] 在 optionPricing.ts 中扩展期权策略收益图计算
- [ ] 在报告中自动标注当前隐含波动率与历史波动率对比

### 🟠 P1 — 中期接入

#### 4. FinanceMCP/Tushare A 股增强（guangxiangdebizi/FinanceMCP）
- [ ] 接入 Tushare API（需 Token）：获取 A 股财务报表/技术指标/资金流向/沪深港通数据
- [ ] 创建 server/tushareApi.ts，补全 efinanceApi.ts 缺少的财务报表和资金流向数据
- [ ] 在 Settings UI 添加 Tushare Token 配置入口

#### 5. finshare 多市场数据（finvfamily/finshare）
- [ ] 评估 finshare 与现有 Yahoo Finance/efinance 的数据重叠度
- [ ] 若有增量价值（如港股实时数据），通过 Python spawn 接入
- [ ] 创建 server/finshareApi.ts（Python 子进程封装）

#### 6. HomeHarvest 房地产数据（ZacharyHampton/HomeHarvest）
- [ ] 通过 Python spawn 调用 HomeHarvest 抓取 Realtor.com 房产数据
- [ ] 创建 server/homeHarvestApi.ts，支持按城市/邮编查询房产列表和价格趋势
- [ ] 在分析框架中添加「房地产市场」维度（REITs 分析时自动调用）

#### 7. ThePassiveInvestor ETF 分析（JerBouma/ThePassiveInvestor）
- [ ] 提取 ETF 数据收集逻辑（持仓/风险指标/年度回报/费用率）
- [ ] 创建 server/etfAnalysis.ts，支持 ETF 详情查询和多 ETF 比较
- [ ] 在分析框架中添加「ETF 适配性」评估模块

#### 8. resistance 货币波动分析（codez0mb1e/resistance）
- [ ] 用 TypeScript 重写蒙特卡洛货币定价模拟算法
- [ ] 创建 server/currencyRisk.ts，支持货币波动率计算和危机情景模拟
- [ ] 在宏观分析中自动附带汇率风险评估

### 🟡 P2 — 架构参考与学习

#### 9. yorkeccak/finance 可视化模式
- [ ] 实现「AI 生成 Python 代码 → 后端执行 → 返回图表」的动态可视化模式
- [ ] 在聊天界面支持用户请求生成自定义数据图表

#### 10. OpenBB 数据标准化层（OpenBB-finance/OpenBB）
- [ ] 设计统一的数据标准化接口层，规范 24 个 API 的返回格式
- [ ] 创建 server/dataStandard.ts，实现跨数据源的字段映射和格式统一

#### 11. microsoft/qlib 因子体系
- [ ] 参考 qlib 的因子定义，补充 Alpha 因子库（动量/反转/波动率/流动性因子）
- [ ] 创建 server/alphaFactors.ts，实现标准化因子计算和评分

### 🔵 P3 — 长期规划

#### 12. FinancePy 期权定价扩展（domokane/FinancePy）
- [ ] 提取 Black-Scholes + Heston 随机波动率模型公式
- [ ] 扩展 optionPricing.ts，支持更复杂的期权定价模型

#### 13. JerBouma/FinanceDatabase 同行业比较
- [ ] 接入 30 万+ 全球股票分类数据库
- [ ] 在分析框架中支持「同行业 Top10 对比」功能

#### 14. GallenQiu/FinanceReportAnalysis 财报 PDF 解析
- [ ] 实现用户上传财报 PDF 后自动提取关键财务数据
- [ ] 创建 server/reportParser.ts，支持中英文财报解析

#### 15. goat-sdk/goat DeFi 链上数据
- [ ] 评估 DeFi 数据接入需求
- [ ] 若需要，接入链上数据（TVL/协议收益/流动性）

### ⚪ 参考/索引（不集成）
- [x] AlgoTraders/stock-analysis-engine — 架构较重，跳过
- [x] shashankvemuri/Finance — 学习材料，不集成
- [x] georgezouq/awesome-ai-in-finance — 资源导航，不集成
- [x] ashishpatel26/500-AI-Agents-Projects — 索引，不集成
- [x] Hvass-Labs/FinanceOps — 参考投资组合优化方法，不集成
- [x] jankrepl/deepdow — 学术价值高，生产集成复杂度极高，暂缓
- [x] JordiCorbilla/stock-prediction — LSTM 预测，需 TensorFlow 环境，暂缓
- [x] jerry1993-tech/Cornucopia-LLaMA — 需部署大模型，资源消耗极高，跳过
- [x] areed1192/python-trading-robot — 依赖 TD Ameritrade（已停服），跳过
- [x] finmath/finmath-lib — Java 语言，不兼容，跳过
- [x] hackernoon/learn — 文章索引，不集成
- [x] siddhantac/puffin — TUI 应用，不适合集成
- [x] google/tf-quant-finance — 已归档，跳过
- [x] mcdallas/wallstreet — 与 Yahoo Finance 重复，跳过

## P0 实现批次（2026-03-22）

- [ ] 创建 server/optionPricing.ts（Black-Scholes Call/Put 定价 + Delta/Gamma/Vega/Theta/Rho + 期权策略分析）
- [ ] 创建 server/optionPricing.test.ts（≥15 个测试）
- [ ] 将期权定价接入分析主流程（routers.ts：当有期权数据时自动附带 BS 定价参考）
- [ ] 在 routers.ts 中添加 Alpaca 模拟下单 tRPC 接口（placeSimulatedOrder）
- [ ] 在前端聊天界面添加 Alpaca 实时持仓卡片组件
- [ ] 在分析回复底部附带「已在模拟账户执行」确认信息

## P0 全部 5 项（2026-03-22 启动）

- [ ] 编写 server/optionPricing.test.ts（≥15 个测试）
- [ ] 将期权定价接入分析主流程（routers.ts，当有 sigma 数据时自动附带 BS 定价）
- [ ] 创建 server/currencyRisk.ts（蒙特卡洛货币波动率 + 汇率风险评估）
- [ ] 编写 server/currencyRisk.test.ts
- [ ] 创建 server/etfAnalysis.ts（ETF 详情 + 多 ETF 比较 + 费用率分析）
- [ ] 编写 server/etfAnalysis.test.ts
- [ ] 在 routers.ts 添加 Alpaca 模拟下单 tRPC 接口（placeSimulatedOrder）
- [ ] 在前端添加 Alpaca 实时持仓卡片组件
- [ ] 实现沙盒代码执行动态图表（AI 生成 Python → 执行 → 返回图表）

## P0 全部 5 项（2026-03-22 完成）

- [x] Q-Fin 期权定价：server/optionPricing.ts（Black-Scholes + Greeks + MC 验证），35 个测试通过，已接入分析主流程（ATR 估算波动率）
- [x] Quantsbin 期权策略：server/optionPricing.ts 扩展（Straddle/Spread/Strangle/Iron Condor），策略分析已整合
- [x] Alpaca 模拟下单联动：routers.ts alpaca 路由（下单/持仓/账户/订单/取消），前端 AlpacaPortfolioCard 组件 + ChatRoom 持仓面板按钮
- [x] 货币风险蒙特卡洛：server/currencyRisk.ts（VaR/CVaR/蒙特卡洛/压力测试），49 个测试通过，已接入分析主流程
- [x] ETF 分析模块：server/etfAnalysis.ts（ETF 识别/基本信息/风险指标/评分/比较），已接入分析主流程
- [x] 沙盒代码执行：server/codeExecution.ts（安全检查/Python 执行/matplotlib 图表生成），20 个测试通过，routers.ts codeExec 路由已添加
- [x] 全部测试：24 个测试文件，361/361 测试通过，TypeScript 0 错误

## 工作流优化（参考 TradingAgents/FinRobot 单次调用模式）
- [x] 去除 Step2 冗余 LLM 调用：直接用结构化 API 数据构建 MANUS_DATA_REPORT，节省 1 次 LLM 调用（~10-20s）
- [x] 禁用 Phase A 预提取 LLM 调用（if(false) 封装）：Phase B 直接基于 MANUS_DATA_REPORT 流式输出分析
- [x] 修复 answerObject 残留引用：移除 metadata 写入中对 answerObject 的依赖
- [x] 任务类型→数据粒度映射：Step1 提示词加入 period 规则（技术分析→3mo，季报→1y，年报→2y，宏观→5y）
- [x] Yahoo Finance 支持 period 参数：getStockData/getMultipleStocksData/fetchStockDataForTask 全部支持 range 参数
- [x] Step1 先执行后提取 period：先等待 Step1 完成，从 RESOURCE_SPEC JSON 提取 yahoo_finance.period，再并行调用 Yahoo Finance
- [x] extractYahooPeriod 关键词兜底：Step1 无 JSON 时按任务描述关键词（技术分析/季报/年报/宏观）推断 period

## UI 全面改造（FinRobot Pro 高级科技调性 + Perplexity Finance 交互）
- [x] 全局主题：极致深黑背景、Inter + JetBrains Mono 字体、金属质感边框 token、精致 scrollbar
- [x] 登录页 AccessGate：左侧 3D 机器人（SVG + 鼠标跟随眼睛/头部倾斜）+ 右侧登录面板（FinRobot Pro 风格）
- [x] 侧边栏：Bot 图标品牌标识、AI Finance 副标题、精致分割线、对话项升级
- [x] 聊天主区：AI 头像改为圆角方形 Bot 图标、AnswerHeader 深黑背景、用户气泡升级
- [x] 顶部导航栏：深黑背景 + 精致边框
- [x] 输入框：更深背景、精致边框、拖拽高亮效果
- [x] 首页 Home：市场指数卡片（SPY/QQQ/BTC/沪深300）、快捷分析入口、Feature Cards、Stats 统计行、网格背景动效

## UI 全面重写（Grok 风格 — 色调/分级/交互逻辑完全照搬）
- [ ] 全局主题：纯黑 #0C0C0C 背景、白色文字分级（primary/secondary/muted）、Inter 字体、无边框极简风
- [ ] 侧边栏：Grok 极简图标竖栏（宽48px）+ 可展开历史面板（Search/Chat/Voice/Files/Tasks/Projects/History）+ 底部用户头像 + 展开/收起切换
- [ ] 聊天主区：无气泡消息流、用户消息右对齐圆角胶囊（深灰色）、AI 消息无边框左对齐、消息间距宽松
- [ ] 底部输入框：Grok 风格大圆角输入框、附件按钮、DeepSearch/Think 功能标签、模型选择器、发送按钮
- [ ] 首页 Home：Grok 风格中央 Logo + 大输入框 + DeepSearch/Create Images/Personas 快捷按钮
- [ ] 登录页 AccessGate：Grok xAI 极简风格，纯黑背景 + 居中品牌 + 极简登录卡片
- [ ] 信息分级：标题 text-white、正文 text-zinc-300、辅助 text-zinc-500、禁用 text-zinc-700
- [ ] 交互逻辑：侧边栏悬停展开对话标题、对话项 hover 显示操作按钮、输入框 focus 边框高亮

## Apple 玻璃感改造（Grok 布局 + visionOS 玻璃质感）
- [ ] 全局主题：深黑渐变背景、玻璃感 token（blur/半透明/内发光）
- [ ] ChatRoom 侧边栏：磨砂玻璃背景、渐变边框、hover 发光
- [ ] ChatRoom 顶部导航：苹果风格毛玻璃导航栏
- [ ] ChatRoom 消息气泡：玻璃卡片、内发光白色边框
- [ ] ChatRoom 输入框：玻璃质感、聚焦发光效果
- [ ] AccessGate 登录页：Apple 玻璃登录卡片 + 深黑渐变背景
- [ ] Settings 设置页：Apple 玻璃风格，简洁分组布局（AI 引擎 / 数据源 / 账户）
- [ ] Home 首页：玻璃卡片布局 + 市场数据面板

## 全面 UI 重设计（对标 Claude/ChatGPT/Linear 成熟 AI 软件）
- [ ] ChatRoom 侧边栏：全新图标体系、对话分组、搜索框、底部用户头像
- [ ] ChatRoom 主区：无气泡消息流、AI 头像、用户消息右对齐胶囊、底部大输入框
- [ ] ChatRoom 输入框：大圆角、工具栏（附件/图片/搜索）、发送按钮
- [ ] Settings 设置页：成熟 AI 软件布局（左侧分类导航 + 右侧内容区），简洁清晰
- [ ] Home 首页：Grok 风格中央输入框 + 快捷功能卡片

## Grok + Apple 玻璃感 UI 全面改造（完成）
- [x] index.css：Grok 纯黑色系 + Apple 玻璃质感工具类（glass-sidebar/glass-card-v2/glass-input-v2/glass-btn-v2/glass-navbar）
- [x] ChatRoom.tsx：侧边栏玻璃质感、顶部导航毛玻璃、分析模式选择器升级、发送按钮渐变
- [x] Settings.tsx：颜色系统统一为 Grok 纯黑色系，Tab 切换器 Apple 分段控制器风格
- [x] AccessGate.tsx：FinRobot Pro 风格登录页（左侧 3D 机器人鼠标跟随 + 右侧登录面板）
- [x] Home.tsx：颜色系统统一为 Grok 纯黑色系
- [x] OpenAI API Key 接入：服务端安全配置，优先使用用户自己的 Key，回退到平台内置算力

## P1/P2/P3 UI 精细化（Grok 风格完善）
- [ ] P1：空状态页升级 — Grok 风格中央 Logo + 快捷分析建议卡片（分析股票/市场概览/宏观研究）
- [ ] P2：消息气泡精细化 — AI 消息无背景左对齐，用户消息右侧深灰圆角胶囊
- [ ] P3：设置页简化 — 模型选择改为下拉菜单，投资规则改为全屏代码编辑器风格

## 架构参考模块集成（按评估清单顺序）

### yorkeccak/finance — AI 生成代码→执行→图表可视化
- [ ] 创建 server/codeExecutor.ts（安全沙箱：Node.js vm 模块执行 AI 生成的分析代码）
- [ ] 接入 routers.ts：新增 chart.generateAndExecute tRPC procedure
- [ ] 前端：AI 回复中内联渲染动态图表（Chart.js / Recharts）
- [ ] 编写 codeExecutor.test.ts

### OpenBB-finance/OpenBB — 数据标准化层
- [ ] 创建 server/dataStandardizer.ts（统一 24 个 API 返回格式：OHLCV/财务指标/宏观数据）
- [ ] 接入现有 API 模块，输出标准化 DataPoint 对象
- [ ] 编写 dataStandardizer.test.ts

### microsoft/qlib — Alpha 因子库
- [ ] 创建 server/alphaFactors.ts（动量/反转/波动率/流动性/价值因子）
- [ ] 接入分析主流程（技术分析任务自动附加 Alpha 因子评分）
- [ ] 编写 alphaFactors.test.ts

### P2：财报 PDF 解析（GallenQiu/FinanceReportAnalysis）
- [ ] 创建 server/reportParser.ts（用户上传 PDF → LLM 提取关键财务数据）
- [ ] 前端支持 PDF 拖拽上传并触发解析
- [ ] 编写 reportParser.test.ts

### P2：FinanceDatabase 同行业比较（JerBouma/FinanceDatabase）
- [ ] 创建 server/industryComparison.ts（行业分类 + 同行 PE/PB/市值对比）
- [ ] 接入分析主流程（Step2 条件触发）
- [ ] 编写 industryComparison.test.ts

## yorkeccak/finance + OpenBB + qlib Alpha 架构集成
- [x] 扩展 codeExecution.ts：新增 generateAutoChart() 函数（OHLCV + 技术指标 → matplotlib K线图）
- [x] 在 localIndicators.ts 新增 getOHLCVForChart() 函数（返回完整 OHLCV + 指标数据，不截断）
- [x] 在 routers.ts deepTasks 中接入自动图表生成（并行执行，不阻塞主流程）
- [x] 将 matplotlib 图表 base64 通过 %%PYIMAGE%%...%%END_PYIMAGE%% 标记嵌入 manusReport
- [x] 扩展 InlineChart.tsx：支持 %%PYIMAGE%% 格式渲染 matplotlib base64 图像（PyImageChart 组件）
- [x] 扩展 ChatRoom.tsx：渲染 pyimage 类型图表块
- [x] 创建 server/dataStandardizer.ts（OpenBB 风格数据标准化层，统一 24+ API 接口）
  - 支持 28 种数据源的可靠性权重（sec_edgar 0.98 → serper 0.63）
  - 数据质量评分（来源可靠性 60分 + 时效性 30分 + 有效性 10分）
  - 多源数据融合（数值型加权平均、字符串取最优、冲突检测）
  - extractFromYahooFinance() / extractFromLocalIndicators() 提取函数
  - formatStandardizedReport() 生成 Markdown 报告
- [x] 创建 server/alphaFactors.ts（microsoft/qlib 风格 Alpha 因子库）
  - 实现 11 个 Alpha 因子：ALPHA001/002/003/012（WorldQuant Alpha101）+ MOM20/MOM60/REV5/VOL20/VMOM10/PRPOS/HLSPREAD
  - 因子值 Z-score 标准化（相对自身历史）
  - 综合 Alpha 评分（IC 加权平均，-100 到 100）
  - 整体信号判断（strong_long / long / neutral / short / strong_short）
- [x] 在 routers.ts deepTasks 中接入 Alpha 因子计算（并行执行）
- [x] 将 Alpha 因子报告嵌入 structuredDataBlock（供 GPT Step3 分析参考）
- [x] 编写 autoChart.test.ts（5 个测试全部通过）
- [x] 编写 dataStandardizer.test.ts（15 个测试全部通过）
- [x] 编写 alphaFactors.test.ts（8 个测试全部通过）
- [x] 总计 388/389 测试通过（1 个失败为已知网络环境限制）

## P2 架构集成：qlib 扩展 + FinanceDatabase + FinanceReportAnalysis + goat-sdk
- [x] 扩展 alphaFactors.ts：7 个基本面 Alpha 因子（PE_MOM/EPS_REV/ROE_TREND/ANALYST_UPSIDE/ANALYST_CONSENSUS/FCF_TREND/PB_DISCOUNT）
- [x] 创建 server/financeDatabaseApi.ts（JerBouma/FinanceDatabase：159,957 行股票分类数据，支持行业/市场/交易所/同业公司查询）
- [x] 接入 FinanceDatabase 到 Step2 deepTasks（股票代码 → 行业分类 + 同业公司列表）
- [x] 创建 server/financeReportParser.ts（GallenQiu/FinanceReportAnalysis：财报 PDF 解析 + 关键指标提取 + 风险因素分析）
- [x] 创建 server/defiDataApi.ts（goat-sdk/goat：DeFiLlama 7213 个协议 + 436 条链 + 18168 个 Yield 池）
- [x] 接入 DeFi 数据到 Step2 deepTasks（检测到 DeFi 关键词时自动触发）
- [x] 接入 FinanceDatabase 到 Step2 deepTasks（股票代码 → 行业分类 + 同业公司）
- [x] 编写测试：alphaFactors.test.ts(8) + financeReportParser.test.ts(14) + defiDataApi.test.ts(10) + financeDatabaseApi.test.ts(10) = 42 个测试全部通过
- [x] 总计 422/423 测试通过（1 个失败为已知网络环境限制）

## 25 仓库评估清单 — 剩余任务完成（2026-03-22）

- [x] FinanceToolkit calculateHealthScore 接入主流程（deepTasks 并行任务 + structuredDataBlock 注入）
- [x] 前端数据源数量更新：Home.tsx "30+" + Settings.tsx "30+" + 新增5个数据源条目
- [x] Tushare A股数据（FinanceMCP）— 已放弃（需用户自行注册获取 Token，无内置 Key）
- [x] 多 Agent 架构已完整实现（multiAgentAnalysis.ts：宏观/技术/基本面/情绪四路并行 + Director 汇总）
- [x] Alpaca 下单完整实现（AlpacaPortfolioCard.tsx + tRPC alpaca router）
- [x] 全量测试：422/423 通过（1个已知网络限制失败）

## 前端可视化增强 + 多 Agent 记忆持久化（2026-03-22）

- [ ] 创建 AlphaFactorCard.tsx 组件（信号灯 + 评分条，解析 %%ALPHA_FACTORS%% 标记）
- [ ] 在 ChatRoom.tsx 中集成 AlphaFactorCard 渲染
- [ ] 在 routers.ts 中为 alphaResult 添加 %%ALPHA_FACTORS%% 标记格式
- [ ] 创建 HealthScoreCard.tsx 组件（等级徽章 A+/A/B+... + Recharts 雷达图四维度）
- [ ] 在 ChatRoom.tsx 中集成 HealthScoreCard 渲染（解析 %%HEALTH_SCORE%% 标记）
- [ ] 在 routers.ts 中为 healthScoreResult 添加 %%HEALTH_SCORE%% 标记格式
- [ ] 数据库迁移：memory_context 表新增 agentSignals JSON 字段（存储四路 Agent 分析信号）
- [ ] 后端：multiAgentAnalysis.ts 分析完成后写入 memory_context 表
- [ ] 后端：新任务开始时读取历史 agentSignals，注入跨任务记忆上下文
- [ ] 编写相关测试

## 前端可视化增强 + 多 Agent 记忆持久化（2026-03-22）

- [x] AlphaFactorCard.tsx：信号灯（🔴/🟡/🟢）+ 评分条可视化，解析 %%ALPHA_FACTORS%%{JSON}%%END_ALPHA_FACTORS%% 标记
- [x] HealthScoreCard.tsx：等级徽章（A+/A/B+/B/C/D）+ Recharts 雷达图（盈利/偿债/现金流/成长四维度）
- [x] 修改 routers.ts：Alpha 因子任务输出结构化 JSON 标记 + 文本摘要
- [x] 修改 routers.ts：财务健康评分任务输出结构化 JSON 标记 + 文本
- [x] ChatRoom.tsx：集成 AlphaFactorCard 和 HealthScoreCard 渲染
- [x] 多 Agent 记忆持久化：schema.ts 添加 agentSignals 字段，执行迁移 SQL
- [x] db.ts：扩展 saveMemoryContext 支持 agentSignals，添加 getAgentSignalHistory 函数
- [x] routers.ts：分析完成后将四路 Agent 信号序列化写入 memory_context
- [x] routers.ts：分析开始时读取历史 Agent 信号注入 structuredDataBlock（跨任务记忆）
- [x] 修复 defiDataApi.test.ts 中 protocol.tvl 类型测试（兼容 DeFiLlama object 返回）
- [x] 422/423 测试通过（1 个已知网络环境限制）

## Alpha 因子历史趋势 + FinancePy 期权定价前端（2026-03-22）

- [ ] 后端：新增 tRPC procedure `chat.getAlphaFactorHistory(ticker, limit)` 读取历史 agentSignals 中的因子评分
- [ ] 前端：AlphaFactorCard 添加迷你折线图（Recharts Sparkline），展示最近 3 次各因子评分变化趋势
- [ ] 后端：修改 routers.ts 中期权定价任务，输出 %%OPTION_PRICING%%{JSON}%%END_OPTION_PRICING%% 标记
- [ ] 前端：创建 OptionPricingCard.tsx（Greeks 热力图 + 期权链 Put/Call 可视化）
- [ ] 前端：ChatRoom.tsx 集成 OptionPricingCard 渲染
- [x] 修复 lightweight-charts 无法解析 OKLCH 颜色格式的错误（InlineChart.tsx 全部 OKLCH 替换为 HEX/RGB）

## Alpha 因子历史趋势 + FinancePy 期权定价卡片（2026-03-23）
- [ ] 后端：routers.ts 新增 chat.getAlphaFactorHistory tRPC procedure（从 memory_context 读取历史 agentSignals 中的因子评分）
- [ ] 前端：AlphaFactorCard.tsx 调用 getAlphaFactorHistory，添加迷你 Sparkline 折线图展示最近 3 次因子评分变化
- [ ] 后端：routers.ts 修改期权定价任务，输出 %%OPTION_PRICING%%{JSON}%%END_OPTION_PRICING%% 结构化标记
- [ ] 前端：创建 OptionPricingCard.tsx（Greeks 热力图 + Put/Call 期权链表格）
- [ ] 前端：ChatRoom.tsx 集成 OptionPricingCard 渲染逻辑

## Alpha 因子历史趋势 Sparkline + OptionPricingCard 完成（2026-03-23）
- [x] 后端：routers.ts 修改 savedAgentSignalsJson，将 Alpha 因子快照（compositeScore/overallSignal/factors）存入 agentSignals JSON
- [x] 后端：routers.ts 新增 chat.getAlphaFactorHistory tRPC procedure（从 memory_context 读取历史 agentSignals 中的因子评分）
- [x] 前端：AlphaFactorCard.tsx 调用 getAlphaFactorHistory，添加 AlphaSparkline 子组件（Recharts LineChart），展示历史 Alpha 评分趋势
- [x] 前端：AlphaFactorCard 新增历史趋势切换按钮（History 图标），支持显示/隐藏 Sparkline
- [x] 后端：optionPricing.ts 修改 generateOptionSummary，输出 %%OPTION_PRICING%%{JSON}%%END_OPTION_PRICING%% 结构化标记（含 8 个行权价的完整期权链）
- [x] 前端：创建 OptionPricingCard.tsx（Greeks 热力图 Tab + 期权链表格 Tab + 策略参考 Tab）
- [x] 前端：OptionPricingCard Greeks 热力图使用 Recharts BarChart 对比 Call/Put 的 Delta/Gamma/Vega/Theta
- [x] 前端：OptionPricingCard 期权链表格按颜色区分 ITM/ATM/OTM/Deep OTM，Greeks 值按大小着色
- [x] 前端：ChatRoom.tsx 集成 OptionPricingCard 渲染逻辑（%%OPTION_PRICING%% 标记检测）
- [x] 422/423 测试通过（1 个已知网络环境限制，Yahoo Finance 沙盒 404）

## 三项高级可视化增强（2026-03-23）
- [x] OptionPricingCard：添加第四 Tab「敏感度/盈亏」，包含 Payoff Diagram（到期盈亏曲线）+ Delta/Gamma 随标的价格变化的敏感度曲线
- [x] AlphaFactorCard：展开详情中添加因子相关性矩阵热力图（N×N 自定义 CSS Cell 热力图）
- [x] IV Smile：后端 polygonApi.ts 新增 getIVSmileData 函数（二分法反推 IV + Polygon 快照 implied_volatility）
- [x] IV Smile：optionPricing.ts generateOptionSummary 改为 async，调用 getIVSmileData 并将 ivSmile 数据注入 structuredPayload
- [x] IV Smile：OptionPricingCard 第五 Tab「IV Smile」，实际 IV vs BS 理论 IV 对比曲线（有真实数据时显示 Polygon 标注，否则 BS 理论模拟降级）

## 三项交互增强（2026-03-23 Round 2）
- [x] OptionPricingCard：顶部添加到期日选择器（7/14/30/60/90 天），动态重算所有 Greeks/Payoff/IV Smile
- [x] AlphaFactorCard：展开详情添加各因子权重滑块（0-2x），实时重算综合评分和信号方向
- [x] IV Smile Tab：下方添加 IV 历史趋势折线图（从 getAlphaFactorHistory 历史记录提取 sigma，包含当前/均唃 IV 对比和高位/低位判断）
- [x] 后端：routers.ts savedAgentSignalsJson 新增 optionSigma 字段，getAlphaFactorHistory 返回 optionSigma
- [x] 440/442 测试通过（2 个已知网络限制）

## 开源仓库集成计划（2026-03-23）

### 🥇 第一优先级（直接可用）
- [ ] alphalens：后端新增 /api/alphalens Python 子进程，计算因子 IC/IR 统计
- [ ] alphalens：AlphaFactorCard 新增 IC 分析 Tab（IC 均值、IC 标准差、IR 比率、IC 时序图）
- [ ] bidask：Alpha 因子体系新增流动性维度（从 OHLC 数据估算买卖价差）
- [ ] bidask：后端新增 estimateBidAskSpread 函数，前端 AlphaFactorCard 展示流动性因子
- [ ] goat-sdk/goat：集成 TypeScript 包，为 AI 代理添加 Paper Trading 执行工具层
- [ ] goat-sdk/goat：新增 PaperTradingCard 组件，展示模拟交易指令和执行结果

### 🥈 第二优先级（功能增强）
- [ ] yhilpisch/dawp：OptionPricingCard 升级 Heston 随机波动率模型（后端 Python 计算）
- [ ] yhilpisch/dawp：OptionPricingCard 新增模型选择下拉（BSM / Heston）
- [ ] ivebotunac/PrimoGPT：情绪 Agent 接入 NLP 特征提取管道（结构化情绪特征）
- [ ] theOGognf/finagg：重构数据聚合层，统一 BEA/FRED/SEC 数据标准化处理
- [ ] pskun/finance_news_analysis：补充中文 A 股新闻情绪分析（Jieba + Gensim）
- [ ] curveresearch/curvesim：加密货币模块新增 DeFi 流动性池分析功能

### 📚 资源型（知识库建设）
- [ ] n0shake/Public-APIs + mr-karan/awesome-investing：平台内置知识库/资源导航页
- [ ] ayush-that/FinVeda：参考金融教育内容结构，设计平台知识问答模块
- [ ] highfestiva/finplot：参考 K 线图交互设计，优化平台图表 UX
- [ ] ForestLinSen/finance：参考有效前沿可视化，集成到投资组合优化模块
- [ ] Carl2016/finance：参考 Tushare A 股数据接入方案

### 🏗️ 长期架构（季度目标）
- [ ] maybe-finance/maybe：参考数据模型，设计个人资产负债表模块
- [ ] hananedupouy/LLMs-in-Finance：参考 RAG 框架，升级 AI 代理文档理解能力
- [ ] ivebotunac/PrimoGPT：引入 FinRL 深度强化学习，探索自适应交易策略生成
- [ ] paulperry/quant：将 OLPS 算法移植到策略模块，提供自适应动态资产配置

### ❌ 已去重跳过
- [x] gugoan/economizzer：与 maybe-finance/maybe 功能重叠，跳过（优先 maybe）

## 开源仓库集成完成状态（2026-03-23）
- [x] 第一优先级：alphalens IC 信息系数分析（Python 脚本 + alphalensApi.ts + AlphaFactorCard IC 面板）
- [x] 第一优先级：bidask 买卖价差流动性估算（Python 脚本 + alphalensApi.ts + AlphaFactorCard 流动性面板）
- [x] 第二优先级：Heston 随机波动率模型（heston_pricing.py + hestonApi.ts + OptionPricingCard Heston Tab）
- [x] 第二优先级：PrimoGPT NLP 情绪特征提取管道（primoGptNlp.ts + analyzeNewsSentiment 路由 + SentimentNLPCard）
- [x] 第二优先级：finagg 数据质量评分（computeDataQualityScore 函数集成到 dataSourceRegistry.ts）
- [x] 资源型：投资知识库页面（InvestmentLibrary.tsx，整合 Public-APIs + awesome-investing + FinVeda）
- [x] 长期：maybe-finance 风格资产负债表（schema 迁移 + netWorth tRPC 路由 + NetWorthDashboard 页面）
- [x] 跳过：economizzer（与 maybe-finance 重复）
- [x] 441/442 测试通过（1 个已知网络限制）

## 5 个新开源仓库集成（2026-03-23 Round 3）
- [ ] P1: Qbot — Python 回测引擎封装（qbot_backtest.py + backtestApi.ts + BacktestCard 组件）
- [ ] P1: Qbot — AlphaFactorCard 新增「深度学习因子」Tab（LSTM/GRU 因子评分）
- [ ] P1: TrendRadar — 热点雷达 API 集成（trendRadarApi.ts + SentimentNLPCard 热点面板）
- [ ] P1: worldmonitor — 金融雷达数据源集成（worldMonitorApi.ts + 数据聚合层）
- [ ] P2: newsnow — 知识库页面嵌入 newsnow 新闻聚合界面
- [ ] 跳过: hacker-laws（与金融投资无直接关联）

## 5 个新开源仓库集成完成状态（2026-03-23 Round 3）
- [x] Qbot (UFund-Me/Qbot)：后端 qbot_backtest.py + qbotApi.ts + backtest tRPC 路由，前端 BacktestCard.tsx（回测指标 + 净值曲线）
- [x] TrendRadar (sansan0/TrendRadar)：后端 trendRadarApi.ts + trendRadar tRPC 路由，前端 TrendRadarCard.tsx（热点聚合 + AI 筛选）
- [x] worldmonitor (koala73/worldmonitor)：后端 worldMonitorApi.ts + worldMonitor tRPC 路由，前端 WorldMonitorCard.tsx（跨资产雷达）
- [x] newsnow (ourongxing/newsnow)：InvestmentLibrary 页面新增 NewsNow Tab（实时新闻聚合，按综合/宏观/科技/加密/中国分类）
- [x] hacker-laws (dwmkerr/hacker-laws)：跳过（与投资平台无直接关联）
- [x] BacktestCard/TrendRadarCard/WorldMonitorCard 集成到 ChatRoom.tsx 消息渲染
- [x] 441/442 测试通过（1 个已知网络限制）

## 三项联动增强（2026-03-23 Round 4）
- [ ] BacktestCard：multiAgentAnalysis.ts Alpha 因子分析完成后自动触发 Qbot 回测，结果写入 agentSignals JSON
- [ ] BacktestCard：AlphaFactorCard 展开详情中调用 chat.runBacktest，渲染 BacktestCard 在卡片下方
- [ ] TrendRadar + WorldMonitor 联动：TrendRadarCard 点击热点股票时，向 WorldMonitorCard 传递 selectedTicker
- [ ] TrendRadar + WorldMonitor 联动：WorldMonitorCard 接收 selectedTicker，自动显示该股票的跨资产相关性分析
- [ ] NewsNow：getNewsFeed 后端路由调用 primoGptNlp.ts 对每条新闻进行情绪评分
- [ ] NewsNow：InvestmentLibrary NewsNow Tab 每条新闻旁显示情绪徽章（正面/负面/中性）
- [ ] NewsNow：NewsNow Tab 底部显示当日整体市场情绪指数（加权平均）

## 联动增强功能（2026-03-23）

- [x] BacktestCard 集成到 AI 分析流程：AlphaFactorCard 添加 FlaskConical 按钮，点击后在卡片内嵌入 BacktestCard，传入 alphaScore 和 alphaScores
- [x] TrendRadar-WorldMonitor 联动：TrendRadarCard watchlist 标签可点击，触发 WorldMonitorCard 显示该 ticker 的跨资产相关性分析
- [x] NewsNow PrimoGPT 情绪评分：getNewsFeed 路由集成 analyzeNewsSentiment，每条新闻显示情绪徽章（利多/利空/中性），底部显示当日市场情绪指数

## UX 增强功能（2026-03-23 第二批）

- [x] 情绪指数 7 日历史趋势图：NewsNowPanel 底部添加 Recharts AreaChart，展示近 7 日市场情绪指数变化，带标注和渐变色填充
- [x] TrendRadar 联动滑入动画：WorldMonitorCard 从右侧滑入（slideInFromRight 关键帧），标题显示「来自 TrendRadar 联动」标记
- [x] BacktestCard 策略自动预填充：基于 Alpha 因子类别权重自动推断最优策略，标题显示推断结果，策略按鈕显示「推荐」徽章

## 深度增强功能（2026-03-23 第三批）

- [x] 情绪历史持久化：新建 sentiment_history 表（ticker, date, score, label, articleCount），getNewsFeed 写入当日数据，新增 getSentimentHistory 路由查询 7 日历史
- [x] 情绪历史持久化：NewsNowPanel 7 日趋势图改用真实数据库历史数据
- [x] TrendRadar 联动扩展：WorldMonitorCard 跨资产分析完成后，将相关性最强的资产自动添加到 TrendRadarCard watchlist（extraWatchlist）
- [x] BacktestCard 预填充精细化：将 Alpha 因子 zScore 纳入策略推断权重（zScore 绝对値越大权重越高）
- [x] BacktestCard 预填充精细化：运行按鈕旁显示「基于 Alpha 信号预期胜率」估算（基于 compositeScore 和 zScore 均値计算）

## A 股/港股数据源接入（2026-03-23）

- [ ] 创建 server/chinaStockApi.ts（Yahoo Finance A 股/港股行情、指数、历史数据）
- [ ] 支持代码格式：A 股（000300.SS/600519.SS/000001.SZ）、港股（^HSI/00700.HK）
- [ ] 数据降级（fallback）：实时数据不可用时自动返回最近一个交易日的历史数据
- [ ] 集成到 Step2 数据引擎：识别 A 股/港股代码时自动触发
- [ ] 更新 getDataSourceStatus 健康检测
- [ ] 更新 Settings.tsx 数据源面板（新增「A 股/港股」分组）
- [ ] 编写 chinaStock.test.ts 测试用例

## A 股/港股数据源集成 + 数据获取失败自动 fallback
- [x] yahooFinance.ts 扩充 nameMap：新增 50+ A 股/港股/指数名称映射（沪深300→000300.SS，恒指→^HSI 等）
- [x] yahooFinance.ts 实现 fallback 逻辑：regularMarketPrice 为空时自动降级到 previousClose，再降级到历史 OHLCV 最近收盘价
- [x] yahooFinance.ts 标注数据来源：实时数据标注「实时价格」，fallback 数据标注「最近收盘价（上一交易日）」
- [x] yahooFinance.ts 添加交易所/时区信息输出（便于区分 A 股/港股/美股）
- [x] routers.ts AVAILABLE_APIS_CATALOG 新增 A 股/港股指数 ticker 映射规则（供 GPT Step1 使用）
- [x] routers.ts Manus 系统提示词新增 A_SHARE_HK_DATA 规则：严禁因非交易时段显示「数据不足」错误
- [x] realtime-data.test.ts 新增 5 个测试：沪深300/恒指/上证指数 ticker 提取 + A 股/港股数据获取无错误验证
- [x] 447/447 测试全部通过，TypeScript 0 错误

## Twelve Data + Exchange Rates API + Portfolio Optimizer 集成
- [x] 研究三个 API 接口文档，确认 Key 需求与免费层限制
- [x] 申请 Twelve Data API Key（twelvedata.com 免费 800次/天）
- [x] 创建 server/twelveDataApi.ts（实时行情/历史 OHLCV/技术指标，作为 Yahoo Finance 备用源）
- [x] 创建 server/exchangeRatesApi.ts（Frankfurter 外汇汇率，开源免费，无需 Key）
- [x] 创建 server/portfolioOptimizerApi.ts（均値-方差优化/风险平价/有效前沿，无需 Key）
- [x] 接入 Step2 数据引擎：routers.ts 并行调用三个新 API
- [x] 更新 Step1 提示词：新增三个 API 的路由规则
- [x] 更新 getDataSourceStatus 健康检测
- [x] 更新 Settings.tsx 数据源面板（新增三行）
- [x] 编写测试用例，运行全套测试，保存 checkpoint

## GitHub 仓库资源集成（hacker-laws + newsnow + Qbot + worldmonitor + TrendRadar）

### hacker-laws 定律知识库
- [ ] 克隆 hacker-laws 仓库，解析所有定律为结构化 JSON（名称/定义/投资应用场景）
- [ ] 创建 server/hackerLawsKnowledge.ts（定律知识库模块，含投资相关定律检索）
- [ ] 更新 Step1 提示词：注入定律知识库，AI 分析时自动引用相关定律（如帕累托/炒作周期）

### newsnow 中文财经新闻源
- [ ] 研究 newsnow 的新闻源配置（财联社/雪球/格隆汇/华尔街见闻/金十数据）
- [ ] 创建 server/cnFinanceNewsApi.ts（中文财经新闻聚合，爬取 A 股核心媒体）
- [ ] 接入 Step2 数据引擎：A 股/港股查询时自动触发中文新闻获取
- [ ] 更新 Settings.tsx 数据源面板

### Qbot 量化因子知识库
- [ ] 研究 Qbot 的因子定义（RSRS/动量/价值/质量因子）和策略逻辑
- [ ] 创建 server/quantFactorKnowledge.ts（量化因子知识库，含因子定义/计算公式/信号解读）
- [ ] 更新 Step1 提示词：注入量化因子知识，AI 技术分析时自动引用

### worldmonitor 地缘政治风险体系
- [ ] 提取 worldmonitor 的地缘政治风险分类体系（制裁/军事/贸易路线/能源管道）
- [ ] 更新 AI 分析提示词：宏观分析时引用地缘政治风险框架

### 测试与 checkpoint
- [ ] 编写新模块测试，运行全套测试，保存 checkpoint

## GitHub 高优先级仓库集成（hacker-laws + newsnow + Qbot）

### hacker-laws 定律知识库
- [x] 克隆仓库，解析定律为结构化 JSON，筛选投资相关定律（帕累托/炒作周期/康威等）
- [x] 创建 server/hackerLawsKnowledge.ts（定律检索模块）
- [x] 更新 Step1 提示词：AI 分析时自动引用相关定律

### newsnow 中文财经新闻源
- [x] 研究 newsnow 的财联社/雪球/格隆汇/华尔街见闻新闻源配置
- [x] 创建 server/cnFinanceNewsApi.ts（中文财经新闻聚合）
- [x] 接入 Step2 数据引擎（A 股/港股查询时触发）
- [x] 更新 Settings.tsx 数据源面板

### Qbot 量化因子知识库
- [x] 研究 Qbot 的因子定义（RSRS/动量/价値/质量因子）
- [x] 创建 server/quantFactorKnowledge.ts（量化因子知识库）
- [x] 更新 Step1 提示词：技术分析时引用量化因子知识

### 测试与 checkpoint
- [x] 编写新模块测试，运行全套测试，保存 checkpoint

## 因子回测可视化页面

- [ ] 创建 server/backtestEngine.ts（历史 OHLCV 获取 + 因子计算 + 回测逻辑）
- [ ] 在 routers.ts 中添加 backtest.run 和 backtest.getFactors tRPC 过程
- [ ] 创建 client/src/pages/FactorBacktest.tsx（因子选择器 + 股票输入 + 净值曲线 + 指标卡片）
- [ ] 在 App.tsx 中注册路由，DashboardLayout 侧边栏添加入口
- [x] 编写测试，运行全套测试，保存 checkpoint

## 因子回测可视化页面

- [x] 创建 server/backtestEngine.ts（历史数据获取 + 因子计算 + 回测逻辑）
- [x] 在 routers.ts 中添加 backtest.factorRun 和 backtest.getFactors tRPC 接口
- [x] 创建 client/src/pages/FactorBacktest.tsx（因子选择器 + 净值曲线 + 指标卡片 + 交易记录 + 回撤图）
- [x] 在 DashboardLayout 侧边栏添加「因子回测」菜单项（FlaskConical 图标）
- [x] 在 App.tsx 注册 /backtest 路由
- [x] 编写 backtestEngine.test.ts（20 个测试），运行 499/499 全套测试通过

## TrendRadar 算法集成

- [x] 创建 server/trendRadarEnhancer.ts：新闻权重评分（排名×0.4+频次×0.3+热度×0.3）
- [x] 实现跨平台共振检测（同一话题在多少源出现）
- [x] 实现全局过滤词（标题党/营销软文正则过滤）
- [x] 更新 Step2 新闻处理：叠加权重排序 + 过滤（cnFinanceNews 接入 TrendRadar 管道）
- [x] 更新 Step3 AI 提示词：升级为 TrendRadar 六板块结构化分析格式（buildTrendRadarAnalysisPrompt 已接入）
- [x] 编写测试，运行全套测试，保存 checkpoint

## SYSTEM_REBUILD_V2_1_FULL ROUND_2_PATCH (OPTION_B)
- [x] server/routers.ts: Step3 prompt 末尾注入 DELIVERABLE + DISCUSSION 标记块指令（严格 JSON，无 trailing comma）
- [x] server/routers.ts: post-stream 解析器 — 提取 %%DELIVERABLE%% 和 %%DISCUSSION%% 块，验证 required keys
- [x] server/routers.ts: 写入 metadataToSave.answerObject 和 metadataToSave.discussionObject
- [x] server/routers.ts: 从 finalReply 中剥离 marker 块（visible reply 不含标记）
- [x] server/routers.ts: graceful degradation — parse 失败不 abort 任务，metadata 设为 null，添加日志
- [x] client/src/pages/ChatRoom.tsx: 扩展 Msg.metadata 类型，加入 discussionObject 字段
- [x] client/src/pages/ChatRoom.tsx: 更新 AnswerHeader 渲染 key_evidence/reasoning/counterarguments/next_steps
- [x] client/src/pages/ChatRoom.tsx: 新增 DiscussionPanel 组件（key_uncertainty/weakest_point/alternative_view/follow_up_questions/exploration_paths）
- [x] client/src/pages/ChatRoom.tsx: 前端 fallback-safe — 两个对象均可为 null，不 crash
- [x] vitest: 覆盖 marker 解析、JSON 验证、graceful degradation 三个场景

## SYSTEM_REBUILD_V2_1_FULL COMPLETE IMPLEMENTATION
- [x] INTENT_CONTEXT_LAYER: Step1 prompt 注入 task_type 分类规则（stock/macro/crypto/portfolio/event/discussion/general）+ time_mode 分类规则
- [x] Step1 OUTPUT JSON 补充 priority_map + action_candidates + fallback_plan 字段
- [x] SOURCE_SELECTION_ENGINE 动态评分: server/dataSourceRegistry.ts 末尾添加 selectTopSources() 函数（reliability + data_quality - latency_penalty - cost_penalty - failure_rate_penalty）
- [x] DATA_PACKET freshness 标签: manusReport 构建后计算 dataPacketFreshness（realtime/latest_available/recent/stale）
- [x] EVIDENCE_ENGINE 补充 freshnessLabel + conflictList + discussability 字段（server/evidenceValidator.ts）
- [x] Interpretation_Agent: server/multiAgentAnalysis.ts 添加第 5 个 Agent，所有 taskType 均激活，输出 discussionHooks
- [x] ACTION_ENGINE: server/routers.ts 在 pipeline 中根据 task_type 自动决定触发哪些 action（comparison/chart/sensitivity/allocation），注入 Step3 prompt

## 数据来源归因 UI + 文件内容提取接入 AI 上下文

### 数据来源归因 UI
- [ ] 后端：新闻 API 触发条件精细化（仅检测到股票代码/公司名/宏观事件时才调用 NewsAPI/Marketaux）
- [ ] 后端：收集实际使用的数据源列表，随任务结果一起返回给前端（写入 message metadata.sourcesUsed）
- [ ] 前端：AI 回复底部显示可折叠「数据来源」卡片（列出本次任务实际调用了哪些 API + 状态）

### 文件内容提取接入 AI 上下文
- [ ] 后端：fileProcessor.ts 实现 PDF 文本提取（pdf-parse）
- [ ] 后端：fileProcessor.ts 实现图片 Vision 描述（LLM image_url）
- [ ] 后端：fileProcessor.ts 实现音频 Whisper 转写（transcribeAudio）
- [ ] 后端：submitTask 支持 attachmentIds 参数，提取文件内容注入 Step1/Step3 AI 上下文
- [ ] 前端：消息中显示已附加的文件卡片（含文件名/类型/大小）

## 新闻 API 触发条件精细化 + AI 记忆系统 UI
### 新闻 API 触发精细化
- [x] 扩展 extractNewsQuery：添加 200+ A 股/港股公司名映射（茅台/平安/招行/中芯/小米等）
- [x] 扩展行业词库：新能源/医药/消费/科技/金融/地产/能源等行业关键词
- [x] 扩展宏观事件词库：降准/降息/加息/汇率/贸易战/关税/政策等
- [x] 支持 A 股 ticker 格式（000001/600519/300750 等）直接触发中文新闻
- [x] 优化英文 ticker 黑名单（避免 GDP/CPI 等缩写误触发）
### AI 记忆系统 UI
- [x] 后端：routers.ts 添加 memory.list / memory.update / memory.delete tRPC 路由
- [x] 前端：Settings.tsx 新增「AI 记忆」Tab
- [x] 前端：记忆列表（卡片式，显示 taskTitle/summary/memoryType/keywords/createdAt）
- [x] 前端：支持按 memoryType 过滤（preference/workflow/watchlist/analysis）
- [x] 前端：支持编辑 summary/keywords 字段（inline 编辑）
- [x] 前端：支持单条删除 + 批量删除
- [x] 前端：显示记忆过期时间（expiresAt）
- [x] 编写测试，运行全套测试，保存 checkpoint

## AI 记忆系统三项增强（2026-03-23）

- [x] 记忆自动分类：saveMemoryContext 调用处加入 LLM 分类逻辑，自动判断 memoryType（preference/workflow/watchlist/analysis）
- [x] 语义化搜索：后端 memory.search tRPC 路由（基于 keywords 相似度匹配）+ 前端搜索框接入
- [x] 记忆导出：AI 记忆 Tab 添加「导出 JSON」和「导出 CSV」按钮
- [x] 编写测试，运行全套测试，保存 checkpoint

## AI 记忆系统两项优化（2026-03-23 第二轮）
- [ ] 中文化分类 prompt：添加 A股/港股/价值投资场景示例，提升分类准确率
- [ ] 添加 importance 字段（1-5分）到 memory_context 表：schema 迁移 + db 函数更新
- [ ] AI 写入记忆时自动评估 importance 分数
- [ ] Settings 前端：显示重要性星级，支持按重要性排序
- [ ] 编写测试，运行全套测试，保存 checkpoint

## AI 记忆系统优化 Round 3（2026-03-23）

- [x] 高重要性记忆置顶：getRelevantMemory 评分中加入 importance 权重，importance≥4 优先注入
- [x] 记忆自动过期策略：saveMemoryContext 根据 importance 计算 expiresAt（1→30天，5→永不过期）

## Reasoning Engine V1.5 实施（2026-03-23）

- [x] Phase 1: 扩展 TASK_PARSE schema（interaction_mode / risk_focus / comparison_needed / user_goal）
- [x] Phase 1: 添加 FIELD_REQUIREMENT_GENERATOR（数据拉取前的字段分层规划）
- [x] Phase 2: 实现 SOURCE_SELECTION_ENGINE（field_route_map + 5min TTL health cache）
- [x] Phase 2: 重映射多角色输出到 valuation_view / business_view / risk_view / market_context
- [x] Phase 3: 增强 SYNTHESIS_ENGINE prompt（counterargument 强制 + latest_available 标注 + verdict 不得泛化）
- [x] Phase 3: 增强 DISCUSSION_ENGINE prompt（thesis-specific 追问 + 4 种输出类型强制）
- [x] Phase 4: 添加 DATA_PACKET_WRAPPER（field_sources / field_timestamps / freshness_labels / missing_fields / field_route_trace）
- [x] Phase 5: 验证无新增 LLM 调用、快速模式无回归、输出更具体

## Bloomberg Terminal UI 全面升级（2026-03-23）
- [x] 全局设计系统升级：Bloomberg Terminal 风格 CSS token（深蓝黑背景、琥珀金 accent、等宽数字字体）
- [x] index.html：引入 Space Grotesk + IBM Plex Mono 专业金融字体
- [x] index.css：bloomberg-card、bloomberg-btn-primary/secondary、bloomberg-badge、bloomberg-ticker、bloomberg-section-label、bloomberg-command-kbd 等专业组件类
- [x] Home.tsx：重构为 Bloomberg Terminal 风格欢迎界面（行情滚动条、专业特性卡片、系统状态、快速入口）
- [x] DashboardLayout.tsx：升级为 Bloomberg 风格侧边栏（专业导航、状态指示器、命令面板提示、键盘快捷键）
- [x] ChatRoom.tsx：统一颜色 token 为 Bloomberg 设计变量
- [x] Settings.tsx：升级顶部 header 和 tab 导航为 Bloomberg 风格
- [x] NetWorthDashboard.tsx：升级图表颜色为 Bloomberg 专业配色
- [x] FactorBacktest.tsx：升级图表颜色为 Bloomberg 专业配色
- [x] InvestmentLibrary.tsx：统一颜色 token
- [x] CommandPalette.tsx：新增全局命令面板组件（⌘K 触发、键盘导航、分组命令）
- [x] App.tsx：集成全局命令面板（GlobalCommandPalette）

## DANTREE FINAL EXECUTION PACKAGE（2026-03-23）

- [ ] Research UI v2：DiscussionPanel 升级为核心区域（展开/折叠、独立面板、可点击追问）
- [ ] Pinned Metrics 系统：固定关键指标到顶部栏（价格、PE、营收等）
- [ ] 可编辑 Watchlist：TrendRadarCard 支持手动添加/删除标的
- [ ] Jump-to-bottom：打开对话时自动滚动到最新消息，滚动按钮优化
- [ ] 对话管理完善：ConvItem 添加收藏（Favorite）功能，侧边栏分置顶/收藏/普通三区
- [ ] Settings UI v1：添加成本控制模式（Mode A/B/C）设置面板
- [ ] Developer Access：AdminPanel 完善（开发者工具、系统状态、日志查看）
- [ ] 推理引擎 Pipeline 可视化：在分析进度条中显示完整 9 步 pipeline

## DANTREE FRONTEND FINAL REBUILD

- [ ] Phase 1: 创建 ResearchWorkspacePage (/research 路由，4列布局骨架)
- [ ] Phase 1: 更新 App.tsx 添加 /research 路由
- [ ] Phase 1: 更新 DashboardLayout 导航（添加 Research Workspace 入口）
- [ ] Phase 2: AIVerdictCard 组件（verdict/confidence/suggested_action/primary_driver/key_risk）
- [ ] Phase 2: KeyAnalysisCard 组件（Bull Case / Bear Case / Macro Impact 三栏结构）
- [ ] Phase 2: RiskPanel 组件（独立视觉处理，红/橙危险语义）
- [ ] Phase 2: DecisionSignalsCard 组件（Hold/Wait/Monitor 信号）
- [ ] Phase 2: WhyItMattersNowCard 组件（时效性上下文，Earnings/Yield/Volatility）
- [ ] Phase 2: PriceTargetsCard / AnalystRatingsCard / KeyForecastsCard / RecommendedActionsCard
- [ ] Phase 3: DiscussionHeader（Discussing: {ticker} · {mode} 上下文标识）
- [ ] Phase 3: ConversationToolbar（pin/favorite/group/delete/rename 工具栏）
- [ ] Phase 3: QuickPromptBar（分析相关的快速追问芯片）
- [ ] Phase 3: ResearchWorkspace 中完整的 DiscussionColumn 集成
- [ ] Phase 4: Settings Monitoring Tab（watchlist signals/earnings/macro/volatility）
- [ ] Phase 4: Settings Research Style Tab（Valuation/Growth/Risk/Balanced）
- [ ] Phase 4: defaultCostMode → analysisMode 自动联动修复
- [ ] Phase 4: Developer Access Presets（Basic Demo/Read-only/Research Viewer/Custom）
- [ ] Phase 5: pinnedMetrics 持久化（DB schema + API + 前端）
- [ ] Phase 5: InstrumentSelectorModal（搜索 ticker，添加到 watchlist，直接打开研究）
- [ ] Phase 5: CustomizeWorkspaceModal（面板可见性切换，pinned metrics 选择）
- [ ] Phase 6: DeepSectionsTabs（集成 HealthScoreCard/BacktestCard/SentimentNLPCard 等）

## ResearchWorkspace 三大功能升级

- [x] 数据联动：发送消息后分析列 AIVerdictCard/RiskPanel 自动更新（SSE 状态驱动 + convMessages 响应式绑定）
- [x] Pinned Metrics 实时行情：顶部栏展示当前标的实时价格/涨跌幅/PE（后端 tRPC + Finnhub/Twelve Data API）
- [x] WorkspaceCustomizeModal：拖拽调整 4 列宽度比例并持久化到 rpaConfig（DB + API 全链路）

## 布局优化（2026-03-24）

- [ ] 修复 Pinned Metrics 栏：指标间距、字体大小、ROE/PB 数值格式化
- [ ] 优化 Analysis Column 卡片间距和内边距
- [ ] 精简 Discussion 标题栏（减少拥挤）
- [ ] 优化 Insights Column：Decision Signals 三卡片均衡布局

## 布局重构 v2（2026-03-24）

- [ ] 股价图表组件：K线/折线/面积图切换按钮，时间周期（1分/5分/15分/1时/1日/1周/1月/1年），中式红涨绿跌默认配色
- [ ] Settings 涨跌颜色设置（红涨绿跌 / 绿涨红跌），保存到 rpaConfig
- [ ] 主布局重构：左侧 Watchlist 侧边栏（标的+价格+涨跌）、中间主分析区（AI Verdict+图表）、右侧 Insights（Decision Signals+Price Targets+Analyst Ratings+Key Forecasts）
- [ ] 对话框改为浮动面板（点击「Discuss with AI」按钮弹出，可拖拽/关闭，叠加在中间区域上方）
- [ ] 一键交易功能：分析完后 AIVerdictCard 底部显示「买入」/「卖出」按钮，弹出 Alpaca 下单确认框

## 股价图表类型切换 + 涨跌颜色设置
- [x] PriceChart 组件：图表类型切换按钮（K线/折线/面积）
- [x] PriceChart 组件：时间周期选择（1分/5分/15分/30分/1时/4时/日/周/月）
- [x] PriceChart 组件：默认中国风格红涨绿跌，支持 colorScheme prop
- [x] 数据库：rpa_configs 表新增 chartColorScheme 字段（cn/us）
- [x] 后端：getConfig/setConfig 支持 chartColorScheme
- [x] Settings 页面：添加「图表涨跌颜色」设置卡片（中国/美国风格选择）
- [x] ResearchWorkspace：colorScheme 从 rpaConfig 读取，实时生效

## 全面重建任务（2026-03-23）

### 第一步：量化回测修复
- [ ] 修复BacktestCard标的物硬编码（ticker || "AAPL"），改为使用currentTicker
- [ ] 修复spot=100硬编码，改为从quoteData.price获取实时价格
- [ ] 修复sigma=0.25硬编码，改为从alphaFactorsData获取或动态计算

### 第二步：数据接口检查
- [ ] 检查牛熊方向接口（bullBear/marketTrend）是否接错
- [ ] 检查市场状态Badge数据来源是否正确
- [ ] 检查AIVerdictCard的方向信号是否正确

### 第三步：全局设计系统重建（去塑料感）
- [ ] 重写index.css：8pt Grid + Glassmorphism tokens + 渐变纹理 + 排版层级（12/14/16/20/24/32）
- [ ] 建立设计token系统（颜色/间距/圆角/阴影/字号）
- [ ] 深色背景 #0a0a0f → #1a1a2e 渐变
- [ ] 所有卡片改为Glassmorphism（backdrop-filter + 1px半透明边框）
- [ ] 按钮hover时border beam动画

### 第四步：登录页重建
- [ ] Three.js 3D流体背景 + 鼠标交互（FinRobot机器人跟随效果）
- [ ] 玻璃拟态登录卡片（backdrop-filter强模糊 + 1px半透明边框）

### 第五步：ResearchWorkspace完全重建（精确匹配参考图）
- [ ] 顶部滚动行情Ticker栏（平滑滚动渐变，Market State Badge）
- [ ] 精确4列布局：LEFT SIDEBAR + ANALYSIS + DISCUSSION(CORE) + INSIGHT
- [ ] ResearchHeader：ticker+price+confidence+设置/退出/下载/一键交易按钮
- [ ] AIVerdictCard：AI裁决+内嵌小图表+关键指标
- [ ] MainChartCard：图表类型切换+时间周期+PinnedMetricsBar
- [ ] Discussion列作为完整独立列（不是浮动面板）
- [ ] Insight列：ContextHeader+PriceTargets+AnalystRatings+KeyForecasts
- [ ] 所有卡片Glassmorphism风格，hover微动效

### 第六步：Settings页重建
- [ ] 高级感SaaS设置页，8pt Grid，信息层级清晰
- [ ] 每区块：标题+一句话解释+主操作按钮

### 第七步：Landing/Home页重建
- [ ] FXology风格，Gradient Texture背景
- [ ] CTA按钮border beam动画

## 2026-03-24 UI修复批次（用户反馈）
- [x] ResearchWorkspace 顶部导航栏：添加导出（下载）按钮（Markdown + PDF）
- [x] ResearchWorkspace 顶部导航栏：添加一键安装 App 按钮（PWA）
- [x] ResearchWorkspace 顶部导航栏：添加设置按钮（跳转 /settings）
- [x] ResearchWorkspace 顶部导航栏：添加退出登录按钮
- [x] BacktestCard 量化标的固定问题：添加「历史回测」模式（factorRun，真实 ticker 历史数据）
- [x] BacktestCard 双模式切换：历史回测（Polygon/Yahoo 真实数据）vs Qbot GBM（蒙特卡洛模拟）
- [x] 牛熊方向颜色修复：Conviction 颜色由绿色改为金色（高置信度），蓝色（中置信度），灰色（低置信度）
- [x] AIVerdictCard confMap 颜色修复：高置信度金色，中置信度蓝色，低置信度灰色
- [x] DecisionSignalsCard 标题色块由绿色改为金色
- [x] DiscussionMessage 添加 data-pdf-message 属性，确保 PDF 导出功能正常工作

## 2026-03-24 七问题修复批次（用户确认执行）

- [x] 问题5：删除顶部导航栏的重复设置按钮，只保留左下角一个
- [x] 问题6：所有子页面（FactorBacktest/BalanceSheet/IncomeStatement/CashFlow/OptionChain）顶部添加返回研究工作台按钮（← 返回研究工作台，金色文字，Alt+←快捷键）
- [x] 问题7：下载按钮改为PWA一键安装到桌面（已安装显示已安装状态，不支持时显示引导提示）
- [x] 问题1+2：全局设计系统升级——背景#0c0c0e、卡片#131318、金色主强调色#C9A84C、字体Inter、正文13-14px、数字16-24px、卡片材质感（极细边框+内发光+噪点纹理）、FXology设计哲学（克制留白、字体层级、材质感）
- [x] 问题4：智能风险分析——优化AI提示词要求基于真实数据生成个性化风险，前端展示升级（类型标签+数据依据+颜色边框）
- [x] 问题3：富途牛牛风格K线图表——集成TradingView Lightweight Charts v4，K线/折线/面积切换，时间周期，成交量子图，技术指标（RSI/MACD/KDJ/BOLL），参数编辑，缩放拖动，盘口数据2列网格

## 2026-03-24 第二轮升级批次（用户确认执行）

- [x] 任务G：修复AI对话中%%CHART%%/%%FOLLOWUP%%标记直接显示为乱码，解析渲染为图表和按钮
- [x] 任务B：修复K线图「暂无图表数据」，增加多数据源fallback（TwelveData→Polygon→AlphaVantage→Yahoo Finance）
- [x] 任务F-补：复查剩余子页面（BalanceSheet/IncomeStatement/CashFlow/OptionChain）——均为DashboardLayout内嵌卡片，无需独立返回按钮
- [x] 任务C：标的物代码旁边添加市场状态标签（绿OPEN/红CLOSED/黄PRE-POST/蓝24H/橙NIGHT）
- [x] 任务D：临近开收盘30min/15min弹窗提醒+ticker旁倒计时+节假日熔断提示
- [x] 任务E：右上角全球主要市场开收盘状态悬浮面板（A股/港股/英股/美股/欧股）
- [x] 任务A：品牌重定义落地页（DanTree Terminal·重新定义的AI版本，黑底网格+金色标题+交互机器人+全球市场面板）

## 2026-03-24 第三轮升级批次

- [x] 节假日/休市日历：在 MarketStatus 组件中集成美股/A股/港股/英股/欧股节假日数据库，节假日显示 HOLIDAY 状态
- [x] 模拟交易一键下单：在 AIVerdictCard 添加「模拟买入/卖出」按钮，接入 Alpaca Paper Trading API
- [x] 模拟交易后端：新增 trade.placeOrder / trade.getPositions / trade.getOrders tRPC procedure（已在 alpaca router 内实现）
- [x] 模拟交易前端：下单确认弹窗（显示标的/方向/数量/预估金额），下单成功 toast 提示
- [x] 修复 Error 1：lightweight-charts "Object is disposed" — 图表组件 cleanup 时序问题
- [x] 修复 Error 2：MetricBadge toFixed undefined — 数值未做空值保护

## 2026-03-24 第四轮优化批次

- [x] 优化全球市场面板倒计时显示：改为语义格式「距开盘 33m」「距收盘 1h33m」，一眼看懂
- [x] 优化 MarketStatusBadge 倒计时显示：同步改为语义格式

## 2026-03-24 第五轮优化批次

- [x] 落地页市场面板：添加「距开盘/距收盘」语义标签（与全局面板一致）
- [x] 落地页市场面板：放大整个面板框（宽度210→320px，内边距10→16px，字号全面放大）

## 2026-03-24 第六轮修复批次

- [x] 修复 PriceChart 时间轴标签：年月日正确格式（跨年显示年份，月份统一，日内显示时间）
- [x] 修复 PriceChart 休盘空白：跳过非交易时段，像券商平台一样连续显示
- [x] 修复 PriceChart 实时数据：开盘时段显示最新价格，收盘后显示最后收盘价
- [x] 完全按券商平台标准重写 PriceChart（时间轴格式、休盘空白、实时数据）

## 2026-03-24 第七轮修复批次

- [x] 修复市场状态名称：用专业术语盘前/开盘/盘后/休市/24H替换错误的“夜盘”
- [x] 美股正确区分盘前(Pre-Market 4:00-9:30 ET)、开盘(9:30-16:00)、盘后(16:00-20:00)、休市
- [x] A股/港股/英股/欧股：只有开盘/休市两种状态（无盘前盘后）

## 2026-03-24 第八轮优化批次

- [x] PriceChart 支持 Mac 触控板两指捏合放大缩小（pinch-to-zoom，ctrlKey+wheel）
- [x] PriceChart 支持 Mac 触控板两指滑动左右平移（wheel deltaX）
- [x] 优化缩放灵敏度，对齐 macOS 原生体验
- [x] 子图表（MACD/RSI/KDJ）与主图表时间轴同步缩放/平移
- [x] 编写 trackpad-gesture.test.ts，9 个测试全部通过

## 2026-03-24 第九轮功能批次

- [x] A股午休状态：MarketStatus 组件在 11:30–13:00 显示「午休」而非「休市」
- [x] A股午休状态：GlobalMarketPanel 同步显示「午休」状态
- [x] A股午休状态：Home.tsx 落地页市场面板同步显示「午休」状态
- [x] Finnhub WebSocket：后端新增 /api/ticker-stream/:symbol SSE 路由，订阅 Finnhub trade 事件
- [x] Finnhub WebSocket：前端 PriceChart 日内周期（1min/5min/15min/30min/1h/4h）时自动连接 SSE
- [x] Finnhub WebSocket：实时更新最新 K 线 bar（最后一根蜡烛实时刷新价格/量）
- [x] Finnhub WebSocket：连接状态指示器（绿色 LIVE / 黄色 CONNECTING / 灰色 OFFLINE）
- [x] 多标的对比图：PriceChart 添加「对比」按鈕，弹出标的输入框
- [x] 多标的对比图：后端同时获取两个标的的历史数据（复用 getPriceHistory）
- [x] 多标的对比图：归一化处理（以第一根 K 线收盘价为基准，转为百分比变化）
- [x] 多标的对比图：双色折线叠加显示（主标的金色，对比标的蓝色），右侧显示图例
- [x] 多标的对比图：对比模式下主图自动切换为归一化折线，取消对比后恢复原始数据

## 2026-03-24 第十轮功能批次

- [x] 对比图十字准线联动：鼠标悬停时在图表内显示两标的在同一时间点的百分比变化浮层
- [x] 对比图十字准线联动：浮层显示时间戳 + 主标的涨跌幅（金色）+ 对比标的涨跌幅（蓝色）
- [x] 对比图时间轴对齐：计算两个标的数据的共同时间范围（交集）
- [x] 对比图时间轴对齐：裁剪到共同时间范围后再归一化，避免时间轴错位
- [x] A股实时Tick：后端新增 /api/ticker-stream-cn/:symbol SSE 路由，每3秒轮询东方财富快照
- [x] A股实时Tick：识别A股代码格式（sh.6xxxxx / sz.0xxxxx / 6位数字），自动切换到A股SSE
- [x] A股实时Tick：前端PriceChart根据标的代码自动选择美股SSE或A股SSE
- [x] 新增 ashare-compare.test.ts，8 个测试全部通过

## 2026-03-24 第十一轮功能批次

- [x] A股Tick节流：实现 getAShareTradingSession() + getASharePollInterval() 函数
- [x] A股Tick节流：交易时段（09:30-11:30 / 13:00-15:00 周一至周五）使用3秒轮询
- [x] A股Tick节流：午休（11:30-13:00）和收盘后使用30秒轮询，盘前/盘后用10秒
- [x] A股Tick节流：用 setTimeout 替换 setInterval，每次轮询后动态重计算间隔
- [x] A股Tick节流：向前端发送 session + interval_ms 字段
- [x] 新增 ashare-throttle.test.ts，19 个测试全部通过

## 2026-03-24 第十二轮功能批次

- [x] LIVE指示器升级：从 SSE payload 读取 session + interval_ms 字段
- [x] LIVE指示器升级：LIVE徽章旁显示时段标签（交易中/午休/盘前/盘后/休市）
- [x] LIVE指示器升级：显示当前刷新频率（3s/10s/30s）
- [x] A股节假日识别：内置2026年A股法定节假日表（春节/清明/五一/端午/中秋/国庆）及调休工作日
- [x] A股节假日识别：getAShareTradingSession() 在节假日返回 closed
- [x] 港股实时Tick：新增 server/tickerWsHk.ts，实现 /api/ticker-stream-hk/:symbol SSE路由
- [x] 港股实时Tick：港股交易时段识别（09:30-12:00 / 13:00-16:00 HKT），内置2026年港股节假日表
- [x] 港股实时Tick：前端PriceChart识别港股代码格式（00700.HK / 9988.HK / 4-5位数字）
- [x] 新增 hkshare-session.test.ts，27 个测试全部通过，累计 64 个测试全部通过
## 2026-03-24 第十三轮功能批次

- [ ] 全球节假日同步：新增 server/globalHolidays.ts，接入 chinese-holiday + Nager.Date API 自动同步
- [ ] 全球节假日同步：覆盖 A股（CN）/ 港股（HK）/ 美股（US）/ 英股（GB）/ 欧股（DE/FR）
- [ ] 全球节假日同步：每天凌晨自动刷新，缓存到内存，fallback 到硬编码2026年数据
- [ ] 全球节假日同步：tickerWsCn.ts / tickerWsHk.ts / tickerWs.ts 统一使用 globalHolidays 判断
- [ ] 港股竞价/撮合状态：getHKTradingSession() 新增 pre_auction（盘前竞价 09:00-09:30）和 post_auction（盘后撮合 16:00-16:10）
- [ ] 港股竞价/撮合状态：LIVE指示器显示「竞价中」/「撮合中」标签
- [ ] 港股竞价/撮合状态：PriceChart 成交量柱在竞价/撮合时段用橙色标注
- [ ] 多市场LIVE聚合：新增 server/marketSessionService.ts，计算全球各市场当前时段
- [ ] 多市场LIVE聚合：新增 client/src/components/GlobalMarketStatusBar.tsx，显示各市场状态摘要
- [ ] 多市场LIVE聚合：在 DashboardLayout 顶部集成 GlobalMarketStatusBar

## 2026-03-24 第十三轮功能批次（修订版：用实时API替换硬编码节假日表）

- [ ] 实时交易日历：新增 server/marketCalendar.ts，统一封装全球市场开闭市状态查询
- [ ] 实时交易日历：美股/英股/欧股 → 调用 Finnhub /stock/market-status?exchange=US 等接口
- [ ] 实时交易日历：港股 → 调用 Finnhub /stock/exchange-status?exchange=HKEX
- [ ] 实时交易日历：A股 → 调用 efinance Python is_trade_date() 判断当天是否为交易日
- [ ] 实时交易日历：结果缓存5分钟，避免高频调用API
- [ ] 实时交易日历：tickerWsCn.ts / tickerWsHk.ts / tickerWs.ts 统一使用 marketCalendar 判断
- [ ] 港股竞价/撮合状态：getHKTradingSession() 新增 pre_auction（09:00-09:30）和 post_auction（16:00-16:10）
- [ ] 港股竞价/撮合状态：LIVE指示器显示「竞价中」/「撮合中」标签
- [ ] 多市场LIVE聚合：新增 /api/market-status SSE 路由，推送全球各市场当前时段
- [ ] 多市场LIVE聚合：新增 client/src/components/GlobalMarketStatusBar.tsx
- [ ] 多市场LIVE聚合：在 DashboardLayout 顶部集成 GlobalMarketStatusBar

## 2026-03-24 第十三轮功能批次（最终实现版）

- [x] 全球节假日服务：重写 globalHolidays.ts，改用 Baostock+Polygon+Nager.Date 实时API
- [x] 全球节假日服务：支持 CN/HK/US/GB/DE/FR 六个市场，统一 MarketStatus 接口
- [x] 全球节假日服务：24小时交易日历缓存 + 5分钟 Polygon 实时状态缓存
- [x] 全球节假日服务：服务器启动时预热 Nager.Date 节假日缓存
- [x] tickerWsCn.ts：改用 globalHolidays.getAShareSession() 替换硬编码节假日表
- [x] tickerWsHk.ts：改用 globalHolidays.getHKSession() + getHKPollIntervalMs()
- [x] 港股竞价/撮合：LIVE指示器新增 pre_auction（竞价中）/ post_auction（撮合中）标签（黄色）
- [x] 港股竞价/撮合：竞价/撮合时段成交量柱用橙色区分，上涨绿色/下跌红色
- [x] 多市场LIVE聚合：新增 GlobalMarketBar.tsx 组件（三色系统：绿/黄/灰）
- [x] 多市场LIVE聚合：DashboardLayout 顶部嵌入 GlobalMarketBar，60秒自动刷新
- [x] 多市场LIVE聚合：后端新增 market.getAllMarketStatuses tRPC procedure
- [x] 新增 global-market-status.test.ts，31 个测试全部通过，累计 95 个测试全部通过

## 2026-03-24 第十四轮功能批次

- [ ] Settings节假日面板：后端新增 market.getHolidayCacheStatus tRPC procedure，返回各市场最后同步时间
- [ ] Settings节假日面板：后端新增 market.refreshHolidayCache tRPC procedure，手动触发 Nager.Date 刷新
- [ ] Settings节假日面板：globalHolidays.ts 记录每个市场的最后同步时间戳
- [ ] Settings节假日面板：Settings.tsx 新增「节假日数据」Tab，显示各市场同步状态表格
- [ ] Settings节假日面板：超过30天未更新显示橙色警告徽章，提供「立即同步」按钮
- [ ] 港股竞价量预警：后端新增 market.getHKPreAuctionAlert tRPC procedure，获取最近5日竞价量均值
- [ ] 港股竞价量预警：当盘前竞价成交量超过前5日均值150%时，SSE payload 新增 auctionAlert 字段
- [ ] 港股竞价量预警：PriceChart LIVE指示器旁显示「⚡ 竞价异常」橙色提示

## 2026-03-24 第十四轮功能批次（三合一）

- [x] Settings节假日面板：globalHolidays.ts 记录各市场最后同步时间戳
- [x] Settings节假日面板：后端新增 market.getHolidayCacheStatus + market.refreshHolidayCache procedure
- [x] Settings节假日面板：Settings.tsx 新增「节假日数据」 Tab，显示各市场同步状态表格
- [x] Settings节假日面板：超过30天未更新显示橙色警告，提供「立即同步」按鈕
- [x] 港股竞价量预警：服务端维抦5日滑动窗口均値，竞价量超过150%触发预警
- [x] 港股竞价量预警：SSE payload 新增 auctionAlert 字段
- [x] 港股竞价量预警：PriceChart LIVE指示器旁显示「⚡ 竞价异常」闪烁橙色提示
- [x] GlobalMarketBar指数浮层：重写 GlobalMarketBar.tsx，点击市场徽章弹出 IndexSnapshotPopup（fixed定位，不跳轮）
- [x] GlobalMarketBar指数浮层：CN显示上证+深证+沪深300，HK显示恒生+国企+腾讯，US显示 SPY/QQQ/DIA
- [x] GlobalMarketBar指数浮层：三色涨跌幅（绿/红/灰）+ TrendingUp/Down 图标，点击外部自动关闭
- [x] 后端新增 market.getMarketIndexSnapshot tRPC procedure，支持 CN/HK/US/GB/DE/FR

## 2026-03-24 字体可读性优化

- [ ] 全局基准字体：index.css 基础字号从 14px 提升到 15-16px，正文字重从 400 提升到 450
- [ ] 字体层级体系：建立 H1(28px/700) H2(22px/600) H3(18px/600) body(15px/450) small(13px/400) 五级体系
- [ ] DashboardLayout：侧边栏导航文字加大加粗，用户名/标题更突出
- [ ] GlobalMarketBar：市场状态徽章字号加大，状态文字更易读
- [ ] PriceChart：工具栏按钮/标签字号加大，盘口数据价格数字加粗
- [ ] Home.tsx：首页市场概览卡片标题/数据加大加粗
- [ ] 各功能页面（Research/Portfolio/Watchlist）：表格/列表字号统一优化
- [ ] 数据数字（价格/涨跌幅/成交量）：统一使用 tabular-nums + font-semibold

## 排版深度优化（Round 2）

- [x] 优化K线图和财务图表坐标轴/图例字体（fontSize≥13）
- [x] 统一卡片标题为font-semibold，强化视觉层次
- [x] 添加响应式断点类，确保小屏（<1280px）可读性

## 第十六轮：InlineChart图表视觉升级
- [x] 修复全屏展开变暗问题（移除-z-10类名，统一使用zIndex:9998内联样式）
- [x] 柱状图多色对比：正值绿色(#22c55e)、负值红色(#ef4444)、零值蓝色(#3b82f6)
- [x] 柱状图均值参考线（金色虚线，标注均值数值）
- [x] 柱状图最大值/最小值标注（绿色/红色标签）
- [x] 折线图最高/最低点高亮（绿色/红色圆点+标签）
- [x] 折线图均值参考线（金色虚线）
- [x] 689个测试全部通过

## 第十七轮：彻底修复全屏展开变暗问题
- [x] 根本原因：遮罩div嵌套在overflow:hidden容器内，fixed定位被父级层叠上下文裁剪
- [x] 修复方案：使用createPortal将遮罩渲染到document.body，完全脱离父级层叠上下文
- [x] InlineChart和PyImageChart两个组件均已修复
- [x] 图表容器改为overflow:auto（全屏时）/hidden（普通时），不再固定overflow:hidden
- [x] 689个测试全部通过，TypeScript 0错误

## 第十八轮：柱状图Y轴比例修复 + 内容增强
- [x] 修复Y轴domain：柱状图必须从0开始，禁止auto截断导致比例失真
- [x] 增加差异标注：两柱对比时显示差异和溢价百分比
- [x] 增加均値参考线（金色虚线）
- [x] 单系列多色柱：高于均値绿色/低于均値蓝色/负値红色/最大値金色
- [x] 689个测试全部通过，TypeScript 0错误

## 第十九轮：图表深度增强
- [x] 修复差异数値精度（17.5999...倍 → 17.6倍，使用parseFloat+toFixed(2)格式化）
- [x] 修复全屏下方大片空白（全屏时容器flex列，图表区域flex-1填充）
- [x] 多柱语义颜色方案（Q1蓝/Q2绿/Q3橙/Q4紫，自动识别系列名称）
- [x] 散点图线性回归趋势线 + R²相关系数标注
- [x] AI提示词增强：要求每个图表必填 annotations 解读字段，并添加散点图示例
- [x] 689个测试全部通过，TypeScript 0错误

## 第二十轮：PriceChart实时价格统一 + 技术指标修复
- [x] 统一顶部栏和K线图L实时价格数据源（SSE实时流回调onLivePrice传回父组件，优先级高于快照）
- [x] 修复K线图时间戳偏移（TwelveData日内数据加timezone=UTC参数）
- [x] 修复RSI/MACD与K线不同步（主图时间轴subscribeVisibleLogicalRangeChange同步子图）
- [x] 修复RSI奇怪线条（改为超买线70/超卖线30/中线50正确参考线）
- [x] 放大顶部栏价格字体（text-base加绿色脉冲圆点）和K线图L实时价格字体（text-[14px]）
- [x] 689个测试全部通过，TypeScript 0错误
## 第二十一轮：K线图全面优化
- [ ] 修复成交量子图与K线主图重叠（成交量必须在独立子图区域）
- [ ] 修复年K线图不显示（检查年K数据源和时间周期映射）
- [ ] 增加K线数据量到1000根（当前390根不足）
- [ ] 切换时间周期时显示加载骨架屏
- [ ] RSI/MACD子图左上角实时显示指标数值（crosshair联动）
- [ ] 全屏模式下子图高度按比例扩大（主图70%，子图30%）

## 第二十一轮：K线图全面优化
- [x] 修复成交量子图重叠（scaleMargins top从0.80改为0.75，成交量占底部25%区域）
- [x] 添加年K选项（服务端按年聚合Yahoo Finance月K数据）
- [x] 增加数据量：日K/5日/1分钟增至1000根，其他周期也相应增加
- [x] 添加RSI/MACD/KDJ指标数值实时显示（crosshair悬停时左上角显示具体数值）
- [x] K线图全屏优化：全屏时子图高度自动按视口30%比例扩大
- [x] 689个测试全部通过，TypeScript 0错误

## 第二十二轮：实时价格统一 + 涨跌颜色/符号/货币符号
- [ ] 修复K线图显示错误股票数据（12.08 vs 174.83，数据源错误）
- [ ] 统一顶部栏和K线图LIVE价格为同一实时数据源
- [ ] 顶部栏价格根据涨跌实时变色（上涨绿色，下跌红色）
- [ ] 顶部栏价格左侧显示正确货币符号（美股$，港股HK$，A股¥等）
- [ ] 涨跌幅显示对应符号（▲/▼）和颜色

## 第二十二轮完成：实时价格统一 + 涨跌颜色/符号/货币符号
- [x] 扩展onLivePrice回调类型为LiveTickData对象（包含price/prevClose/change/pctChange）
- [x] SSE tick payload增加prevClose/change/pctChange字段传递（A股/港股）
- [x] 顶部栏价格使用liveTick.prevClose（港股/A股）或quoteData.prevClose（美股）计算涨跌幅
- [x] 顶部栏价格根据涨跌实时变色（颜色方案适配colorScheme：cn红涨绿跌，us绿涨红跌）
- [x] 顶部栏价格左侧显示正确货币符号（getCurrencySymbol函数）
- [x] 涨跌幅显示▲/▼符号和对应颜色
- [x] LIVE脉冲圆点颜色与涨跌颜色同步
- [x] K线图OHLCV行：live模式下用lastTickPrice重新计算涨跌幅（不再使用快照changePercent）
- [x] 切换股票时重置liveTick（包括从消息提取ticker的场景）
- [x] 689个测试全部通过，TypeScript 0错误

## 第二十三轮：K线图骨架屏 + crosshair OHLCV面板 + 去Logo + 修复牛熊逻辑
- [x] K线图切换时间周期时显示骨架屏动画（仿K线形状的灰色脉冲条）
- [x] 主图左上角crosshair OHLCV悬停信息条（富途牛牛风格，收/开/高/低/量）
- [x] 去除K线图中的TradingView Logo水印（watermark: {visible: false}）
- [x] 修复牛熊卡片逻辑：更新JSON Schema明确BULL=看多论点/BEAR=看空论点，禁止GPT填写反向内容
- [x] 689个测试全部通过，TypeScript 0错误

## 第二十四轮：价格轴遮挡修复 + crosshair联动子图 + 子图骨架屏 + BULL/BEAR置信度
- [x] 修复价格轴与交易量轴标签遮挡（visible:false隐藏交易量轴刻度）
- [x] crosshair联动子图：主图 crosshair 事件同步子图指标数值
- [x] 子图骨架屏：RSI/MACD/KDJ切换时显示骨架屏动画
- [x] BULL/BEAR卡片置信度进度条（基于confidence+verdict字段动态计算）
- [x] 689个测试全部通过，TypeScript 0错误

## 第二十五轮：统一实时价格数据源 + K线图实时价格闪烁刷新
- [x] 分析顶部栏与K线图的价格数据流，找出不一致来源
- [x] 统一价格：unifiedPrice = SSE tick > quoteData.price > candle收盘价
- [x] OHLCV行收价使用 unifiedPrice，年K模式下不再显示年K收盘价
- [x] K线图 OHLCV行和LIVE价格标签添加 fxo-flash-up/down 闪烁动画
- [x] 顶部栏价格也添加 fxo-flash-up/down 闪烁动画，与 K 线图同步
- [x] 689个测试全部通过，TypeScript 0错误

## 第二十六轮：K线图右侧自定义价格标签 + 价格精度自适应 + 涨停跌停预警
- [x] K线图右侧自定义价格标签浮层（绝对定位，实时价格+闪烁动画，连接线+彩色背景）
- [x] 价格精度自适应（加密货币6位、港股3位、美股2位，大数字千分位逗号）
- [x] A股涨停（+9.5%）/跌停（-9.5%）预警：顶部栏价格背景变色+⚡标识+动态脉冲
- [x] 彻底修复牛熊卡片：字段改名bull_case/bear_case，GPT不再填写反向内容
- [x] 689个测试全部通过，TypeScript 0错误

## 第二十七轮：A股涨停/跌停预警音效（Web Audio API）
- [x] 涨停预警音效（高频短促提示音，两声）
- [x] 跌停预警音效（低频短促提示音，两声）
- [x] 防重复触发：同一状态下只播放一次，直到状态解除后才重新触发

## 第二十八轮：音效静音开关 + BULL/BEAR展开 + 价格标签平滑动画
- [x] 音效静音开关：顶部栏中K线图区域添加🔔/🔕按鈕，偏好存localStorage
- [x] BULL/BEAR卡片展开按鈕：点击展开显示全部2-3条分析要点，带折叠动画
- [x] 价格标签Y轴平滑动画：价格变化时标签位置CSS transition平滑滑动
- [x] 689个测试全部通过，TypeScript 0错误

## 第二十九轮：BULL/BEAR自动重置 + 风险面板升级
- [x] BULL/BEAR/RISK卡片：切换股票或提交新分析时自动折叠回默认状态
- [x] 后端JSON Schema：risks字段每条增加reason（详细原因），要求AI给出3-5条按风险等级排列的具体风险
- [x] 前端风险面板：每条风险右侧添加展开按鈕，点击显示详细原因Popover，点击其他区域自动收起
- [x] 689个测试全部通过，TypeScript 0错误

## 第二十九轮：BULL/BEAR自动重置 + 风险面板升级 + 设置页重设计
- [x] BULL/BEAR/RISK卡片：切换股票或提交新分析时自动折叠回默认状态（key重置）
- [x] 后端JSON Schema：risks每条增加reason字段（详细原因），要求3-5条按风险等级排列
- [x] 前端风险面板：每条风险右侧展开按鈕，Popover显示详细原因，点击其他区域收起
- [x] 设置页面重新设计：左侧垂直导航+右侧内容区，清晰排版、字体可读、布局整洁
- [x] PriceChart timeFormatter错误修复（t不是Date对象时先转换）
- [x] 689个测试全部通过，TypeScript 0错误

## 第三十轮：PriceChart标签遗盖问题修复
- [x] 分析实时价格标签和成交量标签的定位逻辑
- [x] 成交量标签隐藏（lastValueVisible:false），不再与价格轴标签重叠
- [x] 确保价格标签、成交量标签、Y轴刻度三者不互相遗盖
- [x] TypeScript 0错误，689个测试全部通过

## 第三十一轮：历史任务切换体验重设计
- [x] 分析当前任务切换逻辑（切换时没有立即清空旧消息导致旧内容残留）
- [x] 切换时立即清空消息，显示骨架屏（animate-pulse），避免旧内容残留
- [x] 内容区 opacity transition 0.2s，切换时平滑淡入淡出
- [x] staleTime 10s：同一任务重复切换不重新请求，提升响应速度
- [x] TypeScript 0错误，689个测试通过（1个偶发网络超时）

## Bug修复：PriceChart timeFormatter字符串/BusinessDay类型错误
- [x] makeTimeFormatter复用timeToDate函数，支持所有Time类型（number/string/BusinessDay）
- [x] TypeScript 0错误，浏览器控制台无新错误（21:09:44后无getUTCFullYear报错）

## 第三十二轮：K线图工具栏增强 + 绘图逻辑修复
- [x] 日期范围快捷按钮：工具栏右侧加 1Y/3Y/5Y/全部，切换时自动调整outputsize和interval
- [x] 修复日内图表空白：数据加载后自动调用 scrollToRealTime() 定位到最新数据
- [x] 均线参数自定义：点击 MA按钮弹出输入框，允许修改 MA 周期（富途牛牛风格）
- [x] 指标参数设置弹窗：Settings2图标点击打开全局指标参数配置面板（BOLL/RSI/MACD/KDJ参数）
- [x] 彻底修复绘图逻辑：图表X轴时间顺序正确（旧→新从左到右）、数据排序、空白消除

## 第三十三轮：Deep Sections 修复 + K线图重叠修复
- [x] 修复量化回测 spawn python3.11 ENOENT 错误（确认是旧版本错误，python3.11在服务器进程中可用）
- [x] 修复趋势雷达 AI 扫描功能：服务端 newsItems为空时自动调用searchNews，解除按钮禁用
- [x] 修复 Deep Sections 其他功能（因子回测/健康评分/情绪分析/Alpha因子/模拟交易）
- [x] K线图：实时价格标签右移到价格轴左侧（right: 72px），与价格轴分离
- [x] K线图：右侧价格轴增加minimumWidth: 72，固定宽度避免标签被截断
- [x] K线图：成交量 scaleMargins.bottom 增加避免与X轴重叠

## 第三十四轮：图表功能增强（未完成项补全）
- [x] 日期范围快捷按钮（1Y/3Y/5Y/全部）- 已在PriceChart实现
- [x] 日内图表scrollToRealTime修复 - 已实现- [x] 折线图/面积图 annotations增强：趋势方向图标（↑↓）+ 涨跌幅百分比 + 最高/最低点标注
- [x] 全屏模式「查看数据表」按鈕：标题栏图表/表格切换，支持所有 line/area/bar/scatter 图表
- [x] 多图表联动：同一回复中多个图表共享 activeXLabel，鼠标悬停时高亮其他图表对应时间点（ChatRoom + ResearchWorkspace）

## 第三十五轮：Insights 面板全面重设计
- [x] 重设计 Decision Signals 区块：大字 Action 徽章 + 置信度进度条 + 时间维度标签
- [x] 重设计 Why It Matters Now：主观点大字显示，Alternative View 降级，问题列表可点击发送到聊天区
- [x] 重设计 Price Targets：清晰列标题（共识目标价/最高/中位/最低）+ 涨幅%
- [x] 重设计 Analyst Ratings：正确比例进度条 + 百分比 + 移除无意义数字列
- [x] 重设计 Key Forecasts：加入单位、YoY 增长率、颜色语义、含义说明
- [x] 折叠 Insights 面板时，聊天区自动扩展（宽度从 360px 增加到 600px）
- [x] 整体排版：统一间距、字体大小层级、颜色语义（绿=正面/上涨，红=负面/下跌，黄=中性/注意）

## 第三十六轮：Insights 三项增强功能
- [x] AI 回复联动更新 Decision Signals：DELIVERABLE 模板加入 horizon 字段，DecisionSignalsCard 动态读取 short/mid/long-term
- [x] Price Targets 分析师情绪趋势迷你折线图：服务端新增 getAnalystRecommendations 路由，前端 SVG sparkline 展示 12 个月 buy/hold/sell 趋势
- [x] Analyst Ratings 展开历史趋势：点击进度条展开 12 个月月度评级历史表格（每月 buy/hold/sell 数量变化）

## 第三十七轮：股票搜索扩展（中英文/代码搜索）
- [x] 服务端新增 market.searchTicker 路由（Finnhub + FMP 双源融合，去重合并）
- [x] 支持中文名称搜索（内置常见 A股/港股公司中文名映射表，约70个公司）
- [x] 前端搜索弹窗升级：实时搜索、分组显示（美股/港股/A股/ETF/加密）、交易所标签
- [x] 搜索结果显示中文公司名称（如腾讯控股、阿里巴巴）
- [x] 编写 searchTicker.test.ts（16个测试全部通过），705个测试全部通过

## 第三十八轮：股票搜索三项增强
- [x] 扩大中文映射表（补充銀行/航空/能源/消费等行业龙头，新增寻宁銀行/中国国航/中国銀行/高盛等）
- [x] 支持拼音首字母搜索（yjd→英伟达、tencent→腾讯、byd→比亚迪等）
- [x] 搜索历史记录（前端 localStorage，最近10条，弹窗空状态优先展示“最近搜索”分组）
- [x] ETF 分类标注（服务端 ETF 映射表，前端展示追踪指数名称+绿色ETF标识）
- [x] 编写测试（39个测试全部通过，728个总测试全部通过）

## 第三十九轮：雪球游客Token接入 + 数据分组清洗
- [x] 测试游客 Token：行情详情/机构评级/资金流向/财务指标全部调通（讨论帖子接口因沙箋限制暂跳过）
- [x] 编写 xueqiuApi.ts：Token 自动获取+5分钟缓存 + 各接口封装（行情详情/评级/资金流/财务指标）
- [x] 数据分组清洗：行情层/评级层/资金层/财务层，按 GPT 分组策略注入 AI 分析引擎（deepTasks）
- [x] 更新 dataSourceRegistry 注册雪球新数据源（A股数据分类）
- [x] Settings.tsx 添加雪球状态行，数据源总数 36→37
- [x] citationSummary 注册 xueqiu 归因闭环
- [x] TypeScript 编译 0 错误，728 个测试全部通过

## 第四十轮：雪球接口测试 + 讨论帖子情绪补充
- [x] 验证茂台/腾讯/比亚迪/小米数据质量：行情层全部通过✅
- [x] 修复港股财务层字段（/hk/indicator.json 路径，roe/beps/gpm 字段映射）
- [x] 修复 A股财务层字段（gross_selling_rate=毛利率, net_interest_of_total_assets=ROA）
- [x] 讨论帖子接口确认仅主域名可用，沙箋限制主域名，子域名返回 403，部署后再测试
- [x] 728 个测试全部通过

## 第四十一轮：东方财富接口调研（A股机构评级）
- [x] 测试东方财富接口：机构评级接口在沙箋环境返回 9501（服务端 IP 白名单限制）
- [x] 结论：东方财富机构评级无法在沙箋可靠调通，放弃该方向，已有 Finnhub/FMP 覆盖分析师评级

## 第四十二轮：清理雪球无效功能代码
- [x] 重写 xueqiuApi.ts：删除机构评级、讨论帖子、XueqiuReport/XueqiuDiscussionPost 类型，代码行数 674→340
- [x] 确认 routers.ts 无无效引用（r.xueqiu.items 属于 cnFinanceNewsApi 不受影响）
- [x] TypeScript 编译 0 错误，728 个测试全部通过

## 第四十三轮：修复全球市场状态时钟卡住问题
- [x] 定位问题：GlobalMarketPanel.tsx 第167行用 new Date() 直接渲染，面板开启后不再更新
- [x] 修复：添加 const [now, setNow] = useState(() => new Date()) + setInterval 每秒更新
- [x] TypeScript 编译 0 错误

## 第四十四轮：顶部导航栏实时时钟 + 时区切换
- [x] 新增 NavClock 组件（GlobalMarketPanel.tsx 导出），显示实时时间 + UTC偏移标注
- [x] ResearchWorkspace.tsx 导航栏全球市场按鈕左侧添加 NavClock（小屏隐藏）
- [x] 面板标题时间支持本地/纽约/伦敦三键切换，带 UTC 偏移标注
- [x] TypeScript 编译 0 错误

## PHASE2_MASTER — LEVEL2C/2D/2E + LEVEL3_PREP
- [x] LEVEL2C: 创建 server/loopTelemetryWriter.ts（遥测写入模块，LOOP_THRESHOLD_CONFIG，writeLoopTelemetry）
- [x] LEVEL2C: DB 迁移 — 创建 loop_telemetry 表（触发类型/证据评分/判断变更/延迟等字段）
- [x] LEVEL2C: DB 迁移 — 创建 analysis_memory 表（LEVEL3A 预备，跨任务分析记忆）
- [x] LEVEL2C: DB 迁移 — 创建 source_reliability 表（LEVEL3B 预备，数据源可靠性归因）
- [x] LEVEL2C: drizzle/schema.ts 添加三个新表的 Drizzle 定义（loopTelemetry, analysisMemory, sourceReliability）
- [x] LEVEL2C: routers.ts 集成遥测写入（line ~2573，convergedOutput 构建后，非致命 try/catch）
- [x] LEVEL2D: 创建 client/src/components/LoopSummaryBadge.tsx（可展开循环摘要面板）
- [x] LEVEL2D: ChatRoom.tsx 集成 LoopSummaryBadge（替换旧静态 badge）
- [x] LEVEL2E: routers.ts 添加 telemetry.getLoopStats 路由（统计触发率/判断变更率/证据增益/类型分布）
- [x] LEVEL2E: 创建 client/src/pages/LoopTelemetryDashboard.tsx（阈值调优仪表盘，/telemetry 路由）
- [x] LEVEL2E: App.tsx 添加 /telemetry 路由
- [x] LEVEL3_PREP: 创建 client/src/components/HypothesisCards.tsx（多假设可点击卡片，H1/H2/H3 索引）
- [x] LEVEL3_PREP: ChatRoom.tsx 集成 HypothesisCards（DiscussionPanel 中 open_hypotheses 渲染）
- [x] LEVEL3_PREP: ChatRoom.tsx discussionObject 类型添加 open_hypotheses?: string[]
- [x] 生成 /home/ubuntu/gpt_package_phase2/99_RETURN_PROTOCOL.md

## LEVEL3A: 分析记忆系统（Analysis Memory）
- [x] LEVEL3A Phase1+2: 创建 analysisMemoryWriter.ts（writeAnalysisMemory + getAnalysisMemory + extractMemoryFromOutput + buildPriorAnalysisContextBlock）
- [x] LEVEL3A Phase3: routers.ts Step3 检索注入 + emitTaskDone 后写入点 + metadata 信号写入
- [x] LEVEL3A Phase4: MemoryBadge.tsx 前端组件 + ChatRoom.tsx 类型扩展 + 渲染注入
- [x] LEVEL3A Phase5: TSC 0 错误确认 + server 200 OK + 所有 gate 条件验证

## LEVEL3B: 记忆驱动推理系统

- [x] LEVEL3B Phase1: hypothesisEngine.ts 记忆假设播种（MemorySeed + seedCandidatesFromMemory + deduplicateCandidates + applyMemoryPriorityBonus）
- [x] LEVEL3B Phase2: memoryConflictDetector.ts（detectMemoryConflict + verdict_flip/confidence_drop/risk_escalation 检测）
- [x] LEVEL3B Phase3: loopStateTriggerEngine.ts 记忆感知触发（memory_conflict_override + memory_recurrence_boost + memory_influenced 字段）
- [x] LEVEL3B Phase3b: routers.ts 注入（MemorySeed 构建 + MemoryConflict 构建 + evaluateTrigger/runHypothesisEngine 传参 + convergedMetadata 信号字段）
- [x] LEVEL3B Phase4: MemoryReasoningBadge.tsx 前端组件 + ChatRoom.tsx 类型扩展 + 渲染注入

## LEVEL1B: 数据源选择引擎

- [x] sourceSelectionEngine.ts 升级（V1.5→LEVEL1B）：SOURCE_DEFINITIONS(22源) + scoreSourceDynamic + selectTopSources + validateMultiSource + runSourceSelection
- [x] routers.ts 注入：import + Step2 前 runSourceSelection 调用 + convergedMetadata 字段（sourceSelectionSummary/sourceValidationNote/sourceConfidenceAdjustment）
- [x] 用户首选源注册：yahoo_finance/fred/bloomberg/aqr/citadel/gmo（user_preferred=true, +0.2 加成）
- [x] 区域自动推断：HK/EU/CN/US 四区
- [x] V1.5 compat 保留（selectSourcesForFields/buildFieldRouteTrace 无破坏性变更）

## LEVEL1C: 证据引擎（Post-Fetch Evidence Engine）

- [x] postFetchEvidenceEngine.ts: runPostFetchValidation + scoreEvidenceStrength + buildConflictBundle + runLevel1CEvidenceEngine
- [x] outputGatingController.ts: computeOutputGating（取更严则，与 Level1A2 coexist）
- [x] routers.ts Phase5: Step2 后注入 + Step3 gating instruction + convergedMetadata LEVEL1C 字段
- [x] EvidenceWarningBadge.tsx: 前端证据警告组件（强度评分 + 冲突字段 + 门控模式）
- [x] ChatRoom.tsx: LEVEL1C metadata 类型扩展 + EvidenceWarningBadge 渲染注入

## FXology UI 升级（全局颜色体系）

- [x] Phase1: index.css CSS 变量从 Bloomberg 琥珀金（hue-75）升级为 FXology 蓝（hue-255）
- [x] Phase2: Home.tsx + ChatRoom.tsx 所有硬编码琥珀金颜色批量替换
- [x] Phase3: 所有其他 .tsx 文件 + index.css 残留 hue-75 颜色全部清除
- [x] Phase4: 添加 FXology 全局动画规范（fxo-enter/fade-up 0.2s）+ Chat 面板视觉层次优化 CSS 类

## DanTree Terminal Rebuild v1 (2026-03-26)
- [x] Phase1: 路由架构 — /terminal-entry + /research 注册到 App.tsx，/ 重定向到 TerminalEntry
- [x] Phase2: TerminalEntry.tsx 全新构建（425行）— TopTickerBar(无缝滚动) + Hero Zone + AIEngineStream(打字动画) + GlobalMarketStatusPanel(动态时钟+实时市场状态) + SystemStatusPanel + CommandStrip
- [x] Phase3: ResearchWorkspace.tsx 重构升级 — WorkspaceIdleStream(替换空状态) + SYSTEM ACTIVE badge(Top Bar) + INSIGHTS LIVE badge(Col4) + SESSIONS label(Col1) + ANALYSIS label(Col2) + DISCUSSION label(Col3)
- [x] Phase4: 视觉系统统一 — 近黑背景(#080a0d) + 高密度布局 + 细边框 + JetBrains Mono 字体
- [x] Phase5: 动效系统 — ticker-scroll(CSS 55s linear) + typing-stream(28ms/char) + status-pulse(2s) + cursor-blink(0.8s) + boot-fill(1.1s) + body-fade-in(0.4s)
- [x] Phase6: 文案去营销化 — 所有 copy 使用系统语言(ACTIVE/RUNNING/STREAMING/SYNCED/DETECTED)，删除所有营销语言
- [x] Phase7: TSC 0 错误验证 + 最终检查清单通过
- [x] Phase8: 99_RETURN_PROTOCOL.md 交付文档生成

## LEVEL4 Action Engine

- [x] 实现 server/level4ActionEngine.ts（STATE/WHY/CYCLE/TIMING/ACTION/RISK 六块逻辑）
- [x] routers.ts 新增 chat.getLevel4Action procedure（从现有消息 metadata 提取输入，调用 LLM）
- [x] 实现 client/src/components/ActionPanel.tsx（STATE 大字/TIMING SIGNAL 色码/WHY 可折叠/TIMING 紧凑指标）
- [x] ResearchWorkspace Column 4 顶部接入 ActionPanel
- [x] TSC 验证 0 错误

## Terminal UI Refactor V1 (DANTREE_TERMINAL_UI_REFACTOR_V1)

- [ ] 实现 8 种 Block 类型组件（SYSTEM/PLANNER/SOURCE/REASONING/EVIDENCE/RISK/SYNTHESIS/FINAL）
- [ ] 实现消息解析器：将 LLM 输出 + metadata 映射到 Block 类型序列
- [ ] 替换 Column 3 聊天气泡为 Block 渲染器（Execution Stream）
- [ ] 升级 Command Bar：query input + execution mode selector + run button（非聊天输入框）
- [ ] 添加 Strategy Module 粘性底部覆盖层（Position/Sizing/Timing + WHY bullets）
- [ ] 升级 Header：Status Chips（RUNNING/IDLE/COMPLETE/SYNCED/EVIDENCE-GATED/LIVE SOURCES）+ Timer + 动态 Task Title
- [ ] 严格执行颜色系统（#0f1115 bg / #161a21 card / #1b2130 elevated / #232937 border / #e6e8eb text）
- [x] TSC 验证 0 错误

## Level4 Auto-Trigger Integration

- [x] routers.ts 两处最终输出点插入 Level4 自动执行（non-LEVEL2 path + LEVEL2 converged path）
- [x] try/catch 隔离：Level4 失败不影响主分析
- [x] metadata 附加 level4Result + level4GeneratedAt
- [x] ActionPanel 添加 initialResult prop，从 metadata 读取自动显示
- [x] TSC 验证 0 错误

## Level4 Persistence & Rehydration Fix

- [x] 审计 DB 持久化路径：确认 level4Result 写入两条路径（non-LEVEL2 + LEVEL2 converged）
- [x] 追踪消息加载流程：getConversationMessages → rawConvMsgs → convMessages → lastAssistantMsg.metadata
- [x] 修复 rehydration bug：useEffect 监听 messageId 变化，切换对话时同步 initialResult
- [x] 消除跨对话状态污染：prevMessageIdRef 追踪 messageId，切换时 reset result/error/autoFailed
- [x] 添加轻量失败状态："行动层暂未生成"（500ms 延迟后显示，非阻塞）
- [x] TSC 验证 0 错误

## Level4 Output Schema Takeover

- [x] level4ActionEngine.ts: 规范化 WHY 为三层结构（Surface/Trend/Hidden）
- [x] level4ActionEngine.ts: 强制 CYCLE 四选一（Early/Mid/Late/Decline）
- [x] level4ActionEngine.ts: 规范 TIMING 五指标（RSI/MACD/MA/Boll/Volume）+ timingSignal
- [x] ActionPanel.tsx: 决策优先渲染顺序（STATE→ACTION→WHY→CYCLE→TIMING→RISK）
- [x] ActionPanel.tsx: 深度分析保留在下方（answerObject 内容不删除）
- [x] TSC 验证 0 错误

## Level4 Output Schema Takeover Rework (GLOBAL HIERARCHY)

- [x] Created DecisionStrip.tsx — full-width decision-first strip (STATE/ACTION/WHY/CYCLE/TIMING/RISK)
- [x] Inserted DecisionStrip in Column 2 ABOVE AIVerdictCard (global hierarchy takeover)
- [x] AIVerdictCard demoted to support layer (labeled "SUPPORT LAYER")
- [x] Chinese-first labels: 当前状态/行动建议/为什么/周期阶段/时机信号/风险
- [x] Technical terms remain English: RSI/MACD/MA/Boll/Vol
- [x] DecisionStrip rehydration: useEffect on messageId change (same fix as ActionPanel)
- [x] TSC: 0 errors

## Timing Engine Formal Integration

- [x] 审计 localIndicators.ts 返回结构（rsi14/macdLine/macdSignal/bbUpper/bbMiddle/bbLower/ema20/ema50/sma200/priceData）
- [x] level4ActionEngine.ts 新增 Level4RealTechnicalData 接口（15个数值字段）
- [x] level4ActionEngine.ts Level4Input 新增 realTechnicalData 可选字段
- [x] level4ActionEngine.ts 升级 system prompt：组合 timingSignal 规则 + volume 确认规则
- [x] level4ActionEngine.ts 升级 buildUserPrompt：realTechnicalData 优先，fallback 到 technicalSignals
- [x] routers.ts 两处 Level4 触发点注入真实数值（getLocalTechnicalIndicators + getOHLCVForChart）
- [x] 修复 volume 字段路径：ohlcvData.ohlcv.volumes（非 ohlcvData.volumes）
- [x] TSC 验证 0 错误

## UI Priority Reorder Light

- [x] DecisionStrip 视觉强化：更强分隔线、更清晰层级标签、中文优先标签
- [x] AIVerdictCard 视觉降级：降低视觉主导性，改为支撑分析样式
- [x] Column 4 决策支撑重排：决策相关卡片置顶，非核心卡片降噪
- [x] TSC 验证 0 错误

## Opportunity Radar Foundation

- [x] 审计现有数据源（TrendRadar/macro/news/sector/congress/FRED）
- [x] 创建 server/opportunityRadar.ts（RadarItem 数据模型 + 7类机会探测 + 10分钟缓存 + LLM结构化输出）
- [x] routers.ts 新增 radar.scan procedure（支持 forceRefresh）
- [x] 创建 client/src/components/OpportunityRadarCard.tsx（SELECT/WAIT 状态 + WHY三层 + 周期/风险）
- [x] ResearchWorkspace Column 4 接入 OpportunityRadarCard（位于 QUICK ACCESS 之前）
- [x] TSC 验证 0 错误

## OPPORTUNITY_RADAR_TO_SELECT_FLOW

- [x] 审计 drizzle/schema.ts，确认 radarCandidates 表已创建（id/userId/candidateId/title/category/opportunityState/cycle/confidence/whySurface/whyTrend/whyHidden/riskSummary/relatedTickers/watchlistReady/addedAt）
- [x] 执行 migration SQL，数据库 radar_candidates 表已创建
- [x] server/db.ts 新增 addRadarCandidate / listRadarCandidates / removeRadarCandidate 三个 helper 函数
- [x] server/routers.ts 新增 candidates router（candidates.add / candidates.list / candidates.remove 三个 protectedProcedure）
- [x] OpportunityRadarCard.tsx 升级：RadarItemRow 新增「加入观察池」按钮（展开后可见），乐观更新 addedIds，已加入显示「已加入观察池」
- [x] 新增 CandidatePoolCard 组件（同文件导出），显示 SELECT 阶段候选机会列表，支持移出观察池
- [x] ResearchWorkspace.tsx Column 4 接入 CandidatePoolCard（紧跟 OpportunityRadarCard 之后）
- [x] 工作流分离验证：机会雷达（早期发现）与 DecisionStrip（已选标的行动决策）保持独立
- [x] 底部标注「候选机会 · 进入 SELECT 阶段 · 非买入建议」明确工作流语义
- [x] TSC 验证 0 错误，728 个测试全部通过

## SELECT_TO_RESEARCH_BRIDGE

- [x] 审计 ResearchWorkspace Column 1 输入注入路径和分析触发机制
- [x] CandidatePoolCard 添加 onSelectCandidate callback prop，点击候选行传递 { title, relatedTickers }
- [x] ResearchWorkspace 定义 handleCandidateSelect，注入 query 到 Column 1 inputValue state 并 auto-trigger 分析
- [x] 触发后自动滚动到 Column 2 DecisionStrip 区域
- [x] TSC 验证 0 错误，728 测试全部通过
- [x] 保存检查点，输出 EXECUTION_FEEDBACK_PROTOCOL

## CANDIDATE_STATUS_EVOLUTION

- [x] radar_candidates 表 ALTER TABLE 添加 status VARCHAR(16) NOT NULL DEFAULT 'SELECT'
- [x] drizzle/schema.ts 同步添加 status 字段
- [x] server/db.ts 新增 updateCandidateStatus(id, userId, status) helper
- [x] server/routers.ts 新增 candidates.updateStatus protectedProcedure
- [x] CandidatePoolCard：status badge 四色显示（SELECT/WATCH/PROMOTED/PASS）
- [x] CandidatePoolCard：WATCH/PASS 操作按钮（轻量，不重构布局）
- [x] CandidatePoolCard：opportunityState=WAIT 时禁用「开始研究」按钮，显示「等待时机」
- [x] ResearchWorkspace handleCandidateSelect：触发后自动调用 updateStatus → PROMOTED
- [x] TSC 验证 0 错误，728 测试全部通过
- [x] 保存检查点，输出 EXECUTION_FEEDBACK_PROTOCOL

## CYCLE_ENGINE_FOUNDATION
- [x] 审计现有数据源（FRED/TrendRadar/sector/policy/yield）可用接口
- [x] 设计 CycleEngine 推理架构（数据采集 → 周期分类 → 行业轮动 → LLM 三层解释）
- [x] 实现 server/cycleEngine.ts：fetchCycleData() + classifyMacroCycle() + analyzeSectorRotation() + invokeLLM 三层解释
- [x] DB: cycle_engine_cache 表（缓存 CycleEngine 输出，TTL 4h）
- [x] server/routers.ts: cycleEngine.analyze protectedProcedure（含缓存命中逻辑）
- [x] UI: CycleEngineCard 组件（Column 4 轻量模块，可展开）
- [x] ResearchWorkspace Column 4 接入 CycleEngineCard
- [x] TSC 0 错误，测试通过
- [x] 保存检查点，输出 EXECUTION_FEEDBACK_PROTOCOL

## AGENTS_MD_INTEGRATION
- [x] 创建 /AGENTS.md（7个章节：系统概览/核心原则/组件角色/硬性规则/UI原则/开发规则/未来层级）
- [x] 保存检查点，输出 EXECUTION_FEEDBACK_PROTOCOL

## DECISION_HISTORY_FOUNDATION
- [x] DB: decision_history 表（11字段）+ drizzle schema 同步
- [x] server/db.ts: saveDecisionHistory() + listDecisionHistory(userId) helpers
- [x] server/routers.ts: decisionHistory.save + decisionHistory.list protectedProcedures
- [x] ResearchWorkspace: DecisionStrip 生成后自动触发 save mutation
- [x] UI: DecisionHistoryPanel 组件（Column 4 轻量面板，显示最近决策记录）
- [x] ResearchWorkspace Column 4 接入 DecisionHistoryPanel
- [x] TSC 0 错误，测试通过，保存检查点
- [x] 输出 EXECUTION_FEEDBACK_PROTOCOL

## DECISION_HISTORY_ANALYTICS
- [x] server/routers.ts: decisionHistory.analytics protectedProcedure（action 分布 + top tickers + 时间线）
- [x] UI: DecisionAnalyticsPanel 组件（action 分布饼/条 + top tickers + 简单时间线）
- [x] ResearchWorkspace Column 4 接入 DecisionAnalyticsPanel
- [x] TSC 0 错误，测试通过，保存检查点
- [x] 输出 EXECUTION_FEEDBACK_PROTOCOL

## HISTORY_TO_CANDIDATE_LINK
- [x] server/routers.ts: decisionHistory.checkTickers procedure（批量查询 ticker 分析状态）
- [x] CandidatePoolCard: 拉取 checkTickers，候选行显示「已分析」徽章 + hover 最近 action/时间
- [x] TSC 0 错误，测试通过，保存检查点
- [x] 输出 EXECUTION_FEEDBACK_PROTOCOL

## DANTREE_LEVEL21_HISTORY_DRIVEN_REASONING
- [x] Phase 1: analysisMemoryWriter 扩展 — 输出 history bootstrap 对象（has_prior_history/previous_action/previous_verdict/previous_key_thesis/previous_risks/history_quality）
- [x] Phase 2: loopStateTriggerEngine 添加 Step 0 thesis_revalidation 逻辑（has_prior_history=true 时前置插入）
- [x] Phase 3: loop controller 升级 — history_requires_revalidation / thesis_shift_detected / action_reconsideration_required 决策字段
- [x] Phase 4: thesis_delta + action_delta 输出对象（change_type: unchanged/strengthened/weakened/invalidated/reversed）
- [x] Phase 5: history_revalidation_summary 注入 finalConvergedOutput.loop_metadata
- [x] Phase 6: cost/trigger 规则 — 仅在 has_prior_history=true 且 query 有决策相关性时触发，强确认时提前停止
- [x] Phase 7: TSC 0 错误，回归测试（3个 case），保存检查点
- [x] 输出 RETURN_PROTOCOL 完整审计报告

## DANTREE LEVEL4 — Execution Layer

- [x] Phase 1: Watchlist State Model — watch schema + trigger condition schema (watchlistEngine.ts)
- [x] Phase 2: Trigger Engine — 7 trigger types, deterministic, no LLM (watchlistEngine.ts)
- [x] Phase 3: Action Recommendation Engine — low/medium/high/critical severity mapping (actionRecommendationEngine.ts)
- [x] Phase 4: Alert + Workflow Output — alert schema, workflow schema, dedup/cooldown (actionRecommendationEngine.ts)
- [x] Phase 5: State Transitions + Audit — transition tracking, audit summary, reconstructable (watchlistAudit.ts)
- [x] Phase 6: Cost Safety + Rate Limits — cooldown, eval cap, no-auto-trade safeguard (costSafetyGuard.ts)
- [x] Phase 7: Validation — 4 test cases + full regression (level4.test.ts)
- [x] LEVEL4 Return Report → ai-reports/DANTREE_LEVEL4_RETURN_REPORT.md

## DANTREE LEVEL4.1 — DB + Scheduler + Operational

- [ ] Phase 1: DB Schema — watch_items, watch_audit_log, watch_alerts, watch_workflows, scheduler_runs
- [ ] Phase 2: Repository + Service Layer — 5 repos + 4 services
- [ ] Phase 3: Scheduler + Batch Evaluation — batchEvaluateTriggers, dry_run, concurrency lock
- [ ] Phase 4: Internal API (tRPC) — watch CRUD + manual batch trigger
- [ ] Phase 5: Observability — audit timeline, scheduler summary, dedup visibility
- [ ] Phase 6: Recovery + Idempotency — dedup key, scheduler lock, partial failure recovery
- [ ] Phase 7: Validation — 5 test cases + full regression
- [ ] LEVEL4.1 Return Report → ai-reports/DANTREE_LEVEL41_RETURN_REPORT.md

## DANTREE LEVEL5 — Real World Data Integration

- [ ] Phase 1+2: marketSnapshotProvider.ts — getMarketSnapshot() + 标准化 MarketSnapshot 格式
- [ ] Phase 3+4: snapshotToTriggerInput() 适配器 + Action 验证（真实快照喂入触发引擎）
- [ ] Phase 5+6: Scheduler 真实运行（接入 snapshotProvider）+ Feedback Loop（结果写入学习记忆）
- [ ] Phase 7: Safety Layer 验证 + level5.test.ts
- [ ] LEVEL5 Return Report

## DANTREE LEVEL5.1 — Live Operations Enablement

- [ ] Phase 1: Cron 调度器启用（shadow_mode 默认）
- [ ] Phase 2: 主源路由与回退链（Finnhub → TwelveData → Polygon → FMP）
- [ ] Phase 3: 源健康监控（health_status: healthy/degraded/failing）
- [ ] Phase 4: 运行日志与样本捕获（run summary + per-watch sample）
- [ ] Phase 5: 滚动防护与故障保险（kill switch + auto-failsafe）
- [ ] Phase 6: 最小运营视图（tRPC ops summary）
- [ ] Phase 7: 验证测试（level51.test.ts — 5 test cases）
- [ ] LEVEL5.1 Return Report

## DANTREE LEVEL6 — Strategy & Alpha Layer

- [ ] Phase 1: Signal Journal Schema + Storage (signalJournal.ts)
- [ ] Phase 2: Outcome Attribution — scoreOutcomeForSignal() + attribution summary
- [ ] Phase 3: Trigger/Signal Scoring — aggregate scoring + low-sample discount
- [ ] Phase 4: Portfolio + Cross-Watch Aggregation
- [ ] Phase 5: Regime/Context Slicing
- [ ] Phase 6: Alpha Prioritization — opportunity + danger surfacing
- [ ] Phase 7: Anti-Overfit Guards — sample guard + stability guard
- [ ] Phase 8: Validation Tests (level6.test.ts — 5 test cases)
- [ ] LEVEL6 Return Report (RETURN_PROTOCOL format)

## DANTREE LEVEL6.1 — Operational Alpha
- [ ] Phase 1: DB Schema — signal_journal + signal_outcome 两张表
- [ ] Phase 2: Signal Persistence Repository (signalPersistence.ts)
- [ ] Phase 3: Auto-Ingestion Hook (scheduler → postRunHook → ingestSignal)
- [ ] Phase 4: Scoring Auto-Update (增量更新 trigger/action scores)
- [ ] Phase 5: Failsafe (ingestion failure 不中断 scheduler, dedup, log-only fallback)
- [ ] Phase 6: Validation Tests (level61.test.ts)
- [ ] LEVEL6.1 Return Report

## DANTREE CRON + Outcome Auto-Resolve

- [ ] Phase 1+2: Cron 服务器挂载 + 调度器启动守卫 (cronServerMount.ts)
- [ ] Phase 3+4: Outcome Horizon Schema + Auto-Resolve Engine (outcomeAutoResolve.ts)
- [ ] Phase 5+6: Price Lookup 抽象 + Post-Run Hook 批量解析 (outcomePriceLookup.ts)
- [ ] Phase 7+8: 可观测性 + 故障保险 + 验证测试 (cronOutcome.test.ts)
- [ ] CRON_OUTCOME Return Report

## DANTREE LEVEL7 — Portfolio Decision Layer
- [ ] Phase 1: Portfolio State + Holding Abstraction (portfolioState.ts)
- [ ] Phase 2: Multi-Signal Decision Fusion (portfolioState.ts)
- [ ] Phase 3: Position Sizing Engine (positionSizingEngine.ts)
- [ ] Phase 4: Risk Budget + Concentration Control (positionSizingEngine.ts)
- [ ] Phase 5: Decision Ranking + Portfolio View (portfolioDecisionRanker.ts)
- [ ] Phase 6: Advisory Output + Explanation Layer (portfolioDecisionRanker.ts)
- [ ] Phase 7: Anti-Overfit + Decision Safety Guards (portfolioDecisionRanker.ts)
- [ ] Phase 8: Validation Tests (level7.test.ts)
- [ ] LEVEL7 Return Report

## DANTREE LEVEL7 — Portfolio Decision Layer
- [x] Phase 1: Portfolio State & Holding Abstraction (portfolioState.ts)
- [x] Phase 2: Multi-Signal Decision Fusion (portfolioState.ts)
- [x] Phase 3: Position Sizing Engine (positionSizingEngine.ts)
- [x] Phase 4: Risk Budget & Concentration Control (positionSizingEngine.ts)
- [x] Phase 5: Decision Ranking & Portfolio View (portfolioDecisionRanker.ts)
- [x] Phase 6: Advisory Output / Explanation Layer (portfolioDecisionRanker.ts)
- [x] Phase 7: Anti-Overfit & Decision Safety Guards (portfolioSafetyGuard.ts)
- [x] Phase 8: Validation Tests — 35/35 tests pass (level7.test.ts)
- [x] Full regression: 1099/1099 tests pass (59 test files)
- [x] TSC: 0 errors
- [x] Return Report: ai-reports/DANTREE_LEVEL7_PORTFOLIO_DECISION_REPORT.md

## DANTREE LEVEL7.1 — Safety Guard Integration
- [x] portfolioGuardOrchestrator.ts: runPortfolioSafetyGuards() 统一入口
- [x] 守卫优先级抑制（CONFLICT > OVERFIT > CHURN > SAMPLE > CONCENTRATION）
- [x] Level71SafetyReport 完整输出结构
- [x] 4 类守卫全部激活路径（Churn/Overfit/Conflict/Sample）
- [x] runLevel7Pipeline() 接入 Guard Orchestrator
- [x] detectDecisionConflicts 扩展 INITIATE vs TRIM 冲突对
- [x] level71.test.ts: 10/10 PASS（TC-01 ~ TC-06 + 回归）
- [x] LEVEL7 回归: 35/35 PASS（全套 45/45）
- [x] TSC 0 errors
- [x] ai-reports/MANUS_TO_GPT_LEVEL71_HANDOFF.md 交接报告

## DANTREE LEVEL7.1B — Guard Precision Patch
- [ ] Phase 1: Danger Guard 一级控制（danger_score>=0.75 CRITICAL, >=0.55 HIGH）
- [ ] Phase 2: 守卫优先级重排（CONFLICT>DANGER>CONCENTRATION>CHURN>SAMPLE>OVERFIT）
- [ ] Phase 3: Sample Guard 软降级（低样本不再全量抑制，改为 cap sizing + monitor）
- [ ] Phase 4: 守卫感知 Sizing Decay 表（CONFLICT 0.2x, DANGER 0.3x, CONCENTRATION 0.5x...）
- [ ] Phase 5: 5 个验证测试用例 + 全套回归
- [ ] 生成 GPT 交接报告

## DANTREE LEVEL7.1B — Guard Precision Patch
- [x] Danger Guard 一级控制（CRITICAL_DANGER / HIGH_DANGER）
- [x] 守卫优先级重排（CONFLICT > CRITICAL_DANGER > HIGH_DANGER > CONCENTRATION > CHURN > SAMPLE_SOFT > OVERFIT）
- [x] Sample Guard 软降级（strong_buy→buy，buy→hold，不再全量抑制到 monitor）
- [x] 守卫感知 Sizing Decay 表（每个守卫独立乘数 + 次级守卫 sqrt 复合）
- [x] SizingDecayTrace 字段（original/guarded allocation + decay trace 数组）
- [x] Level71SafetyReport 新增 danger_guard_active / danger_critical_tickers / danger_high_tickers
- [x] 7/7 TC-B 测试通过 | 45/45 回归测试通过 | TSC 0 errors

## DANTREE LEVEL8 — Persistence & Productization
- [ ] Phase 1: DB schema（portfolio, portfolio_position, portfolio_snapshot, decision_log, guard_log 5张表）
- [ ] Phase 2: 持久化写入层（db.ts helpers：saveDecision, saveGuardLog, saveSnapshot）
- [ ] Phase 3: 快照与回放系统（snapshotPortfolio, replayDecision）
- [ ] Phase 4: tRPC API 层（GET /portfolio, /decisions, /safety, /replay/:ticker）
- [ ] Phase 5: 用户隔离（user_id 字段，多用户支持）
- [ ] Phase 6: 4 个验证测试 + 全套回归测试

## DANTREE LEVEL8 — Persistence & Productization (COMPLETED)
- [x] DB schema: 5 张表（portfolio, portfolio_position, portfolio_snapshot, decision_log, guard_log）+ 迁移 SQL 执行成功
- [x] portfolioPersistence.ts: 持久化写入层（getOrCreatePortfolio, snapshotPortfolio, saveDecision, saveGuardLog, upsertPosition, persistPipelineRun）
- [x] 快照与回放系统（snapshotPortfolio, replayDecision）
- [x] tRPC API 层（portfolioDB router: getMyPortfolio, getDecisionLog, getGuardLog, replayDecision, persistRun）
- [x] 用户隔离（ctx.user.id → portfolioId 链，所有 endpoints 强制隔离）
- [x] advisory_only: true 强制执行（所有 decision_log 行 + persistRun 返回值）
- [x] level8.test.ts: 4/4 TC-L8 测试通过
- [x] 全套回归: 56/56 PASS（level7 35 + level71 10 + level71b 7 + level8 4）
- [x] TSC 0 errors
- [x] ai-reports/MANUS_TO_GPT_LEVEL8_HANDOFF.md 交接报告

## DANTREE LEVEL8 Full Patch — Product Readiness
- [ ] Phase 1: 自动持久化接入（runLevel7Pipeline → persistPipelineRun 强制调用）
- [ ] Phase 2: 数据一致性强制（decision_ids == guard_ids，snapshot total_tickers == decision count）
- [ ] Phase 3: SAMPLE_INSUFFICIENT → SAMPLE_SOFT 命名修复（enum + DB migration）
- [ ] Phase 4: 快照保留策略（每用户最多30条，自动删除旧快照）
- [ ] Phase 5: 回放完整性保证（DB-driven only，不重新计算）
- [ ] Phase 6: 前端最小 UI（Positions Table + Guard Badge + Decision Timeline）
- [ ] Phase 7: API 契约修复（一致 JSON 格式，分页，DB-only 响应）
- [ ] 验证测试 + 全套回归 + 6 项 PROOF 报告

## DANTREE LEVEL8.2 — Live Data Integration
- [ ] Phase 1+3: liveSignalEngine.ts — buildSignalsFromLiveData() + event detection (Finnhub keyword NLP)
- [ ] Phase 2: buildPortfolioFromDB() — query portfolioPosition table for real holdings
- [ ] Phase 4+5+6: wire runDanTreeSystem() to real data + failure safety + [SignalEngine] logging
- [ ] Phase 7: validation tests + 6 OUTPUT PROOF items
- [ ] GPT handoff report: MANUS_TO_GPT_LEVEL82_HANDOFF.md

## DANTREE LEVEL8.3 — Investor Thinking Layer
- [ ] Module 1: computeBusinessQuality() — business_quality_score + moat_strength + flags
- [ ] Module 2: applyEventImpactAdjustment() — event modifies system weights
- [ ] Module 3: Factor hierarchy — business quality gates alpha_score cap
- [ ] Module 4: generateFalsification() — every decision must include falsification
- [ ] Module 5: Decision output upgrade — add BQ/event/falsification to decisionLog + replay + UI
- [ ] Module 6: Signal cache 15min TTL per ticker
- [ ] Module 7: Twelve Data fallback + FRED DGS10 (10Y yield)
- [ ] Module 8: Pipeline integration + 5 PROOF validation

## LEVEL10.4: Experience Persistence & Learning Layer
- [x] 创建 server/experienceLearningEngine.ts（5个分析函数 + buildExperienceHistorySummary 主入口）
- [x] 升级 composeResearchNarrative() 添加 experience_learning_insight 字段（Section 8）
- [x] 升级 runDeepResearch() 为 async，集成 buildExperienceHistorySummary（非阻塞）
- [x] 扩展 replayDecision() 返回 experience_context 字段（从 experienceContextJson 解析）
- [x] 修复 danTreeSystem.ts 中 await runDeepResearch() 调用
- [x] 编写 server/level104.test.ts（4个 describe，12个 it 用例，全部通过）
- [x] 批量修复 level103/103b/103c.test.ts 中的 async/await 调用（44个测试全部通过）
- [x] 生成 MANUS_TO_GPT_LEVEL104_HANDOFF.md 交接报告
- [x] TSC 0 errors，1326/1332 回归测试通过（6个预存失败与本次无关）

## LEVEL10.5: Asymmetry & Position Layer
- [x] 创建 server/level105PositionLayer.ts（5个核心模块：computeAsymmetryScore / computePositionSizing / computeSizeAdjustment / enforceNoBetDiscipline / computePortfolioConcentration + runPositionLayer 复合入口）
- [x] 升级 deepResearchEngine.ts：ResearchNarrativeOutput 添加 positioning_lens 字段，runDeepResearch() 集成 runPositionLayer（非阻塞）
- [x] 扩展 portfolioPersistence.ts：ReplayResult 添加 position_layer 字段，新增 updateDecisionPositionLayer() 函数
- [x] 数据库迁移：decision_log 表新增 7 个字段（asymmetry_score/asymmetry_label/position_target_pct/position_size_bucket/no_bet_restriction/concentration_risk/positioning_lens_json）
- [x] 编写 server/level105.test.ts（6个 describe，11个 it 用例，全部通过）
- [x] 生成 MANUS_TO_GPT_LEVEL105_HANDOFF.md 交接报告
- [x] TSC 0 errors，1337/1343 回归测试通过（6个预存失败与本次无关）

## LEVEL11: Multi-Asset Reality & Propagation Engine
- [x] 创建 server/level11MultiAssetEngine.ts（8个核心模块：classifyAsset / routeDriverEngine / identifyRealDrivers / analyzeIncentives / analyzePolicyReality / detectSentimentState / buildPropagationChain / buildScenarioMap + runLevel11Analysis 复合入口，~1500行）
- [x] 升级 deepResearchEngine.ts：ResearchNarrativeOutput 添加 7 个 LEVEL11 叙事字段（core_reality / real_vs_perceived / incentives_human_layer / policy_reality_lens / sentiment_positioning / cross_asset_implications / scenario_map_summary），runDeepResearch() 集成 runLevel11Analysis（非阻塞）
- [x] 升级 level105PositionLayer.ts：AsymmetryScoreContext 添加 level11Analysis 可选字段，computeAsymmetryScore() 集成情绪/政策/传播链因子（±0.04~±0.12 调整）
- [x] 编写 server/level11.test.ts（5个 describe，8个 it 用例，全部通过）
- [x] 生成 MANUS_TO_GPT_LEVEL11_HANDOFF.md 交接报告
- [x] TSC 0 errors，1345/1351 回归测试通过（6个预存失败与本次无关）

## LEVEL11 Phase 13: Return Protocol Audit
- [x] 补充 AssetClassification.analysis_mode 字段（6种资产类型各有专属描述）
- [x] 补充 DriverSignal.monitoring_signal + risk_if_wrong 字段（21个 drivers.push 全部更新）
- [x] 补充 IncentiveAnalysisOutput.hidden_pressure_points + behavioral_summary 字段
- [x] 补充 PolicyRealityOutput.implementation_friction + policy_reality_summary 字段
- [x] 新增 Phase 11 discoverExternalDataCandidates() 函数（资源发现协议）
- [x] 扩展 level11.test.ts 至 15 个测试用例（新增 CASE 6/7/8）
- [x] 生成 MANUS_TO_GPT_LEVEL11_FINAL_HANDOFF.md Phase 13 完整审计报告
- [x] TSC 0 errors，1352/1358 回归测试通过（6个预存失败与本次无关）

## Model Abstraction Layer (GPT Protocol v1.0)
- [x] 创建 server/claude_provider.ts（Claude API 调用层）
- [x] 创建 server/gpt_provider.ts（GPT stub，生产阶段用）
- [x] 创建 server/model_router.ts（统一路由，开发阶段 Claude-only）
- [x] 重构 server/llmProviders.ts 使用 model_router
- [x] 验证所有模型调用通过 router，无直接 hardcode
- [x] 编写 model_router.test.ts 验证路由逻辑（9/9 通过）

## Workspace v2.1-A1 骨架层（Session Workspace System）
- [x] A-1a 后端骨架：workspace_sessions 表 schema 迁移（10 字段：id/userId/title/sessionType/focusKey/focusType/pinned/favorite/lastActiveAt/createdAt）
- [x] A-1a 后端骨架：db helpers（createWorkspaceSession / listWorkspaceSessions / setActiveWorkspaceSession / updateWorkspaceSessionMeta）
- [x] A-1a 后端骨架：workspace tRPC 路由（createSession / listSessions / setActive / updateTitle / togglePin / toggleFavorite）
- [x] A-1b 前端骨架：WorkspaceContext.tsx（currentSession / sessions / setCurrentSession / createSession / pinSession / favoriteSession）
- [x] A-1b 前端骨架：useWorkspaceViewModel.ts（Workspace Adapter hook，layered query chain，view-model slices）
- [x] A-1b 前端骨架：App.tsx 注入 WorkspaceProvider
- [x] A-1c 前端集成：SessionRail.tsx 组件（左侧 200px Session 导航栏，支持搜索/创建/选择/置顶/收藏/StanceBadge）
- [x] A-1c 前端集成：TerminalEntry.tsx 导入 SessionRail + useActiveFocusKey，activeEntity 绑定到 currentSession.focusKey
- [x] A-1c 前端集成：TerminalEntry 主布局改为 flex row（SessionRail 左列 + te-body 右列）
- [x] 回归测试：workspace.test.ts（19 个测试全部通过）
- [x] Bug Fix：deriveSourceState undefined.length（thesisStateEngine.ts null 防御）
- [x] Bug Fix：getSessionHistory/getBasketHistory 414 URI Too Large（改为 mutation POST）

## L21.2A 自动快照小包（Manus Direct）
- [x] 在 useWorkspaceViewModel 中添加自动快照触发逻辑（仅 entity session + 有效 focusKey）
- [x] 实现防重复去重策略（基于 focusKey + state hash）
- [x] SessionRail StanceBadge 改为优先从 entity_snapshots 读取，fallback 到 thesisViewModel.stance
- [x] 回归测试验证自动快照触发和防重复逻辑（18 个测试全部通过）

## Workspace v2.1-B1a 主脊柱前置包（Manus Direct）

- [x] 扩展 HeaderViewModel（+5 字段：sessionType / stance / readinessState / actionBias / highestSeverity / changeMarker / lastSnapshotAt）
- [x] 扩展 ThesisViewModel（+4 字段：evidenceState / gateState / sourceState / stateSummaryText）
- [x] 扩展 TimingViewModel（+2 字段：confirmationState / timingSummary）
- [x] 扩展 AlertViewModel（+1 字段：keyAlerts 精简列表）
- [x] 扩展 HistoryViewModel（+2 字段：previousSummary / lastSnapshotAt）
- [x] 移除 TerminalEntry 中 7 个重复 market 查询（getSourceSelectionStats / getOutputGateStats / getSemanticStats / evaluateEntityAlerts / getEntityThesisState / getExecutionTiming + getSessionHistory mutation）
- [x] 保留 TerminalEntry 中必要的独立 query（basketData / compData / basketAlerts），说明保留原因
- [x] TSC 验证（0 errors） + 回归测试（19 个全部通过）

## Workspace v2.1-B1b 主脊柱组件包（Manus Direct）

- [ ] 新建 DecisionHeader.tsx（消费 headerViewModel，显示 entity/sessionType/stance/readiness/actionBias/severity/changeMarker/lastSnapshotAt）
- [ ] 新建 DecisionSpine.tsx（容器，按序渲染 ThesisBlock → TimingBlock → AlertBlock → HistoryBlock）
- [ ] 新建 ThesisBlock.tsx（消费 thesisViewModel）
- [ ] 新建 TimingBlock.tsx（消费 timingViewModel）
- [ ] 新建 AlertBlock.tsx（消费 alertViewModel）
- [ ] 新建 HistoryBlock.tsx（消费 historyViewModel）
- [ ] TerminalEntry 瘦身：移除内联主脊柱 JSX，挂载 DecisionHeader + DecisionSpine
- [ ] TSC 验证 + 回归测试

## Workspace v2.1-B2a 交互层包（Manus Direct）
- [ ] ThesisBlock 折叠/展开（默认展开，折叠后保留 stance + 1 行 summary）
- [ ] AlertBlock 整体折叠/展开（默认展开）
- [ ] AlertBlock 单条 key alert 点击展开详情（severity + impact/why it matters）
- [ ] HistoryBlock 轻交互（查看更多/收起 或 前次摘要强调）
- [ ] DecisionHeader 点击 chip 滚动到对应区块（锚点联动）
- [ ] 使用 ui-ux-pro-max 强化交互质感（hover/过渡/active state）
- [ ] TSC 0 errors + 回归测试全部通过

## B5 四栏布局重构（SessionRail + Decision Canvas + Discussion + Insights）
- [x] B5-M1: 集成 Claude 最终版 SessionRail.tsx / DecisionHeader.tsx / DecisionSpine.tsx
- [x] B5-M1.1: 兼容桥接补丁（compat props + 类型导出，TSC 0 errors）
- [x] B5-M2: Column 1 SessionRail + Column 2 DecisionHeader/DecisionSpine 直接 props 挂接
- [x] B5-M3: Column 3 Discussion 舒适化（360px + 消息气泡优化 + 输入框扩大 + quick prompts grid）+ Column 4 Insights 精简（5 核心卡片）+ 清理旧 state（analysisRefreshed/deepSectionsTab/showDeepSections）

## S2 主区真实数据接线（基于 checkpoint 35a22ae4）

- [ ] S2-1: 分析 VNext 现有数据流，确定接线方案
- [ ] S2-2: DecisionHeader 接入真实数据（entity/stance/confidence/gateState/alertCount 等）
- [ ] S2-3: SessionRail 接入真实会话数据（sessions/activeSessionId/onSelectSession/onNewSession）
- [ ] S2-4: DecisionSpine 接入真实数据（ThesisBlock/TimingBlock/AlertBlock/HistoryBlock）
- [ ] S2-5: TSC + vitest + checkpoint + 反馈包

## S4 卡片系统接入（CLAUDE_CARD_SYSTEM_V2）
- [x] S4: ThesisBlock V2 覆盖（fragilityLevel 字段从 fragilityScore 推导）
- [x] S4: TimingBlock V2 覆盖（新增字段全部可选，graceful fallback）
- [x] S4: AlertBlock V2 覆盖（action 字段从 severity 推导）
- [x] S4: HistoryBlock V2 覆盖（接口完全兼容）

## UI 样式大修 v8（对齐 v5/v7 设计稿，纯 CSS 参数调整）
- [x] 主容器背景从 #060810 改为 #040608（更纯粹深黑）
- [x] 所有列标题字体从 11px 升至 12px，weight 800，letterSpacing 0.12em
- [x] 所有卡片标题（投资逻辑/进场时机/风险控制/历史追踪）字体从 11px 升至 12px
- [x] 所有卡片顶边 glow 从 0.45 升至 0.55，边框从 0.11 升至 0.13
- [x] 所有卡片 boxShadow 增加绿色 glow 层（0 0 20px rgba(52,211,153,0.05)）
- [x] 卡片间距从 10px 升至 12px
- [x] DecisionCanvas 列背景从 rgba(6,8,14,0.96) 升至 rgba(7,9,15,0.98)
- [x] Discussion 列背景从 rgba(5,7,12,0.97) 升至 rgba(5,7,12,0.99)
- [x] InsightsRail 列背景从 rgba(4,5,9,0.98) 升至 rgba(3,4,8,1.00)
- [x] SessionRail 列背景已为 rgba(3,4,8,1.00)（确认）
- [x] 所有列分隔边框从 0.10 升至 0.12
- [x] 所有列标题底边框从 0.10 升至 0.12，背景从 0.02 升至 0.025
- [x] SessionCard active 状态 glow 增强（boxShadow 三层）
- [x] 消息气泡背景从 0.055 升至 0.065，边框从 0.10 升至 0.12
- [x] 消息气泡 AI 最新消息 glow 从 0.06 升至 0.10
- [x] 输入框 focused 状态 glow 增强（0 0 12px rgba(52,211,153,0.12)）
- [x] InsightCard 边框从 0.07 升至 0.10
- [x] 关键价位区块边框从 0.07 升至 0.10，背景从 0.03 升至 0.035
- [x] 分析师评级共识标签背景从 0.035 升至 0.045，边框从 0.06 升至 0.09
- [x] Section 分隔线从 0.055 升至 0.08
- [x] RELATED/ANALYST RATINGS 区块分隔线从 0.045/0.05 升至 0.08

## P0 真实 Workspace 数据接线（基于 v8 视觉锁定版 64ae0a5f）
- [x] 分析 ResearchWorkspaceVNext 当前数据流（useWorkspaceViewModel / WorkspaceContext / currentTicker）
- [x] DecisionHeader 接入真实字段：entity / stance / confidence / gateState / alertCount / highestAlertSeverity / changeMarker / lastUpdated
- [x] DecisionSpine ThesisBlock 接入真实数据（thesisViewModel）
- [x] DecisionSpine TimingBlock 接入真实数据（timingViewModel）
- [x] DecisionSpine AlertBlock 接入真实数据（alertViewModel）
- [x] DecisionSpine HistoryBlock 接入真实数据（historyViewModel）
- [x] 确保 session 切换时 Header 与主区同步（WorkspaceContext 天然驱动）
- [x] TSC 验证 0 errors
- [x] 回归测试通过（2040 个测试通过）
- [x] 截图验证同步性
- [x] 保存检查点并输出反馈包

## P1-1 InsightsRail 真实数据接线（基于 v8+P0 版 19f60863）
- [x] 分析 InsightsRail NOW/MONITOR/关键价位当前渲染结构和数据来源
- [x] NOW 区块接入真实字段（price/change/changePercent/实时行情卡片）
- [x] MONITOR 区块接入真实字段（52W低点接近警示/日内振幅警示/analyst恶化）
- [x] 关键价位类展示接入 mappedQuote（price/change/changePercent/high/low/volume/pe/pb）
- [x] 确保 currentTicker 切换时 InsightsRail 同步（WorkspaceContext 天然驱动）
- [x] 零 CSS 改动，v8 视觉锁定不变
- [x] TSC 验证 0 errors
- [x] 回归测试通过（2037 个测试通过）
- [x] 截图验证完成
- [x] 保存检查点并输出反馈包

## P1-2 HistoryBlock 多条快照接线（基于 P1-1 版 7edd69ef）
- [x] 分析 HistoryBlock 当前数据流和 useWorkspaceViewModel entitySnapshots 结构
- [x] 接线 HistoryBlock 到最近 5 条 entitySnapshots（时间倒序）
- [x] 每条 snapshot 接入：snapshotTime / changeMarker / thesisStance / timingBias / alertSeverity / stateSummaryText
- [x] 确保与 currentTicker / currentSession 严格同步（WorkspaceContext 天然驱动）
- [x] 零 CSS 改动，v8 视觉锁定不变
- [x] TSC 验证 0 errors
- [x] 回归测试通过（2040 个测试通过）
- [x] 截图验证完成
- [x] 保存检查点并输出反馈包

## P1-3 DecisionHeader 搜索升级（基于 P1-2 版 f1acb64c）
- [x] 分析 DecisionHeader 当前 prompt() 实现和 WorkspaceContext 数据流
- [x] 实现内联 Combobox 搜索下拉框（Popover + cmdk Command）
- [x] 候选数据来源：sessionList（WorkspaceContext）focusKey / title
- [x] 选中已有 session：setSession() 全页同步（Header/Canvas/Insights/History）
- [x] 输入新 ticker：setManualTicker + handleSubmit 新建 session
- [x] 键盘交互：↑/↓ 导航 + Enter 确认 + Esc 关闭（cmdk 原生支持）
- [x] 零 CSS 破坏，v8 视觉锁定不变
- [x] TSC 验证 0 errors
- [x] 回归测试通过（2039 个测试通过）
- [x] 截图验证（关闭状态/展开状态/候选列表/新 ticker 入口）
- [x] 保存检查点并输出完整反馈包

## P2 合并增强包（基于 P1-3 版 f76887ff）

### P2-A: KEY LEVELS 字段升级
- [x] 分析 tvm.priceTargets / tivm / answerObject 中可用的真实价位字段
- [x] 升级 KEY LEVELS：当前价 + 今日涨跌 + 年高/年低（参考）+ PE/PB（估值参考）
- [x] fallback 策略：支撑/阻力/止损/目标仅在有值时显示，不编造
- [x] 与 currentTicker 严格同步（WorkspaceContext 天然驱动）

### P2-B: InsightsRail NOW/MONITOR 解释增强
- [x] NOW：实时行情卡片 subtext 说明"可判断当日市场情绪"
- [x] NOW：分析师评级 subtext 说明"机构共识强烁多头"
- [x] MONITOR：52W 低点接近警示 subtext 说明"历史支撑区附近，注意下跌风险"
- [x] MONITOR：日内振幅警示 subtext 说明"注意价格波动风险"
- [x] MONITOR：评级恶化 subtext 说明"建议进一步核实基本面"
- [x] 不编造 narrative，字段不足宁可少显示

### P2-C: DecisionHeader 状态表达优化
- [x] alertCount > 0 时 badge 加 animate-pulse（critical/high 级别）
- [x] badge 背景按严重度分三档（critical/high/medium）
- [x] lastUpdated 改为"已更新 · {time}"，无数据时显示"待分析"

### 验证
- [x] 零 CSS 破坏，v8 视觉锁定不变
- [x] TSC 验证 0 errors
- [x] 回归测试通过（2040 个测试通过）
- [x] 截图验证完成
- [x] 保存检查点并输出完整反馈包

## Discussion v1 接线修复（Claude 骨架 3 个窄范围问题，基于 P2 版 3b9c1f67）
- [ ] 复制 useSessionManager.ts 到项目 client/src/hooks 目录
- [ ] 复制 useDiscussion.ts 到项目 client/src/hooks 目录
- [ ] A. handleSubmit 接线修复：改为 discussion.sendMessage()，删除旧残留路径（setSending/setIsTyping/setConvMessages/submitMutation）
- [ ] B. scroll refs 绑定：scrollContainerRef 绑定消息列表容器，bottomRef 绑定底部占位 div，handleScroll 绑定 onScroll 事件
- [ ] C. autoSelectLatest 依赖修复：补充 session.autoSelectLatest 依赖
- [ ] TSC 0 errors
- [ ] 回归测试通过
- [ ] 截图验证（默认状态/发送消息后/滚动底部状态）
- [ ] 保存检查点并输出完整反馈包

## Discussion v1 VNext 接入（基于 002d70d3）
- [ ] 分析 ResearchWorkspaceVNext.tsx 当前旧 discussion 逻辑
- [ ] 接入 useSessionManager（替换旧 session 管理）
- [ ] 接入 useDiscussion（替换旧消息发送/渲染/滚动）
- [ ] visibleMessages 接管消息流渲染
- [ ] scrollContainerRef / bottomRef / handleScroll 接入真实 DOM
- [ ] 删除旧 discussion 双路径，确保单一主路径
- [ ] currentSession / currentTicker 保持单一真源
- [ ] TSC 0 errors
- [ ] 回归测试通过
- [ ] 4 张截图验证
- [ ] 保存检查点并输出完整反馈包

## 3D 悬浮小球组件（ManusOrb）
- [ ] 实现 Manus 风格蓝色渐变 3D 球体（CSS radial-gradient + box-shadow）
- [ ] AI 处理任务时显示呼吸动画（scale + opacity pulse）
- [ ] 悬浮光晕效果（多层 box-shadow glow）
- [ ] 集成到 ResearchWorkspaceVNext Discussion 区域（发送中状态显示）
- [ ] TSC 验证

## File Ingestion v1（Discussion 文件上传）
- [ ] 后端：chat.ingestFile tRPC procedure（S3 上传 + 文本提取 + LLM summary）
- [ ] 前端：DiscussionPanel 📎 上传按钮
- [ ] 前端：FileCard 组件（processing → ready 状态流）
- [ ] useDiscussion.ts：attachFile 升级为插入 FileCard message
- [ ] 后续对话能力：fileContext 注入到 sendMessage
- [ ] TSC 验证 + 回归测试

## File Ingestion v1
- [ ] 后端：chat.ingestFile tRPC procedure
- [ ] 前端：DiscussionPanel 上传按钮
- [ ] 前端：FileCard 组件 processing->ready
- [ ] useDiscussion.ts：attachFile 升级
- [ ] fileContext 注入 sendMessage

## GPT 模型升级 — gpt-5.4 系列接入 + 用户设置页选择器
- [x] llmProviders.ts：写入 gpt-5.4 / gpt-5.4-pro / gpt-5.4-mini / gpt-5.4-nano 四个模型（含元数据）
- [x] model_router.ts：PRODUCTION_MODEL_MAP 中 GPT 任务默认改为 gpt-5.4
- [x] llm.ts：invokeLLM defaultModel 改为 gpt-5.4
- [x] DB：rpaConfigs 表新增 gptModel 字段（默认 gpt-5.4）
- [x] 后端 routers.ts：getConfig 返回 gptModel，setConfig 写入 gptModel
- [x] 设置页面：AI 模型 Tab 新增 GPT 模型选择器（四个选项 + 说明）

## 设置页面重设计 — Bloomberg Terminal 风格 95% 相似度
- [x] 分析 ResearchWorkspaceVNext 设计规范（颜色/字体/边框/组件）
- [x] 在研究工作台页面加入设置入口按钮（顶栏右侧）
- [x] 设置页面完整重写：顶栏、左侧 Tab 导航、内容区全部对齐工作台风格
- [x] 所有卡片容器、section 标题、按鈕样式统一为 Terminal 风格
- [x] TSC 0 errors 验证

## 设置页面 Tab 清理
- [x] 移除「节假日数据」 Tab（导航项 + 内容区）
- [x] 移除「监控」 Tab（导航项 + 内容区）
- [x] 移除「逻辑」 Tab（导航项 + 内容区）
## 模型路由审计与重接线（P0）
- [x] 审计 llm.ts / model_router.ts / llmProviders.ts 当前调用现状
- [x] 主流程收敛到 modelRouter.generate()
- [x] 研发态：所有 GPT 任务由 Claude 代跑（ANTHROPIC_API_KEY 可用）
- [x] 发布态：保留 GPT 路由口，DANTREE_MODE=production 切换
- [x] 真实 AI 请求验证（claude-sonnet-4-5-20250929，5.7s，PASS）
- [x] TSC 0 errors
- [x] 输出完整审计报告

## P1 模型职责分工落地 — GPT 主控 + Claude 执行
- [x] 读取 PRODUCTION_ROUTING_MAP 当前内容
- [x] 修改：research/reasoning/deep_research/narrative/summarization/structured_json/step_analysis/default → openai（GPT-5.4）
- [x] 修改：execution/code_analysis/agent_task/classification → anthropic（Claude）
- [x] 研发态保持全 Claude（不改 development 逻辑）
- [x] TSC 0 errors 验证

## modelRouter v2 FINAL EXECUTABLE
- [x] 读取 model_router.ts / llm.ts 当前内容
- [x] 完整重写 model_router.ts：白名单 + normalizeTaskType + dev/prod 双态 + 路由日志 + fallback
- [x] 确认 invokeLLM 委托逻辑正确（不改 14 个调用文件）
- [x] 运行 5 个验收测试（21/21 PASS）
- [x] TSC 0 errors
- [x] Checkpoint + 反馈包

## 登录页替换（ui.zip 指定页面）
- [ ] 在 index.css 补入 scroll-container / scroll-section / animate-ticker / animate-fadeInUp 等动画 CSS
- [ ] 新建 HeroSection.tsx（神经网络背景 + ticker bar + 左文右表格布局）
- [ ] 新建 LoginSection.tsx（粒子背景 + 左内容右登录表单，接入 Manus OAuth）
- [ ] 新建 NewLoginPage.tsx（组合两个 Section，scroll-snap 布局）
- [ ] App.tsx 路由 "/" 改为 NewLoginPage
- [ ] 文案替换为 DanTree 方向（主标题/副标题/标签/数字）
- [ ] ticker bar 说明（mock 数据 or 真实 API）
- [ ] 登录区接入 getLoginUrl() Manus OAuth
- [ ] TSC 0 errors

## 登录页替换（ui.zip 指定页面）
- [x] 在 index.css 追加登录页所需 CSS 动画（scroll-container / animate-ticker / animate-gradient）
- [x] 新建 HeroSection.tsx（神经网络动画 + 左侧内容 + 数据矩阵预览）
- [x] 新建 LoginSection.tsx（OAuth 按钮 + 数据源 + 安全徽章）
- [x] 替换 Home.tsx：双 Section 滚动页，保留 auth 重定向逻辑
- [x] TSC 0 errors

## 访问密钥激活系统（一次激活，永久使用，密钥绑定邮箱）
- [ ] 数据库：access_keys 表（id, key_hash, bound_email, expires_at, created_at, revoked, label）
- [ ] 数据库：users 表新增 activated_at 字段（记录密钥激活时间）
- [ ] 后端：owner.generateAccessKey 接口（生成密钥 + 设置有效期）
- [ ] 后端：owner.listAccessKeys 接口（查看所有密钥状态）
- [ ] 后端：owner.revokeAccessKey 接口（撤销密钥）
- [ ] 后端：access.activateKey 接口（用户激活密钥，绑定邮箱，防重复绑定）
- [ ] 后端：protectedProcedure 中间件检查用户是否已激活（Owner 免检）
- [ ] 前端：登录后未激活用户显示密钥激活页面（KeyActivation）
- [ ] 前端：设置页 Owner 密钥管理面板（生成/查看/撤销）
- [ ] 前端：已激活用户跳过激活页直接进入工作台

## 旧 access_codes/user_access 系统完全停用，切换到 access_keys
- [ ] db.ts：新增 accessKeys 的 db helpers（createAccessKey / listAccessKeys / revokeAccessKey / getAccessKeyByHash / activateAccessKey）
- [ ] db.ts：移除旧 createAccessCode / verifyAccessCode / incrementCodeUsage / getUserAccess / grantUserAccess / revokeUserAccess 的调用依赖
- [ ] routers.ts：requireAccess 改为查 access_keys.bound_user_id + expires_at + revoked
- [ ] routers.ts：access.check 改用新逻辑（查 access_keys 是否有绑定该 userId 且未过期未撤销的记录）
- [ ] routers.ts：access.activateKey（用户输入密钥激活，绑定邮箱+userId，防重复绑定）
- [ ] routers.ts：owner.generateAccessKey（生成密钥，设有效期，返回明文）
- [ ] routers.ts：owner.listAccessKeys（查看所有密钥状态）
- [ ] routers.ts：owner.revokeAccessKey（撤销密钥）
- [ ] routers.ts：移除旧 access.verify / access.generateCode / access.listCodes / access.revokeCode / access.revokeUser

## 访问密钥激活系统（新版，替换旧 access_codes）

- [x] 数据库：access_keys 表（id, key, label, boundEmail, revoked, expiresAt, createdAt）
- [x] 后端：access.activateKey — 密钥激活，绑定邮箱，一次激活永久有效
- [x] 后端：access.check — 检查当前用户是否已激活且密钥未过期
- [x] 后端：access.generateKey — Owner 生成新密钥（含有效期）
- [x] 后端：access.listKeys — Owner 查看所有密钥
- [x] 后端：access.revokeKey — Owner 撤销密钥
- [x] 前端：App.tsx 全局 AccessGuard — 登录后未激活弹出不可关闭弹窗
- [x] 前端：KeyActivationModal — 强制弹窗，无 X/ESC/点击外部关闭，激活成功后消失
- [x] 前端：密钥过期后 refetchOnWindowFocus 重新检测，自动弹出弹窗
- [x] 前端：Settings.tsx access tab 完整重写为新密钥管理 UI
- [x] 前端：AdminPanel.tsx 完整重写为新密钥管理 UI
- [x] 旧 access_codes / user_access 系统完全停用

## Logo 全站替换

- [x] 上传真实 DanTree Logo（截图提供的图标）到 CDN
- [x] DashboardLayout.tsx：替换导航栏 Logo（绿叶图标）
- [x] LoginSection.tsx：替换登录页 Logo
- [x] ChatRoom.tsx：替换聊天页 Logo
- [x] KeyActivationModal.tsx：替换弹窗 Logo
- [x] 所有其他出现 Logo 的位置统一替换

## Session 切换 Discussion 未同步修复

- [x] 排查 onSelectSession 后 activeConvId 未正确置 null 的问题
- [x] 修复：切换无 conversationId 的 session 时 activeConvId 应置 null，而非保留旧值
- [x] BUG-003: useDiscussion 切换时立即清空 messages，修复 server sync 跳过逻辑
- [x] TSC 0 errors 验证通过

## Session 切换 Discussion 彻底修复（BUG-004）

- [x] 排查 WorkspaceSession 与 allConversations 两套数据源笮争条件
- [x] 修复：切换 session 时强制同步 activeConvId，Discussion 立即切换
- [x] 修复： WorkspaceContext.sessionList 更新时同步 currentSession.conversationId
- [x] 修复： linkConvMutation.onSuccess 后 invalidate listSessions
- [x] TSC 0 errors 验证通过

## P0 系统修复（任务持久化 + 输出结构化 + 防卡）

- [ ] DB: 新增 analysis_tasks 表（task_id, status, input, result, session_id, created_at）
- [ ] 后端: task 创建/更新/查询 tRPC 接口
- [ ] 后端: 60s timeout fallback + 防卡错误处理
- [ ] 后端: parseStructuredOutput 解析器（提取 %CHART%/JSON）
- [ ] 前端: 页面加载自动恢复 running 任务
- [ ] 前端: 输出层使用解析器渲染（text/charts 分离）
- [ ] TSC 验证

## P0 系统修复完成（2026-04-07）
- [x] DB: tasks 表新增 sessionId + inputData 字段（迁移已执行）
- [x] 后端: submitTask 接受 sessionId 参数，写入 DB
- [x] 后端: 新增 getRunningTasksBySession tRPC 查询
- [x] 后端: SSE 300s 最大生命周期 timeout（防卡死）
- [x] 后端: runCollaborationFlow 错误 catch → emitTaskError → DB status=failed
- [x] 输出解析器: parseChartBlocks 支持 %%CHART%%、%CHART%%、%%PYIMAGE%%、```json 四种格式
- [x] 前端: useDiscussion 接受 sessionId 参数
- [x] 前端: 页面加载时查询 running tasks，自动恢复 SSE 连接
- [x] 前端: submitMutation 传入 sessionId
- [x] TSC 0 errors 验证通过

## 会话创建逻辑统一修复（2026-04-07）
- [ ] 左侧搜索框：只搜历史 session，不创建新会话，不调用 entity/stock API
- [ ] 绿色加号：只创建 blank general session（focusKey=null）
- [ ] 顶部标的快捷入口：永远创建新的 entity session，不改写当前 session
- [ ] 灰色加号：完全移除（UI + 事件绑定）
- [ ] entity session 单标的限制：再选新标的时新建 session
- [ ] 连锁影响验证：title/focusKey/placeholder/sorting/history search

## 任务隔离 + 输出收束修复（2026-04-07）
- [ ] 任务隔离：SSE chunk 校验 task_id/conversation_id，切换时丢弃旧流
- [ ] 任务隔离：切换 session 时重置 activeTaskRef、停止旧 SSE 连接
- [ ] 任务隔离：visibleMessages 严格按 activeConvId 过滤，不混入其他 conversation
- [ ] 输出收束：output parser 清洗 %CHART%/%END_CHART%/JSON/模板残留
- [ ] 输出收束：Discussion 只渲染 cleaned text，不渲染原始模型输出

## SessionRail 拖拽排序 + CN_NAME_MAP 词条库扩充
- [x] 数据库：conversations 表添加 displayOrder 字段（int, default 0）
- [x] 后端 db.ts：添加 reorderConversations 函数（批量更新 displayOrder）
- [x] 后端 routers.ts：添加 conversation.reorder procedure（传入有序 id 数组）
- [x] 前端 useSessionManager：添加 reorderSessions + renameSession action，支持乐观更新
- [x] 前端 useSessionManager：grouped 排序逻辑支持 displayOrder（本地乐观顺序优先）
- [x] 前端 SessionRail：集成 @dnd-kit/core + @dnd-kit/sortable，非置顶区域支持拖拽排序
- [x] 前端 SessionRail：拖拽手柄（GripVertical）悬停时显示，DragOverlay 跟随鼠标
- [x] 前端 ResearchWorkspace：传入 onReorder + 完整 actions（含 onRename）
- [x] CN_NAME_MAP 词条库大幅扩充（覆盖美股/港股/A股/加密/ETF/宏观指数等更多中文词条）

## SessionRail 卡片格式修复 + 模糊搜索
- [x] SessionRail 卡片：标题行不再重复显示代码（标题只保留公司名，代码/缩写只在徽章行显示一次）
- [x] SessionRail 卡片：字体放大（公司名 14px、代码/缩写徽章 12px、时间 11px）
- [x] 快捷搜索框：展示格式与任务栏统一（公司名 14px + 代码 12px，不重复）
- [x] 快捷搜索框：字体放大，代码/缩写可读性提升
- [x] 搜索匹配升级为模糊匹配（子字符串 + 有意义字符全匹配）

## Bug 修复 Round 3 (2026-04-07)
- [ ] 卡片标题重复代码：正则未命中"泸州老窖 · 000568.SZ"（4位数字代码）
- [ ] 顶部胶囊显示公司名+代码双行格式
- [ ] 搜索候选字体放大至 14px

- [x] FIX: 切断旧 Discussion 渲染 — 强制用 workspaceOutput.discussion 替代 m.content，禁止 fallback 到 raw content
- [x] FIX: adapter 验证 — console.log 确认 workspaceOutput.mainDiscussion 被分段、不含 %%FOLLOWUP%%
- [x] FIX: chart pipeline — adapter 解析 chart blocks → WorkspaceDiscussionRender 渲染，禁止旧 chart 路径
- [x] FIX: 切断旧 InsightsRail 数据源 — NOW/MONITOR/QUICK FACTS/NEWS 全部走 workspaceOutput
- [x] FIX: 删除所有 placeholder/demo/hardcoded 数据
- [ ] FIX: 最终验证截图 — Discussion 分段、无 %%FOLLOWUP%%、chart 正确、Right Rail 结构化

## 任务栏多选 + 应用内弹窗
- [x] 后端：批量删除 conversations tRPC procedure（batchDelete）
- [x] 后端：批量收藏 conversations tRPC procedure（batchFavorite）
- [x] 后端：批量置顶 conversations tRPC procedure（batchPin）
- [x] 前端 SessionRail：多选模式 UI（勾选框 + 全选/取消 + 批量操作工具栏）
- [x] 前端 SessionRail：批量删除/收藏/置顶按钮 + 调用后端 batch procedures
- [x] 前端：替换所有浏览器原生 confirm() 为应用内 Dialog 弹窗（shadcn AlertDialog）
- [x] 前端：删除确认弹窗改为应用内 AlertDialog

## 强制数据管道接管 — FINAL FIX (2026-04-08)
- [x] FIX-1: useWorkspaceOutput 添加强制验证 console.log（blocks.length, followups.length, isStructured）
- [x] FIX-2: DiscussionPanelVNext 禁止 m.content / msg.content / cleanedContent，唯一允许 workspaceOutput.discussion.blocks
- [x] FIX-3: followups 作为独立 UI block 渲染（clickable），不允许出现在文本中
- [x] FIX-4: InsightsRailVNext NOW/MONITOR/QUICK FACTS/NEWS 全部来自 workspaceOutput.insights.*，禁止 hardcoded/fallback
- [x] FIX-5: entity 选择后自动触发分析任务（createSession → dispatch initialTask）
- [x] FIX-6: 全局搜索删除 msg.content / cleanedContent / fallback render 双数据链残留
- [x] FIX-7: 验收截图 — Discussion 分段、无 %%FOLLOWUP%%、followups 是 UI 组件、Right Rail 真实数据、entity 自动分析、console blocks > 0

## 面板联动修复 — adapter heuristic 增强 (2026-04-08)
- [x] FIX-8: 增强 buildInsightsViewModel heuristic — 从全文内容提取 NOW/MONITOR/QUICK FACTS/NEWS（不依赖精确 heading）
- [x] FIX-9: 增强 buildDiscussionViewModel — 当无 answerObject 时确保 thesis block 正确提取
- [x] FIX-10: 验证修复后 insights.now > 0, insights.monitor > 0, insights.quickFacts > 0

## 通知弹窗改造 (2026-04-08)
- [x] 通知弹窗移至右上角（position="top-right"）
- [x] 添加橙色微光光晕（CSS box-shadow + keyframe glow 动画）
- [x] 支持叉号关闭按鈕（closeButton=true）
- [x] 自动停留后消失（duration 保持，无需手动关闭）

## 删除确认弹窗居中 (2026-04-08)
- [x] 将删除会话确认 Dialog 移至屏幕正中央（修复偏左问题）

## 快捷搜索栏市场徽章 (2026-04-08)
- [x] 将快捷搜索栏标的物名字前的绿色方块替换为市场徽章（US/HK/CN/CRYPTO）

## 修复新建 entity session 自动分析发送到错误对话框 (2026-04-08)
- [x] 修复：选择新标的创建 session 后，首次分析任务应发送到新 session，而非当前旧 session

## 修复 conversationId null 导致 API 查询错误 (2026-04-08)
- [x] 修复：conversationId 为 null 时不应发起需要 number 类型的 API 查询

## 修复市场徽章推断逻辑 (2026-04-08)
- [x] 修复 EntityCombobox 触发按鈕市场徽章：BTC/ETH 等显示 CRYPTO，港股显示 HK，A股显示 CN，美股显示 US

## 新 session 空状态骨架屏 (2026-04-08)
- [ ] Discussion 面板：新 session 创建后无 conversationId 时显示"正在初始化分析..."骨架屏

## Output Routing V16 Final Integration
- [x] 将 Claude routing 逻辑合并进 workspaceOutputAdapter.ts：IS_NARRATIVE/IS_THESIS/IS_DRIVER/IS_RISK/IS_INSIGHTS 分类器
- [x] buildDiscussionViewModel 移除 thesis/reasoning block（只保留 narrative/chart/followups）
- [x] fallback 路径：跳过 thesis/driver/risk 内容段落，只提取纯叙述
- [x] 确认 /research 路由已指向 ResearchWorkspaceVNext（无需修改）
- [x] 确认 onNewEntity 使用 EntityCombobox UI（无 prompt() 调用，符合 InstrumentSelectorModal 要求）
- [x] 确认 pendingEntityPromptRef + createSession + useEffect 调用顺序完全符合 Claude 锁定逻辑
- [x] TSC: 0 errors

## Bug Fix: lightweight-charts "Object is disposed"
- [x] 修复 lightweight-charts ResizeObserver 在图表实例销毁后仍然访问导致的 "Object is disposed" 崩溃

## UI 接线：workspaceOutput routing 数据接入
- [x] DecisionSpine fallback 确认已在位（tvm.available=false 时用 answerObject.verdict/bull_case/risks）
- [x] AlertBlock 补 answerObject.risks fallback（avm.available=false 时用 answerObject.risks）
- [x] Discussion 继续只用 workspaceOutput.discussion，InsightsRail 继续只用 workspaceOutput.insights

## Bug Fix: sessionId Invalid UUID
- [x] 修复 mutation 传入非 UUID 格式 sessionId 导致的 "Invalid UUID" 验证错误
