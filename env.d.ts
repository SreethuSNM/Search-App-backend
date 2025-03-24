import { KVNamespace } from '@cloudflare/workers-types';

export {};

declare global {
  namespace Cloudflare {
    interface Env {
      WEBFLOW_AUTHENTICATION: KVNamespace;
    }
  }
}
