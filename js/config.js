// Pinned to an exact version, not `@2`: the service worker caches this module,
// and a floating major would let the cached bytes drift from what was tested.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.111.0/+esm';

// The publishable key is safe in public code — your data will be protected
// by Row Level Security rules we add when we create database tables.
const SUPABASE_URL = 'https://mzbcrslktmxawacerxmz.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ubykWZgYNLELNoiAu3Vr4Q_HNl2JaC-';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);