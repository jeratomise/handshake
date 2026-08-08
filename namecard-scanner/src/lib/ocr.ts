import type { Worker } from 'tesseract.js';

/**
 * Tesseract wrapper.
 *
 * Every asset — worker, wasm core and the English model — is served from our
 * own origin (see public/tesseract and public/tessdata). Tesseract.js defaults
 * to pulling ~3 MB from a public CDN at first scan, which fails behind a strict
 * CSP, on a locked-down corporate network, and in a conference basement with no
 * signal. Those are precisely the places a BDE opens this app.
 */

const WORKER_PATH = '/tesseract/worker.min.js';
const CORE_PATH = '/tesseract/';
const LANG_PATH = '/tessdata';

export type OcrStage = 'loading-engine' | 'reading' | 'done';

export interface OcrProgress {
  stage: OcrStage;
  /** 0..1 within the current stage. */
  ratio: number;
}

let workerPromise: Promise<Worker> | null = null;
let progressListener: ((p: OcrProgress) => void) | null = null;

function report(stage: OcrStage, ratio: number): void {
  progressListener?.({ stage, ratio: Math.max(0, Math.min(1, ratio)) });
}

async function createOcrWorker(): Promise<Worker> {
  // Loaded lazily so the engine chunk never blocks first paint.
  const { createWorker, PSM } = await import('tesseract.js');

  const worker = await createWorker('eng', 1, {
    workerPath: WORKER_PATH,
    corePath: CORE_PATH,
    langPath: LANG_PATH,
    gzip: true,
    logger: (message: { status?: string; progress?: number }) => {
      const ratio = typeof message.progress === 'number' ? message.progress : 0;
      if (message.status === 'recognizing text') report('reading', ratio);
      else report('loading-engine', ratio);
    },
  });

  await worker.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
    preserve_interword_spaces: '1',
  });

  return worker;
}

/** Starts the engine download early (e.g. while the user lines up the card). */
export function warmUpOcr(): void {
  if (!workerPromise) {
    workerPromise = createOcrWorker().catch((error: unknown) => {
      workerPromise = null; // Allow a retry rather than caching the failure.
      throw error;
    });
  }
}

export async function readCardText(
  image: HTMLCanvasElement | Blob,
  onProgress?: (progress: OcrProgress) => void,
): Promise<string> {
  progressListener = onProgress ?? null;
  try {
    warmUpOcr();
    const worker = await workerPromise!;
    report('reading', 0);
    const result = await worker.recognize(image);
    report('done', 1);
    return result.data.text ?? '';
  } catch (error) {
    // Tesseract surfaces worker failures as bare strings and as ErrorEvents as
    // well as Errors, so pull a message out of whatever shape arrived.
    const detail =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : ((error as { message?: string })?.message ?? '');
    console.error('[handshake] OCR failed:', error);
    throw new Error(detail ? `Could not read that card (${detail}).` : 'Could not read that card.');
  } finally {
    progressListener = null;
  }
}

/** Frees the worker; called when the app is backgrounded for a long time. */
export async function releaseOcr(): Promise<void> {
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    /* Nothing useful to do if teardown fails. */
  }
}
