import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Public static pages — prerender at build time
  { path: '',        renderMode: RenderMode.Prerender },
  { path: 'login',   renderMode: RenderMode.Prerender },
  { path: 'privacy', renderMode: RenderMode.Prerender },
  { path: 'terms',   renderMode: RenderMode.Prerender },

  // All protected routes are dynamic (auth-gated, user-specific data)
  { path: '**', renderMode: RenderMode.Server }
];
