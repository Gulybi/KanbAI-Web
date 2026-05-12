import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { ToastHostComponent } from './toast-host.component';
import { ToastService } from '../../services/toast.service';

describe('ToastHostComponent', () => {
  let fixture: ComponentFixture<ToastHostComponent>;
  let toastService: ToastService;

  beforeEach(async () => {
    vi.useFakeTimers();

    await TestBed.configureTestingModule({
      imports: [ToastHostComponent]
    }).compileComponents();

    toastService = TestBed.inject(ToastService);
    fixture = TestBed.createComponent(ToastHostComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing visible before a toast is shown', () => {
    const toast = fixture.debugElement.query(By.css('.toast-host__toast'));
    expect(toast).toBeNull();
  });

  it('renders the message when the service emits', () => {
    toastService.show("Project 'A' was deleted");
    fixture.detectChanges();
    const msg = fixture.debugElement.query(By.css('.toast-host__toast-message'));
    expect(msg).toBeTruthy();
    expect(msg.nativeElement.textContent.trim()).toBe("Project 'A' was deleted");
  });

  it('applies success / info modifier classes per tone', () => {
    toastService.show('Column was deleted', 'success');
    fixture.detectChanges();
    let host = fixture.debugElement.query(By.css('.toast-host__toast'));
    expect(host.classes['toast-host__toast--success']).toBe(true);

    toastService.show('Remote delete', 'info');
    fixture.detectChanges();
    host = fixture.debugElement.query(By.css('.toast-host__toast'));
    expect(host.classes['toast-host__toast--info']).toBe(true);
  });

  it('auto-dismisses after 8 s', () => {
    toastService.show('x');
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.toast-host__toast'))).toBeTruthy();
    vi.advanceTimersByTime(7999);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.toast-host__toast'))).toBeTruthy();
    vi.advanceTimersByTime(1);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.toast-host__toast'))).toBeNull();
  });

  it('pauses the timer on hover and resumes on leave', () => {
    toastService.show('x');
    fixture.detectChanges();
    const card = fixture.debugElement.query(By.css('.toast-host__toast'));
    card.triggerEventHandler('mouseenter');
    vi.advanceTimersByTime(10000);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.toast-host__toast'))).toBeTruthy();
    card.triggerEventHandler('mouseleave');
    vi.advanceTimersByTime(8000);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.toast-host__toast'))).toBeNull();
  });

  it('manual dismiss hides the toast', () => {
    toastService.show('x');
    fixture.detectChanges();
    const dismiss = fixture.debugElement.query(
      By.css('.toast-host__toast-dismiss')
    );
    dismiss.nativeElement.click();
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.toast-host__toast'))).toBeNull();
  });

  it('renders a visually-hidden polite live region for announcements', () => {
    const live = fixture.debugElement.query(By.css('.toast-host__live'));
    expect(live).toBeTruthy();
    expect(live.nativeElement.getAttribute('role')).toBe('status');
    expect(live.nativeElement.getAttribute('aria-live')).toBe('polite');
  });
});
