import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { describe, it, expect, vi } from 'vitest';

import { DeleteColumnConfirmDialogComponent } from './delete-column-confirm-dialog.component';
import { DeleteColumnConfirmData } from './delete-column-confirm-dialog.types';

interface DialogRefMock {
  close: ReturnType<typeof vi.fn>;
}

async function mount(
  data: DeleteColumnConfirmData
): Promise<{ fixture: ComponentFixture<DeleteColumnConfirmDialogComponent>; dialogRef: DialogRefMock }> {
  const dialogRef: DialogRefMock = { close: vi.fn() };

  await TestBed.configureTestingModule({
    imports: [DeleteColumnConfirmDialogComponent],
    providers: [
      { provide: DIALOG_DATA, useValue: data },
      { provide: DialogRef, useValue: dialogRef }
    ]
  }).compileComponents();

  const fixture = TestBed.createComponent(DeleteColumnConfirmDialogComponent);
  fixture.detectChanges();
  return { fixture, dialogRef };
}

describe('DeleteColumnConfirmDialogComponent', () => {
  it('renders the verbatim heading', async () => {
    const { fixture } = await mount({ columnName: 'Doing', taskCount: 2 });
    const h = fixture.debugElement.query(By.css('#delete-column-confirm-heading'));
    expect(h.nativeElement.textContent.trim()).toBe('Delete this column?');
  });

  it('renders the with-tasks body when taskCount > 0 and interpolates the integer', async () => {
    const { fixture } = await mount({ columnName: 'Doing', taskCount: 3 });
    const body = fixture.debugElement.query(By.css('.delete-column-confirm__body'));
    expect(body.nativeElement.textContent).toContain("'Doing'");
    expect(body.nativeElement.textContent).toContain('3');
    expect(body.nativeElement.textContent).toContain('task(s)');
    expect(body.nativeElement.textContent).toContain('cannot be undone');
  });

  it('renders the empty body when taskCount === 0', async () => {
    const { fixture } = await mount({ columnName: 'Backlog', taskCount: 0 });
    const body = fixture.debugElement.query(By.css('.delete-column-confirm__body'));
    expect(body.nativeElement.textContent).toContain("'Backlog'");
    expect(body.nativeElement.textContent).toContain('will be permanently deleted');
    expect(body.nativeElement.textContent).not.toContain('task(s)');
  });

  it('closes with undefined on Cancel', async () => {
    const { fixture, dialogRef } = await mount({ columnName: 'x', taskCount: 0 });
    const btns = fixture.debugElement.queryAll(By.css('button'));
    const cancel = btns.find(b => b.nativeElement.textContent.trim() === 'Cancel');
    cancel!.nativeElement.click();
    expect(dialogRef.close).toHaveBeenCalledWith(undefined);
  });

  it('emits confirmClicked on primary and does not close', async () => {
    const { fixture, dialogRef } = await mount({ columnName: 'x', taskCount: 0 });
    let confirms = 0;
    fixture.componentInstance.confirmClicked.subscribe(() => (confirms += 1));
    const btns = fixture.debugElement.queryAll(By.css('button'));
    const primary = btns.find(b =>
      b.nativeElement.textContent.trim().startsWith('Delete column')
    );
    primary!.nativeElement.click();
    expect(confirms).toBe(1);
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('renders inline error row with role="alert"', async () => {
    const { fixture } = await mount({ columnName: 'x', taskCount: 0 });
    fixture.componentRef.setInput('inlineError', "Couldn't reach the server — try again");
    fixture.detectChanges();
    const err = fixture.debugElement.query(By.css('.delete-column-confirm__error'));
    expect(err).toBeTruthy();
    expect(err.nativeElement.getAttribute('role')).toBe('alert');
  });
});
