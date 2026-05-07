import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  Component,
  ChangeDetectionStrategy,
  signal
} from '@angular/core';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { PartialFailureToastComponent } from './partial-failure-toast.component';

@Component({
  standalone: true,
  imports: [PartialFailureToastComponent],
  template: `
    <app-partial-failure-toast
      [projectName]="projectName()"
      [message]="message()"
      (openBoard)="onOpenBoard()"
      (dismiss)="onDismiss()"
    ></app-partial-failure-toast>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
class HostComponent {
  readonly projectName = signal<string>('Alpha');
  readonly message = signal<string>(
    "The project was created, but 1 column couldn't be added: 'Done'. You can add it from the board."
  );

  openBoardCalls = 0;
  dismissCalls = 0;

  onOpenBoard(): void {
    this.openBoardCalls++;
  }

  onDismiss(): void {
    this.dismissCalls++;
  }
}

async function mount(): Promise<ComponentFixture<HostComponent>> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return fixture;
}

describe('PartialFailureToastComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(async () => {
    vi.useFakeTimers();
    fixture = await mount();
    host = fixture.componentInstance;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the message verbatim', () => {
    const body: HTMLElement = fixture.nativeElement.querySelector(
      '.partial-failure-toast__message'
    );
    expect(body.textContent).toContain("couldn't be added");
  });

  it('renders the project name as the title fallback', () => {
    const title: HTMLElement = fixture.nativeElement.querySelector(
      '.partial-failure-toast__title'
    );
    expect(title.textContent?.trim()).toBe('Alpha');
  });

  it('falls back to a default title when projectName is empty', async () => {
    host.projectName.set('');
    fixture.detectChanges();

    const title: HTMLElement = fixture.nativeElement.querySelector(
      '.partial-failure-toast__title'
    );
    expect(title.textContent?.trim()).toBe('Project created');
  });

  it('emits openBoard when the "Open board" button is clicked', () => {
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.partial-failure-toast__open-board'
    );
    btn.click();
    expect(host.openBoardCalls).toBe(1);
  });

  it('emits dismiss when the close button is clicked', () => {
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.partial-failure-toast__dismiss'
    );
    btn.click();
    expect(host.dismissCalls).toBe(1);
  });

  it('auto-dismisses after 8 seconds', () => {
    expect(host.dismissCalls).toBe(0);
    vi.advanceTimersByTime(8000);
    expect(host.dismissCalls).toBe(1);
  });

  it('pauses the auto-dismiss timer on hover', () => {
    const toast: HTMLElement = fixture.nativeElement.querySelector(
      '.partial-failure-toast'
    );
    // Hover before the timer fires.
    vi.advanceTimersByTime(4000);
    toast.dispatchEvent(new MouseEvent('mouseenter'));

    // Advance past the original deadline — should NOT fire while paused.
    vi.advanceTimersByTime(10000);
    expect(host.dismissCalls).toBe(0);

    // Leave — timer restarts for a fresh 8 seconds.
    toast.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(8000);
    expect(host.dismissCalls).toBe(1);
  });
});
