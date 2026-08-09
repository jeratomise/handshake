/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** e.g. https://abcdefgh.supabase.co — absent means the app runs local-only. */
  readonly VITE_SUPABASE_URL?: string;
  /** The publishable (anon) key. Safe in the client; row level security is what protects the data. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
