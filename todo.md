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
- [ ] 测试验证纯 API 模式下分析任务能正常完成
