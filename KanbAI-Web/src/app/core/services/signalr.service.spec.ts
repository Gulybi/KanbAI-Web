import { TestBed } from '@angular/core/testing';
import { WritableSignal, computed, signal } from '@angular/core';

import { SignalRService } from './signalr.service';
import { AuthStateService } from './auth-state.service';
import { environment } from '../../../environments/environment';

// Hoist shared mock state so it is available at the time vi.mock() evaluates.
// Using vi.hoisted (instead of a module-scoped const referenced from inside
// the factory) avoids a race in the Angular Vitest builder's mock patch where
// the @microsoft/signalr module is sometimes pre-bundled before the factory
// runs, which, with a class-based factory that uses constructor-return, can
// intermittently surface as `TypeError: Cannot read properties of undefined
// (reading 'trim')` when this spec is loaded alongside other specs.
const mocks = vi.hoisted(() => {
  interface MockConnection {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    invoke: ReturnType<typeof vi.fn>;
    onreconnecting: ReturnType<typeof vi.fn>;
    onreconnected: ReturnType<typeof vi.fn>;
    onclose: ReturnType<typeof vi.fn>;
    _handlers: Map<string, (payload: unknown) => void>;
    _onreconnecting: ((...args: unknown[]) => void) | null;
    _onreconnected: ((...args: unknown[]) => void) | null;
    _onclose: ((...args: unknown[]) => void) | null;
  }

  interface MockBuilder {
    withUrl: ReturnType<typeof vi.fn>;
    withAutomaticReconnect: ReturnType<typeof vi.fn>;
    build: ReturnType<typeof vi.fn>;
    _capturedUrl: string | null;
    _capturedOptions: { accessTokenFactory?: () => string } | null;
    _capturedReconnectSchedule: number[] | null;
    _connection: MockConnection;
  }

  function makeMockConnection(): MockConnection {
    const handlers = new Map<string, (payload: unknown) => void>();
    const conn: MockConnection = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      on: vi.fn((name: string, handler: (payload: unknown) => void) => {
        handlers.set(name, handler);
      }),
      invoke: vi.fn().mockResolvedValue(undefined),
      onreconnecting: vi.fn((cb: (...args: unknown[]) => void) => {
        conn._onreconnecting = cb;
      }),
      onreconnected: vi.fn((cb: (...args: unknown[]) => void) => {
        conn._onreconnected = cb;
      }),
      onclose: vi.fn((cb: (...args: unknown[]) => void) => {
        conn._onclose = cb;
      }),
      _handlers: handlers,
      _onreconnecting: null,
      _onreconnected: null,
      _onclose: null
    };
    return conn;
  }

  function makeMockBuilder(): MockBuilder {
    const conn = makeMockConnection();
    const self: MockBuilder = {
      withUrl: vi.fn((url: string, opts?: { accessTokenFactory?: () => string }) => {
        self._capturedUrl = url;
        self._capturedOptions = opts ?? null;
        return self;
      }),
      withAutomaticReconnect: vi.fn((schedule?: number[]) => {
        self._capturedReconnectSchedule = schedule ?? null;
        return self;
      }),
      build: vi.fn(() => conn),
      _capturedUrl: null,
      _capturedOptions: null,
      _capturedReconnectSchedule: null,
      _connection: conn
    };
    return self;
  }

  const state: {
    latestBuilder: MockBuilder | null;
    builderCount: number;
    // Pluggable factory for the mocked HubConnectionBuilder constructor body.
    // Tests that want a custom builder (e.g. the privacy/start-failure test)
    // swap this out before the SignalRService is instantiated.
    buildFactory: () => MockBuilder;
  } = {
    latestBuilder: null,
    builderCount: 0,
    buildFactory: () => {
      const builder = makeMockBuilder();
      state.latestBuilder = builder;
      state.builderCount += 1;
      return builder;
    }
  };

  return {
    makeMockConnection,
    makeMockBuilder,
    state
  };
});

vi.mock('@microsoft/signalr', () => {
  // Use a real constructor function (NOT an arrow) so `new HubConnectionBuilder()`
  // in production code succeeds; arrows cannot be invoked with `new`.
  function HubConnectionBuilder(this: unknown) {
    // Delegate all behavior to the current buildFactory. Returning an object
    // from a constructor replaces `this` with the returned value, which is
    // exactly what we want so the chainable mock-builder is handed to the SUT.
    return mocks.state.buildFactory();
  }
  return {
    HubConnectionBuilder,
    HubConnectionState: {
      Disconnected: 'Disconnected',
      Connecting: 'Connecting',
      Connected: 'Connected',
      Disconnecting: 'Disconnecting',
      Reconnecting: 'Reconnecting'
    }
  };
});

/** Stub of AuthStateService that exposes controllable signals. */
function createAuthStub(initial: {
  authenticated: boolean;
  token: string | null;
}) {
  const tokenSig: WritableSignal<string | null> = signal(initial.token);
  const authSig: WritableSignal<boolean> = signal(initial.authenticated);

  const stub = {
    // Read-only computed so components can't write to it.
    isAuthenticated: computed(() => authSig()),
    getToken: () => tokenSig(),
    // Test-only setters:
    _setAuthenticated(value: boolean) {
      authSig.set(value);
    },
    _setToken(value: string | null) {
      tokenSig.set(value);
    }
  };
  return stub;
}

function flushMicrotasks(): Promise<void> {
  return Promise.resolve().then(() => Promise.resolve());
}

describe('SignalRService', () => {
  // Preserve the default build factory so tests that replace it (e.g. the
  // privacy test) can restore it without relying on implementation details.
  const defaultBuildFactory = mocks.state.buildFactory;

  beforeEach(() => {
    mocks.state.latestBuilder = null;
    mocks.state.builderCount = 0;
    mocks.state.buildFactory = defaultBuildFactory;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Service Creation', () => {
    it('should be created when user is unauthenticated without building a connection', () => {
      const auth = createAuthStub({ authenticated: false, token: null });
      TestBed.configureTestingModule({
        providers: [
          SignalRService,
          { provide: AuthStateService, useValue: auth }
        ]
      });

      const service = TestBed.inject(SignalRService);
      TestBed.flushEffects();

      expect(service).toBeTruthy();
      expect(service.connectionState()).toBe('disconnected');
      expect(mocks.state.builderCount).toBe(0);
    });
  });

  describe('Authentication-driven connection lifecycle', () => {
    it('does not connect when start() is called while unauthenticated', async () => {
      const auth = createAuthStub({ authenticated: false, token: null });
      TestBed.configureTestingModule({
        providers: [
          SignalRService,
          { provide: AuthStateService, useValue: auth }
        ]
      });

      const service = TestBed.inject(SignalRService);
      TestBed.flushEffects();

      await service.start();

      expect(mocks.state.builderCount).toBe(0);
      expect(service.connectionState()).toBe('disconnected');
    });

    it('connects when authenticated, using environment.hubUrl and access token', async () => {
      const auth = createAuthStub({ authenticated: true, token: 'fake-token' });
      TestBed.configureTestingModule({
        providers: [
          SignalRService,
          { provide: AuthStateService, useValue: auth }
        ]
      });

      const service = TestBed.inject(SignalRService);
      TestBed.flushEffects();
      // Let the effect-triggered start() promise settle.
      await flushMicrotasks();
      await flushMicrotasks();

      expect(mocks.state.builderCount).toBe(1);
      const builder = mocks.state.latestBuilder!;
      expect(builder._capturedUrl).toBe(environment.hubUrl);

      const factory = builder._capturedOptions!.accessTokenFactory!;
      expect(factory()).toBe('fake-token');

      expect(builder._capturedReconnectSchedule).toEqual([0, 2000, 10000, 30000]);
      expect(builder._connection.start).toHaveBeenCalledTimes(1);
      expect(service.connectionState()).toBe('connected');
    });

    it('auth false → true triggers start via effect', async () => {
      const auth = createAuthStub({ authenticated: false, token: null });
      TestBed.configureTestingModule({
        providers: [
          SignalRService,
          { provide: AuthStateService, useValue: auth }
        ]
      });

      const service = TestBed.inject(SignalRService);
      TestBed.flushEffects();
      expect(mocks.state.builderCount).toBe(0);

      auth._setToken('fake-token');
      auth._setAuthenticated(true);
      TestBed.flushEffects();
      await flushMicrotasks();
      await flushMicrotasks();

      expect(mocks.state.builderCount).toBe(1);
      expect(mocks.state.latestBuilder!._connection.start).toHaveBeenCalledTimes(1);
      expect(service.connectionState()).toBe('connected');
    });

    it('auth true → false triggers stop via effect and clears state to disconnected', async () => {
      const auth = createAuthStub({ authenticated: true, token: 'fake-token' });
      TestBed.configureTestingModule({
        providers: [
          SignalRService,
          { provide: AuthStateService, useValue: auth }
        ]
      });

      const service = TestBed.inject(SignalRService);
      TestBed.flushEffects();
      await flushMicrotasks();
      await flushMicrotasks();
      expect(service.connectionState()).toBe('connected');

      const connection = mocks.state.latestBuilder!._connection;

      auth._setAuthenticated(false);
      auth._setToken(null);
      TestBed.flushEffects();
      await flushMicrotasks();
      await flushMicrotasks();

      expect(connection.stop).toHaveBeenCalledTimes(1);
      expect(service.connectionState()).toBe('disconnected');
    });
  });

  describe('Idempotency', () => {
    it('start() is a no-op while already connecting/connected', async () => {
      const auth = createAuthStub({ authenticated: true, token: 'fake-token' });
      TestBed.configureTestingModule({
        providers: [
          SignalRService,
          { provide: AuthStateService, useValue: auth }
        ]
      });

      const service = TestBed.inject(SignalRService);
      TestBed.flushEffects();
      await flushMicrotasks();
      await flushMicrotasks();
      expect(service.connectionState()).toBe('connected');

      // Second start() after connected must be a no-op.
      await service.start();
      const connection = mocks.state.latestBuilder!._connection;
      expect(connection.start).toHaveBeenCalledTimes(1);
      // No new builder built.
      expect(mocks.state.builderCount).toBe(1);
    });

    it('concurrent start() calls share a single in-flight connection', async () => {
      const auth = createAuthStub({ authenticated: false, token: null });
      TestBed.configureTestingModule({
        providers: [
          SignalRService,
          { provide: AuthStateService, useValue: auth }
        ]
      });

      const service = TestBed.inject(SignalRService);
      TestBed.flushEffects();

      // Authenticate without letting the effect-driven start settle between.
      auth._setToken('fake-token');
      auth._setAuthenticated(true);

      const first = service.start();
      const second = service.start();
      await Promise.all([first, second]);

      expect(mocks.state.builderCount).toBe(1);
      const connection = mocks.state.latestBuilder!._connection;
      expect(connection.start).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop()', () => {
    it('completes every event Subject and clears the router map', async () => {
      const auth = createAuthStub({ authenticated: true, token: 'fake-token' });
      TestBed.configureTestingModule({
        providers: [
          SignalRService,
          { provide: AuthStateService, useValue: auth }
        ]
      });

      const service = TestBed.inject(SignalRService);
      TestBed.flushEffects();
      await flushMicrotasks();
      await flushMicrotasks();

      let completed = false;
      const sub = service.on<{ foo: number }>('X').subscribe({
        complete: () => {
          completed = true;
        }
      });

      await service.stop();

      expect(completed).toBe(true);
      expect(service.connectionState()).toBe('disconnected');
      sub.unsubscribe();

      // After a fresh start, re-subscribing to the same event name yields a
      // fresh Subject (completion wouldn't have been rebroadcast otherwise).
      auth._setAuthenticated(true);
      TestBed.flushEffects();
      await flushMicrotasks();
      await flushMicrotasks();

      let secondCompleted = false;
      let emissionCount = 0;
      const sub2 = service.on<{ foo: number }>('X').subscribe({
        next: () => {
          emissionCount += 1;
        },
        complete: () => {
          secondCompleted = true;
        }
      });

      const connection = mocks.state.latestBuilder!._connection;
      const handler = connection._handlers.get('X')!;
      expect(handler).toBeDefined();
      handler({ foo: 42 });
      expect(emissionCount).toBe(1);
      expect(secondCompleted).toBe(false);
      sub2.unsubscribe();
    });

    it('is a no-op when no connection exists', async () => {
      const auth = createAuthStub({ authenticated: false, token: null });
      TestBed.configureTestingModule({
        providers: [
          SignalRService,
          { provide: AuthStateService, useValue: auth }
        ]
      });

      const service = TestBed.inject(SignalRService);
      TestBed.flushEffects();

      await expect(service.stop()).resolves.toBeUndefined();
      expect(mocks.state.builderCount).toBe(0);
    });
  });

  describe('on<T>()', () => {
    it('delivers server-published events to subscribers', async () => {
      const auth = createAuthStub({ authenticated: true, token: 'fake-token' });
      TestBed.configureTestingModule({
        providers: [
          SignalRService,
          { provide: AuthStateService, useValue: auth }
        ]
      });

      const service = TestBed.inject(SignalRService);
      TestBed.flushEffects();
      await flushMicrotasks();
      await flushMicrotasks();

      const received: Array<{ foo: number }> = [];
      const sub = service.on<{ foo: number }>('TaskMoved').subscribe(payload => {
        received.push(payload);
      });

      const connection = mocks.state.latestBuilder!._connection;
      const handler = connection._handlers.get('TaskMoved');
      expect(handler).toBeDefined();

      handler!({ foo: 1 });
      handler!({ foo: 2 });

      expect(received).toEqual([{ foo: 1 }, { foo: 2 }]);
      sub.unsubscribe();
    });

    it('returns the same Subject for repeated subscriptions to the same event name', async () => {
      const auth = createAuthStub({ authenticated: true, token: 'fake-token' });
      TestBed.configureTestingModule({
        providers: [
          SignalRService,
          { provide: AuthStateService, useValue: auth }
        ]
      });

      const service = TestBed.inject(SignalRService);
      TestBed.flushEffects();
      await flushMicrotasks();
      await flushMicrotasks();

      const received1: unknown[] = [];
      const received2: unknown[] = [];
      const sub1 = service.on<{ n: number }>('E').subscribe(p => received1.push(p));
      const sub2 = service.on<{ n: number }>('E').subscribe(p => received2.push(p));

      const connection = mocks.state.latestBuilder!._connection;
      const handler = connection._handlers.get('E')!;
      handler({ n: 7 });

      expect(received1).toEqual([{ n: 7 }]);
      expect(received2).toEqual([{ n: 7 }]);
      // The connection.on registration should have happened exactly once for 'E'.
      const registrations = connection.on.mock.calls.filter(c => c[0] === 'E');
      expect(registrations.length).toBe(1);

      sub1.unsubscribe();
      sub2.unsubscribe();
    });

    it('pre-start on() subscriptions receive events once start() completes', async () => {
      const auth = createAuthStub({ authenticated: false, token: null });
      TestBed.configureTestingModule({
        providers: [
          SignalRService,
          { provide: AuthStateService, useValue: auth }
        ]
      });

      const service = TestBed.inject(SignalRService);
      TestBed.flushEffects();

      const received: Array<{ v: number }> = [];
      const sub = service.on<{ v: number }>('Pre').subscribe(p => received.push(p));

      // Now authenticate and let the effect connect.
      auth._setToken('fake-token');
      auth._setAuthenticated(true);
      TestBed.flushEffects();
      await flushMicrotasks();
      await flushMicrotasks();

      const connection = mocks.state.latestBuilder!._connection;
      const handler = connection._handlers.get('Pre');
      expect(handler).toBeDefined();

      handler!({ v: 99 });
      expect(received).toEqual([{ v: 99 }]);
      sub.unsubscribe();
    });
  });

  describe('Reconnect lifecycle', () => {
    it('updates connectionState on reconnecting / reconnected / close events', async () => {
      const auth = createAuthStub({ authenticated: true, token: 'fake-token' });
      TestBed.configureTestingModule({
        providers: [
          SignalRService,
          { provide: AuthStateService, useValue: auth }
        ]
      });

      const service = TestBed.inject(SignalRService);
      TestBed.flushEffects();
      await flushMicrotasks();
      await flushMicrotasks();
      expect(service.connectionState()).toBe('connected');

      const connection = mocks.state.latestBuilder!._connection;

      connection._onreconnecting!();
      expect(service.connectionState()).toBe('reconnecting');

      connection._onreconnected!();
      expect(service.connectionState()).toBe('connected');

      connection._onclose!();
      expect(service.connectionState()).toBe('disconnected');
    });

    it('does NOT auto-restart the connection when onclose fires while still authenticated (Key Decision #3)', async () => {
      const auth = createAuthStub({ authenticated: true, token: 'fake-token' });
      TestBed.configureTestingModule({
        providers: [
          SignalRService,
          { provide: AuthStateService, useValue: auth }
        ]
      });

      const service = TestBed.inject(SignalRService);
      TestBed.flushEffects();
      await flushMicrotasks();
      await flushMicrotasks();
      expect(service.connectionState()).toBe('connected');
      expect(mocks.state.builderCount).toBe(1);

      const connection = mocks.state.latestBuilder!._connection;

      // Server/network closes the connection. Auth is still true, but the
      // service must NOT auto-restart — only the auth effect drives restarts,
      // and the auth signal did not change. We intentionally do NOT call
      // `TestBed.flushEffects()` here because Angular effects only re-run
      // when their tracked signals change; the auth signal did not.
      connection._onclose!();
      await flushMicrotasks();
      await flushMicrotasks();

      // Even if a downstream consumer were to flush, no new start should
      // happen from the onclose path itself.
      expect(service.connectionState()).toBe('disconnected');
      expect(mocks.state.builderCount).toBe(1);
      expect(connection.start).toHaveBeenCalledTimes(1);
    });
  });

  describe('accessTokenFactory', () => {
    it('re-reads the current token on every invocation', async () => {
      const auth = createAuthStub({ authenticated: true, token: 'token-v1' });
      TestBed.configureTestingModule({
        providers: [
          SignalRService,
          { provide: AuthStateService, useValue: auth }
        ]
      });

      TestBed.inject(SignalRService);
      TestBed.flushEffects();
      await flushMicrotasks();
      await flushMicrotasks();

      const factory = mocks.state.latestBuilder!._capturedOptions!.accessTokenFactory!;
      expect(factory()).toBe('token-v1');

      auth._setToken('token-v2');
      expect(factory()).toBe('token-v2');

      auth._setToken(null);
      expect(factory()).toBe('');
    });
  });

  describe('Privacy / logging (AC9)', () => {
    it('never logs the access token, even on start failure', async () => {
      const auth = createAuthStub({ authenticated: true, token: 'super-secret-jwt' });

      // Arrange: replace the build factory so the NEXT HubConnectionBuilder
      // produces a connection whose start() rejects with an error that
      // CONTAINS the token string. This guarantees the
      // `console.error('SignalR start failed')` branch is actually exercised
      // (the previous revision of this test never reached it because it
      // mutated builder #1 after it had already resolved).
      mocks.state.buildFactory = () => {
        const builder = mocks.makeMockBuilder();
        builder._connection.start = vi
          .fn()
          .mockRejectedValue(new Error('boom: super-secret-jwt'));
        mocks.state.latestBuilder = builder;
        mocks.state.builderCount += 1;
        return builder;
      };

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      TestBed.configureTestingModule({
        providers: [
          SignalRService,
          { provide: AuthStateService, useValue: auth }
        ]
      });

      const service = TestBed.inject(SignalRService);
      TestBed.flushEffects();
      await flushMicrotasks();
      await flushMicrotasks();
      await flushMicrotasks();

      // Sanity: the error branch was actually reached.
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(service.connectionState()).toBe('disconnected');

      const allArgs = [
        ...consoleErrorSpy.mock.calls.flat(),
        ...consoleLogSpy.mock.calls.flat()
      ];

      expect(allArgs.length).toBeGreaterThan(0);
      for (const arg of allArgs) {
        const asString = typeof arg === 'string' ? arg : JSON.stringify(arg);
        expect(asString).not.toContain('super-secret-jwt');
      }

      // (beforeEach of the next test restores the default build factory.)
      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });
  });

  describe('joinProjectGroup() / leaveProjectGroup()', () => {
    const PROJECT_ID = 'proj-abc-123';

    it('invokes the underlying hub method once connected', async () => {
      const auth = createAuthStub({ authenticated: true, token: 'fake-token' });
      TestBed.configureTestingModule({
        providers: [
          SignalRService,
          { provide: AuthStateService, useValue: auth }
        ]
      });

      const service = TestBed.inject(SignalRService);
      TestBed.flushEffects();
      await flushMicrotasks();
      await flushMicrotasks();
      expect(service.connectionState()).toBe('connected');

      const connection = mocks.state.latestBuilder!._connection;
      await service.joinProjectGroup(PROJECT_ID);
      await service.leaveProjectGroup(PROJECT_ID);

      expect(connection.invoke).toHaveBeenCalledWith('JoinProjectGroup', PROJECT_ID);
      expect(connection.invoke).toHaveBeenCalledWith('LeaveProjectGroup', PROJECT_ID);
      expect(connection.invoke).toHaveBeenCalledTimes(2);
    });

    it('is a no-op when the connection is not yet connected', async () => {
      const auth = createAuthStub({ authenticated: false, token: null });
      TestBed.configureTestingModule({
        providers: [
          SignalRService,
          { provide: AuthStateService, useValue: auth }
        ]
      });

      const service = TestBed.inject(SignalRService);
      TestBed.flushEffects();

      await expect(service.joinProjectGroup(PROJECT_ID)).resolves.toBeUndefined();
      await expect(service.leaveProjectGroup(PROJECT_ID)).resolves.toBeUndefined();

      // No connection was ever built, so there is no invoke to spy on.
      expect(mocks.state.builderCount).toBe(0);
    });

    it('is a no-op after auth drops to disconnected', async () => {
      const auth = createAuthStub({ authenticated: true, token: 'fake-token' });
      TestBed.configureTestingModule({
        providers: [
          SignalRService,
          { provide: AuthStateService, useValue: auth }
        ]
      });

      const service = TestBed.inject(SignalRService);
      TestBed.flushEffects();
      await flushMicrotasks();
      await flushMicrotasks();

      const connection = mocks.state.latestBuilder!._connection;

      // Stop the connection (simulating logout).
      auth._setAuthenticated(false);
      auth._setToken(null);
      TestBed.flushEffects();
      await flushMicrotasks();
      await flushMicrotasks();
      expect(service.connectionState()).toBe('disconnected');

      await service.joinProjectGroup(PROJECT_ID);
      await service.leaveProjectGroup(PROJECT_ID);

      // Stop was called, but no Join/Leave invocation ever reached the wire.
      expect(connection.invoke).not.toHaveBeenCalled();
    });

    it('is a no-op when projectId is empty/whitespace', async () => {
      const auth = createAuthStub({ authenticated: true, token: 'fake-token' });
      TestBed.configureTestingModule({
        providers: [
          SignalRService,
          { provide: AuthStateService, useValue: auth }
        ]
      });

      const service = TestBed.inject(SignalRService);
      TestBed.flushEffects();
      await flushMicrotasks();
      await flushMicrotasks();

      await service.joinProjectGroup('');
      await service.joinProjectGroup('   ');
      await service.leaveProjectGroup('');

      const connection = mocks.state.latestBuilder!._connection;
      expect(connection.invoke).not.toHaveBeenCalled();
    });

    it('logs a bare error and never throws when the hub invoke rejects, and never logs the projectId', async () => {
      const auth = createAuthStub({ authenticated: true, token: 'fake-token' });
      TestBed.configureTestingModule({
        providers: [
          SignalRService,
          { provide: AuthStateService, useValue: auth }
        ]
      });

      const service = TestBed.inject(SignalRService);
      TestBed.flushEffects();
      await flushMicrotasks();
      await flushMicrotasks();

      const connection = mocks.state.latestBuilder!._connection;
      // Reject with an error whose message contains the projectId — the
      // service must NOT propagate that to any console sink.
      connection.invoke = vi
        .fn()
        .mockRejectedValue(new Error(`boom: ${PROJECT_ID}`));

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      // Never throws.
      await expect(service.joinProjectGroup(PROJECT_ID)).resolves.toBeUndefined();
      await expect(service.leaveProjectGroup(PROJECT_ID)).resolves.toBeUndefined();

      // Both hub methods logged once each; neither log contains the id.
      expect(consoleErrorSpy).toHaveBeenCalled();
      const allArgs = [
        ...consoleErrorSpy.mock.calls.flat(),
        ...consoleLogSpy.mock.calls.flat()
      ];
      for (const arg of allArgs) {
        const asString = typeof arg === 'string' ? arg : JSON.stringify(arg);
        expect(asString).not.toContain(PROJECT_ID);
      }

      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });
  });
});
