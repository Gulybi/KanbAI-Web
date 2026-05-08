import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { TaskDescriptionClearConfirmDialogComponent } from './task-description-clear-confirm-dialog.component';
import { TASK_DESCRIPTION_COPY } from '../task-description-section/task-description-copy';

interface DialogRefMock {
  close: ReturnType<typeof vi.fn>;
}

describe('TaskDescriptionClearConfirmDialogComponent', () => {
  let fixture: ComponentFixture<TaskDescriptionClearConfirmDialogComponent>;
  let dialogRef: DialogRefMock;

  beforeEach(async () => {
    dialogRef = { close: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [TaskDescriptionClearConfirmDialogComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: {} },
        { provide: DialogRef, useValue: dialogRef }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TaskDescriptionClearConfirmDialogComponent);
    fixture.detectChanges();
  });

  it('renders the heading with the canonical CLEAR_CONFIRM_TITLE', () => {
    const heading = fixture.nativeElement.querySelector(
      '#task-description-clear-heading'
    );
    expect(heading).toBeTruthy();
    expect(heading.textContent.trim()).toBe(
      TASK_DESCRIPTION_COPY.CLEAR_CONFIRM_TITLE
    );
  });

  it('closes with true on Confirm', () => {
    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('button')
    );
    const confirmBtn = buttons.find(
      b => b.textContent?.trim() === TASK_DESCRIPTION_COPY.CLEAR_CONFIRM_CONFIRM_LABEL
    );
    expect(confirmBtn).toBeTruthy();
    confirmBtn!.click();
    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('closes with undefined on Cancel', () => {
    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('button')
    );
    const cancelBtn = buttons.find(
      b => b.textContent?.trim() === TASK_DESCRIPTION_COPY.CLEAR_CONFIRM_CANCEL_LABEL
    );
    expect(cancelBtn).toBeTruthy();
    cancelBtn!.click();
    expect(dialogRef.close).toHaveBeenCalledWith(undefined);
  });
});
