import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { unauthGuard } from './core/guards/unauth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/landing/landing-page/landing-page.component').then(m => m.LandingPageComponent),
    canActivate: [unauthGuard]
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login-page/login-page.component').then(m => m.LoginPageComponent)
  },
  {
    path: 'board',
    loadComponent: () => import('./features/board/board-page/board-page.component').then(m => m.BoardPageComponent),
    canActivate: [authGuard]
  }
];
