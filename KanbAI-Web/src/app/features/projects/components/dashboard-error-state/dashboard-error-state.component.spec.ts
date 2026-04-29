import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
import { DashboardErrorStateComponent } from './dashboard-error-state.component';

describe('DashboardErrorStateComponent', () => {
  let component: DashboardErrorStateComponent;
  let fixture: ComponentFixture<DashboardErrorStateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DashboardErrorStateComponent] }).compileComponents();
    fixture = TestBed.createComponent(DashboardErrorStateComponent);
    component = fixture.componentInstance;
  });

  it('creates', () => {
    fixture.componentRef.setInput('message', 'Boom');
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('renders the input message verbatim', () => {
    const msg = 'Your session has expired. Please sign in again.';
    fixture.componentRef.setInput('message', msg);
    fixture.detectChanges();

    const paragraph = fixture.debugElement.query(By.css('.error-state__message'));
    expect(paragraph.nativeElement.textContent.trim()).toBe(msg);
  });

  it('emits retry when the retry button is clicked', () => {
    fixture.componentRef.setInput('message', 'Boom');
    fixture.detectChanges();

    const handler = vi.fn();
    component.retry.subscribe(handler);

    const btn = fixture.debugElement.query(By.css('button.error-state__retry'));
    btn.nativeElement.click();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('declares role="alert" on the panel', () => {
    fixture.componentRef.setInput('message', 'Boom');
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('.error-state');
    expect(panel.getAttribute('role')).toBe('alert');
  });

  // QA gap-filler (issue #30): tech-spec Unit Test Matrix row (c) —
  // "pressing Enter and Space on the retry button also emits (native
  // <button> — sanity assertion only)". Native semantics translate
  // Enter/Space keydown into a click event, so asserting via the
  // generated click proves keyboard users can activate retry without
  // a bespoke keydown handler.
  it('uses a native <button> so Enter and Space trigger retry via the browser click', () => {
    fixture.componentRef.setInput('message', 'Boom');
    fixture.detectChanges();

    const btn = fixture.debugElement.query(By.css('button.error-state__retry'));
    expect(btn.nativeElement.tagName).toBe('BUTTON');

    const handler = vi.fn();
    component.retry.subscribe(handler);

    // The browser dispatches a synthetic click on Enter/Space for <button>;
    // in jsdom we assert the same emission path by invoking .click() and
    // confirming the element is a native button (so no extra keydown
    // wiring is needed for keyboard accessibility).
    (btn.nativeElement as HTMLButtonElement).click();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('renders a <button type="button"> to avoid accidental form submission', () => {
    fixture.componentRef.setInput('message', 'Boom');
    fixture.detectChanges();

    const btn = fixture.debugElement.query(By.css('button.error-state__retry'));
    expect((btn.nativeElement as HTMLButtonElement).type).toBe('button');
  });
});
