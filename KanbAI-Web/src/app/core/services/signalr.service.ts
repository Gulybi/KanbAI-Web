import { Injectable, Signal, effect, inject, signal } from '@angular/core';
import {
  HubConnection,
  HubConnectionBuilder,
} from '@microsoft/signalr';
import { Observable, Subject } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthStateService } from './auth-state.service';

/**
 * High-level connection state exposed by {@link SignalRService}.
 *
 * Mirrors the transitions a SignalR transport can be in. Consumers render
 * status indicators from this signal; they must NOT infer the underlying
 * `HubConnectionState` values directly.
 */
export type SignalRConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

/**
 * Public surface of the SignalR client service. This is the contract future
 * consumers (issue #46 onward) should depend on.
 */
export interface SignalRServiceContract {
  readonly connectionState: Signal<SignalRConnectionState>;
  start(): Promise<void>;
  stop(): Promise<void>;
  on<T>(eventName: string): Observable<T>;
}

@Injectable({ providedIn: 'root' })
export class SignalRService implements SignalRServiceContract {
  private readonly authStateService = inject(AuthStateService);

  private readonly state = signal<SignalRConnectionState>('disconnected');
  readonly connectionState: Signal<SignalRConnectionState> =
    this.state.asReadonly();

  private connection: HubConnection | null = null;
  private readonly eventSubjects = new Map<string, Subject<unknown>>();
  private startPromise: Promise<void> | null = null;

  constructor() {
    effect(() => {
      if (this.authStateService.isAuthenticated()) {
        void this.start();
      } else {
        void this.stop();
      }
    });
  }

  async start(): Promise<void> {
    const currentState = this.state();
    if (currentState === 'connected' || currentState === 'connecting') {
      return;
    }

    if (!this.authStateService.isAuthenticated()) {
      return;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    const connection = new HubConnectionBuilder()
      .withUrl(environment.hubUrl, {
        accessTokenFactory: () => this.authStateService.getToken() ?? '',
      })
      .withAutomaticReconnect([0, 2000, 10000, 30000])
      .build();

    connection.onreconnecting(() => {
      this.state.set('reconnecting');
    });

    connection.onreconnected(() => {
      this.state.set('connected');
    });

    connection.onclose(() => {
      this.state.set('disconnected');
    });

    for (const [eventName, subject] of this.eventSubjects) {
      connection.on(eventName, (payload: unknown) => subject.next(payload));
    }

    this.connection = connection;
    this.state.set('connecting');

    this.startPromise = connection
      .start()
      .then(() => {
        this.state.set('connected');
      })
      .catch(() => {
        this.state.set('disconnected');
        console.error('SignalR start failed');
      })
      .finally(() => {
        this.startPromise = null;
      });

    return this.startPromise;
  }

  async stop(): Promise<void> {
    const connection = this.connection;
    if (!connection) {
      return;
    }

    this.connection = null;

    try {
      await connection.stop();
    } catch {
      console.error('SignalR stop failed');
    }

    for (const subject of this.eventSubjects.values()) {
      subject.complete();
    }
    this.eventSubjects.clear();

    this.state.set('disconnected');
  }

  on<T>(eventName: string): Observable<T> {
    const existing = this.eventSubjects.get(eventName);
    if (existing) {
      return (existing as Subject<T>).asObservable();
    }

    const subject = new Subject<unknown>();
    this.eventSubjects.set(eventName, subject);

    if (this.connection) {
      this.connection.on(eventName, (payload: unknown) =>
        subject.next(payload),
      );
    }

    return (subject as Subject<T>).asObservable();
  }
}
