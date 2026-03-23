/**
 * hackerLawsKnowledge.ts
 * 基于 dwmkerr/hacker-laws 仓库提取的投资相关定律与原则知识库
 * 在 AI 分析时自动引用相关定律，增强定性分析深度
 */

export interface HackerLaw {
  id: string;
  name: string;
  nameZh: string;
  category: "market_behavior" | "organization" | "technology" | "decision_making" | "risk";
  summary: string;
  investmentApplication: string;
  triggerKeywords: string[];
}

/** 投资分析相关定律库（从 hacker-laws 精选 25 条） */
export const INVESTMENT_LAWS: HackerLaw[] = [
  {
    id: "pareto-principle",
    name: "The Pareto Principle (The 80/20 Rule)",
    nameZh: "帕累托法则（80/20 法则）",
    category: "market_behavior",
    summary: "约 80% 的结果来自 20% 的原因。",
    investmentApplication:
      "在投资组合中，通常 20% 的持仓贡献 80% 的收益；企业中 20% 的客户贡献 80% 的营收。分析公司时，应重点关注其核心客户集中度和主要产品线的贡献比例。若单一客户/产品占比过高，需评估集中风险。",
    triggerKeywords: ["集中度", "主要客户", "核心产品", "收入结构", "80/20", "帕累托"],
  },
  {
    id: "hype-cycle",
    name: "The Hype Cycle & Amara's Law",
    nameZh: "炒作周期与阿马拉定律",
    category: "market_behavior",
    summary:
      "技术/概念经历：触发期 → 膨胀预期峰值 → 幻灭低谷 → 复苏爬升 → 生产力高原。人们倾向于高估技术短期影响，低估其长期影响。",
    investmentApplication:
      "判断新兴技术/行业所处的炒作周期阶段至关重要。处于「膨胀预期峰值」时估值泡沫风险最高；处于「幻灭低谷」时往往是长期布局的最佳窗口。AI、新能源、元宇宙等主题投资均需结合炒作周期分析。",
    triggerKeywords: [
      "AI",
      "人工智能",
      "新能源",
      "元宇宙",
      "区块链",
      "炒作",
      "泡沫",
      "估值",
      "新兴技术",
      "概念股",
    ],
  },
  {
    id: "moores-law",
    name: "Moore's Law",
    nameZh: "摩尔定律",
    category: "technology",
    summary: "集成电路上的晶体管数量约每两年翻一番，性能提升而成本下降。",
    investmentApplication:
      "半导体行业的长期增长驱动力。评估芯片公司时，需判断其产品是否符合摩尔定律的演进路径。当摩尔定律放缓（如先进制程逼近物理极限），异构计算、封装技术等新路径的公司具有更高的战略价值。",
    triggerKeywords: [
      "半导体",
      "芯片",
      "晶体管",
      "制程",
      "英伟达",
      "台积电",
      "英特尔",
      "AMD",
      "算力",
    ],
  },
  {
    id: "metcalfes-law",
    name: "Metcalfe's Law",
    nameZh: "梅特卡夫定律",
    category: "technology",
    summary: "网络的价值与其用户数量的平方成正比。",
    investmentApplication:
      "评估平台型公司（社交网络、支付平台、电商生态）的护城河时，梅特卡夫定律是核心框架。用户规模达到临界点后，网络效应形成强大的竞争壁垒。分析微信、支付宝、亚马逊等平台时应重点评估其网络效应强度。",
    triggerKeywords: [
      "平台",
      "网络效应",
      "用户规模",
      "社交",
      "支付",
      "电商",
      "腾讯",
      "Meta",
      "护城河",
    ],
  },
  {
    id: "conways-law",
    name: "Conway's Law",
    nameZh: "康威定律",
    category: "organization",
    summary: "系统的设计结构往往反映设计该系统的组织的通信结构。",
    investmentApplication:
      "评估科技公司的产品架构时，康威定律揭示了组织效率与产品竞争力的关联。组织架构臃肿的公司往往产品迭代慢、协作成本高。管理层变动（如拆分/合并事业部）对产品路线图的影响需结合康威定律分析。",
    triggerKeywords: ["组织架构", "管理层", "事业部", "产品迭代", "研发效率", "科技公司"],
  },
  {
    id: "goodharts-law",
    name: "Goodhart's Law",
    nameZh: "古德哈特定律",
    category: "decision_making",
    summary: "当一个指标成为目标时，它就不再是一个好的指标。",
    investmentApplication:
      "警惕公司管理层为完成特定 KPI（如 EPS、月活用户数）而进行的短期操纵行为。当某个财务指标被市场过度关注时，公司可能通过回购、会计处理等方式人为美化，导致指标失真。需结合多维度指标交叉验证。",
    triggerKeywords: [
      "EPS",
      "月活",
      "用户数",
      "KPI",
      "业绩",
      "财务指标",
      "回购",
      "会计",
      "盈利质量",
    ],
  },
  {
    id: "murphys-law",
    name: "Murphy's Law / Sod's Law",
    nameZh: "墨菲定律",
    category: "risk",
    summary: "凡是可能出错的事，终将出错。",
    investmentApplication:
      "风险管理的核心原则。在评估公司时，应系统性地识别所有可能的风险情景（黑天鹅事件、供应链中断、监管风险、地缘政治等），并假设最坏情况会发生。永远不要因为某风险「概率极低」而忽视其潜在影响。",
    triggerKeywords: [
      "风险",
      "黑天鹅",
      "尾部风险",
      "供应链",
      "监管",
      "地缘政治",
      "最坏情况",
      "压力测试",
    ],
  },
  {
    id: "occams-razor",
    name: "Occam's Razor",
    nameZh: "奥卡姆剃刀",
    category: "decision_making",
    summary: "在解释同一现象的多个假设中，应优先选择假设最少的那个（最简单的解释往往是正确的）。",
    investmentApplication:
      "当分析公司业绩异常时，最简单的解释通常最准确。若一家公司的财务报表需要复杂的理由才能解释其盈利，往往暗示存在问题。投资决策应基于简单清晰的商业逻辑，而非复杂的金融工程。",
    triggerKeywords: [
      "财务异常",
      "盈利质量",
      "商业模式",
      "逻辑",
      "复杂",
      "简单",
      "基本面",
      "护城河",
    ],
  },
  {
    id: "parkinsons-law",
    name: "Parkinson's Law",
    nameZh: "帕金森定律",
    category: "organization",
    summary: "工作会自动膨胀以填满完成它所分配的时间。",
    investmentApplication:
      "评估公司运营效率时，帕金森定律揭示了大型组织的低效倾向。员工人数快速扩张、管理层级增多往往是效率下降的信号。关注收入/员工比（Revenue per Employee）和人力成本占比的变化趋势。",
    triggerKeywords: ["员工", "人力成本", "运营效率", "组织膨胀", "管理层级", "人均收入"],
  },
  {
    id: "dunning-kruger-effect",
    name: "The Dunning-Kruger Effect",
    nameZh: "邓宁-克鲁格效应",
    category: "decision_making",
    summary: "能力不足的人往往高估自己的能力；真正有能力的人往往低估自己。",
    investmentApplication:
      "投资者行为偏差的重要来源。初入市场的投资者在小幅盈利后容易产生过度自信，忽视风险。在评估管理层时，过度自信的 CEO（频繁并购、激进扩张）往往是价值毁灭的信号。应保持对自身认知边界的清醒认识。",
    triggerKeywords: [
      "并购",
      "扩张",
      "激进",
      "管理层",
      "过度自信",
      "认知偏差",
      "行为金融",
      "CEO",
    ],
  },
  {
    id: "brooks-law",
    name: "Brooks' Law",
    nameZh: "布鲁克斯定律",
    category: "organization",
    summary: "向一个已经延期的软件项目增加人手只会使其更加延期。",
    investmentApplication:
      "评估科技公司大规模招聘时需谨慎。在产品关键节点大量招人往往导致沟通成本激增、交付延期。结合公司招聘节奏与产品发布时间线分析，识别执行风险。",
    triggerKeywords: ["招聘", "研发", "产品延期", "软件", "科技公司", "执行力"],
  },
  {
    id: "galls-law",
    name: "Gall's Law",
    nameZh: "盖尔定律",
    category: "organization",
    summary: "所有能正常运作的复杂系统都是从一个能正常运作的简单系统演化而来的。",
    investmentApplication:
      "评估公司战略时，从简单核心业务出发逐步扩张的公司（如亚马逊从图书到云计算）往往比一开始就追求复杂生态的公司更成功。过于复杂的商业模式和多元化战略往往是风险信号。",
    triggerKeywords: ["多元化", "生态", "战略", "核心业务", "扩张", "商业模式"],
  },
  {
    id: "jevons-paradox",
    name: "Jevons' Paradox",
    nameZh: "杰文斯悖论",
    category: "market_behavior",
    summary: "技术进步提高了资源使用效率，但往往导致该资源总消耗量增加而非减少。",
    investmentApplication:
      "分析能源/算力行业时的重要框架。AI 芯片效率提升并不会减少数据中心的总用电量，反而因需求爆发而增加。新能源汽车效率提升也可能刺激更多驾驶需求。评估能源转型投资时需考虑杰文斯悖论效应。",
    triggerKeywords: [
      "能源",
      "算力",
      "数据中心",
      "电力",
      "效率",
      "AI",
      "新能源",
      "用电量",
      "碳排放",
    ],
  },
  {
    id: "ringelmann-effect",
    name: "The Ringelmann Effect",
    nameZh: "林格曼效应（社会懈怠）",
    category: "organization",
    summary: "团队成员越多，个体的平均贡献越低（社会懈怠现象）。",
    investmentApplication:
      "大型企业的效率陷阱。员工规模超过一定阈值后，人均产出往往下降。分析公司时关注员工规模与收入增长的比例关系，识别是否存在组织效率下滑。",
    triggerKeywords: ["员工规模", "人均产出", "大型企业", "效率", "组织管理"],
  },
  {
    id: "peter-principle",
    name: "The Peter Principle",
    nameZh: "彼得原理",
    category: "organization",
    summary: "在层级组织中，每个员工都倾向于晋升到其无能为力的职位。",
    investmentApplication:
      "评估公司管理层时，从技术/销售岗位晋升至 CEO 的管理者可能缺乏战略管理能力。创始人转型为 CEO 的过程中，若缺乏相应能力补充（如引入 CFO/COO），往往成为公司成长瓶颈。",
    triggerKeywords: ["管理层", "CEO", "创始人", "晋升", "领导力", "高管"],
  },
  {
    id: "shirky-principle",
    name: "The Shirky Principle",
    nameZh: "雪基原理",
    category: "market_behavior",
    summary: "机构会倾向于维护其所解决的问题的存在。",
    investmentApplication:
      "分析受监管行业时，监管机构和既得利益者往往阻碍颠覆性创新。评估金融、医疗、教育等行业的颠覆者时，需评估其面临的制度性阻力。同时，这也解释了为何某些低效行业长期存在——因为有人从中受益。",
    triggerKeywords: ["监管", "行业壁垒", "颠覆", "既得利益", "金融", "医疗", "教育"],
  },
  {
    id: "two-pizza-rule",
    name: "The Two Pizza Rule",
    nameZh: "两个披萨原则",
    category: "organization",
    summary: "团队规模不应超过两个披萨能喂饱的人数（约 6-10 人）。",
    investmentApplication:
      "亚马逊的核心管理原则。小团队自主权高、决策快、创新力强。评估科技公司组织文化时，是否采用小团队制（如 Spotify 的 Squad 模式）是判断其创新活力的重要指标。",
    triggerKeywords: ["团队", "组织文化", "亚马逊", "创新", "敏捷", "研发团队"],
  },
  {
    id: "all-models-are-wrong",
    name: "All Models Are Wrong (George Box's Law)",
    nameZh: "所有模型都是错的（乔治·博克斯定律）",
    category: "decision_making",
    summary: "所有模型都是错误的，但有些是有用的。",
    investmentApplication:
      "量化模型和估值模型的核心局限性。DCF 模型、CAPM、因子模型等都是对现实的简化，不应将其结果视为精确预测。模型应作为辅助思考工具，而非决策依据。关键假设的敏感性分析比模型本身更重要。",
    triggerKeywords: ["DCF", "估值模型", "量化", "因子模型", "预测", "假设", "敏感性分析"],
  },
  {
    id: "chestertons-fence",
    name: "Chesterton's Fence",
    nameZh: "切斯特顿之栅栏",
    category: "decision_making",
    summary: "在理解某事物存在的原因之前，不要轻易移除它。",
    investmentApplication:
      "评估公司战略变革时，新管理层大刀阔斧地改变既有策略（如砍掉「低效」业务线）可能破坏隐性价值。在分析并购整合、业务重组时，需深入理解被改变部分的历史逻辑，避免因表面低效而错误评估其战略价值。",
    triggerKeywords: ["重组", "并购整合", "战略变革", "管理层更换", "业务剥离", "改革"],
  },
  {
    id: "dead-sea-effect",
    name: "The Dead Sea Effect",
    nameZh: "死海效应",
    category: "organization",
    summary: "在组织中，优秀的人才往往最先离开，留下的是能力较弱的人，就像死海中盐分越来越高。",
    investmentApplication:
      "评估公司人才流失风险时的重要框架。核心技术/管理人才大量离职是公司竞争力下滑的早期信号。科技公司的 Glassdoor 评分、LinkedIn 离职率数据可作为辅助判断指标。",
    triggerKeywords: ["人才流失", "离职率", "核心团队", "竞争力", "科技公司", "员工满意度"],
  },
  {
    id: "dilbert-principle",
    name: "The Dilbert Principle",
    nameZh: "呆伯特原理",
    category: "organization",
    summary: "公司倾向于将最无能的员工提升到管理岗位，以减少他们对实际工作的破坏。",
    investmentApplication:
      "与彼得原理类似，但更强调组织对无能管理者的容忍。评估公司治理质量时，管理层的专业背景与岗位匹配度是重要指标。频繁的管理层变动或「空降」管理者往往是治理问题的信号。",
    triggerKeywords: ["公司治理", "管理层", "空降", "高管变动", "治理结构"],
  },
  {
    id: "robustness-principle",
    name: "The Robustness Principle (Postel's Law)",
    nameZh: "鲁棒性原则（波斯特尔定律）",
    category: "risk",
    summary: "对自己发送的内容保持保守，对接收的内容保持宽容。",
    investmentApplication:
      "投资组合构建原则：对自己的预测保持保守（不过度乐观），对市场的不确定性保持宽容（留有安全边际）。在设定目标价和预期收益时，应采用保守假设，同时对超预期情景保持开放。",
    triggerKeywords: ["安全边际", "保守估计", "目标价", "预期收益", "不确定性", "风险管理"],
  },
  {
    id: "reedss-law",
    name: "Reed's Law",
    nameZh: "里德定律",
    category: "technology",
    summary: "网络中群组形成的价值随用户数量呈指数级增长（超越梅特卡夫定律）。",
    investmentApplication:
      "评估社区型平台（Discord、Reddit、微信群、知识星球等）时，里德定律比梅特卡夫定律更适用。用户不仅形成一对一连接，还形成多个子群体，价值呈超指数增长。这类平台的用户粘性和变现潜力往往被低估。",
    triggerKeywords: ["社区", "群组", "Discord", "Reddit", "用户粘性", "平台", "社交"],
  },
  {
    id: "law-of-triviality",
    name: "The Law of Triviality",
    nameZh: "琐碎定律（自行车棚效应）",
    category: "decision_making",
    summary: "组织往往在琐碎问题上花费过多时间，而在重要问题上花费不足。",
    investmentApplication:
      "评估公司管理层的决策质量时，关注其是否将精力集中在核心战略问题上。若公司在次要问题（如品牌 Logo 更换、办公室装修）上大量投入，而忽视核心业务竞争力，往往是管理层失焦的信号。",
    triggerKeywords: ["管理层", "战略", "资本配置", "决策质量", "核心业务"],
  },
  {
    id: "hutbers-law",
    name: "Hutber's Law",
    nameZh: "赫特伯定律",
    category: "market_behavior",
    summary: "改善意味着恶化（每次改进都会引入新问题）。",
    investmentApplication:
      "评估公司产品升级和业务转型时，新功能/新产品往往带来新的复杂性和风险。平台迁移、系统升级、产品重构等项目的执行风险往往被低估。应在估值中为「改善带来的恶化」预留风险折价。",
    triggerKeywords: ["产品升级", "系统迁移", "转型", "重构", "执行风险", "改革"],
  },
];

/**
 * 根据查询关键词检索相关定律
 * @param query 用户查询文本
 * @param maxResults 最多返回条数（默认 3）
 */
export function findRelevantLaws(query: string, maxResults = 3): HackerLaw[] {
  const queryLower = query.toLowerCase();
  const scored = INVESTMENT_LAWS.map((law) => {
    let score = 0;
    // 关键词匹配
    for (const kw of law.triggerKeywords) {
      if (queryLower.includes(kw.toLowerCase())) {
        score += 2;
      }
    }
    // 名称匹配
    if (queryLower.includes(law.nameZh.toLowerCase())) score += 5;
    if (queryLower.includes(law.name.toLowerCase())) score += 5;
    return { law, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((s) => s.law);
}

/**
 * 生成定律引用的 Markdown 文本块（用于注入 AI 分析上下文）
 */
export function buildLawsContextBlock(query: string): string {
  const laws = findRelevantLaws(query, 3);
  if (laws.length === 0) return "";

  const lines = laws.map(
    (l) =>
      `**${l.nameZh}（${l.name}）**：${l.summary}\n> 投资应用：${l.investmentApplication}`
  );

  return `\n\n---\n### 📚 相关定律与原则（来源：hacker-laws）\n\n${lines.join("\n\n")}\n`;
}

/** 获取所有定律的简要列表（用于知识库展示） */
export function getAllLawsSummary(): { id: string; nameZh: string; name: string; category: string }[] {
  return INVESTMENT_LAWS.map(({ id, nameZh, name, category }) => ({
    id,
    nameZh,
    name,
    category,
  }));
}
