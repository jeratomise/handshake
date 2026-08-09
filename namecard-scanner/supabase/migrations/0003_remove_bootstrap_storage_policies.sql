-- Idempotent cleanup.
--
-- An earlier attempt to bootstrap the first Vercel deployment created a public
-- `app-source` bucket with a permissive write policy so the build could fetch
-- its own source. That approach was abandoned; this drops the policies so no
-- holder of the publishable key can write to storage. Safe to run on a fresh
-- project, where none of these exist.
drop policy if exists "bootstrap source write" on storage.objects;
drop policy if exists "bootstrap source upload" on storage.objects;
drop policy if exists "bootstrap source update" on storage.objects;
