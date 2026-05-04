import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { unauthGuard } from './core/guards/unauth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/landing/landing-page/landing-page.component').then(m => m.LandingPageComponent),
    canActivate: [unauthGuard]
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login-page/login-page.component').then(m => m.LoginPageComponent),
    canActivate: [unauthGuard]
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./features/auth/register-page/register-page.component').then((m) => m.RegisterPageComponent),
    canActivate: [unauthGuard]
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/projects/dashboard-page/dashboard-page.component').then(m => m.DashboardPageComponent),
    canActivate: [authGuard]
  },
  {
    path: 'board/:projectId',
    loadComponent: () =>
      import('./features/board/board-page/board-page.component').then(m => m.BoardPageComponent),
    canActivate: [authGuard]
  },
  // Wildcard composes with the `unauthGuard` on `''`: unknown paths fall through
  // to the landing route, which then redirects authenticated users to
  // AUTH_HOME_ROUTE and leaves anonymous visitors on the landing page.
  {
    path: '**',
    redirectTo: '',
    pathMatch: 'full'
  }
];
