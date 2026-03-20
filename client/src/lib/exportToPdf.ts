/**
 * exportToPdf — 将聊天回复（文字 + 图表）导出为专业 PDF 报告
 *
 * 技术方案：
 * 1. 用 html2canvas 对每条 AI 消息气泡截图（保留图表渲染效果）
 * 2. 用 jsPDF 将截图拼合为 A4 PDF，加上封面页（标题 + 时间戳）
 */

import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export interface ExportMessage {
  role: "user" | "assistant" | "system";
  content: string;
  createdAt?: number;
}

interface ExportOptions {
  title?: string;
  /** 要导出的消息 DOM 容器 selector 或 HTMLElement 数组 */
  messageElements: HTMLElement[];
  /** 对话标题 */
  conversationTitle?: string;
  /** 导出文件名（不含扩展名） */
  filename?: string;
  onProgress?: (pct: number) => void;
}

const PAGE_WIDTH = 210; // A4 mm
const PAGE_HEIGHT = 297; // A4 mm
const MARGIN = 14; // mm
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/** 将 px 转为 mm（96dpi） */
function pxToMm(px: number): number {
  return (px * 25.4) / 96;
}

/** 绘制封面页 */
function drawCoverPage(pdf: jsPDF, title: string, subtitle: string) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  // 深色背景
  pdf.setFillColor(22, 22, 32);
  pdf.rect(0, 0, pageW, pageH, "F");

  // 顶部装饰线（蓝紫渐变模拟）
  pdf.setDrawColor(99, 102, 241);
  pdf.setLineWidth(0.8);
  pdf.line(MARGIN, 28, pageW - MARGIN, 28);

  // 标题
  pdf.setTextColor(240, 240, 248);
  pdf.setFontSize(22);
  pdf.setFont("helvetica", "bold");
  const titleLines = pdf.splitTextToSize(title, CONTENT_WIDTH);
  pdf.text(titleLines, MARGIN, 50);

  // 副标题
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(160, 160, 180);
  pdf.text(subtitle, MARGIN, 50 + titleLines.length * 10 + 8);

  // 底部信息
  pdf.setFontSize(9);
  pdf.setTextColor(100, 100, 120);
  pdf.text("AI Team Chat — 智能投资协作平台", MARGIN, pageH - 16);
  pdf.text(new Date().toLocaleString("zh-CN"), pageW - MARGIN, pageH - 16, { align: "right" });

  // 底部装饰线
  pdf.setDrawColor(60, 60, 80);
  pdf.setLineWidth(0.3);
  pdf.line(MARGIN, pageH - 20, pageW - MARGIN, pageH - 20);
}

/** 主导出函数 */
export async function exportToPdf(options: ExportOptions): Promise<void> {
  const {
    messageElements,
    conversationTitle = "AI 分析报告",
    filename = `AI-Report-${Date.now()}`,
    onProgress,
  } = options;

  if (messageElements.length === 0) {
    throw new Error("没有可导出的消息内容");
  }

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  // ── 封面页 ─────────────────────────────────────────────────────────────────
  const subtitle = `生成时间：${new Date().toLocaleString("zh-CN")}`;
  drawCoverPage(pdf, conversationTitle, subtitle);

  onProgress?.(5);

  // ── 内容页 ─────────────────────────────────────────────────────────────────
  pdf.addPage();

  // 内容页背景
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  pdf.setFillColor(22, 22, 32);
  pdf.rect(0, 0, pageW, pageH, "F");

  let cursorY = MARGIN + 4; // 当前 Y 位置（mm）
  const footerH = 12; // 底部页脚预留高度

  const addNewPage = () => {
    pdf.addPage();
    pdf.setFillColor(22, 22, 32);
    pdf.rect(0, 0, pageW, pageH, "F");
    cursorY = MARGIN + 4;
  };

  const drawFooter = (pageNum: number) => {
    const totalPages = pdf.getNumberOfPages();
    pdf.setFontSize(8);
    pdf.setTextColor(80, 80, 100);
    pdf.text(`${pageNum} / ${totalPages}`, pageW / 2, pageH - 6, { align: "center" });
    pdf.setDrawColor(50, 50, 70);
    pdf.setLineWidth(0.2);
    pdf.line(MARGIN, pageH - 10, pageW - MARGIN, pageH - 10);
  };

  // 截图每条消息并添加到 PDF
  for (let i = 0; i < messageElements.length; i++) {
    const el = messageElements[i];

    onProgress?.(5 + Math.round(((i + 1) / messageElements.length) * 85));

    try {
      const canvas = await html2canvas(el, {
        backgroundColor: "#161620",
        scale: 2, // 高清截图
        useCORS: true,
        logging: false,
        // 忽略不需要截图的元素（如按钮、操作栏）
        ignoreElements: (element) => {
          return element.hasAttribute("data-export-ignore");
        },
      });

      const imgData = canvas.toDataURL("image/png");
      const imgWidthPx = canvas.width;
      const imgHeightPx = canvas.height;

      // 计算在 PDF 中的尺寸（适配内容宽度）
      const imgWidthMm = CONTENT_WIDTH;
      const imgHeightMm = (imgHeightPx / imgWidthPx) * imgWidthMm;

      // 如果图片太高，需要分割（超过一页高度时）
      const maxImgH = pageH - MARGIN - footerH - cursorY;

      if (imgHeightMm <= maxImgH) {
        // 整张图片放得下
        pdf.addImage(imgData, "PNG", MARGIN, cursorY, imgWidthMm, imgHeightMm);
        cursorY += imgHeightMm + 4;
      } else {
        // 图片需要分页——按比例裁切
        let srcY = 0;
        let remainH = imgHeightPx;

        while (remainH > 0) {
          const availH = pageH - MARGIN - footerH - cursorY;
          const sliceHPx = Math.floor((availH / imgWidthMm) * imgWidthPx);
          const actualSliceH = Math.min(sliceHPx, remainH);
          const sliceHMm = (actualSliceH / imgWidthPx) * imgWidthMm;

          // 创建裁切 canvas
          const sliceCanvas = document.createElement("canvas");
          sliceCanvas.width = imgWidthPx;
          sliceCanvas.height = actualSliceH;
          const ctx = sliceCanvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(canvas, 0, srcY, imgWidthPx, actualSliceH, 0, 0, imgWidthPx, actualSliceH);
            const sliceData = sliceCanvas.toDataURL("image/png");
            pdf.addImage(sliceData, "PNG", MARGIN, cursorY, imgWidthMm, sliceHMm);
          }

          srcY += actualSliceH;
          remainH -= actualSliceH;
          cursorY += sliceHMm + 2;

          if (remainH > 0) {
            addNewPage();
          }
        }
      }

      // 消息间分隔线
      if (i < messageElements.length - 1) {
        if (cursorY + 3 > pageH - MARGIN - footerH) {
          addNewPage();
        } else {
          pdf.setDrawColor(50, 50, 70);
          pdf.setLineWidth(0.2);
          pdf.line(MARGIN, cursorY, pageW - MARGIN, cursorY);
          cursorY += 4;
        }
      }

      // 检查是否需要翻页
      if (cursorY > pageH - MARGIN - footerH - 10 && i < messageElements.length - 1) {
        addNewPage();
      }
    } catch (err) {
      console.warn("截图失败，跳过该消息", err);
    }
  }

  // 为所有内容页添加页脚
  const totalPages = pdf.getNumberOfPages();
  for (let p = 2; p <= totalPages; p++) {
    pdf.setPage(p);
    drawFooter(p - 1); // 封面不算页码
  }

  onProgress?.(98);

  // 下载
  pdf.save(`${filename}.pdf`);
  onProgress?.(100);
}
