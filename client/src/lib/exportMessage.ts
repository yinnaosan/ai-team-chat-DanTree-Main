/**
 * 消息导出工具
 * 支持 Markdown、纯文本、单条 PDF、完整对话 PDF 四种格式
 */

/**
 * html2canvas 不支持 oklch() 颜色函数（Tailwind 4 默认使用）。
 * 在截图前，将所有 <style> 和 inline style 中的 oklch() 替换为等价 rgb()，
 * 截图完成后恢复原始样式，确保页面视觉不受影响。
 */
function oklchToRgbApprox(oklchStr: string): string {
  // 将 oklch(L C H / A) 转换为近似 rgb
  // 使用简化映射：保留亮度信息，色相映射到 HSL 再转 RGB
  return oklchStr.replace(
    /oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/gi,
    (_match, l, c, h, a) => {
      const L = parseFloat(l) / (l.includes("%") ? 100 : 1);
      const C = parseFloat(c);
      const H = parseFloat(h);
      const alpha = a ? parseFloat(a) / (String(a).includes("%") ? 100 : 1) : 1;

      // oklch → approximate sRGB via simplified LCH→Lab→XYZ→sRGB
      // For UI purposes, a hue-based HSL approximation is sufficient
      const hDeg = H % 360;
      // Map lightness: oklch L=0→black, L=1→white
      const lightness = Math.max(0, Math.min(1, L));
      // Chroma → saturation approximation (oklch chroma 0-0.4 typical range)
      const saturation = Math.max(0, Math.min(1, C / 0.4));

      // HSL to RGB
      const hslH = hDeg / 360;
      const hslS = saturation;
      const hslL = lightness;
      const q = hslL < 0.5 ? hslL * (1 + hslS) : hslL + hslS - hslL * hslS;
      const p = 2 * hslL - q;
      const hue2rgb = (t: number) => {
        let tt = t;
        if (tt < 0) tt += 1;
        if (tt > 1) tt -= 1;
        if (tt < 1/6) return p + (q - p) * 6 * tt;
        if (tt < 1/2) return q;
        if (tt < 2/3) return p + (q - p) * (2/3 - tt) * 6;
        return p;
      };
      const r = Math.round(hue2rgb(hslH + 1/3) * 255);
      const g = Math.round(hue2rgb(hslH) * 255);
      const b = Math.round(hue2rgb(hslH - 1/3) * 255);

      return alpha < 1
        ? `rgba(${r},${g},${b},${alpha.toFixed(3)})`
        : `rgb(${r},${g},${b})`;
    }
  );
}

/** 截图前替换所有 oklch，截图后恢复 */
function patchOklchForCanvas(): () => void {
  const patches: Array<{ node: HTMLStyleElement | HTMLElement; attr: string; original: string }> = [];

  // 1. 处理所有 <style> 标签
  document.querySelectorAll<HTMLStyleElement>("style").forEach((style) => {
    if (style.textContent && style.textContent.includes("oklch")) {
      const original = style.textContent;
      style.textContent = oklchToRgbApprox(original);
      patches.push({ node: style, attr: "textContent", original });
    }
  });

  // 2. 处理所有 inline style 属性
  document.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
    const original = el.getAttribute("style") || "";
    if (original.includes("oklch")) {
      el.setAttribute("style", oklchToRgbApprox(original));
      patches.push({ node: el, attr: "style", original });
    }
  });

  // 返回恢复函数
  return () => {
    patches.forEach(({ node, attr, original }) => {
      if (attr === "textContent") {
        (node as HTMLStyleElement).textContent = original;
      } else {
        (node as HTMLElement).setAttribute("style", original);
      }
    });
  };
}

/** 下载文本文件 */
function downloadText(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 生成安全文件名（去除特殊字符，截断） */
function safeFilename(title: string, ext: string): string {
  const base = title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60).trim() || "回复";
  const date = new Date().toISOString().slice(0, 10);
  return `${base}_${date}.${ext}`;
}

/** 导出为 Markdown */
export function exportAsMarkdown(content: string, title?: string) {
  const header = title ? `# ${title}\n\n` : "";
  downloadText(header + content, safeFilename(title || "投资分析", "md"), "text/markdown;charset=utf-8");
}

/** 导出为纯文本（去除 Markdown 标记） */
export function exportAsText(content: string, title?: string) {
  const plain = content
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`{3}[\s\S]*?`{3}/g, (m) => m.replace(/```\w*\n?/g, ""))
    .replace(/`(.+?)`/g, "$1")
    .replace(/^>\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/!\[.*?\]\(.+?\)/g, "")
    .replace(/\|.+\|/g, (m) => m.replace(/\|/g, "  ").trim())
    .replace(/^[-|:]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  downloadText(plain, safeFilename(title || "投资分析", "txt"), "text/plain;charset=utf-8");
}

/** 导出单条消息为 PDF（使用 html2canvas + jsPDF） */
export async function exportAsPDF(element: HTMLElement, title?: string) {
  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);

    const restoreOklch = patchOklchForCanvas();
    let canvas;
    try {
      canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#161620",
        logging: false,
        ignoreElements: (el) => el.hasAttribute("data-export-ignore"),
      });
    } finally {
      restoreOklch();
    }

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 12;
    const imgWidth = pageWidth - margin * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let yPos = margin;
    let remainingHeight = imgHeight;

    while (remainingHeight > 0) {
      const sliceHeight = Math.min(remainingHeight, pageHeight - margin * 2);
      const sourceY = (imgHeight - remainingHeight) * (canvas.height / imgHeight);
      const sourceH = sliceHeight * (canvas.height / imgHeight);

      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = Math.ceil(sourceH);
      const ctx = pageCanvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(canvas, 0, sourceY, canvas.width, sourceH, 0, 0, canvas.width, sourceH);
        pdf.addImage(pageCanvas.toDataURL("image/png"), "PNG", margin, yPos, imgWidth, sliceHeight);
      }

      remainingHeight -= sliceHeight;
      if (remainingHeight > 0) { pdf.addPage(); yPos = margin; }
    }

    pdf.save(safeFilename(title || "投资分析", "pdf"));
  } catch (err) {
    console.error("[exportAsPDF] failed:", err);
    throw err;
  }
}

/**
 * 导出完整对话报告为 PDF
 * 将页面上所有 data-pdf-message 元素截图并合并为一份带封面的 PDF
 */
export async function exportConversationAsPDF(
  title: string,
  onProgress?: (pct: number) => void
): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  // 收集所有 AI 回复消息元素（data-pdf-message="ai"）
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>("[data-pdf-message]")
  );

  if (elements.length === 0) {
    throw new Error("没有可导出的消息内容");
  }

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const MARGIN = 13;
  const CONTENT_W = pageW - MARGIN * 2;
  const FOOTER_H = 11;

  // ── 封面页 ──────────────────────────────────────────────────────────────────
  pdf.setFillColor(22, 22, 32);
  pdf.rect(0, 0, pageW, pageH, "F");

  // 顶部蓝紫装饰线
  pdf.setDrawColor(99, 102, 241);
  pdf.setLineWidth(0.7);
  pdf.line(MARGIN, 26, pageW - MARGIN, 26);

  // 标题
  pdf.setTextColor(235, 235, 248);
  pdf.setFontSize(20);
  pdf.setFont("helvetica", "bold");
  const titleLines = pdf.splitTextToSize(title, CONTENT_W);
  pdf.text(titleLines, MARGIN, 44);

  // 副标题
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(140, 140, 165);
  pdf.text(`生成时间：${new Date().toLocaleString("zh-CN")}`, MARGIN, 44 + titleLines.length * 9 + 7);
  pdf.text(`共 ${elements.length} 条分析记录`, MARGIN, 44 + titleLines.length * 9 + 15);

  // 底部 branding
  pdf.setFontSize(8.5);
  pdf.setTextColor(80, 80, 105);
  pdf.text("DanTree — 智能投资协作平台", MARGIN, pageH - 14);
  pdf.setDrawColor(50, 50, 72);
  pdf.setLineWidth(0.25);
  pdf.line(MARGIN, pageH - 18, pageW - MARGIN, pageH - 18);

  onProgress?.(5);

  // ── 内容页 ──────────────────────────────────────────────────────────────────
  pdf.addPage();
  pdf.setFillColor(22, 22, 32);
  pdf.rect(0, 0, pageW, pageH, "F");

  let cursorY = MARGIN;

  const ensureSpace = (needed: number) => {
    if (cursorY + needed > pageH - MARGIN - FOOTER_H) {
      pdf.addPage();
      pdf.setFillColor(22, 22, 32);
      pdf.rect(0, 0, pageW, pageH, "F");
      cursorY = MARGIN;
    }
  };

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    onProgress?.(5 + Math.round(((i + 1) / elements.length) * 88));

    try {
      const restoreOklch = patchOklchForCanvas();
      let canvas;
      try {
        canvas = await html2canvas(el, {
          backgroundColor: "#161620",
          scale: 2,
          useCORS: true,
          logging: false,
          ignoreElements: (elem) => elem.hasAttribute("data-export-ignore"),
        });
      } finally {
        restoreOklch();
      }

      const imgWidthPx = canvas.width;
      const imgHeightPx = canvas.height;
      const imgWidthMm = CONTENT_W;
      const imgHeightMm = (imgHeightPx / imgWidthPx) * imgWidthMm;

      // 图片可能需要分页
      let srcY = 0;
      let remainPx = imgHeightPx;

      while (remainPx > 0) {
        const availMm = pageH - MARGIN - FOOTER_H - cursorY;
        const slicePx = Math.floor((availMm / imgWidthMm) * imgWidthPx);
        const actualPx = Math.min(slicePx, remainPx);
        const sliceMm = (actualPx / imgWidthPx) * imgWidthMm;

        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = imgWidthPx;
        sliceCanvas.height = actualPx;
        const ctx = sliceCanvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(canvas, 0, srcY, imgWidthPx, actualPx, 0, 0, imgWidthPx, actualPx);
          pdf.addImage(sliceCanvas.toDataURL("image/png"), "PNG", MARGIN, cursorY, imgWidthMm, sliceMm);
        }

        srcY += actualPx;
        remainPx -= actualPx;
        cursorY += sliceMm + 2;

        if (remainPx > 0) {
          pdf.addPage();
          pdf.setFillColor(22, 22, 32);
          pdf.rect(0, 0, pageW, pageH, "F");
          cursorY = MARGIN;
        }
      }

      // 消息间分隔线
      if (i < elements.length - 1) {
        ensureSpace(6);
        pdf.setDrawColor(45, 45, 65);
        pdf.setLineWidth(0.2);
        pdf.line(MARGIN, cursorY, pageW - MARGIN, cursorY);
        cursorY += 5;
      }
    } catch (err) {
      console.warn("[exportConversationAsPDF] 截图失败，跳过", err);
    }
  }

  // 为所有内容页添加页脚
  const totalPages = pdf.getNumberOfPages();
  for (let p = 2; p <= totalPages; p++) {
    pdf.setPage(p);
    pdf.setFontSize(7.5);
    pdf.setTextColor(75, 75, 100);
    pdf.text(`${p - 1} / ${totalPages - 1}`, pageW / 2, pageH - 4.5, { align: "center" });
    pdf.setDrawColor(45, 45, 65);
    pdf.setLineWidth(0.2);
    pdf.line(MARGIN, pageH - 8, pageW - MARGIN, pageH - 8);
  }

  onProgress?.(98);
  pdf.save(safeFilename(title || "投资分析报告", "pdf"));
  onProgress?.(100);
}

/** 导出整个对话（所有消息合并为 Markdown） */
export function exportConversationAsMarkdown(
  messages: Array<{ role: string; content: string; createdAt?: Date }>,
  title?: string
) {
  const header = `# ${title || "投资分析对话"}\n\n导出时间：${new Date().toLocaleString("zh-CN")}\n\n---\n\n`;
  const body = messages
    .filter(m => m.role !== "system")
    .map(m => {
      const roleLabel = m.role === "user" ? "**用户**" : "**顾问**";
      const time = m.createdAt ? `\n> ${new Date(m.createdAt).toLocaleString("zh-CN")}` : "";
      return `${roleLabel}${time}\n\n${m.content}`;
    })
    .join("\n\n---\n\n");
  downloadText(header + body, safeFilename(title || "投资对话", "md"), "text/markdown;charset=utf-8");
}
