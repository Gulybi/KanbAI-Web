import { Injectable, signal, computed, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';

/**
 * Generic base class for state management services.
 *
 * This class provides a standardized pattern for managing reactive state
 * using Angular Signals. It enforces immutability, provides type safety,
 * and integrates seamlessly with RxJS for async operations.
 *
 * Usage:
 * 1. Extend this class with a specific state interface
 * 2. Initialize with default state in constructor via getInitialState()
 * 3. Expose computed selectors as public getters using select()
 * 4. Create update methods that modify state immutably using setState()
 *
 * Example:
 * ```typescript
 * interface MyState {
 *   count: number;
 *   name: string;
 * }
 *
 * @Injectable({ providedIn: 'root' })
 * class MyStateService extends BaseStateService<MyState> {
 *   protected getInitialState(): MyState {
 *     return { count: 0, name: '' };
 *   }
 *
 *   readonly count = this.select(state => state.count);
 *   readonly name = this.select(state => state.name);
 *
 *   increment(): void {
 *     this.setState({ count: this.getState().count + 1 });
 *   }
 * }
 * ```
 *
 * @template T - The shape of the state object
 */
@Injectable()
export abstract class BaseStateService<T> {
  /**
   * Private state signal - never exposed directly to prevent external mutation.
   * All state updates must go through setState() or replaceState().
   */
  private readonly state = signal<T>(this.getInitialState());

  /**
   * Subclasses must implement this to provide default/initial state.
   * This will be called during service initialization.
   *
   * @returns The initial state object
   */
  protected abstract getInitialState(): T;

  /**
   * Get the current state snapshot (read-only).
   * Use this within service methods to read current state before updates.
   *
   * @returns Read-only snapshot of current state
   */
  protected getState(): Readonly<T> {
    return this.state();
  }

  /**
   * Update state immutably using a partial update.
   * Only the provided properties will be updated, others remain unchanged.
   *
   * Example:
   * ```typescript
   * this.setState({ isLoading: true }); // Only updates isLoading
   * ```
   *
   * @param partial - Object containing properties to update
   */
  protected setState(partial: Partial<T>): void {
    this.state.update(current => ({ ...current, ...partial }));
  }

  /**
   * Replace entire state (use sparingly).
   * This overwrites the entire state object, not just specific properties.
   * Typically used for reset/logout scenarios.
   *
   * Example:
   * ```typescript
   * this.replaceState(this.getInitialState()); // Reset to defaults
   * ```
   *
   * @param newState - Complete new state object
   */
  protected replaceState(newState: T): void {
    this.state.set(newState);
  }

  /**
   * Create a computed selector from the state.
   * The selector function is called whenever state changes, returning a derived value.
   *
   * Example:
   * ```typescript
   * readonly isLoading = this.select(state => state.loading);
   * readonly userName = this.select(state => state.user?.name ?? 'Guest');
   * ```
   *
   * @param selector - Function that extracts a value from state
   * @returns A reactive Signal that updates when the selected value changes
   */
  protected select<R>(selector: (state: T) => R): Signal<R> {
    return computed(() => selector(this.state()));
  }

  /**
   * Convert an Observable to a Signal for async data.
   * Bridges RxJS streams (HTTP, WebSocket) to Signals for reactive templates.
   *
   * Example:
   * ```typescript
   * readonly users$ = this.http.get<User[]>('/api/users');
   * readonly users = this.toSignal(this.users$, { initialValue: [] });
   * ```
   *
   * @param observable - RxJS Observable to convert
   * @param options - Configuration including initialValue (required)
   * @returns A Signal that emits the Observable's values
   */
  protected toSignal<R>(
    observable: Observable<R>,
    options: { initialValue: R }
  ): Signal<R> {
    return toSignal(observable, options);
  }
}
