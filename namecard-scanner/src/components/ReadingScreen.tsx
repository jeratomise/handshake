import type { OcrProgress } from '../lib/ocr';

interface Props {
  previewUrl: string | null;
  progress: OcrProgress;
}

const STAGE_COPY: Record<OcrProgress['stage'], string> = {
  'loading-engine': 'Warming up the reader',
  reading: 'Reading the card',
  done: 'Done',
};

export default function ReadingScreen({ previewUrl, progress }: Props) {
  // The engine download and the recognition pass are shown as one bar, weighted
  // so the user never sees it jump back to zero halfway through.
  const percent =
    progress.stage === 'loading-engine'
      ? Math.round(progress.ratio * 35)
      : Math.round(35 + progress.ratio * 65);

  return (
    <div className="panel no-bar reveal">
      <p className="step-eyebrow">Step 2 — Reading</p>
      <h1>
        Pulling out the <em>details</em>.
      </h1>
      <p className="lede">This takes a few seconds. You will get to check every field before anything is sent.</p>

      <div className="viewfinder">
        {previewUrl ? <img src={previewUrl} alt="The card being read" /> : null}
        <div className="scanline" aria-hidden="true" />
        <div className="brackets" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>

      <div className="progress-shell" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-fill" style={{ width: `${Math.max(4, percent)}%` }} />
      </div>
      <div className="progress-label">
        <span>{STAGE_COPY[progress.stage]}…</span>
        <span>{percent}%</span>
      </div>
    </div>
  );
}
