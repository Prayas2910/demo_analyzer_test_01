const fetch = require("node-fetch");
const sizeOf = require("image-size");

/**
 * IMPORTANT LIMITATION (read this before wiring up a demo):
 * The dataset only records whether a profile has a photo (Yes/No) — it does not
 * include the actual image file or a stable image URL. Real DeepFace (face-match /
 * face-liveness) and CLIP (AI-generated-image detection) both need the actual
 * image bytes and non-trivial model weights (100MB-1GB+, PyTorch/TF runtime),
 * which don't belong bundled in a Node/Express service.
 *
 * This agent is built to run for real the moment an image URL IS available
 * (e.g. from a future scraper or manual upload): it fetches the image and
 * does lightweight, dependency-light checks (reachability, dimensions,
 * stock-photo-sized heuristics). The DeepFace/CLIP calls are stubbed as a
 * documented extension point — see `runDeepFaceStub` / `runClipStub` — meant
 * to be swapped for a call to a Python microservice
 * (e.g. POST http://localhost:8001/deepface) once that service exists.
 */

async function fetchImageMeta(imageUrl) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(imageUrl, { method: "GET", signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { reachable: false, status: res.status };
    const buffer = Buffer.from(await res.arrayBuffer());
    const dimensions = sizeOf(buffer);
    return {
      reachable: true,
      status: res.status,
      contentType: res.headers.get("content-type"),
      byteSize: buffer.length,
      width: dimensions.width,
      height: dimensions.height,
    };
  } catch (e) {
    return { reachable: false, error: e.message };
  }
}

function runDeepFaceStub() {
  return {
    implemented: false,
    note:
      "DeepFace face-verification/reverse-image-match not run: requires the DeepFace " +
      "Python package + model weights, best served from a separate microservice. " +
      "Wire this up by POSTing the image URL to a `deepface-service` and mapping its " +
      "response here.",
  };
}

function runClipStub() {
  return {
    implemented: false,
    note:
      "CLIP-based AI-generated-image detection not run for the same reason as DeepFace " +
      "above (needs a model runtime this Node service doesn't carry). Recommended: a " +
      "small FastAPI service running open-clip-torch or a hosted detection API.",
  };
}

async function runImageAgent(profile, imageUrl) {
  const hasPhotoFlag = profile.Photo === "Yes" || profile.Has_Photo === 1;

  if (!imageUrl) {
    return {
      agent: "ImageAgent",
      hasPhotoFlag,
      imageAnalyzed: false,
      reason:
        "No image URL available for this profile in the dataset — only a Yes/No " +
        "photo flag is recorded. Provide an image URL to run full analysis.",
      deepFace: runDeepFaceStub(),
      clip: runClipStub(),
    };
  }

  const meta = await fetchImageMeta(imageUrl);
  return {
    agent: "ImageAgent",
    hasPhotoFlag,
    imageAnalyzed: true,
    imageMeta: meta,
    deepFace: runDeepFaceStub(),
    clip: runClipStub(),
  };
}

module.exports = { runImageAgent };
