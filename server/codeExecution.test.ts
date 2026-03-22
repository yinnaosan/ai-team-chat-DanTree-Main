/**
 * codeExecution.test.ts — 沙盒代码执行模块测试
 */
import { describe, it, expect } from "vitest";
import { validateCode, executeCode, getPresetChartCode } from "./codeExecution";

describe("validateCode — 安全检查", () => {
  it("允许安全的数学代码", () => {
    const result = validateCode("x = 1 + 2\nprint(x)");
    expect(result.safe).toBe(true);
  });

  it("允许 matplotlib 代码", () => {
    const result = validateCode(`
import matplotlib
import matplotlib.pyplot as plt
import numpy as np
x = np.linspace(0, 10, 100)
plt.plot(x, np.sin(x))
`);
    expect(result.safe).toBe(true);
  });

  it("拒绝 import os", () => {
    const result = validateCode("import os\nos.system('ls')");
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("禁止操作");
  });

  it("拒绝 import subprocess", () => {
    const result = validateCode("import subprocess\nsubprocess.run(['ls'])");
    expect(result.safe).toBe(false);
  });

  it("拒绝 import requests", () => {
    const result = validateCode("import requests\nrequests.get('http://example.com')");
    expect(result.safe).toBe(false);
  });

  it("拒绝 eval()", () => {
    const result = validateCode("eval('print(1)')");
    expect(result.safe).toBe(false);
  });

  it("拒绝文件写入", () => {
    const result = validateCode("f = open('/etc/passwd', 'w')");
    expect(result.safe).toBe(false);
  });

  it("拒绝超长代码", () => {
    const result = validateCode("x = 1\n".repeat(10000));
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("50000");
  });
});

describe("executeCode — 代码执行", () => {
  it("执行简单 print 输出", async () => {
    const result = await executeCode({
      code: "print('hello world')",
      timeout: 10000,
    });
    expect(result.success).toBe(true);
    expect(result.outputType).toBe("text");
    expect(result.textOutput).toContain("hello world");
  }, 15000);

  it("执行数学计算并输出 JSON", async () => {
    const result = await executeCode({
      code: `
import json
data = {"sum": 1 + 2 + 3, "product": 2 * 3 * 4}
print(json.dumps(data))
`,
      timeout: 10000,
    });
    expect(result.success).toBe(true);
    expect(result.outputType).toBe("json");
    expect((result.jsonData as any).sum).toBe(6);
    expect((result.jsonData as any).product).toBe(24);
  }, 15000);

  it("访问注入的 _data 变量", async () => {
    const result = await executeCode({
      code: `
prices = _data["prices"]
avg = sum(prices) / len(prices)
print(f"Average: {avg:.2f}")
`,
      data: { prices: [100, 110, 105, 115, 120] },
      timeout: 10000,
    });
    expect(result.success).toBe(true);
    expect(result.textOutput).toContain("110.00");
  }, 15000);

  it("生成 matplotlib 图表返回 base64 图像", async () => {
    const result = await executeCode({
      code: `
import numpy as np
x = np.linspace(0, 2 * np.pi, 100)
y = np.sin(x)
plt.figure(figsize=(8, 4))
plt.plot(x, y, color='#4fc3f7', linewidth=2)
plt.title('Sine Wave')
plt.xlabel('x')
plt.ylabel('sin(x)')
plt.grid(True, alpha=0.3)
`,
      timeout: 20000,
    });
    expect(result.success).toBe(true);
    expect(result.outputType).toBe("image");
    expect(result.imageBase64).toBeDefined();
    expect(result.imageBase64!.length).toBeGreaterThan(1000);
    expect(result.imageUrl).toMatch(/^data:image\/png;base64,/);
  }, 25000);

  it("捕获运行时错误", async () => {
    const result = await executeCode({
      code: "x = 1 / 0",
      timeout: 10000,
    });
    expect(result.success).toBe(false);
    expect(result.outputType).toBe("error");
    expect(result.error).toContain("division by zero");
  }, 15000);

  it("拒绝不安全代码（不执行）", async () => {
    const result = await executeCode({
      code: "import os\nos.system('echo hacked')",
      timeout: 5000,
    });
    expect(result.success).toBe(false);
    expect(result.outputType).toBe("error");
    expect(result.error).toContain("安全检查失败");
    expect(result.executionTimeMs).toBe(0);
  }, 5000);

  it("记录执行耗时", async () => {
    const result = await executeCode({
      code: "print('timing test')",
      timeout: 10000,
    });
    expect(result.executionTimeMs).toBeGreaterThan(0);
    expect(result.executionTimeMs).toBeLessThan(10000);
  }, 15000);
});

describe("getPresetChartCode — 预设图表代码", () => {
  it("返回价格折线图代码", () => {
    const code = getPresetChartCode("price_line", {});
    expect(code).not.toBeNull();
    expect(code).toContain("ax.plot");
    expect(code).toContain("_data");
  });

  it("返回 K 线图代码", () => {
    const code = getPresetChartCode("candlestick", {});
    expect(code).not.toBeNull();
    expect(code).toContain("opens");
    expect(code).toContain("closes");
  });

  it("返回饼图代码", () => {
    const code = getPresetChartCode("portfolio_pie", {});
    expect(code).not.toBeNull();
    expect(code).toContain("pie");
  });

  it("返回收益率柱状图代码", () => {
    const code = getPresetChartCode("returns_bar", {});
    expect(code).not.toBeNull();
    expect(code).toContain("bar");
  });

  it("未知类型返回 null", () => {
    const code = getPresetChartCode("unknown_type", {});
    expect(code).toBeNull();
  });
});
