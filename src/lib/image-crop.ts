// Auto-crop uploaded photo to a square focused on face/upper body.
// 1) Tries the native FaceDetector API (Chrome/Edge/Android).
// 2) Falls back to a heuristic upper-center square crop (faces are
//    almost always in the upper third of a portrait).
// Output: 800x800 JPEG Blob.

const OUT = 800;
const QUALITY = 0.88;

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // revoke a bit later so decode finishes
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

type Box = { x: number; y: number; w: number; h: number };

async function detectFace(img: HTMLImageElement): Promise<Box | null> {
  const FD = (window as any).FaceDetector;
  if (!FD) return null;
  try {
    const detector = new FD({ fastMode: true, maxDetectedFaces: 5 });
    const faces = await detector.detect(img);
    if (!faces?.length) return null;
    // Pick the largest face.
    const best = faces.reduce((a: any, b: any) =>
      a.boundingBox.width * a.boundingBox.height >
      b.boundingBox.width * b.boundingBox.height ? a : b
    );
    const b = best.boundingBox;
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  } catch {
    return null;
  }
}

function squareAroundFace(face: Box, W: number, H: number): Box {
  // Expand so the crop includes shoulders/body — head is ~25% of full body.
  // Use face height * 3.2 to get head-to-chest framing.
  const size = Math.min(Math.max(face.w, face.h) * 3.2, Math.min(W, H));
  const cx = face.x + face.w / 2;
  // Shift center down a bit so face sits in upper third of the crop.
  const cy = face.y + face.h / 2 + size * 0.18;
  let x = cx - size / 2;
  let y = cy - size / 2;
  x = Math.max(0, Math.min(W - size, x));
  y = Math.max(0, Math.min(H - size, y));
  return { x, y, w: size, h: size };
}

function heuristicSquare(W: number, H: number): Box {
  const size = Math.min(W, H);
  // Center horizontally, bias toward top (head is usually upper third).
  const x = (W - size) / 2;
  const y = H > W ? Math.min(H - size, (H - size) * 0.18) : (H - size) / 2;
  return { x, y, w: size, h: size };
}

export async function smartCropPortrait(file: File): Promise<{ blob: Blob; ext: string; contentType: string }> {
  const img = await loadImage(file);
  const W = img.naturalWidth;
  const H = img.naturalHeight;

  let crop: Box;
  const face = await detectFace(img);
  if (face) crop = squareAroundFace(face, W, H);
  else crop = heuristicSquare(W, H);

  const canvas = document.createElement("canvas");
  canvas.width = OUT;
  canvas.height = OUT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("ক্যানভাস তৈরি করা যায়নি");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, OUT, OUT);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("ছবি প্রস্তুত হয়নি"))),
      "image/jpeg",
      QUALITY,
    );
  });

  return { blob, ext: "jpg", contentType: "image/jpeg" };
}
