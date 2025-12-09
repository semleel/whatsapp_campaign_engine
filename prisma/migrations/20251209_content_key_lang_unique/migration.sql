-- Ensure content_key column exists (idempotent for Supabase/Prisma)
ALTER TABLE public.content
ADD COLUMN IF NOT EXISTS content_key varchar;

-- Enforce uniqueness of (content_key, lang) while allowing NULLs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    WHERE tc.constraint_schema = 'public'
      AND tc.table_name = 'content'
      AND tc.constraint_name = 'content_key_lang_unique'
  ) THEN
    ALTER TABLE public.content
      ADD CONSTRAINT content_key_lang_unique UNIQUE (content_key, lang);
  END IF;
END $$;
