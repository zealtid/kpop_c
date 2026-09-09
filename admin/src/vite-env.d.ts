/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin baked in at `vite build`. Empty in local `vite` (same-origin proxy). */
  readonly VITE_API_BASE?: string;
}

export {};
