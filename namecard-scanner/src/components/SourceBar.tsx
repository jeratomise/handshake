import { useState } from 'react';
import { CloseIcon } from './Icons';
import { dismissSourceBar, sourceBarDismissed } from '../lib/storage';

/**
 * The one line that tells a first-time visitor this is open source, and where
 * to read about it.
 *
 * It sits above the header rather than inside a screen because the point is to
 * be seen without scrolling — the same note lower down the capture screen was
 * below the fold on a phone, which is the same as not being there.
 *
 * Dismissible, and dismissal sticks until the user clears the site's data. A
 * bar that comes back every visit stops being information and becomes an ad,
 * and the capture screen keeps a quieter permanent link for anyone who closes
 * this one and later wants it.
 */
const REPO_URL = 'https://github.com/jeratomise/handshake';

export default function SourceBar() {
  // Read once on mount. Reading in a lazy initialiser rather than an effect
  // avoids a frame where the bar is visible before we know it was dismissed,
  // which on a phone reads as a flicker.
  const [open, setOpen] = useState(() => !sourceBarDismissed());

  if (!open) return null;

  return (
    <div className="announce" data-testid="source-bar">
      <p>
        Free and open source —{' '}
        <a href={REPO_URL} target="_blank" rel="noreferrer noopener" data-testid="source-bar-link">
          see how it works on GitHub
        </a>
      </p>
      <button
        type="button"
        onClick={() => {
          dismissSourceBar();
          setOpen(false);
        }}
        aria-label="Close this message"
        data-testid="source-bar-close"
      >
        <CloseIcon />
      </button>
    </div>
  );
}
