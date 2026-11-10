-- Card designer: where client names (and other text) are drawn on a greeting card.
-- Run once in Supabase Dashboard -> SQL Editor.
alter table public.templates add column if not exists layout jsonb;
alter table public.campaigns add column if not exists layout jsonb;
