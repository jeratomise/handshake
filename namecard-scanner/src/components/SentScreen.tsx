import { CheckIcon, WhatsAppIcon } from './Icons';

interface Props {
  name: string;
  todayCount: number;
  onSaveContact: () => void;
  onReopen: () => void;
  onNext: () => void;
}

export default function SentScreen({ name, todayCount, onSaveContact, onReopen, onNext }: Props) {
  const who = name.trim() || 'your new contact';

  return (
    <div className="panel no-bar reveal center">
      <div className="done-mark">
        <CheckIcon />
      </div>
      <h1>
        Handed off to <em>WhatsApp</em>.
      </h1>
      <p className="lede">
        The message to {who} is sitting in WhatsApp ready to go. If the tab did not open, your browser may have blocked
        it — reopen it below.
      </p>

      {/* Scanning the next card is the loop this app exists for, so it gets the
          signal colour. Reopening is a recovery path and stays quiet — and the
          WhatsApp green is reserved for the button that actually hands off. */}
      <div className="stack">
        <button type="button" className="btn btn-primary btn-block" onClick={onNext} data-testid="scan-next">
          Scan the next card
        </button>
        <button type="button" className="btn btn-ghost btn-block" onClick={onSaveContact} data-testid="save-contact">
          Save to contacts
        </button>
        <button type="button" className="btn btn-ghost btn-block" onClick={onReopen} data-testid="reopen-whatsapp">
          <WhatsAppIcon size={18} />
          Reopen WhatsApp
        </button>
      </div>

      <p className="lede center" style={{ marginTop: 26, fontSize: 13 }}>
        {todayCount === 1 ? 'First card of the day.' : `${todayCount} cards followed up today.`}
      </p>
    </div>
  );
}
