import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { RemoveMemberConfirmDialogComponent } from './remove-member-confirm-dialog.component';
import { RemoveMemberConfirmData } from './remove-member-confirm-dialog.types';
import { MemberSummary } from '../../../models/member.model';

function makeMember(partial?: Partial<MemberSummary>): MemberSummary {
  return {
    userId: 'u-1',
    name: 'Alice Example',
    email: 'alice@example.com',
    role: 'Member',
    joinedAt: '2026-04-29T14:12:00Z',
    ...partial
  };
}

interface DialogRefMock {
  close: ReturnType<typeof vi.fn>;
}

async function mount(data: RemoveMemberConfirmData): Promise<{
  fixture: ComponentFixture<RemoveMemberConfirmDialogComponent>;
  dialogRef: DialogRefMock;
}> {
  TestBed.resetTestingModule();
  const dialogRef: DialogRefMock = { close: vi.fn() };

  await TestBed.configureTestingModule({
    imports: [RemoveMemberConfirmDialogComponent],
    providers: [
      { provide: DIALOG_DATA, useValue: data },
      { provide: DialogRef, useValue: dialogRef }
    ]
  }).compileComponents();

  const fixture = TestBed.createComponent(RemoveMemberConfirmDialogComponent);
  fixture.detectChanges();
  return { fixture, dialogRef };
}

describe('RemoveMemberConfirmDialogComponent', () => {
  let fixture: ComponentFixture<RemoveMemberConfirmDialogComponent>;
  let dialogRef: DialogRefMock;

  beforeEach(async () => {
    const mounted = await mount({ member: makeMember(), projectName: 'Alpha' });
    fixture = mounted.fixture;
    dialogRef = mounted.dialogRef;
  });

  it('renders the heading with the member name (AC-47)', () => {
    const heading = fixture.nativeElement.querySelector('#remove-member-confirm-heading');
    expect(heading).toBeTruthy();
    expect(heading.textContent.trim()).toBe('Remove Alice Example?');
  });

  it('renders the project name in the consequence sentence', () => {
    const body = fixture.nativeElement.querySelector('#remove-member-confirm-body');
    expect(body.textContent).toContain('Alpha');
  });

  it('closes with true on Remove', () => {
    const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
    const removeBtn = buttons.find(b => b.textContent?.trim() === 'Remove');
    expect(removeBtn).toBeTruthy();
    removeBtn!.click();
    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('closes with undefined on Cancel', () => {
    const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
    const cancelBtn = buttons.find(b => b.textContent?.trim() === 'Cancel');
    expect(cancelBtn).toBeTruthy();
    cancelBtn!.click();
    expect(dialogRef.close).toHaveBeenCalledWith(undefined);
  });
});
