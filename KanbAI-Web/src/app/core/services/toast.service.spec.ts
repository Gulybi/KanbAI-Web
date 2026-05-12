import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToastService);
  });

  it('is null before any show() call', () => {
    expect(service.currentToast()).toBeNull();
  });

  it('exposes the message on show()', () => {
    service.show("Project 'Alpha' was deleted");
    const current = service.currentToast();
    expect(current).not.toBeNull();
    expect(current!.message).toBe("Project 'Alpha' was deleted");
    expect(current!.tone).toBe('success');
  });

  it('replaces the visible slot on a second show() (single-slot)', () => {
    service.show('first');
    const first = service.currentToast();
    service.show('second');
    const second = service.currentToast();
    expect(second).not.toBeNull();
    expect(second!.message).toBe('second');
    expect(second!.id).not.toBe(first!.id);
  });

  it('supports an info tone', () => {
    service.show('This project was deleted by another member', 'info');
    expect(service.currentToast()!.tone).toBe('info');
  });

  it('dismissCurrent() nulls the slot', () => {
    service.show('x');
    service.dismissCurrent();
    expect(service.currentToast()).toBeNull();
  });

  describe('announce()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('clears then sets the announcement (so identical messages re-fire)', async () => {
      const seen: string[] = [];
      // Mirror the effect a template would set up by reading the signal on
      // each microtask — we record each observed value transition.
      const capture = () => seen.push(service.currentAnnouncement());

      service.announce('Project deleted');
      capture();
      await Promise.resolve();
      capture();

      service.announce('Project deleted');
      capture();
      await Promise.resolve();
      capture();

      // Sequence should traverse through '' back to the message each time.
      expect(seen).toEqual([
        '',
        'Project deleted',
        '',
        'Project deleted'
      ]);
    });
  });
});
