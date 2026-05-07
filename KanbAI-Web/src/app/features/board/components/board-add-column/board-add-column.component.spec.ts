import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, signal, WritableSignal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { describe, it, expect, beforeEach } from 'vitest';

import { BoardAddColumnComponent } from './board-add-column.component';

/**
 * Host component wrapping `BoardAddColumnComponent` so the test can drive
 * signal-based inputs (`input()` values cannot be mutated directly in a
 * TestBed-created standalone component — the host drives them through
 * its own writable signals).
 */
@Component({
  standalone: true,
  imports: [BoardAddColumnComponent],
  template: `
    <app-board-add-column
      [existingColumnNames]="existing()"
      [submitting]="submitting()"
      [submitError]="submitError()"
      (submitted)="onSubmitted($event)"
      (cancelled)="onCancelled()"
    />
  `
})
class TestHostComponent {
  readonly existing: WritableSignal<readonly string[]> = signal<readonly string[]>([]);
  readonly submitting: WritableSignal<boolean> = signal(false);
  readonly submitError: WritableSignal<string | null> = signal<string | null>(null);
  readonly submittedValues: string[] = [];
  cancelledCount = 0;

  onSubmitted(name: string): void {
    this.submittedValues.push(name);
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
  const el = fixture.debugElement.query(By.css('.board-add-column__submit'));
  return el.nativeElement as HTMLButtonElement;
}

function getCancel(fixture: ComponentFixture<TestHostComponent>): HTMLButtonElement {
  const el = fixture.debugElement.query(By.css('.board-add-column__cancel'));
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
  const form = fixture.debugElement.query(By.css('form.board-add-column'));
  // jsdom does not translate button.click() through to a synthetic form-submit
  // the way a real browser does, so dispatch the submit event explicitly.
  form.nativeElement.dispatchEvent(
    new Event('submit', { cancelable: true, bubbles: true })
  );
  fixture.detectChanges();
}

describe('BoardAddColumnComponent', () => {
  describe('Rendering & focus', () => {
    it('renders with an empty name input on first mount', async () => {
      const { fixture } = await mount();
      expect(getInput(fixture).value).toBe('');
    });

    it('auto-focuses the native input on first render', async () => {
      const { fixture } = await mount();
      // afterNextRender already fired — input must have focus.
      expect(document.activeElement).toBe(getInput(fixture));
    });

    it('labels the form as "Add column" for assistive tech', async () => {
      const { fixture } = await mount();
      const form = fixture.debugElement.query(By.css('form.board-add-column'));
      expect(form.nativeElement.getAttribute('aria-label')).toBe('Add column');
    });
  });

  describe('Submit path', () => {
    it('emits submitted with the trimmed value when the form is submitted', async () => {
      const { fixture, host } = await mount();
      setInputValue(fixture, '  Blocked  ');
      submitForm(fixture);
      expect(host.submittedValues).toEqual(['Blocked']);
    });

    it('emits submitted once when Enter is pressed inside the form (ngSubmit)', async () => {
      const { fixture, host } = await mount();
      setInputValue(fixture, 'New');
      submitForm(fixture);
      expect(host.submittedValues).toEqual(['New']);
    });

    it('does NOT emit submitted when the value is empty (submit button stays disabled)', async () => {
      const { fixture, host } = await mount();
      const button = getSubmit(fixture);
      expect(button.disabled).toBe(true);
      // Programmatic submit must still short-circuit due to invalid control.
      submitForm(fixture);
      expect(host.submittedValues).toEqual([]);
    });

    it('does NOT emit submitted when whitespace-only (disabled + no emit)', async () => {
      const { fixture, host } = await mount();
      setInputValue(fixture, '   ');
      expect(getSubmit(fixture).disabled).toBe(true);
      submitForm(fixture);
      expect(host.submittedValues).toEqual([]);
    });

    it('does NOT emit when name exceeds 100 characters', async () => {
      const { fixture, host } = await mount();
      setInputValue(fixture, 'x'.repeat(101));
      expect(getSubmit(fixture).disabled).toBe(true);
      submitForm(fixture);
      expect(host.submittedValues).toEqual([]);
    });

    it('accepts exactly 100 characters (boundary inclusive)', async () => {
      const { fixture, host } = await mount();
      const boundary = 'x'.repeat(100);
      setInputValue(fixture, boundary);
      expect(getSubmit(fixture).disabled).toBe(false);
      submitForm(fixture);
      expect(host.submittedValues).toEqual([boundary]);
    });

    it('rapid double-submit emits submitted once when submitting goes true between', async () => {
      const { fixture, host } = await mount();
      setInputValue(fixture, 'One');
      submitForm(fixture);
      // Parent reacts by flipping submitting → button disables.
      host.submitting.set(true);
      fixture.detectChanges();
      submitForm(fixture);
      expect(host.submittedValues).toEqual(['One']);
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
      const form = fixture.debugElement.query(By.css('form.board-add-column'));
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

  describe('Duplicate validation (reacting to parent input changes)', () => {
    it('flags duplicateExisting when the typed name matches an existing name', async () => {
      const { fixture, host } = await mount();
      host.existing.set(['Done']);
      fixture.detectChanges();
      setInputValue(fixture, 'done');
      expect(getSubmit(fixture).disabled).toBe(true);
      const err = fixture.debugElement.query(
        By.css('.board-add-column__field-error')
      );
      expect(err).toBeTruthy();
      expect(err.nativeElement.textContent).toContain('already exists');
    });

    it('clears the duplicate error when the existing list shrinks (SignalR delete mid-typing)', async () => {
      const { fixture, host } = await mount();
      host.existing.set(['Done']);
      fixture.detectChanges();
      setInputValue(fixture, 'Done');
      expect(getSubmit(fixture).disabled).toBe(true);

      // List no longer carries the name — validator must re-evaluate.
      host.existing.set([]);
      fixture.detectChanges();
      expect(getSubmit(fixture).disabled).toBe(false);
    });

    it('flags a duplicate when the existing list GROWS after the user has typed (SignalR create mid-typing)', async () => {
      const { fixture, host } = await mount();
      setInputValue(fixture, 'Blocked');
      expect(getSubmit(fixture).disabled).toBe(false);

      // Simulate another user adding the same column name via SignalR.
      host.existing.set(['Blocked']);
      fixture.detectChanges();
      expect(getSubmit(fixture).disabled).toBe(true);
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
      host.submitError.set("We couldn't add a column. Please try again.");
      fixture.detectChanges();
      const err = fixture.debugElement.query(By.css('.board-add-column__error'));
      expect(err).toBeTruthy();
      expect(err.nativeElement.getAttribute('role')).toBe('alert');
      expect(err.nativeElement.textContent).toContain("couldn't add a column");
    });

    it('does not render the error paragraph when submitError() is null', async () => {
      const { fixture } = await mount();
      const err = fixture.debugElement.query(By.css('.board-add-column__error'));
      expect(err).toBeNull();
    });
  });

  describe('Value preservation on error', () => {
    it('preserves the typed value after a simulated submit error (control not reset)', async () => {
      const { fixture, host } = await mount();
      setInputValue(fixture, 'Blocked');
      getSubmit(fixture).click();
      // Parent flips submitting true, then comes back with an error.
      host.submitting.set(true);
      fixture.detectChanges();
      host.submitting.set(false);
      host.submitError.set('Server error.');
      fixture.detectChanges();
      expect(getInput(fixture).value).toBe('Blocked');
    });
  });
});
