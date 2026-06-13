import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { redis } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const REMBG_SERVICE_URL =
  process.env.REMBG_SERVICE_URL ?? "http://127.0.0.1:7000";
const REMBG_MODEL = process.env.REMBG_MODEL ?? "u2net_human_seg";
const REMBG_TIMEOUT_MS = 120_000;

let backgroundRemovalQueue = Promise.resolve();

export async function POST(request: Request) {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 5 requests per 60 seconds per user
  const rateLimitKey = `rate-limit:remove-bg:${session.user.id}`;
  const attempts = await redis.incr(rateLimitKey);
  if (attempts === 1) await redis.expire(rateLimitKey, 60);
  if (attempts > 5) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429 },
    );
  }

  const body = await request.formData();
  const image = body.get("image");

  if (!(image instanceof File)) {
    return NextResponse.json({ error: "Missing image file" }, { status: 400 });
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(image.type)) {
    return NextResponse.json(
      { error: "Background removal supports JPG, PNG, and WebP inputs" },
      { status: 400 },
    );
  }

  if (image.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "Image must be 12 MB or smaller" },
      { status: 400 },
    );
  }

  try {
    return await enqueueBackgroundRemoval(() =>
      removeBackgroundWithRembg(image, request.signal),
    );
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 502 },
    );
  }
}

async function removeBackgroundWithRembg(
  image: File,
  requestSignal: AbortSignal,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMBG_TIMEOUT_MS);
  const abort = () => controller.abort();
  requestSignal.addEventListener("abort", abort, { once: true });

  try {
    const body = new FormData();
    body.append("file", image, image.name || "fco.png");
    body.append("model", REMBG_MODEL);
    body.append("ppm", "true");

    const response = await fetch(`${REMBG_SERVICE_URL}/api/remove`, {
      method: "POST",
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(await getResponseError(response));
    }

    return new Response(await response.arrayBuffer(), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": response.headers.get("content-type") || "image/png",
      },
    });
  } finally {
    clearTimeout(timeout);
    requestSignal.removeEventListener("abort", abort);
  }
}

async function enqueueBackgroundRemoval<T>(task: () => Promise<T>): Promise<T> {
  const queued = backgroundRemovalQueue.then(task, task);
  backgroundRemovalQueue = queued.then(
    () => undefined,
    () => undefined,
  );
  return queued;
}

async function getResponseError(response: Response) {
  const message = await response.text();
  return message || response.statusText || "Background removal failed";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Failed to remove background";
}
