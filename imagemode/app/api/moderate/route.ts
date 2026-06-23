import "@tensorflow/tfjs-node";
import * as tf from "@tensorflow/tfjs-node";
import * as nsfwjs from "nsfwjs";
import sharp from "sharp";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ModerateResponse {
  safe: boolean;
  scores: {
    porn: number;
    hentai: number;
    sexy: number;
  };
  predictions: nsfwjs.predictionType[];
}

interface ErrorResponse {
  error: string;
}

// ─── Model ───────────────────────────────────────────────────────────────────

const globalWithModel = global as typeof global & { nsfwModel?: nsfwjs.NSFWJS };

async function getModel(): Promise<nsfwjs.NSFWJS> {
  if (!globalWithModel.nsfwModel) {
    tf.enableProdMode();
    await tf.ready();
    const modelPath = `file://${path.join(process.cwd(), "public/models/mobilenet_v2/model.json")}`;
    globalWithModel.nsfwModel = await nsfwjs.load(modelPath);
  }
  return globalWithModel.nsfwModel;
}

// ─── CORS ────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean);

function corsHeaders(origin: string | null): HeadersInit {
  const allowed =
    ALLOWED_ORIGINS.length === 0 || (origin && ALLOWED_ORIGINS.includes(origin));
  return {
    "Access-Control-Allow-Origin": allowed && origin ? origin : "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

// ─── Auth ────────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const apiKey = process.env.MODERATION_API_KEY;
  if (!apiKey) return true; // no key configured = open
  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${apiKey}`;
}

// ─── Image loading ───────────────────────────────────────────────────────────

async function bufferFromRequest(req: NextRequest): Promise<Buffer> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const { url } = await req.json();
    if (!url || typeof url !== "string") throw new Error("Missing or invalid 'url' field");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch image from URL: ${res.statusText}`);
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.startsWith("image/")) throw new Error("URL did not return an image");
    return Buffer.from(await res.arrayBuffer());
  }

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("image");
    if (!(file instanceof File)) throw new Error("No image uploaded");
    if (!file.type.startsWith("image/")) throw new Error("Invalid file type");
    return Buffer.from(await file.arrayBuffer());
  }

  throw new Error("Unsupported content type — use multipart/form-data or application/json with a 'url' field");
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest
): Promise<NextResponse<ModerateResponse | ErrorResponse>> {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const buffer = await bufferFromRequest(req);
    const normalized = await sharp(buffer).toFormat("jpeg").toBuffer();
    const imageTensor = tf.node.decodeImage(normalized, 3) as tf.Tensor3D;

    const nsfwModel = await getModel();

    let predictions: nsfwjs.predictionType[];
    try {
      predictions = await nsfwModel.classify(imageTensor);
    } finally {
      imageTensor.dispose();
    }

    const pornScore   = predictions.find((p) => p.className === "Porn")?.probability ?? 0;
    const hentaiScore = predictions.find((p) => p.className === "Hentai")?.probability ?? 0;
    const sexyScore   = predictions.find((p) => p.className === "Sexy")?.probability ?? 0;

    const isNSFW =
      pornScore > 0.7 ||
      hentaiScore > 0.7 ||
      pornScore + hentaiScore + sexyScore > 0.9;

    return NextResponse.json(
      { safe: !isNSFW, scores: { porn: pornScore, hentai: hentaiScore, sexy: sexyScore }, predictions },
      { headers }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Moderation failed";
    const status = message.includes("Unauthorized") ? 401
      : message.includes("Invalid") || message.includes("No image") || message.includes("Missing") ? 400
      : 500;
    console.error("Moderation error:", error);
    return NextResponse.json({ error: message }, { status, headers });
  }
}