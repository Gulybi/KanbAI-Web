import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { DeleteProjectConfirmDialogComponent } from './delete-project-confirm-dialog.component';
import { DeleteProjectConfirmData } from './delete-project-confirm-dialog.types';

interface DialogRefMock {
  close: ReturnType<typeof vi.fn>;
}

describe('DeleteProjectConfirmDialogComponent', () => {
  let fixture: ComponentFixture<DeleteProjectConfirmDialogComponent>;
  let dialogRef: DialogRefMock;

  async function mount(data: DeleteProjectConfirmData = { projectName: 'Alpha' }): Promise<void> {
    dialogRef = { close: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [DeleteProjectConfirmDialogComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: data },
        { provide: DialogRef, useValue: dialogRef }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DeleteProjectConfirmDialogComponent);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await mount();
  });

  it('renders the verbatim heading', () => {
    const h = fixture.debugElement.query(By.css('#delete-project-confirm-heading'));
    expect(h.nativeElement.textContent.trim()).toBe('Delete this project?');
  });

  it('interpolates the project name inside the body copy', () => {
    const body = fixture.debugElement.query(By.css('.delete-project-confirm__body'));
    // Single-quoted project name + verbatim consequence copy.
    expect(body.nativeElement.textContent).toContain("'Alpha'");
    expect(body.nativeElement.textContent).toContain(
      'columns, tasks, attachments'
    );
    expect(body.nativeElement.textContent).toContain('cannot be undone');
  });

  it('closes with undefined on Cancel', () => {
    const btns = fixture.debugElement.queryAll(By.css('button'));
    const cancel = btns.find(b => b.nativeElement.textContent.trim() === 'Cancel');
    expect(cancel).toBeTruthy();
    cancel!.nativeElement.click();
    expect(dialogRef.close).toHaveBeenCalledWith(undefined);
  });

  it('emits confirmClicked on primary (does NOT close)', () => {
    let confirms = 0;
    fixture.componentInstance.confirmClicked.subscribe(() => (confirms += 1));

    const btns = fixture.debugElement.queryAll(By.css('button'));
    const primary = btns.find(b =>
      b.nativeElement.textContent.trim().startsWith('Delete project')
    );
    expect(primary).toBeTruthy();
    primary!.nativeElement.click();

    expect(confirms).toBe(1);
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('disables both buttons while submitting and swaps the primary label to Deleting…', () => {
    fixture.componentRef.setInput('submitting', true);
    fixture.detectChanges();

    const btns = fixture.debugElement.queryAll(By.css('button'));
    for (const b of btns) {
      expect((b.nativeElement as HTMLButtonElement).disabled).toBe(true);
    }
    const primary = btns.find(b =>
      b.nativeElement.textContent.includes('Deleting')
    );
    expect(primary).toBeTruthy();
    // U+2026 HORIZONTAL ELLIPSIS, not three full stops.
    expect(primary!.nativeElement.textContent).toContain('…');
  });

  it('renders the inline error row with role="alert" when inlineError is non-null', () => {
    fixture.componentRef.setInput(
      'inlineError',
      "Couldn't reach the server — try again"
    );
    fixture.detectChanges();
    const err = fixture.debugElement.query(By.css('.delete-project-confirm__error'));
    expect(err).toBeTruthy();
    expect(err.nativeElement.getAttribute('role')).toBe('alert');
    expect(err.nativeElement.textContent).toContain(
      "Couldn't reach the server — try again"
    );
  });
});
