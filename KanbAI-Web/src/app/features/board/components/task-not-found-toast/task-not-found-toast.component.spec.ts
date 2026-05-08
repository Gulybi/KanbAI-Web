import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { TaskNotFoundToastComponent } from './task-not-found-toast.component';
import { TASK_DESCRIPTION_COPY } from '../task-description-section/task-description-copy';

describe('TaskNotFoundToastComponent', () => {
  let fixture: ComponentFixture<TaskNotFoundToastComponent>;
  let component: TaskNotFoundToastComponent;
  let dismissed: number;

  beforeEach(async () => {
    vi.useFakeTimers();
    dismissed = 0;

    await TestBed.configureTestingModule({
      imports: [TaskNotFoundToastComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(TaskNotFoundToastComponent);
    component = fixture.componentInstance;
    component.dismiss.subscribe(() => (dismissed += 1));
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the default message', () => {
    const msg = fixture.debugElement.query(
      By.css('.task-not-found-toast__message')
    );
    expect(msg.nativeElement.textContent.trim()).toBe(
      TASK_DESCRIPTION_COPY.TOAST_TASK_NOT_FOUND
    );
  });

  it('has role=status, aria-live=polite, aria-atomic=true on the host', () => {
    const host = fixture.debugElement.nativeElement as HTMLElement;
    expect(host.getAttribute('role')).toBe('status');
    expect(host.getAttribute('aria-live')).toBe('polite');
    expect(host.getAttribute('aria-atomic')).toBe('true');
  });

  it('auto-dismisses after 8 seconds', () => {
    vi.advanceTimersByTime(7999);
    expect(dismissed).toBe(0);
    vi.advanceTimersByTime(1);
    expect(dismissed).toBe(1);
  });

  it('pauses the timer on mouseenter, resumes on mouseleave', () => {
    const root = fixture.debugElement.query(By.css('.task-not-found-toast'));
    root.triggerEventHandler('mouseenter');
    vi.advanceTimersByTime(10000);
    expect(dismissed).toBe(0);

    root.triggerEventHandler('mouseleave');
    vi.advanceTimersByTime(8000);
    expect(dismissed).toBe(1);
  });

  it('manual dismiss emits dismiss', () => {
    const btn = fixture.debugElement.query(
      By.css('.task-not-found-toast__dismiss')
    );
    btn.nativeElement.click();
    expect(dismissed).toBe(1);
  });
});
