import { describe, expect, it } from 'vitest';
import { aiReadAvailable, mergeAiFields, type AiCardFields } from '../src/lib/aiOcr';
import type { ContactForm } from '../src/components/ConfirmScreen';

/**
 * The merge is the safety layer around the AI re-read.
 *
 * A vision model is confidently wrong in a way Tesseract is not: garbled OCR
 * looks garbled, but an invented phone number looks perfect and opens a chat
 * with a stranger. So the model's answer is merged, never trusted wholesale —
 * blanks lose, and the phone has to normalise before it is allowed in.
 */

const TESSERACT_READ: ContactForm = {
  name: 'Ng Beei Ching',
  greeting: 'Beei Ching',
  title: 'Assistant Outlet Supervisor',
  company: 'Eu Yan Sang (1959) Sdn. Bhd.',
  email: '',
  phone: '(6019) 7314 959',
};

const EMPTY_AI: AiCardFields = { name: '', title: '', company: '', email: '', phone: '', website: '' };
const ai = (patch: Partial<AiCardFields>): AiCardFields => ({ ...EMPTY_AI, ...patch });

describe('mergeAiFields', () => {
  it('fills fields the on-device read missed', () => {
    const { form, changed } = mergeAiFields(TESSERACT_READ, ai({ email: 'beeiching.ng@euyansang.com.my' }), 'MY');
    expect(form.email).toBe('beeiching.ng@euyansang.com.my');
    expect(changed).toEqual(['email']);
  });

  it('never lets a blank answer erase something already read', () => {
    // The model is told to return '' rather than guess. That instruction must
    // not cost the user fields Tesseract got right.
    const { form, changed } = mergeAiFields(TESSERACT_READ, EMPTY_AI, 'MY');
    expect(form).toEqual(TESSERACT_READ);
    expect(changed).toEqual([]);
  });

  it('corrects a misread name and re-derives the greeting', () => {
    const misread: ContactForm = { ...TESSERACT_READ, name: 'Ng Beei Chlng', greeting: 'Beei Chlng' };
    const { form, changed } = mergeAiFields(misread, ai({ name: 'Ng Beei Ching' }), 'MY');
    expect(form.name).toBe('Ng Beei Ching');
    expect(form.greeting).toBe('Beei Ching');
    expect(changed).toContain('name');
    expect(changed).toContain('greeting');
  });

  it('accepts a phone that normalises', () => {
    const { form, changed } = mergeAiFields({ ...TESSERACT_READ, phone: '' }, ai({ phone: '+60197314959' }), 'MY');
    expect(form.phone).toBe('+60197314959');
    expect(changed).toEqual(['phone']);
  });

  it('rejects a phone that does not normalise, keeping the traceable one', () => {
    // A hallucinated number is the one failure with a real-world cost, and it
    // arrives looking entirely plausible.
    const { form, changed } = mergeAiFields(TESSERACT_READ, ai({ phone: '+60 12' }), 'MY');
    expect(form.phone).toBe('(6019) 7314 959');
    expect(changed).not.toContain('phone');
  });

  it('reports nothing changed when the AI agrees', () => {
    const agreeing = ai({
      name: TESSERACT_READ.name,
      title: TESSERACT_READ.title,
      company: TESSERACT_READ.company,
      phone: TESSERACT_READ.phone,
    });
    expect(mergeAiFields(TESSERACT_READ, agreeing, 'MY').changed).toEqual([]);
  });

  it('does not touch the greeting when the name is unchanged', () => {
    // Somebody who has hand-edited "greet them as" should keep their edit.
    const edited: ContactForm = { ...TESSERACT_READ, greeting: 'Ching' };
    const { form } = mergeAiFields(edited, ai({ title: 'Outlet Supervisor' }), 'MY');
    expect(form.greeting).toBe('Ching');
  });

  it('trims whatever the model returns', () => {
    const { form } = mergeAiFields({ ...TESSERACT_READ, company: '' }, ai({ company: '  Eu Yan Sang  ' }), 'MY');
    expect(form.company).toBe('Eu Yan Sang');
  });

  it('leaves the original object untouched', () => {
    const before = { ...TESSERACT_READ };
    mergeAiFields(TESSERACT_READ, ai({ name: 'Someone Else' }), 'MY');
    expect(TESSERACT_READ).toEqual(before);
  });
});

describe('aiReadAvailable', () => {
  it('is off unless the operator switched it on', () => {
    // With no Supabase configured there is nothing to proxy the call, so this
    // is false in the unit environment either way — the point is that the
    // toggle is a necessary condition, never a sufficient one on its own.
    expect(aiReadAvailable(false)).toBe(false);
  });
});
