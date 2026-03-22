/**
 * 消息导出工具
 * 支持 Markdown、纯文本、单条 PDF、完整对话 PDF 四种格式
 */

/**
 * html2canvas 不支持现代 CSS 颜色函数（oklch/oklab/lch/lab/color()）。
 * 在截图前，将页面上所有不支持的颜色函数替换为等价 rgb()，
 * 截图完成后恢复原始样式，确保页面视觉不受影响。
 */

/** 将 oklch/oklab/lch/lab/color() 转换为近似 rgb */
function patchModernColors(css: string): string {
  // 处理 oklch(L C H / A)
  let result = css.replace(
    /oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/gi,
    (_m, l, c, h, a) => {
      const L = parseFloat(l) / (String(l).includes("%") ? 100 : 1);
      const C = parseFloat(c);
      const H = parseFloat(h);
      const alpha = a !== undefined ? parseFloat(a) / (String(a).includes("%") ? 100 : 1) : 1;
      return lchishToRgb(L, C, H, alpha);
    }
  );

  // 处理 oklab(L a b / A)
  result = result.replace(
    /oklab\(\s*([\d.]+%?)\s+([\d.e+-]+)\s+([\d.e+-]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/gi,
    (_m, l, _a2, _b2, a) => {
      const L = parseFloat(l) / (String(l).includes("%") ? 100 : 1);
      const alpha = a !== undefined ? parseFloat(a) / (String(a).includes("%") ? 100 : 1) : 1;
      // oklab: no hue, use lightness only
      const v = Math.round(Math.max(0, Math.min(1, L)) * 255);
      return alpha < 1 ? `rgba(${v},${v},${v},${alpha.toFixed(3)})` : `rgb(${v},${v},${v})`;
    }
  );

  // 处理 lch(L C H / A)
  result = result.replace(
    /lch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/gi,
    (_m, l, c, h, a) => {
      const L = parseFloat(l) / (String(l).includes("%") ? 100 : 1);
      const C = parseFloat(c);
      const H = parseFloat(h);
      const alpha = a !== undefined ? parseFloat(a) / (String(a).includes("%") ? 100 : 1) : 1;
      return lchishToRgb(L / 100, C / 150, H, alpha); // lch L is 0-100
    }
  );

  // 处理 lab(L a b / A)
  result = result.replace(
    /lab\(\s*([\d.]+%?)\s+([\d.e+-]+)\s+([\d.e+-]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/gi,
    (_m, l, _a2, _b2, a) => {
      const L = parseFloat(l) / (String(l).includes("%") ? 100 : 1);
      const alpha = a !== undefined ? parseFloat(a) / (String(a).includes("%") ? 100 : 1) : 1;
      const v = Math.round(Math.max(0, Math.min(1, L)) * 255);
      return alpha < 1 ? `rgba(${v},${v},${v},${alpha.toFixed(3)})` : `rgb(${v},${v},${v})`;
    }
  );

  // 处理 color(display-p3 R G B / A) 和 color(srgb R G B / A)
  result = result.replace(
    /color\(\s*(?:display-p3|srgb|srgb-linear|a98-rgb|prophoto-rgb)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/gi,
    (_m, r, g, b, a) => {
      const R = Math.round(Math.max(0, Math.min(1, parseFloat(r))) * 255);
      const G = Math.round(Math.max(0, Math.min(1, parseFloat(g))) * 255);
      const B = Math.round(Math.max(0, Math.min(1, parseFloat(b))) * 255);
      const alpha = a !== undefined ? parseFloat(a) / (String(a).includes("%") ? 100 : 1) : 1;
      return alpha < 1 ? `rgba(${R},${G},${B},${alpha.toFixed(3)})` : `rgb(${R},${G},${B})`;
    }
  );

  return result;
}

/** LCH-风格转 RGB（oklch/lch 共用） */
function lchishToRgb(L: number, C: number, H: number, alpha: number): string {
  const hDeg = H % 360;
  const lightness = Math.max(0, Math.min(1, L));
  const saturation = Math.max(0, Math.min(1, C / 0.4));
  const hslH = hDeg / 360;
  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
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
  return alpha < 1 ? `rgba(${r},${g},${b},${alpha.toFixed(3)})` : `rgb(${r},${g},${b})`;
}

/** 检测字符串是否包含任何现代颜色函数 */
function hasModernColor(s: string): boolean {
  return /oklch\(|oklab\(|\blch\(|\blab\(|color\(\s*(?:display-p3|srgb)/i.test(s);
}

/**
 * 在 html2canvas 的 onclone 回调中修复克隆 DOM 里的现代颜色函数。
 * onclone 是最可靠的方式：html2canvas 在克隆完成、解析前调用，
 * 此时修改克隆副本不会影响原始页面，也不会被 computedStyle 覆盖。
 */
function fixClonedDocColors(clonedDoc: Document): void {
  // 1. 修复所有 <style> 标签
  clonedDoc.querySelectorAll<HTMLStyleElement>("style").forEach((style) => {
    if (style.textContent && hasModernColor(style.textContent)) {
      style.textContent = patchModernColors(style.textContent);
    }
  });

  // 2. 修复所有 inline style 属性
  clonedDoc.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
    const val = el.getAttribute("style") || "";
    if (hasModernColor(val)) {
      el.setAttribute("style", patchModernColors(val));
    }
  });

  // 3. 修复 SVG 内联属性
  const svgAttrs = ["fill", "stroke", "stop-color", "flood-color", "lighting-color"];
  clonedDoc.querySelectorAll<SVGElement>("svg, svg *").forEach((el) => {
    svgAttrs.forEach((attr) => {
      const val = el.getAttribute(attr);
      if (val && hasModernColor(val)) {
        el.setAttribute(attr, patchModernColors(val));
      }
    });
  });

  // 4. 修复所有元素的 computedStyle 中可能包含现代颜色的 CSS 变量
  // 通过将常用的 CSS 变量覆写为 fallback 颜色
  const rootStyle = clonedDoc.documentElement.style;
  // 如果 :root 上有内联 style 包含现代颜色，一并修复
  const rootInline = clonedDoc.documentElement.getAttribute("style") || "";
  if (hasModernColor(rootInline)) {
    clonedDoc.documentElement.setAttribute("style", patchModernColors(rootInline));
  }
  void rootStyle; // suppress unused warning
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

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#161620",
      logging: false,
      ignoreElements: (el) => el.hasAttribute("data-export-ignore"),
      onclone: (_clonedDoc: Document) => { fixClonedDocColors(_clonedDoc); },
    });

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
      const canvas = await html2canvas(el, {
        backgroundColor: "#161620",
        scale: 2,
        useCORS: true,
        logging: false,
        ignoreElements: (elem) => elem.hasAttribute("data-export-ignore"),
        onclone: (_clonedDoc: Document) => { fixClonedDocColors(_clonedDoc); },
      });

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
