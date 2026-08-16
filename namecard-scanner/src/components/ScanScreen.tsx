import { useCallback, useEffect, useRef, useState } from 'react';
import { captureFromVideo } from '../lib/preprocess';
import { warmUpOcr } from '../lib/ocr';
import { AlertIcon, CameraIcon, CardIcon, UploadIcon } from './Icons';

const CARD_ASPECT = 1.586;
/** How long to wait for the first frame before giving up on the viewfinder. */
const FIRST_FRAME_TIMEOUT_MS = 6000;

type CameraState = 'starting' | 'live' | 'unavailable';

/**
 * Why the viewfinder is not running. "Camera unavailable" on its own sends the
 * user to their browser settings when the real problem is a video call holding
 * the device, so each cause gets its own sentence and its own remedy.
 */
type Reason = 'unsupported' | 'insecure' | 'denied' | 'notfound' | 'inuse' | 'failed';

const REASON_COPY: Record<Reason, string> = {
  unsupported: 'This browser cannot open a live camera. Take a photo instead — it reads just as well.',
  insecure: 'A live camera needs a secure (https) connection. Take a photo instead.',
  denied: 'Camera access is blocked for this site. Allow it in your browser settings, then try again.',
  notfound: 'No camera found on this device. Take a photo or pick one from your library.',
  inuse: 'Another app is using the camera. Close it, then try again.',
  failed: 'The camera would not start. Take a photo instead — it reads just as well.',
};

/** Causes the user can actually do something about without leaving the page. */
const RETRYABLE: ReadonlySet<Reason> = new Set<Reason>(['denied', 'inuse', 'failed']);

function classify(error: unknown): Reason {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'notfound';
  if (name === 'NotReadableError' || name === 'AbortError') return 'inuse';
  return 'failed';
}

/**
 * Resolves once the stream has produced dimensions.
 *
 * Going 'live' the instant getUserMedia resolves is too early: the element has
 * no frame yet, so an immediate tap on the shutter captures a 0x0 canvas.
 */
function waitForFirstFrame(video: HTMLVideoElement): Promise<void> {
  if (video.videoWidth > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      video.removeEventListener('loadedmetadata', done);
      resolve();
    };
    const timer = setTimeout(done, FIRST_FRAME_TIMEOUT_MS);
    video.addEventListener('loadedmetadata', done);
  });
}

interface Props {
  onCapture: (blob: Blob) => void;
  error: string | null;
}

export default function ScanScreen({ onCapture, error }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraFileRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);
  const [camera, setCamera] = useState<CameraState>('starting');
  const [reason, setReason] = useState<Reason>('failed');
  const [busy, setBusy] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    // Not every context can offer a live viewfinder: no camera, permission
    // denied, or a non-secure origin. Each of those falls back to the native
    // camera app via <input capture>, which works everywhere.
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setReason('insecure');
      setCamera('unavailable');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setReason('unsupported');
      setCamera('unavailable');
      return;
    }

    setCamera('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
        audio: false,
      });
      if (cancelledRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;

      // The <video> is mounted on every render precisely so it exists here. It
      // used to be rendered only in the 'live' state, which meant the ref was
      // still null at this point and the stream was never attached to anything:
      // permission granted, camera light on, viewfinder black.
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setReason('failed');
        setCamera('unavailable');
        return;
      }

      video.srcObject = stream;
      // Autoplay is permitted because the element is muted and inline, but a
      // rejected play() must not take the viewfinder down with it.
      await video.play().catch(() => undefined);
      await waitForFirstFrame(video);
      if (cancelledRef.current) return;
      setCamera('live');
    } catch (err) {
      if (cancelledRef.current) return;
      setReason(classify(err));
      setCamera('unavailable');
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    void start();
    // Pull the OCR engine down while the user is still lining up the card, so
    // the read feels instant rather than stalling on a 3 MB download.
    warmUpOcr();

    return () => {
      cancelledRef.current = true;
      stopCamera();
    };
  }, [start, stopCamera]);

  const shoot = useCallback(async () => {
    if (!videoRef.current || busy) return;
    setBusy(true);
    try {
      const blob = await captureFromVideo(videoRef.current, CARD_ASPECT);
      stopCamera();
      onCapture(blob);
    } catch {
      setBusy(false);
      setReason('failed');
      setCamera('unavailable');
    }
  }, [busy, onCapture, stopCamera]);

  const onFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Reset so picking the same file twice still fires a change event.
      event.target.value = '';
      if (!file) return;
      stopCamera();
      onCapture(file);
    },
    [onCapture, stopCamera],
  );

  const retry = useCallback(() => {
    stopCamera();
    void start();
  }, [start, stopCamera]);

  return (
    <>
      <div className="panel reveal">
        <p className="step-eyebrow">Step 1 — Capture</p>
        <h1>
          Point at the <em>card</em>.
        </h1>
        <p className="lede">
          Fill the frame, keep it flat, and let the text stay sharp. Cards are read on your phone by
          default — nothing is uploaded unless you ask for an AI re-read.
        </p>

        {error ? (
          <div className="notice" role="alert">
            <AlertIcon />
            <span>{error}</span>
          </div>
        ) : null}

        <div className={`viewfinder${camera === 'live' ? ' live' : ''}`}>
          {/* Mounted from the first render, not just when live: the ref has to
              exist at the moment getUserMedia resolves. Faded in by CSS once
              frames are actually arriving. */}
          <video ref={videoRef} playsInline muted autoPlay aria-label="Live camera view" />
          {camera !== 'live' ? (
            <div className="hint" data-testid="camera-hint">
              <CardIcon />
              {camera === 'starting' ? 'Waking the camera…' : REASON_COPY[reason]}
              {camera === 'unavailable' && RETRYABLE.has(reason) ? (
                <button type="button" className="link-btn" onClick={retry} data-testid="camera-retry">
                  Try the camera again
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="brackets" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>

        <div className="shot-actions">
          <button type="button" className="btn btn-ghost" onClick={() => cameraFileRef.current?.click()}>
            <CameraIcon size={18} />
            Photo
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
            <UploadIcon size={18} />
            Upload
          </button>
        </div>

        {/* Native camera app — the reliable path on every phone. */}
        <input
          ref={cameraFileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onFile}
          className="visually-hidden"
          aria-label="Take a photo of a business card"
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onFile}
          className="visually-hidden"
          data-testid="card-upload"
          aria-label="Upload a photo of a business card"
        />

        {/* The claim above — that cards are read on the phone — is the kind of
            thing every app says. The link is what makes it checkable, so it
            sits directly under it rather than in a settings screen nobody
            opens. It doubles as the way anyone curious finds the docs, or
            deploys a copy for their own team. */}
        <p className="oss-note">
          Free and open source. How it works, and how to run your own copy:{' '}
          <a
            href="https://github.com/jeratomise/handshake"
            target="_blank"
            rel="noreferrer noopener"
            data-testid="source-link"
          >
            see the GitHub page
          </a>
          .
        </p>
      </div>

      <div className="bar">
        <button
          type="button"
          className="btn btn-primary"
          onClick={camera === 'live' ? shoot : () => cameraFileRef.current?.click()}
          disabled={busy || camera === 'starting'}
        >
          <CameraIcon />
          {busy ? 'Capturing…' : 'Scan card'}
        </button>
      </div>
    </>
  );
}
