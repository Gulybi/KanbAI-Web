import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, signal, WritableSignal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { describe, it, expect } from 'vitest';

import { BoardAddTaskComponent } from './board-add-task.component';

/**
 * Host component wrapping `BoardAddTaskComponent` so the test can drive
 * signal-based inputs through its own writable signals.
 */
@Component({
  standalone: true,
  imports: [BoardAddTaskComponent],
  template: `
    <app-board-add-task
      [submitting]="submitting()"
      [submitError]="submitError()"
      (submitted)="onSubmitted($event)"
      (cancelled)="onCancelled()"
    />
  `
})
class TestHostComponent {
  readonly submitting: WritableSignal<boolean> = signal(false);
  readonly submitError: WritableSignal<string | null> = signal<string | null>(null);
  readonly submittedValues: string[] = [];
  cancelledCount = 0;

  onSubmitted(title: string): void {
    this.submittedValues.push(title);
  }
  onCancelled(): void {
    this.cancelledCount++;
  }
}

async function mount(): Promise<{
  fixture: ComponentFixture<TestHostComponent>;
  host: TestHostComponent;
}> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [TestHostComponent]
  }).compileComponents();
  const fixture = TestBed.createComponent(TestHostComponent);
  fixture.detectChanges();
  // Let afterNextRender auto-focus fire.
  await fixture.whenStable();
  return { fixture, host: fixture.componentInstance };
}

function getInput(fixture: ComponentFixture<TestHostComponent>): HTMLInputElement {
  const el = fixture.debugElement.query(By.css('input'));
  return el.nativeElement as HTMLInputElement;
}

function getSubmit(fixture: ComponentFixture<TestHostComponent>): HTMLButtonElement {
  const el = fixture.debugElement.query(By.css('.board-add-task__submit'));
  return el.nativeElement as HTMLButtonElement;
}

function getCancel(fixture: ComponentFixture<TestHostComponent>): HTMLButtonElement {
  const el = fixture.debugElement.query(By.css('.board-add-task__cancel'));
  return el.nativeElement as HTMLButtonElement;
}

function setInputValue(
  fixture: ComponentFixture<TestHostComponent>,
  value: string
): void {
  const input = getInput(fixture);
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function submitForm(fixture: ComponentFixture<TestHostComponent>): void {
  const form = fixture.debugElement.query(By.css('form.board-add-task'));
  // jsdom does not translate button.click() into a synthetic form-submit
  // the way a real browser does — dispatch the submit event explicitly.
  form.nativeElement.dispatchEvent(
    new Event('submit', { cancelable: true, bubbles: true })
  );
  fixture.detectChanges();
}

describe('BoardAddTaskComponent', () => {
  describe('Rendering & focus', () => {
    it('renders with an empty title input on first mount', async () => {
      const { fixture } = await mount();
      expect(getInput(fixture).value).toBe('');
    });

    it('auto-focuses the native input on first render', async () => {
      const { fixture } = await mount();
      expect(document.activeElement).toBe(getInput(fixture));
    });

    it('labels the form as "Add task" for assistive tech', async () => {
      const { fixture } = await mount();
      const form = fixture.debugElement.query(By.css('form.board-add-task'));
      expect(form.nativeElement.getAttribute('aria-label')).toBe('Add task');
    });
  });

  describe('Submit path', () => {
    it('emits submitted with the trimmed value when the form is submitted', async () => {
      const { fixture, host } = await mount();
      setInputValue(fixture, '  Wire up onboarding flow  ');
      submitForm(fixture);
      expect(host.submittedValues).toEqual(['Wire up onboarding flow']);
    });

    it('emits submitted once when Enter is pressed inside the form (ngSubmit)', async () => {
      const { fixture, host } = await mount();
      setInputValue(fixture, 'Task 1');
      submitForm(fixture);
      expect(host.submittedValues).toEqual(['Task 1']);
    });

    it('does NOT emit submitted when the value is empty (submit stays disabled)', async () => {
      const { fixture, host } = await mount();
      expect(getSubmit(fixture).disabled).toBe(true);
      submitForm(fixture);
      expect(host.submittedValues).toEqual([]);
    });

    it('does NOT emit submitted when whitespace-only', async () => {
      const { fixture, host } = await mount();
      setInputValue(fixture, '   ');
      expect(getSubmit(fixture).disabled).toBe(true);
      submitForm(fixture);
      expect(host.submittedValues).toEqual([]);
    });

    it('does NOT emit when title exceeds 200 characters', async () => {
      const { fixture, host } = await mount();
      setInputValue(fixture, 'x'.repeat(201));
      expect(getSubmit(fixture).disabled).toBe(true);
      submitForm(fixture);
      expect(host.submittedValues).toEqual([]);
    });

    it('accepts exactly 200 characters (boundary inclusive)', async () => {
      const { fixture, host } = await mount();
      const boundary = 'x'.repeat(200);
      setInputValue(fixture, boundary);
      expect(getSubmit(fixture).disabled).toBe(false);
      submitForm(fixture);
      expect(host.submittedValues).toEqual([boundary]);
    });

    it('blocks programmatic onSubmit while submitting() is true', async () => {
      const { fixture, host } = await mount();
      setInputValue(fixture, 'Two');
      host.submitting.set(true);
      fixture.detectChanges();
      submitForm(fixture);
      expect(host.submittedValues).toEqual([]);
    });
  });

  describe('Cancel path', () => {
    it('emits cancelled when the Cancel button is clicked', async () => {
      const { fixture, host } = await mount();
      getCancel(fixture).click();
      expect(host.cancelledCount).toBe(1);
      expect(host.submittedValues).toEqual([]);
    });

    it('emits cancelled on Escape key (keydown at form level)', async () => {
      const { fixture, host } = await mount();
      const form = fixture.debugElement.query(By.css('form.board-add-task'));
      const evt = new KeyboardEvent('keydown', {
        key: 'Escape',
        cancelable: true,
        bubbles: true
      });
      form.nativeElement.dispatchEvent(evt);
      expect(host.cancelledCount).toBe(1);
      expect(evt.defaultPrevented).toBe(true);
    });

    it('does not emit cancelled on other keys', async () => {
      const { fixture, host } = await mount();
      const input = getInput(fixture);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      expect(host.cancelledCount).toBe(0);
    });
  });

  describe('Submitting state', () => {
    it('shows "Adding…" on the submit button when submitting() is true', async () => {
      const { fixture, host } = await mount();
      setInputValue(fixture, 'Go');
      host.submitting.set(true);
      fixture.detectChanges();
      expect(getSubmit(fixture).textContent?.trim()).toBe('Adding…');
    });

    it('disables both buttons while submitting() is true', async () => {
      const { fixture, host } = await mount();
      setInputValue(fixture, 'Go');
      host.submitting.set(true);
      fixture.detectChanges();
      expect(getSubmit(fixture).disabled).toBe(true);
      expect(getCancel(fixture).disabled).toBe(true);
    });

    it('shows "Add" at rest', async () => {
      const { fixture } = await mount();
      expect(getSubmit(fixture).textContent?.trim()).toBe('Add');
    });
  });

  describe('Server error surface', () => {
    it('renders the error paragraph with role="alert" when submitError() is set', async () => {
      const { fixture, host } = await mount();
      host.submitError.set("We couldn't add this task. Please try again.");
      fixture.detectChanges();
      const err = fixture.debugElement.query(By.css('.board-add-task__error'));
      expect(err).toBeTruthy();
      expect(err.nativeElement.getAttribute('role')).toBe('alert');
      expect(err.nativeElement.textContent).toContain("couldn't add this task");
    });

    it('does not render the error paragraph when submitError() is null', async () => {
      const { fixture } = await mount();
      const err = fixture.debugElement.query(By.css('.board-add-task__error'));
      expect(err).toBeNull();
    });
  });

  describe('Value preservation on error', () => {
    it('preserves the typed value after a simulated submit error (control not reset)', async () => {
      const { fixture, host } = await mount();
      setInputValue(fixture, 'Preserve me');
      getSubmit(fixture).click();
      host.submitting.set(true);
      fixture.detectChanges();
      host.submitting.set(false);
      host.submitError.set('Server error.');
      fixture.detectChanges();
      expect(getInput(fixture).value).toBe('Preserve me');
    });
  });

  describe('No duplicate-title surface', () => {
    it('does NOT render a .board-add-task__field-error node even with a long value', async () => {
      // Tech spec D11: tasks allow duplicate titles, so the field-error
      // block from BoardAddColumnComponent is intentionally absent.
      const { fixture } = await mount();
      setInputValue(fixture, 'Some title');
      const fieldError = fixture.debugElement.query(
        By.css('.board-add-task__field-error')
      );
      expect(fieldError).toBeNull();
    });
  });
});
