import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Login page can be prerendered (it's static)
  {
    path: 'login',
    renderMode: RenderMode.Prerender
  },
  // All other routes are dynamic (auth-gated, user-specific data)
  {
    path: '**',
    renderMode: RenderMode.Server
  }
];
