let faceApiPromise: Promise<any> | null = null;
const CDN = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.min.js";
const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";
const MATCH_THRESHOLD = 0.52;

function loadScript() {
  if (typeof window === "undefined") throw new Error("Face verification is available in the browser only.");
  if ((window as any).faceapi) return Promise.resolve((window as any).faceapi);
  if (faceApiPromise) return faceApiPromise;
  faceApiPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-printball-face-api="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve((window as any).faceapi));
      existing.addEventListener("error", () => reject(new Error("Could not load face verification engine.")));
      return;
    }
    const script = document.createElement("script");
    script.src = CDN;
    script.async = true;
    script.dataset.printballFaceApi = "true";
    script.onload = () => resolve((window as any).faceapi);
    script.onerror = () => reject(new Error("Could not load face verification engine. Check your internet connection."));
    document.head.appendChild(script);
  });
  return faceApiPromise;
}

export async function faceEngine() {
  const api = await loadScript();
  if (!api.nets.tinyFaceDetector.isLoaded) await api.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
  if (!api.nets.faceLandmark68Net.isLoaded) await api.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
  if (!api.nets.faceRecognitionNet.isLoaded) await api.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
  return api;
}

async function imageFromBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function descriptor(api: any, input: HTMLImageElement) {
  return api.detectSingleFace(input, new api.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
}

export async function verifyFaceMatch(profileUrl: string, capture: Blob) {
  const api = await faceEngine();
  const [profile, live] = await Promise.all([
    new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not load the employee profile photo."));
      image.src = profileUrl;
    }),
    imageFromBlob(capture),
  ]);
  const [profileResult, liveResult] = await Promise.all([descriptor(api, profile), descriptor(api, live)]);
  if (!profileResult) throw new Error("No clear face was found in the employee profile photo.");
  if (!liveResult) throw new Error("No clear face was found in the captured photo. Please face the camera and capture again.");
  const distance = api.euclideanDistance(profileResult.descriptor, liveResult.descriptor);
  return { matched: distance <= MATCH_THRESHOLD, distance, threshold: MATCH_THRESHOLD };
}

export type LivenessChallenge = "turn-left" | "turn-right";

function faceMetrics(result: any) {
  const p = result.landmarks.positions;
  const leftEye = p.slice(36, 42);
  const rightEye = p.slice(42, 48);
  const eyeMid = { x: (leftEye[0].x + rightEye[3].x) / 2, y: (leftEye[0].y + rightEye[3].y) / 2 };
  const nose = p[30];
  const faceWidth = Math.max(1, Math.abs(p[16].x - p[0].x));
  const yaw = (nose.x - eyeMid.x) / faceWidth;
  const mouthLeft = p[48];
  const mouthRight = p[54];
  const mouthTop = p[51];
  const mouthBottom = p[57];
  const mouthWidth = Math.max(1, Math.hypot(mouthRight.x - mouthLeft.x, mouthRight.y - mouthLeft.y));
  const mouthHeight = Math.hypot(mouthBottom.x - mouthTop.x, mouthBottom.y - mouthTop.y);
  const smileRatio = mouthWidth / faceWidth;
  const mouthOpenRatio = mouthHeight / mouthWidth;
  return { yaw, smileRatio, mouthOpenRatio };
}

/**
 * Active browser liveness. The preview is mirrored for a natural selfie view,
 * but the landmark coordinates remain in the camera's native coordinate space.
 * Left/right are therefore intentionally interpreted from the user's physical
 * left/right, not from the screen side.
 */
export async function detectLivenessAction(
  video: HTMLVideoElement,
  challenge: LivenessChallenge,
  timeoutMs = 10000,
) {
  const api = await faceEngine();
  const started = performance.now();
  let baselineYaw: number | null = null;
  let neutralFrames = 0;
  let passedFrames = 0;

  // Keep the challenge responsive without running detection on every animation frame.
  // Two consecutive passing frames are enough to avoid accidental one-frame triggers.
  while (performance.now() - started < timeoutMs) {
    const detection = api
      .detectSingleFace(video, new api.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.40 }))
      .withFaceLandmarks();
    const result = await detection;

    if (result) {
      const { yaw } = faceMetrics(result);

      if (baselineYaw === null) {
        baselineYaw = yaw;
        neutralFrames = 0;
        passedFrames = 0;
      }

      // Slowly refresh the neutral reference only while the face is near center.
      if (Math.abs(yaw - baselineYaw) < 0.05) {
        neutralFrames += 1;
        if (neutralFrames >= 2) baselineYaw = baselineYaw * 0.85 + yaw * 0.15;
      } else {
        neutralFrames = 0;
      }

      const delta = yaw - baselineYaw;
      const passed = challenge === "turn-left"
        ? delta > 0.075
        : delta < -0.075;

      passedFrames = passed ? passedFrames + 1 : 0;
      if (passedFrames >= 2) return true;
    } else {
      passedFrames = 0;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  return false;
}
