/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API address, e.g. https://api.prawdowid.pl. Defaults to http://localhost:3000. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
