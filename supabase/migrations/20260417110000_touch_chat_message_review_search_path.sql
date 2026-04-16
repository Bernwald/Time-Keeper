-- Supabase Advisor (function_search_path_mutable) warnte die
-- Trigger-Funktion touch_chat_message_review ohne expliziten search_path
-- aus. Hier mit SET search_path = public nachgezogen. Reine Hardening,
-- Funktionsverhalten identisch.

CREATE OR REPLACE FUNCTION public.touch_chat_message_review()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
