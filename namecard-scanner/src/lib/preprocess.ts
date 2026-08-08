/**
 * Image conditioning for OCR.
 *
 * Tesseract is markedly better on high-contrast greyscale than on a raw phone
 * photo shot under conference-hall lighting, so every capture goes through a
 * resize, a greyscale pass and a percentile contrast stretch before it reaches
 * the engine. This is the cheapest accuracy win available to us.
 */

const TARGET_LONG_EDGE = 1600;
const MIN_LONG_EDGE = 900;

export interface PreparedImage {
  canvas: HTMLCanvasElement;
  /** Object URL of the untouched capture, shown back to the user. */
  previewUrl: string;
  width: number;
  height: number;
}

async function toBitmap(source: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      // 'from-image' applies EXIF rotation, so photos taken in portrait do not
      // arrive sideways and read as gibberish.
      return await createImageBitmap(source, { imageOrientation: 'from-image' });
    } catch {
      /* Safari < 16 and some Android webviews: fall through to <img>. */
    }
  }
  const url = URL.createObjectURL(source);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('That image could not be opened.'));
      img.src = url;
    });
  } finally {
    // The bitmap is decoded by now; the canvas draw does not need the URL.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

function scaleFor(width: number, height: number): number {
  const longEdge = Math.max(width, height);
  if (longEdge > TARGET_LONG_EDGE) return TARGET_LONG_EDGE / longEdge;
  if (longEdge < MIN_LONG_EDGE) return Math.min(2, MIN_LONG_EDGE / longEdge);
  return 1;
}

/**
 * Greyscale plus a 2nd/98th percentile contrast stretch.
 *
 * A plain min/max stretch is wrecked by a single glare pixel or one dark
 * shadow, which is exactly what a phone photo of a glossy card contains, so we
 * clip the tails first.
 */
function enhance(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const histogram = new Uint32Array(256);

  for (let i = 0; i < data.length; i += 4) {
    const luma = (data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114) | 0;
    data[i] = luma;
    data[i + 1] = luma;
    data[i + 2] = luma;
    histogram[luma]!++;
  }

  const total = width * height;
  const lowCut = total * 0.02;
  const highCut = total * 0.98;
  let cumulative = 0;
  let low = 0;
  let high = 255;
  for (let value = 0; value < 256; value++) {
    cumulative += histogram[value]!;
    if (cumulative <= lowCut) low = value;
    if (cumulative <= highCut) high = value;
  }
  if (high - low < 32) return; // Flat image: stretching would only amplify noise.

  const range = high - low;
  const lut = new Uint8ClampedArray(256);
  for (let value = 0; value < 256; value++) {
    lut[value] = Math.max(0, Math.min(255, ((value - low) / range) * 255));
  }
  for (let i = 0; i < data.length; i += 4) {
    const v = lut[data[i]!]!;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }

  ctx.putImageData(image, 0, 0);
}

/** Decodes, orients, resizes and contrast-stretches a capture ready for OCR. */
export async function prepareImage(source: Blob): Promise<PreparedImage> {
  const bitmap = await toBitmap(source);
  const naturalWidth = 'width' in bitmap ? bitmap.width : 0;
  const naturalHeight = 'height' in bitmap ? bitmap.height : 0;
  if (!naturalWidth || !naturalHeight) throw new Error('That image appears to be empty.');

  const scale = scaleFor(naturalWidth, naturalHeight);
  const width = Math.round(naturalWidth * scale);
  const height = Math.round(naturalHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Your browser blocked image processing.');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);
  enhance(ctx, width, height);

  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();

  return { canvas, previewUrl: URL.createObjectURL(source), width, height };
}

/**
 * Grabs what the user can actually see in the viewfinder.
 *
 * The <video> is laid out with `object-fit: cover` inside a card-shaped box, so
 * the browser is already cropping the frame. We reproduce that same crop here —
 * otherwise the capture would include strips of the scene the user never framed,
 * and the OCR would read the table the card is lying on.
 */
export function captureFromVideo(video: HTMLVideoElement, displayAspect: number): Promise<Blob> {
  const { videoWidth: vw, videoHeight: vh } = video;
  if (!vw || !vh) return Promise.reject(new Error('The camera is not ready yet.'));

  let sw = vw;
  let sh = vh;
  if (vw / vh > displayAspect) {
    sw = Math.round(vh * displayAspect);
  } else {
    sh = Math.round(vw / displayAspect);
  }
  const sx = Math.round((vw - sw) / 2);
  const sy = Math.round((vh - sh) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser blocked image capture.');
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not capture that frame.'))),
      'image/jpeg',
      0.95,
    );
  });
}
