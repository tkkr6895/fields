/// <reference types="vite/client" />

// Extend Vite's env typing for app-specific variables.
interface ImportMetaEnv {
  readonly VITE_CORESTACK_API_KEY?: string;
  readonly VITE_TESSERA_PROXY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
