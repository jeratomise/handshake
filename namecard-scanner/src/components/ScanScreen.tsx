import { useCallback, useEffect, useRef, useState } from 'react';
import { captureFromVideo } from '../lib/preprocess';
import { warmUpOcr } from '../lib/ocr';
import { AlertIcon, CameraIcon, CardIcon, UploadIcon } from './Icons';

const CARD_ASPECT = 1.586;

type CameraState = 'starting' | 'live' | 'unavailable';

interface Props {
  onCapture: (blob: Blob) => void;
  error: string | null;
}

export default function ScanScreen({ onCapture, error }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraFileRef = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState<CameraState>('starting');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      // Not every context can offer a live viewfinder: no camera, permission
      // denied, or a non-secure origin. Each of those falls back to the native
      // camera app via <input capture>, which works everywhere.
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamera('unavailable');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setCamera('live');
      } catch {
        if (!cancelled) setCamera('unavailable');
      }
    }

    void start();
    // Pull the OCR engine down while the user is still lining up the card, so
    // the read feels instant rather than stalling on a 3 MB download.
    warmUpOcr();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const shoot = useCallback(async () => {
    if (!videoRef.current || busy) return;
    setBusy(true);
    try {
      const blob = await captureFromVideo(videoRef.current, CARD_ASPECT);
      stopCamera();
      onCapture(blob);
    } catch {
      setBusy(false);
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

  return (
    <>
      <div className="panel reveal">
        <p className="step-eyebrow">Step 1 — Capture</p>
        <h1>
          Point at the <em>card</em>.
        </h1>
        <p className="lede">
          Fill the frame, keep it flat, and let the text stay sharp. Everything is read on your phone —
          no card ever leaves the device.
        </p>

        {error ? (
          <div className="notice" role="alert">
            <AlertIcon />
            <span>{error}</span>
          </div>
        ) : null}

        <div className={`viewfinder${camera === 'live' ? ' live' : ''}`}>
          {camera === 'live' ? (
            <video ref={videoRef} playsInline muted autoPlay aria-label="Live camera view" />
          ) : (
            <div className="hint">
              <CardIcon />
              {camera === 'starting'
                ? 'Waking the camera…'
                : 'Camera unavailable here — take a photo or pick one from your library.'}
            </div>
          )}
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
