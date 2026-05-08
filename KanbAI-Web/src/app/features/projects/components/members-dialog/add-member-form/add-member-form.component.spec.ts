import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, it, expect } from 'vitest';

import { AddMemberFormComponent } from './add-member-form.component';

async function mount(inputs?: {
  disabled?: boolean;
  errorMessage?: string | null;
  resetCounter?: number;
}): Promise<ComponentFixture<AddMemberFormComponent>> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({ imports: [AddMemberFormComponent] }).compileComponents();
  const fixture = TestBed.createComponent(AddMemberFormComponent);
  fixture.componentRef.setInput('disabled', inputs?.disabled ?? false);
  fixture.componentRef.setInput('errorMessage', inputs?.errorMessage ?? null);
  fixture.componentRef.setInput('resetCounter', inputs?.resetCounter ?? 0);
  fixture.detectChanges();
  return fixture;
}

interface Internal {
  emailControl: AddMemberFormComponent['emailControl' & keyof AddMemberFormComponent] extends infer F
    ? F
    : never;
  onSubmit: () => void;
}
function internal(component: AddMemberFormComponent): {
  emailControl: { setValue: (v: string) => void; invalid: boolean; value: string; hasError: (k: string) => boolean };
  onSubmit: () => void;
} {
  return component as unknown as {
    emailControl: {
      setValue: (v: string) => void;
      invalid: boolean;
      value: string;
      hasError: (k: string) => boolean;
    };
    onSubmit: () => void;
  };
}

describe('AddMemberFormComponent', () => {
  it('starts with an invalid form (required)', async () => {
    const fixture = await mount();
    expect(internal(fixture.componentInstance).emailControl.invalid).toBe(true);
    expect(internal(fixture.componentInstance).emailControl.hasError('required')).toBe(true);
  });

  it('rejects whitespace-only email', async () => {
    const fixture = await mount();
    const ctl = internal(fixture.componentInstance).emailControl;
    ctl.setValue('   ');
    expect(ctl.hasError('whitespaceOnly')).toBe(true);
    expect(ctl.invalid).toBe(true);
  });

  it('rejects malformed email', async () => {
    const fixture = await mount();
    const ctl = internal(fixture.componentInstance).emailControl;
    ctl.setValue('not-an-email');
    expect(ctl.hasError('email')).toBe(true);
    expect(ctl.invalid).toBe(true);
  });

  it('emits submitEmail with the value on submit', async () => {
    const fixture = await mount();
    const ctl = internal(fixture.componentInstance).emailControl;
    ctl.setValue('alice@example.com');

    let emitted: string | undefined;
    fixture.componentInstance.submitEmail.subscribe(v => (emitted = v));
    internal(fixture.componentInstance).onSubmit();

    expect(emitted).toBe('alice@example.com');
  });

  it('does not emit when the form is invalid', async () => {
    const fixture = await mount();
    let emissions = 0;
    fixture.componentInstance.submitEmail.subscribe(() => (emissions += 1));
    internal(fixture.componentInstance).onSubmit();
    expect(emissions).toBe(0);
  });

  it('does not emit when disabled=true', async () => {
    const fixture = await mount({ disabled: true });
    const ctl = internal(fixture.componentInstance).emailControl;
    ctl.setValue('alice@example.com');

    let emissions = 0;
    fixture.componentInstance.submitEmail.subscribe(() => (emissions += 1));
    internal(fixture.componentInstance).onSubmit();
    expect(emissions).toBe(0);
  });

  it('renders the error banner when errorMessage is set', async () => {
    const fixture = await mount({ errorMessage: "We couldn't find a user with that email." });
    const banner = fixture.debugElement.query(By.css('.add-member-form__error'));
    expect(banner).toBeTruthy();
    expect(banner.nativeElement.textContent).toContain("We couldn't find a user with that email.");
  });

  it('resets the form when resetCounter changes', async () => {
    const fixture = await mount({ resetCounter: 0 });
    const ctl = internal(fixture.componentInstance).emailControl;
    ctl.setValue('alice@example.com');
    expect(ctl.value).toBe('alice@example.com');

    fixture.componentRef.setInput('resetCounter', 1);
    fixture.detectChanges();
    expect(ctl.value).toBe('');
  });

  it('renders the label "Email" on the wrapped FormInputComponent', async () => {
    const fixture = await mount();
    const label = fixture.nativeElement.querySelector('label');
    expect(label).toBeTruthy();
    expect(label?.textContent).toContain('Email');
  });

  describe('submit-gating reactivity (regression: issue #89)', () => {
    function getInput(
      fixture: ComponentFixture<AddMemberFormComponent>
    ): HTMLInputElement {
      return fixture.nativeElement.querySelector(
        'input[type="email"]'
      ) as HTMLInputElement;
    }

    function getSubmitButton(
      fixture: ComponentFixture<AddMemberFormComponent>
    ): HTMLButtonElement {
      return fixture.nativeElement.querySelector(
        'button[type="submit"]'
      ) as HTMLButtonElement;
    }

    function type(
      fixture: ComponentFixture<AddMemberFormComponent>,
      value: string
    ): void {
      const input = getInput(fixture);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
    }

    it('enables the submit button within one CD cycle after typing a valid email and emits on submit', async () => {
      const fixture = await mount();
      const input = getInput(fixture);
      const button = getSubmitButton(fixture);

      expect(input).toBeTruthy();
      expect(button).toBeTruthy();
      expect(button.disabled).toBe(true);
      expect(input.value).toBe('');

      type(fixture, 'alice@example.com');

      expect(button.disabled).toBe(false);

      let emitted: string | undefined;
      let emissionCount = 0;
      fixture.componentInstance.submitEmail.subscribe(v => {
        emitted = v;
        emissionCount += 1;
      });

      // The form uses (ngSubmit) without a parent [formGroup] directive, so
      // no NgForm/FormGroupDirective listens for the native submit event.
      // Invoke the listener that Angular wired up to the template binding.
      const form = fixture.debugElement.query(By.css('form'));
      form.triggerEventHandler('ngSubmit', {});
      fixture.detectChanges();

      expect(emitted).toBe('alice@example.com');
      expect(emissionCount).toBe(1);
    });

    it('re-disables the submit button when the email becomes invalid', async () => {
      const fixture = await mount();
      const button = getSubmitButton(fixture);

      type(fixture, 'alice@example.com');
      expect(button.disabled).toBe(false);

      type(fixture, 'not-an-email');
      expect(button.disabled).toBe(true);

      type(fixture, '');
      expect(button.disabled).toBe(true);

      type(fixture, '   ');
      expect(button.disabled).toBe(true);
    });

    it('keeps the submit button disabled when parent sets disabled=true even with a valid email', async () => {
      const fixture = await mount({ disabled: false });
      const button = getSubmitButton(fixture);

      type(fixture, 'alice@example.com');
      expect(button.disabled).toBe(false);

      fixture.componentRef.setInput('disabled', true);
      fixture.detectChanges();
      expect(button.disabled).toBe(true);

      fixture.componentRef.setInput('disabled', false);
      fixture.detectChanges();
      expect(button.disabled).toBe(false);
    });
  });
});
