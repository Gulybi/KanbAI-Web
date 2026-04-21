import {Injectable, inject, signal} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { AuthResponseDto, UserProfileDto, LoginRequestDto, RegisterRequestDto } from '../models/auth.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  private readonly apiUrl = 'http://localhost:5257/api/auth';

  currentUser = signal<UserProfileDto | null>(null);

  login(credentials: LoginRequestDto): Observable<AuthResponseDto> {
    return this.http.post<AuthResponseDto>(`${this.apiUrl}/login`, credentials).pipe(tap(response => this.handleAuthSuccess(response)));
  }

  register(user: RegisterRequestDto): Observable<AuthResponseDto> {
    return this.http.post<AuthResponseDto>(`${this.apiUrl}/register`, user).pipe(tap(response => this.handleAuthSuccess(response)));
  }

  logout(): void {
    localStorage.removeItem('jwt_token');
    this.currentUser.set(null);
  }

  private handleAuthSuccess(response: AuthResponseDto): void {
    localStorage.setItem('jwt_token', response.token);
    this.currentUser.set(response.user);
  }
}
