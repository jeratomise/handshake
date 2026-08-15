-- Move the AI card reader onto Gemini 3.7 Flash.
--
-- Checked against the live OpenRouter catalogue before changing anything: the
-- id exists, accepts image input, and is cheaper per token in both directions
-- than the 3.6 it replaces. A model id that does not exist fails at the moment
-- a BDE taps the button, so this is not a value to set from memory.
--
-- The stored row is updated as well as the column default, because the row was
-- created before this and would otherwise keep the old model for ever.

alter table public.app_settings
  alter column ai_ocr_model set default 'google/gemini-3.7-flash';

update public.app_settings
   set ai_ocr_model = 'google/gemini-3.7-flash'
 where id = true
   and ai_ocr_model = 'google/gemini-2.5-flash';
