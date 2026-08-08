import { CTAS, MEETING_CONTEXTS, TONES, type CtaId, type Tone } from '../lib/draft';

interface Props {
  firstName: string;
  context: string;
  tone: Tone;
  cta: CtaId;
  onContextChange: (value: string) => void;
  onToneChange: (tone: Tone) => void;
  onCtaChange: (cta: CtaId) => void;
  onBack: () => void;
  onNext: () => void;
}

export default function ContextScreen({
  firstName,
  context,
  tone,
  cta,
  onContextChange,
  onToneChange,
  onCtaChange,
  onBack,
  onNext,
}: Props) {
  const who = firstName.trim() || 'them';

  return (
    <>
      <div className="panel reveal">
        <p className="step-eyebrow">Step 4 — Context</p>
        <h1>
          Where did you meet <em>{who}</em>?
        </h1>
        <p className="lede">
          One line is all it takes to make this read like a real follow-up instead of a template. Skip it and the
          message still works.
        </p>

        <div className="chips">
          {MEETING_CONTEXTS.map((option) => (
            <button
              key={option}
              type="button"
              className="chip"
              aria-pressed={context === option}
              onClick={() => onContextChange(context === option ? '' : option)}
              data-testid={`context-${option.replace(/\s+/g, '-')}`}
            >
              {option}
            </button>
          ))}
        </div>

        <label className="field">
          <span className="field-label">Or say it in your own words</span>
          <input
            type="text"
            value={context}
            placeholder="at the Q3 logistics summit"
            onChange={(e) => onContextChange(e.target.value)}
            data-testid="context-input"
            autoComplete="off"
          />
          <p className="field-note">
            Goes straight into the sentence: “…enjoyed meeting you {context.trim() || '___'}.”
          </p>
        </label>

        <label className="field">
          <span className="field-label">Tone</span>
          <div className="segmented" role="group" aria-label="Message tone">
            {TONES.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={tone === option.id}
                onClick={() => onToneChange(option.id)}
                data-testid={`tone-${option.id}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="field-note">{TONES.find((t) => t.id === tone)?.blurb}</p>
        </label>

        <label className="field">
          <span className="field-label">Close with</span>
          <div className="chips">
            {CTAS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="chip"
                aria-pressed={cta === option.id}
                onClick={() => onCtaChange(option.id)}
                data-testid={`cta-${option.id}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </label>
      </div>

      <div className="bar">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            onContextChange('');
            onNext();
          }}
          data-testid="skip-context"
        >
          Skip
        </button>
        <button type="button" className="btn btn-primary" onClick={onNext} data-testid="to-review">
          Write it
        </button>
      </div>
    </>
  );
}
