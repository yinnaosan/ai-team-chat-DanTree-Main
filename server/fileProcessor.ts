/**
 * 文件内容提取模块
 * 支持：PDF文本提取、图片视觉描述（LLM Vision）、音频转文字（Whisper）、文本文件直读
 */
import { invokeLLM } from "./_core/llm";
import { transcribeAudio } from "./_core/voiceTranscription";

export type FileCategory = "document" | "image" | "video" | "audio" | "other";

/** 根据 MIME 类型判断文件分类 */
export function getFileCategory(mimeType: string): FileCategory {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (
    mimeType === "application/pdf" ||
    mimeType === "text/plain" ||
    mimeType === "text/csv" ||
    mimeType === "text/markdown" ||
    mimeType.includes("word") ||
    mimeType.includes("excel") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("presentation") ||
    mimeType.includes("opendocument")
  ) return "document";
  return "other";
}

/** 格式化文件大小 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 从文件内容提取可供 AI 分析的文本
 * @param buffer  文件二进制内容
 * @param mimeType  MIME 类型
 * @param filename  原始文件名
 * @param s3Url  已上传到 S3 的公开 URL（图片/音频需要）
 */
export async function extractFileContent(
  buffer: Buffer,
  mimeType: string,
  filename: string,
  s3Url: string
): Promise<string> {
  const category = getFileCategory(mimeType);

  try {
    // ── 纯文本文件：直接读取 ──────────────────────────────────────────────────
    if (
      mimeType === "text/plain" ||
      mimeType === "text/csv" ||
      mimeType === "text/markdown"
    ) {
      const text = buffer.toString("utf-8").slice(0, 20000); // 最多2万字符
      return `[文件内容：${filename}]\n${text}`;
    }

    // ── 图片：使用 LLM Vision 描述 ────────────────────────────────────────────
    if (category === "image") {
      const response = await invokeLLM({
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "请详细描述这张图片的内容，包括所有可见的文字、数据、图表、表格等信息。如果是金融/投资相关图表，请提取所有数值和趋势。用中文回答。",
              },
              {
                type: "image_url",
                image_url: { url: s3Url, detail: "high" },
              },
            ],
          },
        ],
      });
      const desc = String(response.choices?.[0]?.message?.content || "图片内容无法识别");
      return `[图片文件：${filename}]\n${desc}`;
    }

    // ── 音频：Whisper 转文字 ──────────────────────────────────────────────────
    if (category === "audio") {
      const result = await transcribeAudio({
        audioUrl: s3Url,
        language: "zh",
        prompt: "金融投资分析讨论",
      });
      if ("error" in result) {
        return `[音频文件：${filename}]\n音频转文字失败：${result.error}`;
      }
      return `[音频文件：${filename}，时长：${result.duration?.toFixed(0) ?? "?"}秒]\n转录内容：\n${result.text}`;
    }

    // ── 视频：提取音轨转文字（通过 URL 直接传给 Whisper）─────────────────────
    if (category === "video") {
      const result = await transcribeAudio({
        audioUrl: s3Url,
        language: "zh",
        prompt: "视频内容转录",
      });
      if ("error" in result) {
        return `[视频文件：${filename}]\n视频音轨转文字失败：${result.error}`;
      }
      return `[视频文件：${filename}]\n视频音轨转录：\n${result.text}`;
    }

    // ── PDF：尝试提取文本（简单方法：读取可打印字符）─────────────────────────
    if (mimeType === "application/pdf") {
      // 提取 PDF 中的可读文本（简单启发式方法）
      const raw = buffer.toString("latin1");
      const textMatches = raw.match(/\(([^\)]{2,200})\)/g) || [];
      const extracted = textMatches
        .map(m => m.slice(1, -1).replace(/\\[0-9]{3}|\\[nrtf\\()]/g, " ").trim())
        .filter(t => t.length > 3 && /[\u4e00-\u9fa5a-zA-Z0-9]/.test(t))
        .join("\n")
        .slice(0, 15000);

      if (extracted.length > 100) {
        return `[PDF文件：${filename}]\n提取内容：\n${extracted}`;
      }
      // 如果提取失败，用 LLM Vision 处理 PDF 第一页（通过 URL）
      try {
        const response = await invokeLLM({
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "请提取并描述这个PDF文档的主要内容，包括所有文字、数据和表格。用中文回答。" },
                { type: "image_url", image_url: { url: s3Url, detail: "high" } },
              ],
            },
          ],
        });
        const desc = String(response.choices?.[0]?.message?.content || "PDF内容无法识别");
        return `[PDF文件：${filename}]\n${desc}`;
      } catch {
        return `[PDF文件：${filename}]\nPDF内容提取失败，请确保文件可读。`;
      }
    }

    // ── Word/Excel/其他文档：尝试 LLM Vision ─────────────────────────────────
    if (category === "document") {
      try {
        const response = await invokeLLM({
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: `请提取并描述这个文档（${filename}）的主要内容，包括所有文字、数据和表格。用中文回答。` },
                { type: "image_url", image_url: { url: s3Url, detail: "high" } },
              ],
            },
          ],
        });
        const desc = String(response.choices?.[0]?.message?.content || "文档内容无法识别");
        return `[文档文件：${filename}]\n${desc}`;
      } catch {
        return `[文档文件：${filename}]\n文档内容提取失败。`;
      }
    }

    return `[文件：${filename}（${mimeType}）]\n此文件类型暂不支持内容提取。`;
  } catch (err) {
    console.error("[FileProcessor] Extract error:", err);
    return `[文件：${filename}]\n内容提取时发生错误：${err instanceof Error ? err.message : String(err)}`;
  }
}
