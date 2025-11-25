import OpenAI from "openai";
import sql from "../configs/db.js";
import { clerkClient, requireAuth } from "@clerk/express";
import axios from "axios";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import FormData from "form-data";
import * as pdfParse from "pdf-parse";
import PDFParser from "pdf2json";
import QRCode from "qrcode";
import { createWorker } from "tesseract.js";
import sharp from "sharp"; 
import { GoogleGenerativeAI } from "@google/generative-ai";

// if using ES modules
// import pkg from "youtube-transcript";
// import { getSubtitles } from "youtube-captions-scraper";
// const { getTranscript } = pkg;
// import ytdl from "ytdl-core";
// import ffmpeg from "fluent-ffmpeg";
// import ffmpegPath from "ffmpeg-static";
// const { YoutubeTranscript } = pkg;

// or
// const sharp = require("sharp"); // if using CommonJS


// import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

// import pdfParse from "pdf-parse/lib/pdf-parse.js";

// import pdf from "pdf-parse";

 // for PDF parsing in resume review

// ---------- Initialize AI ----------
const AI = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
// ---------- ARTICLE GENERATION ----------
export const generateArticle = async (req, res) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ success: false, message: "Prompt is required" });

    const response = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      { contents: [{ parts: [{ text: prompt }] }] },
      { headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY } }
    );

    const content = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response";

    await sql`
      INSERT INTO creations (user_id, prompt, content, type)
      VALUES (${userId}, ${prompt}, ${content}, 'article')
    `;

    res.json({ success: true, content });

  } catch (err) {
    console.error("Article generation error:", err);
    res.status(500).json({ success: false, message: "Failed to generate article" });
  }
};

// ---------- BLOG TITLE GENERATION ----------
export const generateBlogTitle = async (req, res) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const { topic } = req.body;
    if (!topic) return res.status(400).json({ success: false, message: "Topic is required" });

    const response = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      { contents: [{ parts: [{ text: `Generate 5 catchy blog titles about ${topic}` }] }] },
      { headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY } }
    );

    const content = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response";

    await sql`
      INSERT INTO creations (user_id, prompt, content, type)
      VALUES (${userId}, ${topic}, ${content}, 'blog-title')
    `;

    res.json({ success: true, content });

  } catch (err) {
    console.error("Blog title generation error:", err);
    res.status(500).json({ success: false, message: "Failed to generate blog titles" });
  }
};

// ---------- IMAGE GENERATION ----------
export const generateImage = async (req, res) => {
  try {
    const { userId } = req.auth();
    const { prompt } = req.body;

    const plan = req.plan;

    if (!prompt) {
      return res.json({ success: false, message: "Prompt is required" });
    }

    // premium-only
    if (plan !== "premium") {
      return res.json({
        success: false,
        message: "This feature is only available for premium subscriptions",
      });
    }

    const form = new FormData();
    form.append("prompt", prompt);

    const response = await axios.post(
      "https://clipdrop-api.co/text-to-image/v1",
      form,
      {
        headers: {
          ...form.getHeaders(),
          "x-api-key": process.env.CLIPDROP_API_KEY,
        },
        responseType: "arraybuffer",
      }
    );

    const tempFile = "temp.png";
    fs.writeFileSync(tempFile, response.data);

    const upload = await cloudinary.uploader.upload(tempFile, {
      folder: "ClaroAI",
    });

    fs.unlinkSync(tempFile);

    await sql`
      INSERT INTO creations (user_id, prompt, content, type)
      VALUES (${userId}, ${prompt}, ${upload.secure_url}, 'image')
    `;

    return res.json({ success: true, content: upload.secure_url });

  } catch (err) {
    console.error(err);
    return res.json({ success: false, message: err.message });
  }
};


// ---------- REMOVE BACKGROUND ----------
// ---------- REMOVE BACKGROUND ----------
export const removeBackground = async (req, res) => {
  try {
    const { userId } = req.auth();
    const file = req.file;

    const plan = req.plan; // ⭐ added

    // ⭐ PREMIUM CHECK
    if (plan !== "premium") {
      return res.json({
        success: false,
        message: "This feature is only available for premium subscriptions",
      });
    }

    if (!file) return res.status(400).json({ success: false, message: "Image file required" });

    // ensure file is read correctly as binary
    const buffer = fs.readFileSync(file.path);

    const form = new FormData();
    form.append("image_file", buffer, file.originalname);

    const response = await axios.post(
      "https://clipdrop-api.co/remove-background/v1",
      form,
      {
        headers: {
          "x-api-key": process.env.CLIPDROP_API_KEY,
          ...form.getHeaders(),
        },
        responseType: "arraybuffer"
      }
    );

    fs.writeFileSync("temp.png", response.data);

    const upload = await cloudinary.uploader.upload("temp.png", { folder: "ClaroAI", resource_type: "image" });
    fs.unlinkSync("temp.png");

    await sql`
      INSERT INTO creations (user_id, prompt, content, type)
      VALUES (${userId}, 'Removed background', ${upload.secure_url}, 'image-edit')
    `;

    res.json({ success: true, content: upload.secure_url });
  } catch (err) {
    console.error("Remove background error:", err.response?.data || err.message);
    res.status(500).json({ success: false, message: "Failed to remove background" });
  }
};


// ---------- REMOVE OBJECT ----------
export const removeObject = async (req, res) => {
  try {
    const { userId } = req.auth();
    const object = req.body.object;
    const image = req.file;

    const plan = req.plan; // ⭐ added

    // ⭐ PREMIUM CHECK
    if (plan !== "premium") {
      return res.json({
        success: false,
        message: "This feature is only available for premium subscriptions",
      });
    }

    if (!image)
      return res.status(400).json({ success: false, message: "Image required" });

    if (!object)
      return res.status(400).json({ success: false, message: "Object required" });

    const uploaded = await cloudinary.uploader.upload(image.path, {
      resource_type: "image",
    });

    const imageUrl = cloudinary.url(uploaded.public_id, {
      secure: true,
      resource_type: "image",
      transformation: [{ effect: `gen_remove:${object}` }],
    });

    await sql`
      INSERT INTO creations (user_id, prompt, content, type)
      VALUES (${userId}, ${`Removed ${object}`}, ${imageUrl}, 'image-edit')
    `;

    res.json({ success: true, content: imageUrl });

  } catch (error) {
    console.error("REMOVE OBJECT ERROR:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to remove object",
    });
  }
};



// ---------- REVIEW RESUME ----------


export const reviewResume = async (req, res) => {
  try {
    const { userId } = req.auth();

    const plan = req.plan; // ⭐ added

    // ⭐ PREMIUM CHECK
    if (plan !== "premium") {
      return res.json({
        success: false,
        message: "This feature is only available for premium subscriptions",
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Resume file is required"
      });
    }

    const pdfPath = req.file.path;
    const pdfParser = new PDFParser();

    pdfParser.loadPDF(pdfPath);

    pdfParser.on("pdfParser_dataError", (errData) => {
      console.error("PDF ERROR:", errData.parserError);
      return res.status(400).json({
        success: false,
        message: "Invalid PDF file"
      });
    });

    pdfParser.on("pdfParser_dataReady", async () => {
      // 1. Primary Extraction
      let extractedText = pdfParser.getRawTextContent()?.trim() || "";

      // 2. Fallback Extraction
      if (!extractedText || extractedText.length < 10) {
        try {
          extractedText = pdfParser.data.Pages
            .map(page =>
              page.Texts.map(t =>
                decodeURIComponent(t.R.map(r => r.T).join(" "))
              ).join(" ")
            )
            .join("\n\n");
        } catch (err) {
          console.log("Fallback extraction failed:", err.message);
        }
      }

      // 3. If STILL empty
      if (!extractedText || extractedText.length < 5) {
        return res.status(400).json({
          success: false,
          message: "Could not read resume text. Try another PDF."
        });
      }

      // 4. Prepare Gemini prompt
      const prompt = `
You are a professional HR resume reviewer. Analyze this resume text and give:

• Strengths  
• Weaknesses  
• Missing information  
• Formatting issues  
• Suggestions for improvement  
• Overall rating (out of 10)

Resume Text:
${extractedText}
      `;

      // 5. Gemini request
      const response = await axios.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        { contents: [{ parts: [{ text: prompt }] }] },
        {
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": process.env.GEMINI_API_KEY
          }
        }
      );

      const content =
        response.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "No response";

      // 6. Delete PDF
      fs.unlink(pdfPath, () => {});

      // 7. Return result
      return res.json({
        success: true,
        content
      });
    });

  } catch (error) {
    console.error("RESUME REVIEW ERROR:", error.response?.data || error.message);

    return res.status(500).json({
      success: false,
      message: "Error reviewing resume"
    });
  }
};








// store pdf text for each user
let pdfContext = {};

export const pdfSummarizer = async (req, res) => {
  try {
    console.log("===== PDF SUMMARIZER HIT =====");

    const { userId } = req.auth();
    const plan = req.plan; // ⭐ added

    // ⭐ PREMIUM CHECK
    if (plan !== "premium") {
      return res.json({
        success: false,
        message: "This feature is only available for premium subscriptions",
      });
    }

    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    if (!req.file)
      return res.status(400).json({ success: false, message: "No PDF uploaded" });

    const pdfPath = req.file.path;
    const pdfParser = new PDFParser();

    pdfParser.loadPDF(pdfPath);

    pdfParser.on("pdfParser_dataError", err => {
      console.error("PDF ERROR:", err.parserError);
      return res.status(400).json({
        success: false,
        message: "Invalid PDF file",
      });
    });

    pdfParser.on("pdfParser_dataReady", async () => {
      let extractedText = pdfParser.getRawTextContent()?.trim() || "";

      // fallback extraction
      if (!extractedText || extractedText.length < 10) {
        extractedText = pdfParser.data.Pages
          .map(page =>
            page.Texts.map(t =>
              decodeURIComponent(t.R.map(r => r.T).join(" "))
            ).join(" ")
          )
          .join("\n\n");
      }

      if (!extractedText || extractedText.length < 5) {
        return res.status(400).json({
          success: false,
          message: "Could not read PDF text. Try another file.",
        });
      }

      // store for chat
      pdfContext[userId] = extractedText;
      console.log("PDF CONTEXT SAVED FOR USER:", userId);

      const prompt = `
Summarize this PDF into simple bullet points:

${extractedText}
`;

      const response = await axios.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        {
          contents: [{ parts: [{ text: prompt }] }],
        },
        {
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": process.env.GEMINI_API_KEY,
          },
        }
      );

      const summary =
        response.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "No summary generated";

      return res.json({ success: true, content: summary });
    });

  } catch (err) {
    console.log("===== SUMMARIZER ERROR =====", err);
    res.status(500).json({ success: false, message: "Server error" });

  } finally {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
  }
};



export const pdfChat = async (req, res) => {
  try {
    const { userId } = req.auth();
    const { question } = req.body;
    const plan = req.plan; // ⭐ added

    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    // ⭐ PREMIUM CHECK
    if (plan !== "premium") {
      return res.json({
        success: false,
        message: "This feature is only available for premium subscriptions",
      });
    }

    if (!question?.trim())
      return res.json({
        success: false,
        message: "Please ask a question",
      });

    if (!pdfContext[userId]) {
      return res.json({
        success: false,
        message: "Please summarize a PDF first.",
      });
    }

    const prompt = `
Answer the user's question using ONLY the PDF content.

PDF CONTENT:
${pdfContext[userId]}

QUESTION: ${question}
`;

    const response = await AI.chat.completions.create({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      max_tokens: 800,
    });

    const answer =
      response.choices?.[0]?.message?.content || "No answer found";

    return res.json({ success: true, answer });

  } catch (err) {
    console.error("PDF CHAT ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

//QR generator
export const generateQr = async (req, res) => {
  try {
    const { userId } = req.auth();
    const plan = req.plan; // ⭐ added

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // ⭐ PREMIUM CHECK
    if (plan !== "premium") {
      return res.json({
        success: false,
        message: "This feature is only available for premium subscriptions",
      });
    }

    const { 
      text, 
      size = 512, 
      margin = 2, 
      errorCorrectionLevel = "M", 
      format = "png", 
      darkColor = "#000", 
      lightColor = "#fff" 
    } = req.body;

    if (!text?.trim()) {
      return res.json({ success: false, message: "Text required" });
    }

    const options = {
      errorCorrectionLevel: ["L","M","Q","H"].includes(errorCorrectionLevel) ? errorCorrectionLevel : "M",
      width: Math.max(128, Math.min(1024, parseInt(size))),
      margin: Math.max(0, Math.min(10, parseInt(margin))),
      color: { dark: darkColor, light: lightColor }
    };

    if (format === "png") {
      const pngBuffer = await QRCode.toBuffer(text, options);
      const dataUrl = `data:image/png;base64,${pngBuffer.toString("base64")}`;
      return res.json({ success: true, format: "png", dataUrl });
    } else {
      const svg = await QRCode.toString(text, { ...options, type: "svg" });
      return res.json({ success: true, format: "svg", svg });
    }

  } catch (err) {
    console.error("QR generation error:", err);
    return res.json({ success: false, message: err.message });
  }
};

//TextToImage
export const extractTextFromImage = async (req, res) => {
  try {
    const { userId } = req.auth();
    const plan = req.plan; // ⭐ added

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // ⭐ PREMIUM CHECK
    if (plan !== "premium") {
      return res.json({
        success: false,
        message: "This feature is only available for premium subscriptions",
      });
    }

    const image = req.file;

    if (!image) {
      return res.json({ success: false, message: "No image uploaded" });
    }

    const tessdataPath = "./tessdata";

    const worker = Tesseract.createWorker({
      langPath: tessdataPath,
      logger: () => {},
    });

    await worker.load();
    await worker.loadLanguage("eng");
    await worker.initialize("eng");

    const { data } = await worker.recognize(image.path);

    await worker.terminate();

    await sql`
      INSERT INTO creations (user_id, prompt, content, type)
      VALUES (${userId}, 'Extracted text from image', ${data.text}, 'text')
    `;

    fs.unlinkSync(image.path);

    res.json({ success: true, content: data.text });

  } catch (error) {
    console.error("OCR Error:", error);
    res.json({ success: false, message: error.message });
  }
};

export const compressResizeImage = async (req, res) => {
  try {
    const { userId } = req.auth();
    const plan = req.plan; // ⭐ added

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // ⭐ PREMIUM CHECK
    if (plan !== "premium") {
      return res.json({
        success: false,
        message: "This feature is only available for premium subscriptions",
      });
    }

    const { width, height, quality, format } = req.body;
    const image = req.file;

    if (!image) {
      return res.json({ success: false, message: "No image uploaded" });
    }

    let transformer = sharp(image.path);
    transformer = transformer.rotate();

    // Resize if width/height given
    if (width || height) {
      transformer = transformer.resize(
        width ? parseInt(width) : null,
        height ? parseInt(height) : null,
        { fit: "inside", withoutEnlargement: true }
      );
    }

    // Ensure format
    let outputFormat = format ? format.toLowerCase() : "jpeg";
    let processedBuffer;

    if (outputFormat === "jpeg" || outputFormat === "jpg") {
      processedBuffer = await transformer
        .jpeg({ quality: parseInt(quality) || 80, mozjpeg: true })
        .toBuffer();
      outputFormat = "jpg";
    } else if (outputFormat === "png") {
      processedBuffer = await transformer
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer();
    } else if (outputFormat === "webp") {
      processedBuffer = await transformer
        .webp({ quality: parseInt(quality) || 80 })
        .toBuffer();
    } else {
      processedBuffer = await transformer.toBuffer();
    }

    // Upload buffer directly to Cloudinary
    const uploaded = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: "image", format: outputFormat },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(processedBuffer);
    });

    // Save in DB
    await sql`
      INSERT INTO creations (user_id, prompt, content, type)
      VALUES (${userId}, ${"Compressed/Resized image"}, ${uploaded.secure_url}, 'image')
    `;

    res.json({ success: true, content: uploaded.secure_url });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: error.message });
  }
};



const YT_API = "https://www.googleapis.com/youtube/v3";
const YT_KEY = process.env.YT_API_KEY;
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const GEMINI_KEY = process.env.GEMINI_API_KEY;
// ---- Helper: extract video ID from URL ----

// transient contexts

let ytContext = {};
// safe auth getter: supports req.auth object or req.auth() function
function getAuth(req) {
  try {
    if (typeof req.auth === "function") return req.auth() || {};
    return req.auth || {};
  } catch {
    return {};
  }
}

// extract video id robustly
function extractVideoId(urlOrId) {
  try {
    // if user passed ID directly
    if (!urlOrId.includes("http")) return urlOrId;
    const u = new URL(urlOrId);
    if (u.hostname === "youtu.be") return u.pathname.slice(1);
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "shorts" || parts[0] === "embed") return parts[1] || parts.pop();
    return parts[parts.length - 1];
  } catch {
    return urlOrId;
  }
}

// fetch video metadata + top comments fallback
async function fetchVideoMetadata(videoId) {
  if (!YT_KEY) throw new Error("Server missing YT_API_KEY");
  const { data } = await axios.get(`${YT_API}/videos`, {
    params: {
      id: videoId,
      part: "snippet,contentDetails,statistics",
      key: YT_KEY,
    },
  });
  if (!data.items?.length) throw new Error("Video not found");
  const meta = data.items[0];

  // try fetch comments (best-effort)
  let comments = [];
  try {
    const c = await axios.get(`${YT_API}/commentThreads`, {
      params: {
        videoId,
        part: "snippet",
        maxResults: 20,
        order: "relevance",
        key: YT_KEY,
      },
    });
    comments =
      c.data.items
        ?.map(
          (it) =>
            it.snippet?.topLevelComment?.snippet?.textDisplay
              ?.replace(/<\/?[^>]+(>|$)/g, "")
              .trim()
        )
        .filter(Boolean) || [];
  } catch (e) {
    // ignore - comments are optional
  }

  return { meta, comments, source: "youtube-data-api" };
}

// build context string from metadata (this is what working repo used — reliable)
function buildYouTubeContextFromMeta(meta, comments = []) {
  const title = meta.snippet?.title || "";
  const description = meta.snippet?.description || "";
  const channel = meta.snippet?.channelTitle || "";
  const tags = meta.snippet?.tags?.slice(0, 15) || [];
  const durationIso = meta.contentDetails?.duration || "";
  const stats = meta.statistics || {};
  const publishedAt = meta.snippet?.publishedAt || "";

  const durationReadable = (() => {
    if (!durationIso) return "";
    const h = /(\d+)H/.exec(durationIso)?.[1];
    const m = /(\d+)M/.exec(durationIso)?.[1];
    const s = /(\d+)S/.exec(durationIso)?.[1];
    return [h ? `${h}h` : "", m ? `${m}m` : "", s ? `${s}s` : ""].filter(Boolean).join(" ");
  })();

  let text = `Video Title: ${title}
Channel: ${channel}
Duration: ${durationReadable}
Published: ${publishedAt}
Views: ${stats.viewCount || "—"}, Likes: ${stats.likeCount || "—"}, Comments: ${stats.commentCount || "—"}
Tags: ${tags.join(", ") || "—"}

Description:
${description || "No description available."}`;

  if (comments.length) {
    text += `

Top Comments:
- ${comments.join("\n- ")}`;
  }

  return text;
}

// chunk text
function chunkText(text, size = 6000) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

function detailToInstructions(detail) {
  switch (detail) {
    case "short":
      return "Create ~5 crisp bullet points. Keep <120 words total.";
    case "medium":
      return "Create 8–12 bullet points with key ideas, numbers, and action items.";
    case "detailed":
      return "Write a structured outline with sections & sub-bullets, include examples. 300–600 words.";
    default:
      return "Create 8–12 bullet points.";
  }
}

// call Gemini (Generative Language) via axios
async function callGemini(prompt, max_tokens = 800, temperature = 0.5) {
  if (!GEMINI_KEY) throw new Error("Server missing GEMINI_API_KEY");
  const body = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
  };
  const resp = await axios.post(GEMINI_URL, body, {
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_KEY,
    },
    timeout: 120000,
  });
  const text = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return text || "";
}

// map-reduce summarizer using Gemini
async function summarizeTranscriptLong(transcript, detail = "medium") {
  const chunks = chunkText(transcript, 7000);
  const partials = [];

  for (const [idx, chunk] of chunks.entries()) {
    const stepPrompt = `You are a precise note-maker.
Chunk ${idx + 1}/${chunks.length} of YouTube metadata is below.
Summarize ONLY this chunk into sharp bullet notes. Avoid repetition.

Chunk:
"""
${chunk}
"""
Return bullets only.`;
    const partial = await callGemini(stepPrompt, 800, 0.5);
    partials.push(partial || "");
  }

  const combinePrompt = `You are combining notes into a final YouTube video summary.
${detailToInstructions(detail)}

Chunk notes:
${partials.join("\n\n---\n\n")}

Final summary:`;
  const final = await callGemini(combinePrompt, 1200, 0.5);
  return final || "No summary generated";
}

// ------------------ Controllers ------------------

// generateArticle etc. left unchanged if you already have them (omitted here for brevity).
// ... (keep your other controllers as-is) ...
// For this answer I'll include only the YouTube-related controllers (so it's clear and focused).

// POST /api/ai/youtube-summary
export const youtubeSummarizer = async (req, res) => {
  try {
    const auth = getAuth(req);
    const userId = auth.userId;

    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const plan = req.plan ?? auth.plan; // ⭐ added

    // ⭐ PREMIUM CHECK
    if (plan !== "premium") {
      return res.json({
        success: false,
        message: "This feature is only available for premium subscriptions",
      });
    }

    // accept either "url" or "link" or "videoId"
    const { url, link, videoId: vidFromBody, detail = "medium" } = req.body;
    const raw = url || link || vidFromBody;
    if (!raw) return res.json({ success: false, message: "Missing URL/videoId" });

    const vId = extractVideoId(raw);
    console.log("YT summarizer: videoId =", vId);

    const { meta, comments, source } =
      await fetchVideoMetadata(vId)
        .then((r) => ({
          meta: r.meta || r,
          comments: r.comments || [],
          source: "youtube-data-api",
        }))
        .catch(async (err) => {
          console.error("YT metadata fetch failed:", err.message || err);
          try {
            const htmlResp = await axios.get(
              `https://www.youtube.com/watch?v=${vId}`,
              { timeout: 10000 }
            );
            return {
              meta: {
                snippet: {
                  title: `YouTube page ${vId}`,
                  description: htmlResp.data.slice(0, 2000),
                },
              },
              comments: [],
              source: "youtube-page",
            };
          } catch (e) {
            throw new Error("Failed to fetch video metadata");
          }
        });

    const text = buildYouTubeContextFromMeta(meta, comments);

    ytContext[userId] = text;

    const content = await summarizeTranscriptLong(text, detail);

    // Save to DB (try but do not break)
    try {
      await sql`
        INSERT INTO creations (user_id, prompt, content, type)
        VALUES (${userId}, ${vId + " | " + detail}, ${content}, 'youtube-summary')
      `;
    } catch (dbErr) {
      console.warn("Failed to save creation:", dbErr.message || dbErr);
    }

    res.json({ success: true, content, used: source });
  } catch (err) {
    console.error("YT Summary Error:", err.message || err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to summarize video",
    });
  }
};


// POST /api/ai/youtube-chat
export const youtubeChat = async (req, res) => {
  try {
    const auth = getAuth(req);
    const userId = auth.userId;

    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const plan = req.plan ?? auth.plan; // ⭐ added

    // ⭐ PREMIUM CHECK
    if (plan !== "premium") {
      return res.json({
        success: false,
        message: "This feature is only available for premium subscriptions",
      });
    }

    const { question, message } = req.body;
    const q = (question || message || "").trim();

    if (!q)
      return res.json({ success: false, message: "Please provide a question" });

    const transcript = ytContext[userId];
    if (!transcript) {
      return res.json({
        success: false,
        message: "Please summarize a video first.",
      });
    }

    const prompt = `
You are a helpful assistant that answers strictly from the given YouTube metadata (title, description, tags, stats, and top comments).
If an answer is not found in metadata, say so.

Metadata:
"""
${transcript}
"""

User question: "${q}"
Answer clearly and concisely.`;

    const rText = await callGemini(prompt, 900, 0.4);
    const answer = rText || "No answer found";

    try {
      await sql`
        INSERT INTO creations (user_id, prompt, content, type)
        VALUES (${userId}, ${q}, ${answer}, 'youtube-chat')
      `;
    } catch (dbErr) {
      console.warn("Failed to save chat creation:", dbErr.message || dbErr);
    }

    res.json({ success: true, answer });
  } catch (err) {
    console.error("YT Chat Error:", err.message || err);
    res.status(500).json({
      success: false,
      message: err.message || "Chat failed",
    });
  }
};



// ---------- EXAM QUESTION GENERATOR ----------
export const generateExamQuestions = async (req, res) => {
  try {
    const { userId } = req.auth();
    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    // ⭐ PREMIUM CHECK
    const plan = req.plan;
    if (plan !== "premium") {
      return res.json({
        success: false,
        message: "This feature is only available for premium subscriptions",
      });
    }

    const { topic, longCount, sortCount, mcqCount, difficulty } = req.body;

    if (!topic)
      return res.status(400).json({
        success: false,
        message: "Topic is required",
      });

    const prompt = `
Generate exam questions for topic "${topic}".
Difficulty: ${difficulty}

Long Questions: ${longCount}
Short Questions: ${sortCount}
MCQs: ${mcqCount}

Return ONLY JSON in this format:
{
  "long": [{ "id": 1, "q": "..." }],
  "sort": [{ "id": 1, "q": "..." }],
  "mcq": [
    {
      "id": 1,
      "q": "...",
      "options": ["A","B","C","D"],
      "answer": "A"
    }
  ],
  "LQ_version": "Long questions explanation here...",
  "SQ_version": "Short questions explanation here..."
}
`;

    const response = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      {
        contents: [{ parts: [{ text: prompt }] }],
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
      }
    );

    const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!raw)
      return res.json({
        success: false,
        message: "AI didn't return a response",
      });

    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}") + 1;

    const jsonString = raw.slice(start, end);

    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (err) {
      console.log("JSON Parse Error:", jsonString);
      return res.json({
        success: false,
        message: "Failed to parse AI response",
      });
    }

    const lq =
      typeof parsed.LQ_version === "object"
        ? Object.values(parsed.LQ_version).join("\n\n")
        : parsed.LQ_version || "";

    const sq =
      typeof parsed.SQ_version === "object"
        ? Object.values(parsed.SQ_version).join("\n\n")
        : parsed.SQ_version || "";

    await sql`
      INSERT INTO creations (user_id, prompt, content, type)
      VALUES (${userId}, ${topic}, ${JSON.stringify(parsed)}, 'exam-generator')
    `;

    return res.json({
      success: true,
      content: parsed,
      lq,
      sq,
    });
  } catch (err) {
    console.error("Exam generator error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to generate exam questions",
    });
  }
};

//Caption generator
export const imageCaption = async (req, res) => {
  try {
    const { userId } = req.auth();
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // ⭐ PREMIUM CHECK
    const plan = req.plan;
    if (plan !== "premium") {
      return res.json({
        success: false,
        message: "This feature is only available for premium subscriptions",
      });
    }

    if (!req.file) {
      return res.json({ success: false, message: "No image uploaded" });
    }

    // convert file to base64
    const imgBase64 = fs.readFileSync(req.file.path, { encoding: "base64" });
    const mimeType = req.file.mimetype;
    const filePath = req.file.path;

    // upload to cloudinary
    const uploaded = await cloudinary.uploader.upload(filePath, {
      folder: "ClaroAI",
      resource_type: "image",
    });

    fs.unlinkSync(filePath);

    const { length } = req.body;

    const STYLES = [
      "Bold", "Sassy", "Gen-Z", "Poetic", "Classy", "Emotional",
      "Minimal", "Funny", "Aesthetic", "Formal", "Filmy",
      "Cute", "Travel vibe", "Tech vibe"
    ];

    // 1) GET SHORT DESCRIPTION USING VISION
    const visionPrompt = {
      contents: [
        {
          parts: [
            { text: "Describe this image in 2-3 lines, realistic description only." },
            {
              inline_data: {
                mime_type: mimeType,
                data: imgBase64
              }
            }
          ]
        }
      ]
    };

    let descRes = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      visionPrompt,
      {
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY
        }
      }
    );

    const description =
      descRes.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "A person in a photo";

    console.log("DESCRIPTION:", description);

    // 2) USE DESCRIPTION TO GENERATE CAPTIONS FOR ALL STYLES
    const captionPrompt = `
You are an expert social media caption writer.

Image Description:
${description}

Length: ${length}

Generate captions for all these styles:
${STYLES.join(", ")}

Return STRICT JSON:
{
 "Bold": "caption here",
 "Sassy": "caption here",
 "Gen-Z": "caption here",
 ...
}
`;

    const capBody = {
      contents: [
        { parts: [{ text: captionPrompt }] }
      ]
    };

    let capRes = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      capBody,
      {
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY
        }
      }
    );

    const raw = capRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;

    const jsonStr = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);

    let captions;
    try {
      captions = JSON.parse(jsonStr);
    } catch (err) {
      console.log("JSON FAIL:", raw);
      return res.json({ success: false, message: "JSON parse failed" });
    }

    return res.json({
      success: true,
      imageUrl: uploaded.secure_url,
      captions
    });

  } catch (err) {
    console.error("CAPTION ERROR:", err);
    return res.json({ success: false, message: err.message });
  }
};


// Mock Interview
export const interviewSimulator = async (req, res) => {
  try {
    const { userId } = req.auth();
    const { role, difficulty, answer } = req.body;

    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    // ⭐ PREMIUM CHECK
    const plan = req.plan;
    if (plan !== "premium") {
      return res.json({
        success: false,
        message: "This feature is only available for premium subscriptions",
      });
    }

    // First question — no answer yet
    if (!answer) {
      const prompt = `
You are an AI Interviewer.
Conduct a mock interview.

Job Role: ${role}
Difficulty: ${difficulty}

Give:
1. One strong interview question
2. Why you asked it
3. How candidate should ideally answer  
Keep it short.
`;

      const response = await axios.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        {
          contents: [{ parts: [{ text: prompt }] }],
        },
        {
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": process.env.GEMINI_API_KEY,
          },
        }
      );

      const question =
        response.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "No question generated";

      return res.json({ success: true, type: "question", message: question });
    }

    // If user answered → evaluate answer
    const feedbackPrompt = `
You are an AI interviewer.  
Here is the candidate's answer — evaluate it.

Role: ${role}
Difficulty: ${difficulty}

Candidate Answer:
${answer}

Give:
• Feedback (short)
• What was good  
• What was weak  
• Score out of 10  
• Ask ONE follow-up question  
Keep it short.
`;

    const feedbackRes = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      {
        contents: [{ parts: [{ text: feedbackPrompt }] }],
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
      }
    );

    const feedback =
      feedbackRes.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No feedback generated";

    return res.json({ success: true, type: "feedback", message: feedback });

  } catch (err) {
    console.error("INTERVIEW ERROR:", err);
    return res.json({ success: false, message: err.message });
  }
};


//ppt generator
// ---------- PPT / PRESENTATION GENERATOR ----------
export const generatePresentation = async (req, res) => {
  try {
    const { userId } = req.auth();
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // ⭐ PREMIUM CHECK
    const plan = req.plan;
    if (plan !== "premium") {
      return res.json({
        success: false,
        message: "This feature is only available for premium subscriptions",
      });
    }

    const { topic, slideCount = 8, detail = "normal" } = req.body;

    if (!topic?.trim()) {
      return res.json({
        success: false,
        message: "Topic is required",
      });
    }

    const slidesNum = Math.max(3, Math.min(20, parseInt(slideCount) || 8));

    const detailText =
      detail === "short"
        ? "very concise bullet points, 3–4 bullets per slide"
        : detail === "detailed"
        ? "detailed bullet points, 5–7 bullets per slide"
        : "clear bullet points, 4–5 bullets per slide";

    const prompt = `
You are a senior presentation designer and subject expert.

Create a slide deck outline for the topic:
"${topic}"

- Number of slides: ${slidesNum}
- Style: corporate, clean, easy to scan
- For each slide, include:
  - "title": short slide title
  - "bullets": array of bullet points (no more than 2 lines each)
Return ONLY valid JSON.

Details: ${detailText}
`;

    const response = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      {
        contents: [{ parts: [{ text: prompt }] }],
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
      }
    );

    const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) {
      return res.json({
        success: false,
        message: "AI did not return a response",
      });
    }

    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}") + 1;
    const jsonString = raw.slice(start, end);

    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (err) {
      console.error("PPT JSON Parse Error:", jsonString);
      return res.json({
        success: false,
        message: "Failed to parse AI response",
      });
    }

    const slides = Array.isArray(parsed.slides) ? parsed.slides : [];

    const safeSlides = slides.map((s, idx) => ({
      title: String(s.title || `Slide ${idx + 1}`),
      bullets: Array.isArray(s.bullets)
        ? s.bullets.map((b) => String(b))
        : [],
    }));

    await sql`
      INSERT INTO creations (user_id, prompt, content, type)
      VALUES (${userId}, ${topic}, ${JSON.stringify({ slides: safeSlides })}, 'ppt-generator')
    `;

    return res.json({
      success: true,
      slides: safeSlides,
    });
  } catch (err) {
    console.error("PPT generator error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to generate presentation",
    });
  }
};

// ---------- AI RESUME BUILDER ----------
// ---------- AI RESUME GENERATOR ----------
export const generateResume = async (req, res) => {
  try {
    const { userId } = req.auth();
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const {
      fullName,
      jobTitle,
      email,
      phone,
      location,
      experienceLevel,
      experienceYears,
      skills,
      techStack,
      projects,
      education,
      extras,
    } = req.body;

    if (!fullName || !jobTitle || !email) {
      return res.json({
        success: false,
        message: "Name, job title & email are required",
      });
    }

    const prompt = `
You are a top 1% resume writer. Create a **one-page, ATS-friendly resume** for this user.

User Info:
- Full Name: ${fullName}
- Target Role / Headline: ${jobTitle}
- Email: ${email}
- Phone: ${phone || "N/A"}
- Location: ${location || "N/A"}
- Experience level: ${experienceLevel || "Not specified"}
- Years of experience: ${experienceYears || "N/A"}
- Skills: ${skills || "N/A"}
- Tech stack: ${techStack || "N/A"}
- Projects: ${projects || "N/A"}
- Education: ${education || "N/A"}
- Extra details (certifications, achievements, links): ${extras || "N/A"}

Rules:
- Keep it **one page** worth of content.
- Use **bullet points** with strong action verbs.
- Make it **ATS-friendly** (no tables, no columns).
- Use clear section headings: SUMMARY, SKILLS, EXPERIENCE, PROJECTS, EDUCATION, EXTRA.

Return STRICT JSON only in this shape:

{
  "markdown": "### full resume in markdown here...",
  "sections": {
    "summary": "short professional summary...",
    "skills": {
      "primary": ["Skill 1", "Skill 2"],
      "secondary": ["Skill 3", "Skill 4"]
    },
    "experience": [
      {
        "role": "Job Title",
        "company": "Company Name",
        "location": "City, Country",
        "start": "Jan 2022",
        "end": "Present",
        "points": [
          "Bullet point 1",
          "Bullet point 2"
        ]
      }
    ],
    "projects": [
      {
        "name": "Project Name",
        "tech": ["React", "Node.js"],
        "link": "https://...",
        "points": [
          "What you built / impact",
          "What stack / results"
        ]
      }
    ],
    "education": [
      {
        "degree": "BCA",
        "school": "College Name",
        "year": "2025",
        "extra": "CGPA / Highlights"
      }
    ],
    "extras": [
      "Certifications, hackathons, achievements..."
    ]
  }
}
`;

    // use your existing Gemini helper if you have it
    const raw = await callGemini(prompt, 1800, 0.5); // uses GEMINI_KEY etc

    if (!raw) {
      return res.json({
        success: false,
        message: "AI did not return a response",
      });
    }

    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}") + 1;
    if (start === -1 || end === 0) {
      console.log("RAW RESUME RESPONSE:", raw);
      return res.json({
        success: false,
        message: "Failed to parse AI response",
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(raw.slice(start, end));
    } catch (err) {
      console.log("RESUME JSON PARSE ERROR:", raw);
      return res.json({
        success: false,
        message: "Failed to parse AI JSON",
      });
    }

    const markdown = parsed.markdown || "";
    const sections = parsed.sections || null;

    // optional: save in DB
    try {
      await sql`
        INSERT INTO creations (user_id, prompt, content, type)
        VALUES (${userId}, ${jobTitle}, ${JSON.stringify(parsed)}, 'ai-resume')
      `;
    } catch (dbErr) {
      console.warn("Failed to save resume:", dbErr.message || dbErr);
    }

    return res.json({
      success: true,
      markdown,
      sections,
    });
  } catch (err) {
    console.error("RESUME GENERATOR ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to generate resume",
    });
  }
};

