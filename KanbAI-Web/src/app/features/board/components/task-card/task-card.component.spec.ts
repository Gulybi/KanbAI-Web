import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { TaskCardComponent } from './task-card.component';
import { BoardTask } from '../../state/board-state.model';

function makeTask(partial?: Partial<BoardTask>): BoardTask {
  return {
    id: 't-1',
    title: 'Design login page',
    content: null,
    taskOrder: 0,
    columnId: 'col-1',
    assignedId: null,
    ...partial
  };
}

describe('TaskCardComponent', () => {
  let fixture: ComponentFixture<TaskCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskCardComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(TaskCardComponent);
    fixture.componentRef.setInput('task', makeTask());
    fixture.componentRef.setInput('rollbackTrigger', 0);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Rendering', () => {
    it('renders the task title', () => {
      const title = fixture.debugElement.query(By.css('.task-card__title'));
      expect(title).toBeTruthy();
      expect(title.nativeElement.textContent.trim()).toBe('Design login page');
    });

    it('does not render the "has content" meta when content is null', () => {
      const meta = fixture.debugElement.query(By.css('.task-card__meta'));
      expect(meta).toBeNull();
    });

    it('renders the "has content" meta when content is non-empty', () => {
      fixture.componentRef.setInput('task', makeTask({ content: 'Some notes' }));
      fixture.detectChanges();

      const meta = fixture.debugElement.query(By.css('.task-card__meta'));
      expect(meta).toBeTruthy();
      expect(meta.nativeElement.textContent).toContain('Notes');
    });

    it('sets the accessible name to the title when no content is present', () => {
      const card = fixture.debugElement.query(By.css('.task-card'));
      expect(card.nativeElement.getAttribute('aria-label')).toBe('Design login page');
    });

    it('appends "(has notes)" to the accessible name when content is present', () => {
      fixture.componentRef.setInput('task', makeTask({ content: 'Some notes' }));
      fixture.detectChanges();

      const card = fixture.debugElement.query(By.css('.task-card'));
      expect(card.nativeElement.getAttribute('aria-label')).toBe('Design login page (has notes)');
    });

    it('renders a keyboard-reachable card with tabindex=0', () => {
      const card = fixture.debugElement.query(By.css('.task-card'));
      expect(card.nativeElement.getAttribute('tabindex')).toBe('0');
    });

    it('renders a drag-handle button with an aria-label per design spec', () => {
      const handle = fixture.debugElement.query(By.css('.task-card__handle'));
      expect(handle).toBeTruthy();
      expect(handle.nativeElement.getAttribute('aria-label')).toBe('Drag Design login page');
    });
  });

  describe('Click / keyboard activation', () => {
    function dispatch(type: string, init: PointerEventInit | KeyboardEventInit): Event {
      const event = type.startsWith('pointer')
        ? new PointerEvent(type, init as PointerEventInit)
        : type.startsWith('key')
          ? new KeyboardEvent(type, init as KeyboardEventInit)
          : new Event(type);
      const el = fixture.debugElement.query(By.css('.task-card')).nativeElement as HTMLElement;
      el.dispatchEvent(event);
      return event;
    }

    it('emits cardActivated on click (no preceding pointer move)', () => {
      const spy = vi.fn();
      fixture.componentInstance.cardActivated.subscribe(spy);

      dispatch('pointerdown', { clientX: 10, clientY: 10 });
      dispatch('click', {});

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('suppresses cardActivated when pointer moved far enough to be a drag', () => {
      const spy = vi.fn();
      fixture.componentInstance.cardActivated.subscribe(spy);

      dispatch('pointerdown', { clientX: 10, clientY: 10 });
      dispatch('pointermove', { clientX: 100, clientY: 100 });
      dispatch('click', {});

      expect(spy).not.toHaveBeenCalled();
    });

    it('Enter key emits cardActivated', () => {
      const spy = vi.fn();
      fixture.componentInstance.cardActivated.subscribe(spy);
      dispatch('keydown', { key: 'Enter' });
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('Space key emits cardActivated and prevents default', () => {
      const spy = vi.fn();
      fixture.componentInstance.cardActivated.subscribe(spy);
      const event = dispatch('keydown', { key: ' ', cancelable: true });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(true);
    });

    it('applies .task-card--active when the active input is true', () => {
      fixture.componentRef.setInput('active', true);
      fixture.detectChanges();
      const el = fixture.debugElement.query(By.css('.task-card')).nativeElement as HTMLElement;
      expect(el.classList.contains('task-card--active')).toBe(true);
    });
  });

  describe('Rollback shake', () => {
    it('does not apply the rollback class on first render', () => {
      const card = fixture.debugElement.query(By.css('.task-card'));
      expect(card.nativeElement.classList.contains('task-card--rollback')).toBe(false);
    });

    it('applies .task-card--rollback after the trigger increments (microtask flush)', async () => {
      fixture.componentRef.setInput('rollbackTrigger', 1);
      fixture.detectChanges();

      // The set(true) is scheduled on a microtask to avoid
      // ExpressionChangedAfterItHasBeenCheckedError — let it flush.
      await Promise.resolve();
      fixture.detectChanges();

      const card = fixture.debugElement.query(By.css('.task-card'));
      expect(card.nativeElement.classList.contains('task-card--rollback')).toBe(true);
    });

    it('removes the rollback class after the animation timeout elapses', async () => {
      vi.useFakeTimers();

      fixture.componentRef.setInput('rollbackTrigger', 1);
      fixture.detectChanges();
      await Promise.resolve();
      fixture.detectChanges();

      const card = fixture.debugElement.query(By.css('.task-card'));
      expect(card.nativeElement.classList.contains('task-card--rollback')).toBe(true);

      // Advance past the 250 ms $motion-base duration.
      vi.advanceTimersByTime(260);
      fixture.detectChanges();

      expect(card.nativeElement.classList.contains('task-card--rollback')).toBe(false);
    });

    it('replays the shake on subsequent increments of the trigger', async () => {
      vi.useFakeTimers();

      fixture.componentRef.setInput('rollbackTrigger', 1);
      fixture.detectChanges();
      await Promise.resolve();
      fixture.detectChanges();
      vi.advanceTimersByTime(260);
      fixture.detectChanges();

      fixture.componentRef.setInput('rollbackTrigger', 2);
      fixture.detectChanges();
      await Promise.resolve();
      fixture.detectChanges();

      const card = fixture.debugElement.query(By.css('.task-card'));
      expect(card.nativeElement.classList.contains('task-card--rollback')).toBe(true);
    });
  });
});
