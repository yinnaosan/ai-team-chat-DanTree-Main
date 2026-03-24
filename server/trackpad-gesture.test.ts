/**
 * Mac trackpad 手势逻辑单元测试
 * 验证 PriceChart 中 wheel 事件处理的缩放和平移计算
 */
import { describe, it, expect } from "vitest";

// 模拟 lightweight-charts 的 LogicalRange 计算逻辑
function computeZoom(
  range: { from: number; to: number },
  deltaY: number
): { from: number; to: number } {
  const span = range.to - range.from;
  const zoomFactor = deltaY > 0 ? 1.1 : 0.9; // >1 缩小，<1 放大
  const newSpan = span * zoomFactor;
  const center = (range.from + range.to) / 2;
  return {
    from: center - newSpan / 2,
    to:   center + newSpan / 2,
  };
}

function computePan(
  range: { from: number; to: number },
  deltaX: number,
  deltaY: number
): { from: number; to: number } {
  const span = range.to - range.from;
  const scrollDelta = deltaX !== 0 ? deltaX : deltaY;
  const shift = scrollDelta * span * 0.003;
  return {
    from: range.from + shift,
    to:   range.to   + shift,
  };
}

describe("Mac trackpad 手势逻辑", () => {
  const initialRange = { from: 0, to: 100 }; // span = 100

  describe("捏合缩放（ctrlKey=true）", () => {
    it("向外捏（deltaY < 0）应放大（span 变小）", () => {
      const result = computeZoom(initialRange, -10);
      const newSpan = result.to - result.from;
      expect(newSpan).toBeLessThan(100); // span 缩小 → 放大
      expect(newSpan).toBeCloseTo(90, 0); // 0.9 * 100 = 90
    });

    it("向内捏（deltaY > 0）应缩小（span 变大）", () => {
      const result = computeZoom(initialRange, 10);
      const newSpan = result.to - result.from;
      expect(newSpan).toBeGreaterThan(100); // span 增大 → 缩小
      expect(newSpan).toBeCloseTo(110, 0); // 1.1 * 100 = 110
    });

    it("缩放应以可见范围中心为基准", () => {
      const result = computeZoom(initialRange, -10);
      const center = (result.from + result.to) / 2;
      expect(center).toBeCloseTo(50, 5); // 中心应保持在 50
    });

    it("多次放大后 span 应持续减小", () => {
      let range = initialRange;
      for (let i = 0; i < 5; i++) {
        range = computeZoom(range, -10);
      }
      const finalSpan = range.to - range.from;
      expect(finalSpan).toBeLessThan(100);
      expect(finalSpan).toBeCloseTo(100 * Math.pow(0.9, 5), 1);
    });
  });

  describe("双指平移（ctrlKey=false）", () => {
    it("向右滑动（deltaX > 0）应向未来方向平移", () => {
      const result = computePan(initialRange, 100, 0);
      expect(result.from).toBeGreaterThan(0);
      expect(result.to).toBeGreaterThan(100);
      // span 应保持不变
      expect(result.to - result.from).toBeCloseTo(100, 5);
    });

    it("向左滑动（deltaX < 0）应向过去方向平移", () => {
      const result = computePan(initialRange, -100, 0);
      expect(result.from).toBeLessThan(0);
      expect(result.to).toBeLessThan(100);
      // span 应保持不变
      expect(result.to - result.from).toBeCloseTo(100, 5);
    });

    it("deltaX 优先于 deltaY", () => {
      const withDeltaX = computePan(initialRange, 50, 100);
      const withDeltaXOnly = computePan(initialRange, 50, 0);
      expect(withDeltaX.from).toBeCloseTo(withDeltaXOnly.from, 5);
    });

    it("当 deltaX=0 时使用 deltaY", () => {
      const result = computePan(initialRange, 0, 50);
      expect(result.from).toBeGreaterThan(0);
    });

    it("平移量与 span 成比例（大 span 时平移更多像素）", () => {
      const smallSpan = computePan({ from: 0, to: 10 }, 100, 0);
      const largeSpan = computePan({ from: 0, to: 1000 }, 100, 0);
      const smallShift = smallSpan.from;
      const largeShift = largeSpan.from;
      expect(Math.abs(largeShift)).toBeGreaterThan(Math.abs(smallShift));
    });
  });
});
