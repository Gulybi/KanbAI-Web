import { TestBed } from '@angular/core/testing';
import { effect, Injectable } from '@angular/core';
import { BaseStateService } from './base-state.service';

/**
 * Test state interface for demonstrating the pattern
 */
interface TestState {
  count: number;
  name: string;
  items: string[];
}

/**
 * Concrete implementation of BaseStateService for testing
 */
@Injectable()
class TestStateService extends BaseStateService<TestState> {
  protected getInitialState(): TestState {
    return {
      count: 0,
      name: 'initial',
      items: []
    };
  }

  // Public selectors
  readonly count = this.select(state => state.count);
  readonly name = this.select(state => state.name);
  readonly items = this.select(state => state.items);

  // Computed values
  readonly itemCount = this.select(state => state.items.length);
  readonly displayName = this.select(state =>
    state.name.toUpperCase() + ' (' + state.count + ')'
  );

  // Public methods that modify state
  increment(): void {
    this.setState({ count: this.getState().count + 1 });
  }

  setName(name: string): void {
    this.setState({ name });
  }

  addItem(item: string): void {
    const currentItems = this.getState().items;
    this.setState({ items: [...currentItems, item] });
  }

  reset(): void {
    this.replaceState(this.getInitialState());
  }
}

describe('BaseStateService', () => {
  let service: TestStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TestStateService]
    });
    service = TestBed.inject(TestStateService);
  });

  describe('Initialization', () => {
    it('should initialize with default state', () => {
      expect(service.count()).toBe(0);
      expect(service.name()).toBe('initial');
      expect(service.items()).toEqual([]);
    });
  });

  describe('State Updates', () => {
    it('should update state immutably with setState', () => {
      service.increment();
      expect(service.count()).toBe(1);

      service.increment();
      expect(service.count()).toBe(2);
    });

    it('should update only specified properties', () => {
      service.setName('updated');
      expect(service.name()).toBe('updated');
      expect(service.count()).toBe(0); // Other properties unchanged
    });

    it('should handle nested array updates immutably', () => {
      service.addItem('item1');
      const firstItems = service.items();

      service.addItem('item2');
      const secondItems = service.items();

      expect(secondItems).toEqual(['item1', 'item2']);
      expect(firstItems).not.toBe(secondItems); // Different array instances after update
    });

    it('should replace entire state with replaceState', () => {
      service.increment();
      service.setName('test');
      service.addItem('item');

      service.reset();

      expect(service.count()).toBe(0);
      expect(service.name()).toBe('initial');
      expect(service.items()).toEqual([]);
    });
  });

  describe('Signal Reactivity', () => {
    it('should react to state changes in computed signals', () => {
      expect(service.itemCount()).toBe(0);

      service.addItem('item1');
      expect(service.itemCount()).toBe(1);

      service.addItem('item2');
      expect(service.itemCount()).toBe(2);
    });

    it('should react to multiple state properties in computed signals', () => {
      expect(service.displayName()).toBe('INITIAL (0)');

      service.setName('test');
      expect(service.displayName()).toBe('TEST (0)');

      service.increment();
      expect(service.displayName()).toBe('TEST (1)');
    });

    it('should trigger effect callbacks when state changes', () => {
      const emittedValues: number[] = [];

      TestBed.runInInjectionContext(() => {
        effect(() => {
          emittedValues.push(service.count());
        });
      });

      // Initial value should be captured
      TestBed.flushEffects();
      expect(emittedValues).toContain(0);

      service.increment();
      TestBed.flushEffects();
      expect(emittedValues).toContain(1);

      service.increment();
      TestBed.flushEffects();
      expect(emittedValues).toContain(2);
    });
  });

  describe('Immutability Guarantees', () => {
    it('should create new array references on updates preventing accidental mutations', () => {
      service.addItem('item1');
      const firstReference = service.items();

      // Adding a new item creates a new array
      service.addItem('item2');
      const secondReference = service.items();

      // The old reference still has the old data (but mutating it won't affect state)
      expect(firstReference).toEqual(['item1']);
      expect(secondReference).toEqual(['item1', 'item2']);
      expect(firstReference).not.toBe(secondReference);
    });

    it('should create new references on each update', () => {
      service.addItem('item1');
      const firstItems = service.items();

      service.addItem('item2');
      const secondItems = service.items();

      expect(firstItems).not.toBe(secondItems);
      expect(firstItems).toEqual(['item1']);
      expect(secondItems).toEqual(['item1', 'item2']);
    });
  });

  describe('Multiple Rapid Updates', () => {
    it('should handle rapid consecutive updates correctly', () => {
      for (let i = 0; i < 10; i++) {
        service.increment();
      }
      expect(service.count()).toBe(10);
    });

    it('should handle multiple property updates in sequence', () => {
      service.setName('name1');
      service.increment();
      service.addItem('item1');
      service.setName('name2');
      service.increment();

      expect(service.name()).toBe('name2');
      expect(service.count()).toBe(2);
      expect(service.items()).toEqual(['item1']);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty object updates without breaking state', () => {
      service.increment();
      const countBefore = service.count();

      // This should be a no-op but should not crash
      (service as any).setState({});

      expect(service.count()).toBe(countBefore);
    });

    it('should handle partial updates without affecting other properties', () => {
      service.increment();
      service.setName('test');
      service.addItem('item');

      service.setName('updated');

      expect(service.name()).toBe('updated');
      expect(service.count()).toBe(1); // Unchanged
      expect(service.items()).toEqual(['item']); // Unchanged
    });
  });
});
