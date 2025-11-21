import express from "express";
import { 
  generateArticle, 
  generateBlogTitle, 
  generateImage,  
  removeBackground, 
  removeObject, 
  reviewResume, 
  pdfSummarizer ,pdfChat,generateQr, extractTextFromImage ,compressResizeImage ,youtubeSummarizer , youtubeChat, generateExamQuestions , imageCaption,
} from "../controllers/aiController.js";
import { requireAuth } from "@clerk/express";
import { upload } from "../configs/multer.js";

const aiRouter = express.Router();
// const upload = multer({ dest: "uploads/" });
aiRouter.post("/generate-article", requireAuth(), generateArticle);
aiRouter.post("/generate-blog-title", requireAuth(), generateBlogTitle);
aiRouter.post("/generate-image", requireAuth(), generateImage);
aiRouter.post("/remove-background", upload.single('image'), requireAuth(), removeBackground);
aiRouter.post("/remove-object", upload.single('image'), requireAuth(), removeObject);

aiRouter.post("/resume-review", upload.single("resume"), requireAuth(), reviewResume);

// ✅ Fixed: use requireAuth() instead of undefined `auth`
aiRouter.post(
  "/summarize-pdf",
  requireAuth(),
  upload.single("pdf"),   // must match input name in React
  pdfSummarizer
);
aiRouter.post("/pdf-chat", requireAuth(), pdfChat);

aiRouter.post("/qr-generate", requireAuth(), generateQr);

aiRouter.post("/extract-text", upload.single("image"), requireAuth(), extractTextFromImage);

aiRouter.post(
    "/compress-resize-image",
    upload.single("image"),
    requireAuth(),
    compressResizeImage
);
aiRouter.post("/youtube-summary", requireAuth(), youtubeSummarizer);
aiRouter.post("/youtube-chat", requireAuth(), youtubeChat);
aiRouter.post("/exam-generator",requireAuth(), generateExamQuestions)
// at top: make sure `generateImageCaptions` is exported/imported from controller
aiRouter.post("/image-caption", upload.single("image"), requireAuth(), imageCaption);

export default aiRouter;
