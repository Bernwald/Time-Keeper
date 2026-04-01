-- Migration: voice_recording_feature
-- Adds voice_recording feature flag (non-core, must be enabled per org)

INSERT INTO public.feature_flags (key, name, description, is_core) VALUES
  ('voice_recording', 'Sprachaufnahme', 'Gespräche aufzeichnen und transkribieren', FALSE)
ON CONFLICT (key) DO NOTHING;
