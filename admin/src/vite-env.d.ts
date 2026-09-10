/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin baked in at `vite build`. Empty in local `vite` (same-origin proxy). */
  readonly VITE_API_BASE?: string;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
