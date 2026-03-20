/**
 * 消息导出工具
 * 支持 Markdown、纯文本、PDF 三种格式
 */

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
    .replace(/^#{1,6}\s+/gm, "")        // 标题
    .replace(/\*\*(.+?)\*\*/g, "$1")    // 粗体
    .replace(/\*(.+?)\*/g, "$1")        // 斜体
    .replace(/`{3}[\s\S]*?`{3}/g, (m) => m.replace(/```\w*\n?/g, "")) // 代码块
    .replace(/`(.+?)`/g, "$1")          // 行内代码
    .replace(/^>\s+/gm, "")             // 引用
    .replace(/^\s*[-*+]\s+/gm, "• ")   // 无序列表
    .replace(/^\s*\d+\.\s+/gm, "")     // 有序列表
    .replace(/\[(.+?)\]\(.+?\)/g, "$1") // 链接
    .replace(/!\[.*?\]\(.+?\)/g, "")    // 图片
    .replace(/\|.+\|/g, (m) => m.replace(/\|/g, "  ").trim()) // 表格
    .replace(/^[-|:]+$/gm, "")          // 表格分隔行
    .replace(/\n{3,}/g, "\n\n")         // 多余空行
    .trim();
  downloadText(plain, safeFilename(title || "投资分析", "txt"), "text/plain;charset=utf-8");
}

/** 导出为 PDF（使用 html2canvas + jsPDF） */
export async function exportAsPDF(element: HTMLElement, title?: string) {
  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#1e1e2e",
      logging: false,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth - 20; // 10mm margin each side
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let yPos = 10;
    let remainingHeight = imgHeight;

    // 分页处理
    while (remainingHeight > 0) {
      const sliceHeight = Math.min(remainingHeight, pageHeight - 20);
      const sourceY = (imgHeight - remainingHeight) * (canvas.height / imgHeight);
      const sourceH = sliceHeight * (canvas.height / imgHeight);

      // 裁剪当前页内容
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sourceH;
      const ctx = pageCanvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(canvas, 0, sourceY, canvas.width, sourceH, 0, 0, canvas.width, sourceH);
        const pageImg = pageCanvas.toDataURL("image/png");
        pdf.addImage(pageImg, "PNG", 10, yPos, imgWidth, sliceHeight);
      }

      remainingHeight -= sliceHeight;
      if (remainingHeight > 0) {
        pdf.addPage();
        yPos = 10;
      }
    }

    pdf.save(safeFilename(title || "投资分析", "pdf"));
  } catch (err) {
    console.error("[exportAsPDF] failed:", err);
    throw err;
  }
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
