import { Router, Request, Response } from "express";
import multer from "multer";
import { storagePut } from "./storage";
import { sdk } from "./_core/sdk";
import { insertAttachment } from "./db";
import { getFileCategory, extractFileContent } from "./fileProcessor";

const router = Router();

// 50MB limit, memory storage (we pipe directly to S3)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/", "video/", "audio/",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument",
      "text/",
    ];
    const ok = allowed.some(t => file.mimetype.startsWith(t));
    cb(null, ok);
  },
});

router.post("/api/upload", upload.single("file"), async (req: Request, res: Response) => {
  try {
    // Auth check
    const user = await sdk.authenticateRequest(req).catch(() => null);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "No file provided or file type not allowed" });
      return;
    }

    const { originalname, mimetype, buffer } = req.file;
    const conversationId = req.body.conversationId ? parseInt(req.body.conversationId, 10) : undefined;
    const ext = originalname.split(".").pop() || "bin";
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const fileKey = `uploads/${user.id}/${Date.now()}-${randomSuffix}.${ext}`;

    const { url: s3Url } = await storagePut(fileKey, buffer, mimetype);
    const fileCategory = getFileCategory(mimetype);

    // 异步提取文件内容（不阻塞响应）
    let extractedText: string | null = null;
    try {
      extractedText = await extractFileContent(buffer, mimetype, originalname, s3Url);
    } catch (e) {
      console.warn("[Upload] Content extraction failed:", e);
    }

    // 保存附件到数据库（获取attachmentId供后续AI分析使用）
    const attachmentId = await insertAttachment({
      userId: user.id,
      conversationId: conversationId ?? undefined,
      filename: originalname,
      mimeType: mimetype,
      size: buffer.length,
      s3Key: fileKey,
      s3Url,
      extractedText,
      fileCategory,
    }).catch(e => {
      console.warn("[Upload] DB insert failed:", e);
      return null;
    });

    res.json({
      url: s3Url,
      attachmentId,
      key: fileKey,
      name: originalname,
      size: buffer.length,
      type: mimetype,
      fileCategory,
      extractedText: extractedText ? extractedText.slice(0, 200) + "..." : null,
    });
  } catch (err: any) {
    console.error("[Upload] Error:", err);
    res.status(500).json({ error: err.message || "Upload failed" });
  }
});

export { router as uploadRouter };
