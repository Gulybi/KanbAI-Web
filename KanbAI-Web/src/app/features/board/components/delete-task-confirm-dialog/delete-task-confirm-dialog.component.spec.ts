import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { describe, it, expect, vi } from 'vitest';

import { DeleteTaskConfirmDialogComponent } from './delete-task-confirm-dialog.component';
import { DeleteTaskConfirmData } from './delete-task-confirm-dialog.types';

interface DialogRefMock {
  close: ReturnType<typeof vi.fn>;
}

async function mount(
  data: DeleteTaskConfirmData = { taskTitle: 'Design login page' }
): Promise<{ fixture: ComponentFixture<DeleteTaskConfirmDialogComponent>; dialogRef: DialogRefMock }> {
  const dialogRef: DialogRefMock = { close: vi.fn() };
  await TestBed.configureTestingModule({
    imports: [DeleteTaskConfirmDialogComponent],
    providers: [
      { provide: DIALOG_DATA, useValue: data },
      { provide: DialogRef, useValue: dialogRef }
    ]
  }).compileComponents();

  const fixture = TestBed.createComponent(DeleteTaskConfirmDialogComponent);
  fixture.detectChanges();
  return { fixture, dialogRef };
}

describe('DeleteTaskConfirmDialogComponent', () => {
  it('renders the verbatim heading and body copy with the task title', async () => {
    const { fixture } = await mount({ taskTitle: 'Finalise copy' });
    const h = fixture.debugElement.query(By.css('#delete-task-confirm-heading'));
    expect(h.nativeElement.textContent.trim()).toBe('Delete this task?');

    const body = fixture.debugElement.query(By.css('.delete-task-confirm__body'));
    expect(body.nativeElement.textContent).toContain("'Finalise copy'");
    expect(body.nativeElement.textContent).toContain('all its attachments');
    expect(body.nativeElement.textContent).toContain('cannot be undone');
  });

  it('closes with undefined on Cancel', async () => {
    const { fixture, dialogRef } = await mount();
    const btns = fixture.debugElement.queryAll(By.css('button'));
    const cancel = btns.find(b => b.nativeElement.textContent.trim() === 'Cancel');
    cancel!.nativeElement.click();
    expect(dialogRef.close).toHaveBeenCalledWith(undefined);
  });

  it('emits confirmClicked on primary (does NOT close)', async () => {
    const { fixture, dialogRef } = await mount();
    let confirms = 0;
    fixture.componentInstance.confirmClicked.subscribe(() => (confirms += 1));
    const btns = fixture.debugElement.queryAll(By.css('button'));
    const primary = btns.find(b =>
      b.nativeElement.textContent.trim().startsWith('Delete task')
    );
    primary!.nativeElement.click();
    expect(confirms).toBe(1);
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('swaps primary label to Deleting… when submitting', async () => {
    const { fixture } = await mount();
    fixture.componentRef.setInput('submitting', true);
    fixture.detectChanges();
    const btns = fixture.debugElement.queryAll(By.css('button'));
    const primary = btns.find(b => b.nativeElement.textContent.includes('Deleting'));
    expect(primary).toBeTruthy();
    expect(primary!.nativeElement.textContent).toContain('…');
  });

  it('renders inline error with role="alert"', async () => {
    const { fixture } = await mount();
    fixture.componentRef.setInput(
      'inlineError',
      "You don't have permission to delete this task"
    );
    fixture.detectChanges();
    const err = fixture.debugElement.query(By.css('.delete-task-confirm__error'));
    expect(err).toBeTruthy();
    expect(err.nativeElement.getAttribute('role')).toBe('alert');
  });
});
