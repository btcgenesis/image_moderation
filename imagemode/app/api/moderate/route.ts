import * as tf from "@tensorflow/tfjs";
import { setWasmPaths } from "@tensorflow/tfjs-backend-wasm";
import "@tensorflow/tfjs-backend-wasm";
import * as nsfwjs from "nsfwjs";
import sharp from "sharp";
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

interface ModerateResponse {
  safe: boolean;
  scores: { porn: number; hentai: number; sexy: number };
  predictions: nsfwjs.predictionType[];
}

interface ErrorResponse {
  error: string;
}

const globalWithModel = global as typeof global & {
  nsfwModel?: nsfwjs.NSFWJS;
  tfReady?: boolean;
};

async function getModel(): Promise<nsfwjs.NSFWJS> {
  if (!globalWithModel.tfReady) {
    tf.enableProdMode();
    const wasmDir = path.join(process.cwd(), "public/wasm/");
    setWasmPaths(`file://${wasmDir}`);
    await tf.setBackend("wasm");
    await tf.ready();
    globalWithModel.tfReady = true;
  }

  if (!globalWithModel.nsfwModel) {
    const modelJsonPath = path.join(process.cwd(), "public/models/mobilenet_v2/model.json");
    const modelJson = JSON.parse(fs.readFileSync(modelJsonPath, "utf-8"));
    const modelDir = path.dirname(modelJsonPath);

    const weightData = modelJson.weightsManifest
      .flatMap((group: any) => group.paths)
      .map((p: string) => fs.readFileSync(path.join(modelDir, p)));

    const concatenated = Buffer.concat(weightData);

    const modelArtifacts: tf.io.ModelArtifacts = {
      modelTopology: modelJson.modelTopology,
      weightSpecs: modelJson.weightsManifest.flatMap((g: any) => g.weights),
      weightData: concatenated.buffer.slice(
        concatenated.byteOffset,
        concatenated.byteOffset + concatenated.byteLength
      ),
      format: modelJson.format,
      generatedBy: modelJson.generatedBy,
      convertedBy: modelJson.convertedBy,
    };

    const ioHandler: { load: () => Promise<tf.io.ModelArtifacts> } = {
      load: async () => modelArtifacts,
    };

    globalWithModel.nsfwModel = new nsfwjs.NSFWJS(ioHandler, { size: 224 });
    await globalWithModel.nsfwModel.load();
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
  if (!apiKey) return true;
  return req.headers.get("authorization") === `Bearer ${apiKey}`;
}

// ─── Image loading ───────────────────────────────────────────────────────────

async function bufferFromRequest(req: NextRequest): Promise<Buffer> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const { url } = await req.json();
    if (!url || typeof url !== "string") throw new Error("Missing or invalid 'url' field");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch image from URL: ${res.statusText}`);
    if (!(res.headers.get("content-type") ?? "").startsWith("image/"))
      throw new Error("URL did not return an image");
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

    // Initialize backend + model first
    const nsfwModel = await getModel();

    // Only create tensor after backend is ready
    const { data, info } = await sharp(buffer)
      .resize(224, 224)        // resize to exact model input size
      .removeAlpha()           // strip alpha channel if present
      .toColorspace("srgb")    // ensure RGB colorspace
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    const imageTensor = tf.tensor3d(
      new Uint8Array(data),
      [info.height, info.width, 3]  // hardcode 3 channels, don't trust info.channels
    );

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
    const status =
      message.includes("Invalid") || message.includes("No image") || message.includes("Missing") ? 400 : 500;
    console.error("Moderation error:", error);
    return NextResponse.json({ error: message }, { status, headers });
  }
}