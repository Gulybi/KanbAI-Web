# State Management Pattern (Angular Signals)

This document describes the standardized state management pattern for the KanbAI-Web application using Angular Signals.

## Overview

The state management pattern provides a reusable template for managing reactive state across all features. It uses Angular Signals for synchronous reactive state and integrates with RxJS for async operations.

**Key Benefits:**
- ✅ Consistent pattern across all features
- ✅ Type-safe state management with TypeScript
- ✅ Immutable state updates
- ✅ Automatic change detection
- ✅ Easy testing
- ✅ Clear separation between state and selectors

## When to Use

### Use This Pattern When:

- **State needs to be shared** across multiple components (user authentication, task lists)
- **State requires computed/derived values** (unread count, filtered lists)
- **State involves async operations** (HTTP requests, WebSocket events)
- **State needs to survive component lifecycle** (persist during navigation)

**Examples:**
- User authentication state (currentUser, isAuthenticated)
- Task/board state (tasks, filters, sorting)
- Theme state (dark/light mode, preferences)
- Notification state (messages, unread count)

### Use Local Component Signals When:

- **State is purely UI-related** (dropdown open/closed, modal visible)
- **State doesn't need to be shared** between components
- **No derived values are needed**
- **State is temporary** (cleared on component destroy)

**Examples:**
- Form field visibility toggles
- Accordion open/closed state
- Hover states
- Local loading indicators

## Quick Start

### 1. Create a State Service

Create a new service extending `BaseStateService<YourState>`:

```typescript
import { Injectable, inject, Signal } from '@angular/core';
import { BaseStateService } from '@core/state/base-state.service';

export interface TaskState {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;
}

@Injectable({ providedIn: 'root' })
export class TaskStateService extends BaseStateService<TaskState> {
  protected getInitialState(): TaskState {
    return {
      tasks: [],
      isLoading: false,
      error: null
    };
  }

  // Public selectors
  readonly tasks = this.select(state => state.tasks);
  readonly isLoading = this.select(state => state.isLoading);
  readonly error = this.select(state => state.error);

  // Computed values
  readonly taskCount = this.select(state => state.tasks.length);
  readonly completedTasks = this.select(state =>
    state.tasks.filter(t => t.completed)
  );

  // Update methods
  addTask(task: Task): void {
    const currentTasks = this.getState().tasks;
    this.setState({ tasks: [...currentTasks, task] });
  }

  removeTask(id: string): void {
    const currentTasks = this.getState().tasks;
    this.setState({ tasks: currentTasks.filter(t => t.id !== id) });
  }
}
```

### 2. Use in Components

Inject the service and use signals in your component:

```typescript
import { Component, inject } from '@angular/core';
import { TaskStateService } from '@core/state/task-state.service';

@Component({
  selector: 'app-task-list',
  template: `
    <div>
      <p>Tasks: {{ taskState.taskCount() }}</p>
      <p>Completed: {{ taskState.completedTasks().length }}</p>

      @if (taskState.isLoading()) {
        <p>Loading...</p>
      }

      @for (task of taskState.tasks(); track task.id) {
        <div>{{ task.title }}</div>
      }
    </div>
  `
})
export class TaskListComponent {
  protected taskState = inject(TaskStateService);

  addNewTask(): void {
    this.taskState.addTask({
      id: crypto.randomUUID(),
      title: 'New Task',
      completed: false
    });
  }
}
```

## Pattern Examples

### Example 1: Task List State

Managing a list of tasks with CRUD operations:

```typescript
export interface Task {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  dueDate: Date | null;
}

export interface TaskListState {
  tasks: Task[];
  filter: 'all' | 'active' | 'completed';
  sortBy: 'title' | 'priority' | 'dueDate';
  isLoading: boolean;
  error: string | null;
}

@Injectable({ providedIn: 'root' })
export class TaskListStateService extends BaseStateService<TaskListState> {
  private http = inject(HttpClient);

  protected getInitialState(): TaskListState {
    return {
      tasks: [],
      filter: 'all',
      sortBy: 'title',
      isLoading: false,
      error: null
    };
  }

  // Selectors
  readonly tasks = this.select(state => state.tasks);
  readonly filter = this.select(state => state.filter);
  readonly sortBy = this.select(state => state.sortBy);
  readonly isLoading = this.select(state => state.isLoading);
  readonly error = this.select(state => state.error);

  // Computed values
  readonly filteredTasks = this.select(state => {
    let filtered = state.tasks;

    if (state.filter === 'active') {
      filtered = filtered.filter(t => !t.completed);
    } else if (state.filter === 'completed') {
      filtered = filtered.filter(t => t.completed);
    }

    return filtered.sort((a, b) => {
      if (state.sortBy === 'title') {
        return a.title.localeCompare(b.title);
      } else if (state.sortBy === 'priority') {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      } else {
        // Sort by dueDate
        const aDate = a.dueDate?.getTime() ?? Infinity;
        const bDate = b.dueDate?.getTime() ?? Infinity;
        return aDate - bDate;
      }
    });
  });

  readonly taskCount = this.select(state => state.tasks.length);
  readonly activeCount = this.select(state =>
    state.tasks.filter(t => !t.completed).length
  );

  // Methods
  loadTasks(): void {
    this.setState({ isLoading: true, error: null });

    this.http.get<Task[]>('/api/tasks')
      .pipe(
        catchError(error => {
          this.setState({
            isLoading: false,
            error: 'Failed to load tasks'
          });
          return of([]);
        })
      )
      .subscribe(tasks => {
        this.setState({ tasks, isLoading: false });
      });
  }

  addTask(task: Task): void {
    const currentTasks = this.getState().tasks;
    this.setState({ tasks: [...currentTasks, task] });
  }

  updateTask(id: string, updates: Partial<Task>): void {
    const currentTasks = this.getState().tasks;
    this.setState({
      tasks: currentTasks.map(t =>
        t.id === id ? { ...t, ...updates } : t
      )
    });
  }

  deleteTask(id: string): void {
    const currentTasks = this.getState().tasks;
    this.setState({
      tasks: currentTasks.filter(t => t.id !== id)
    });
  }

  setFilter(filter: 'all' | 'active' | 'completed'): void {
    this.setState({ filter });
  }

  setSortBy(sortBy: 'title' | 'priority' | 'dueDate'): void {
    this.setState({ sortBy });
  }
}
```

### Example 2: Theme State with Persistence

Managing theme preferences with localStorage persistence:

```typescript
export type Theme = 'light' | 'dark' | 'auto';

export interface ThemeState {
  currentTheme: Theme;
  systemPreference: 'light' | 'dark';
}

@Injectable({ providedIn: 'root' })
export class ThemeStateService extends BaseStateService<ThemeState> {
  private readonly THEME_STORAGE_KEY = 'app-theme';

  protected getInitialState(): ThemeState {
    const savedTheme = localStorage.getItem(this.THEME_STORAGE_KEY) as Theme | null;
    const systemPreference = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';

    return {
      currentTheme: savedTheme ?? 'auto',
      systemPreference
    };
  }

  // Selectors
  readonly currentTheme = this.select(state => state.currentTheme);
  readonly systemPreference = this.select(state => state.systemPreference);

  // Computed: Resolved theme (handles 'auto' by using system preference)
  readonly effectiveTheme = this.select(state =>
    state.currentTheme === 'auto'
      ? state.systemPreference
      : state.currentTheme
  );

  // Methods
  setTheme(theme: Theme): void {
    this.setState({ currentTheme: theme });
    localStorage.setItem(this.THEME_STORAGE_KEY, theme);
    this.applyThemeToDOM();
  }

  updateSystemPreference(preference: 'light' | 'dark'): void {
    this.setState({ systemPreference: preference });
    this.applyThemeToDOM();
  }

  private applyThemeToDOM(): void {
    const theme = this.effectiveTheme();
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }
}
```

## Integration with RxJS

Use `toSignal()` to bridge RxJS Observables to Signals:

```typescript
@Injectable({ providedIn: 'root' })
export class NotificationStateService extends BaseStateService<NotificationState> {
  private http = inject(HttpClient);

  protected getInitialState(): NotificationState {
    return { notifications: [], unreadCount: 0 };
  }

  // Convert Observable to Signal
  private notifications$ = this.http.get<Notification[]>('/api/notifications');
  readonly notifications = this.toSignal(this.notifications$, { initialValue: [] });

  // Or use select() with manual subscription management
  readonly unreadCount = this.select(state => state.unreadCount);

  loadNotifications(): void {
    this.notifications$
      .pipe(takeUntilDestroyed())
      .subscribe(notifications => {
        this.setState({
          notifications,
          unreadCount: notifications.filter(n => !n.read).length
        });
      });
  }
}
```

## Testing

### Testing State Services

```typescript
describe('TaskStateService', () => {
  let service: TaskStateService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [TaskStateService]
    });

    service = TestBed.inject(TaskStateService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('should initialize with empty tasks', () => {
    expect(service.tasks()).toEqual([]);
    expect(service.taskCount()).toBe(0);
  });

  it('should add task immutably', () => {
    const task: Task = {
      id: '1',
      title: 'Test',
      completed: false
    };

    service.addTask(task);

    expect(service.tasks()).toEqual([task]);
    expect(service.taskCount()).toBe(1);
  });

  it('should load tasks from API', () => {
    const mockTasks: Task[] = [
      { id: '1', title: 'Task 1', completed: false },
      { id: '2', title: 'Task 2', completed: true }
    ];

    service.loadTasks();

    const req = httpMock.expectOne('/api/tasks');
    expect(req.request.method).toBe('GET');
    req.flush(mockTasks);

    expect(service.tasks()).toEqual(mockTasks);
    expect(service.isLoading()).toBe(false);
  });

  it('should handle API errors', () => {
    service.loadTasks();

    const req = httpMock.expectOne('/api/tasks');
    req.error(new ErrorEvent('Network error'));

    expect(service.error()).toBe('Failed to load tasks');
    expect(service.isLoading()).toBe(false);
  });
});
```

### Mocking State Services in Component Tests

```typescript
describe('TaskListComponent', () => {
  let component: TaskListComponent;
  let fixture: ComponentFixture<TaskListComponent>;
  let mockTaskState: jasmine.SpyObj<TaskStateService>;

  beforeEach(() => {
    // Create mock with signals
    mockTaskState = {
      tasks: signal<Task[]>([]),
      taskCount: signal<number>(0),
      isLoading: signal<boolean>(false),
      error: signal<string | null>(null),
      addTask: jasmine.createSpy('addTask'),
      deleteTask: jasmine.createSpy('deleteTask')
    } as any;

    TestBed.configureTestingModule({
      imports: [TaskListComponent],
      providers: [
        { provide: TaskStateService, useValue: mockTaskState }
      ]
    });

    fixture = TestBed.createComponent(TaskListComponent);
    component = fixture.componentInstance;
  });

  it('should display task count', () => {
    mockTaskState.taskCount.set(5);
    fixture.detectChanges();

    const element = fixture.nativeElement.querySelector('.task-count');
    expect(element.textContent).toContain('5');
  });
});
```

## Migration from RxJS BehaviorSubject

If you have existing state services using RxJS `BehaviorSubject`, here's how to migrate:

### Before (BehaviorSubject)

```typescript
@Injectable({ providedIn: 'root' })
export class OldUserService {
  private userSubject = new BehaviorSubject<User | null>(null);
  user$ = this.userSubject.asObservable();

  get currentUser(): User | null {
    return this.userSubject.value;
  }

  setUser(user: User): void {
    this.userSubject.next(user);
  }
}
```

### After (Signals)

```typescript
@Injectable({ providedIn: 'root' })
export class NewUserService extends BaseStateService<UserState> {
  protected getInitialState(): UserState {
    return { currentUser: null };
  }

  readonly currentUser = this.select(state => state.currentUser);

  setUser(user: User): void {
    this.setState({ currentUser: user });
  }
}
```

### Migration Checklist

- [ ] Replace `BehaviorSubject<T>` with `BaseStateService<StateInterface>`
- [ ] Convert `.value` getter to `getState()` method
- [ ] Replace `.next()` with `setState()`
- [ ] Convert `asObservable()` to `select()` for public signals
- [ ] Update component usage from `| async` pipe to `()` signal call
- [ ] Update tests to use signal assertions

## Common Pitfalls & Troubleshooting

### Pitfall 1: Mutating State Directly

❌ **Wrong:**
```typescript
const tasks = this.getState().tasks;
tasks.push(newTask); // Mutates state!
this.setState({ tasks }); // Still points to mutated array
```

✅ **Correct:**
```typescript
const tasks = this.getState().tasks;
this.setState({ tasks: [...tasks, newTask] }); // New array
```

### Pitfall 2: Forgetting to Call Signal in Template

❌ **Wrong:**
```html
<p>Count: {{ taskState.taskCount }}</p>
```

✅ **Correct:**
```html
<p>Count: {{ taskState.taskCount() }}</p>
```

### Pitfall 3: Not Using takeUntilDestroyed

❌ **Wrong:**
```typescript
ngOnInit() {
  this.http.get('/api/data').subscribe(data => {
    // Subscription never cleaned up!
  });
}
```

✅ **Correct:**
```typescript
ngOnInit() {
  this.http.get('/api/data')
    .pipe(takeUntilDestroyed())
    .subscribe(data => {
      // Automatically cleaned up when component destroys
    });
}
```

### Pitfall 4: Storing Sensitive Data in State

❌ **Wrong:**
```typescript
export interface UserState {
  password: string; // Never store passwords!
  accessToken: string; // Vulnerable to XSS
}
```

✅ **Correct:**
```typescript
export interface UserState {
  userId: string;
  email: string;
  // Tokens should be in httpOnly cookies
}
```

## Performance Considerations

### Change Detection

- State services work seamlessly with `OnPush` change detection
- Signals automatically mark components dirty when values change
- No need for manual `ChangeDetectorRef.markForCheck()`

### Memory Management

- Services with `providedIn: 'root'` are singletons (shared across app)
- Use `takeUntilDestroyed()` for automatic subscription cleanup
- Signals don't require manual cleanup (garbage collected automatically)

### State Size

- Keep state objects lean (only store necessary data)
- For large lists, consider using ID arrays + lookup maps:

```typescript
export interface TaskState {
  taskIds: string[]; // Array of IDs
  taskMap: Record<string, Task>; // Lookup map
}

// Computed selector
readonly tasks = this.select(state =>
  state.taskIds.map(id => state.taskMap[id])
);
```

## Best Practices

1. **Use `providedIn: 'root'` for app-wide state** (user, theme, global notifications)
2. **Use component-level providers for feature-scoped state** (wizard forms, modals)
3. **Keep state flat** - avoid deep nesting, use normalized structures
4. **Create computed selectors** for derived values instead of computing in templates
5. **Document state shape** with JSDoc comments and TypeScript interfaces
6. **Write tests first** - state services are easy to test in isolation
7. **Use immutable updates** - always spread objects/arrays when updating
8. **Separate concerns** - keep HTTP logic in services, state logic in state services

## Additional Resources

- [Angular Signals Documentation](https://angular.dev/guide/signals)
- [RxJS Integration Guide](https://angular.dev/guide/signals/rxjs-integration)
- [Example Implementation](../../src/app/core/state/example-user-state.service.ts)
- [Unit Test Examples](../../src/app/core/state/base-state.service.spec.ts)
