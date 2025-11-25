import express from "express";
import { requireAuth } from "@clerk/express";
import { auth } from "../middlewares/auth.js";
import { upload } from "../configs/multer.js";

import {
  generateArticle,
  generateBlogTitle,
  generateImage,
  removeBackground,
  removeObject,
  reviewResume,
  pdfSummarizer,
  pdfChat,
  generateQr,
  extractTextFromImage,
  compressResizeImage,
  youtubeSummarizer,
  youtubeChat,
  generateExamQuestions,
  imageCaption,
  interviewSimulator,
  generatePresentation,
    generateResume,
} from "../controllers/aiController.js";

const aiRouter = express.Router();

// ALWAYS USE THIS ORDER 👇
// requireAuth() → your custom auth → controller

aiRouter.post("/generate-article", requireAuth(), auth, generateArticle);
aiRouter.post("/generate-blog-title", requireAuth(), auth, generateBlogTitle);
aiRouter.post("/generate-image", requireAuth(), auth, generateImage);

aiRouter.post("/remove-background",
  upload.single("image"),
  requireAuth(),
  auth,
  removeBackground
);

aiRouter.post("/remove-object",
  upload.single("image"),
  requireAuth(),
  auth,
  removeObject
);

aiRouter.post("/resume-review",
  upload.single("resume"),
  requireAuth(),
  auth,
  reviewResume
);

aiRouter.post("/summarize-pdf",
  upload.single("pdf"),
  requireAuth(),
  auth,
  pdfSummarizer
);

aiRouter.post("/pdf-chat", requireAuth(), auth, pdfChat);

aiRouter.post("/qr-generate", requireAuth(), auth, generateQr);

aiRouter.post("/extract-text",
  upload.single("image"),
  requireAuth(),
  auth,
  extractTextFromImage
);

aiRouter.post("/compress-resize-image",
  upload.single("image"),
  requireAuth(),
  auth,
  compressResizeImage
);

aiRouter.post("/youtube-summary", requireAuth(), auth, youtubeSummarizer);

aiRouter.post("/youtube-chat", requireAuth(), auth, youtubeChat);

aiRouter.post("/exam-generator", requireAuth(), auth, generateExamQuestions);

aiRouter.post("/image-caption",
  upload.single("image"),
  requireAuth(),
  auth,
  imageCaption
);
aiRouter.post("/interview", requireAuth(), auth, interviewSimulator);
aiRouter.post("/ppt-generate", requireAuth(), auth, generatePresentation);
aiRouter.post("/generate-resume", requireAuth(), auth, generateResume);
export default aiRouter;
