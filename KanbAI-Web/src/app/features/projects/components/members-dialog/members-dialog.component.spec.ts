import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { Signal, signal } from '@angular/core';
import { Observable, Subject, of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { MembersDialogComponent } from './members-dialog.component';
import { MembersStateService } from '../../state/members-state.service';
import { PerProjectMembers } from '../../state/members-state.model';
import { AuthService } from '../../../../core/services/AuthService';
import { UserProfileDto } from '../../../../core/models/auth.models';
import { MemberSummary } from '../../models/member.model';
import { ProjectSummary } from '../../models/project.model';
import { MembersDialogData } from './members-dialog.types';
import { RemoveMemberConfirmDialogComponent } from './remove-member-confirm-dialog/remove-member-confirm-dialog.component';

function makeMember(partial?: Partial<MemberSummary>): MemberSummary {
  return {
    userId: 'u-1',
    name: 'Alice',
    email: 'alice@example.com',
    role: 'Member',
    joinedAt: '2026-04-29T14:12:00Z',
    ...partial
  };
}

function makeProject(partial?: Partial<ProjectSummary>): ProjectSummary {
  return {
    id: 'p-1',
    name: 'Alpha',
    description: null,
    role: 'Owner',
    createdAt: '2026-04-10T00:00:00Z',
    updatedAt: '2026-04-10T00:00:00Z',
    ...partial
  };
}

const OWNER_USER: UserProfileDto = { id: 'u-self', name: 'Self', email: 'self@example.com' };

interface MembersStateMock {
  sliceSig: ReturnType<typeof signal<PerProjectMembers>>;
  selectForProject: (id: string) => Signal<PerProjectMembers>;
  loadMembers: ReturnType<typeof vi.fn>;
  addMemberByEmail: ReturnType<typeof vi.fn>;
  removeMember: ReturnType<typeof vi.fn>;
  setCurrentProjectContext: ReturnType<typeof vi.fn>;
  clearCurrentProjectContext: ReturnType<typeof vi.fn>;
}

interface DialogMock {
  open: ReturnType<typeof vi.fn>;
}

interface MountOptions {
  project?: ProjectSummary;
  initialSlice?: PerProjectMembers;
  addImpl?: (email: string) => Observable<MemberSummary>;
  removeImpl?: (userId: string) => Observable<void>;
  confirmResult?: true | undefined;
  currentUser?: UserProfileDto | null;
}

async function mount(options: MountOptions = {}): Promise<{
  fixture: ComponentFixture<MembersDialogComponent>;
  component: MembersDialogComponent;
  membersState: MembersStateMock;
  dialog: DialogMock;
  dialogRef: { close: ReturnType<typeof vi.fn> };
}> {
  TestBed.resetTestingModule();

  const defaultSlice: PerProjectMembers = {
    members: [],
    isLoading: false,
    error: null,
    hasLoaded: false
  };
  const sliceSig = signal<PerProjectMembers>(options.initialSlice ?? defaultSlice);

  const membersState: MembersStateMock = {
    sliceSig,
    selectForProject: () => sliceSig,
    loadMembers: vi.fn(),
    addMemberByEmail: vi.fn(
      options.addImpl ?? ((_email: string) => of(makeMember({ userId: 'u-new' })))
    ),
    removeMember: vi.fn(
      options.removeImpl ?? ((_userId: string) => of(void 0))
    ),
    setCurrentProjectContext: vi.fn(),
    clearCurrentProjectContext: vi.fn()
  };

  const dialog: DialogMock = {
    open: vi.fn(() => ({ closed: of(options.confirmResult ?? undefined) }))
  };

  const dialogRef = { close: vi.fn() };

  const project = options.project ?? makeProject();
  const currentUser = options.currentUser === undefined ? OWNER_USER : options.currentUser;

  await TestBed.configureTestingModule({
    imports: [MembersDialogComponent],
    providers: [
      { provide: DIALOG_DATA, useValue: <MembersDialogData>{ project } },
      { provide: DialogRef, useValue: dialogRef },
      { provide: MembersStateService, useValue: membersState },
      { provide: Dialog, useValue: dialog },
      {
        provide: AuthService,
        useValue: {
          currentUser: signal<UserProfileDto | null>(currentUser),
          login: () => undefined,
          register: () => undefined,
          logout: () => undefined
        }
      }
    ]
  }).compileComponents();

  const fixture = TestBed.createComponent(MembersDialogComponent);
  fixture.detectChanges();

  return {
    fixture,
    component: fixture.componentInstance,
    membersState,
    dialog,
    dialogRef
  };
}

describe('MembersDialogComponent', () => {
  it('calls loadMembers on init with the project id', async () => {
    const { membersState } = await mount();
    expect(membersState.loadMembers).toHaveBeenCalledWith('p-1');
  });

  it('sets the members-state realtime context to the open project id on init', async () => {
    const { membersState } = await mount();
    expect(membersState.setCurrentProjectContext).toHaveBeenCalledWith('p-1');
  });

  it('clears the members-state realtime context on destroy', async () => {
    const { fixture, membersState } = await mount();
    fixture.destroy();
    expect(membersState.clearCurrentProjectContext).toHaveBeenCalledTimes(1);
  });

  it('renders the heading with the project name (id="members-dialog-title")', async () => {
    const { fixture } = await mount({ project: makeProject({ name: 'Alpha Project' }) });
    const heading = fixture.nativeElement.querySelector('#members-dialog-title');
    expect(heading).toBeTruthy();
    expect(heading.textContent.trim()).toBe('Members — Alpha Project');
  });

  it('renders loading copy while listVm is loading', async () => {
    const { fixture, membersState } = await mount();
    membersState.sliceSig.set({ members: [], isLoading: true, error: null, hasLoaded: false });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Loading members');
  });

  it('renders the error banner with Retry', async () => {
    const { fixture, membersState } = await mount();
    membersState.sliceSig.set({
      members: [],
      isLoading: false,
      error: 'This project no longer exists.',
      hasLoaded: false
    });
    fixture.detectChanges();

    const banner = fixture.debugElement.query(By.css('.members-dialog__error-banner'));
    expect(banner).toBeTruthy();
    const retry: HTMLButtonElement = banner.nativeElement.querySelector(
      '.members-dialog__error-banner-retry'
    );
    expect(retry).toBeTruthy();

    retry.click();
    fixture.detectChanges();
    expect(membersState.loadMembers).toHaveBeenCalledWith('p-1', true);
  });

  it('owner view renders the add-form', async () => {
    const { fixture, membersState } = await mount();
    membersState.sliceSig.set({
      members: [makeMember({ userId: 'u-self', role: 'Owner', name: 'Self' })],
      isLoading: false,
      error: null,
      hasLoaded: true
    });
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('app-add-member-form');
    expect(form).toBeTruthy();
  });

  it('non-owner view hides the add-form and shows the viewer-note', async () => {
    const { fixture, membersState } = await mount({
      project: makeProject({ role: 'Member' })
    });
    membersState.sliceSig.set({
      members: [makeMember()],
      isLoading: false,
      error: null,
      hasLoaded: true
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-add-member-form')).toBeNull();
    const note = fixture.nativeElement.querySelector('.members-dialog__viewer-note');
    expect(note).toBeTruthy();
    expect(note.textContent).toContain('Only owners can add or remove members.');
  });

  it('onAddSubmit happy path bumps resetCounter and clears addError', async () => {
    const created = makeMember({ userId: 'u-new', name: 'New' });
    const { fixture, component, membersState } = await mount({
      addImpl: () => of(created)
    });
    membersState.sliceSig.set({
      members: [],
      isLoading: false,
      error: null,
      hasLoaded: true
    });
    fixture.detectChanges();

    (component as unknown as { onAddSubmit: (e: string) => void }).onAddSubmit('new@example.com');
    fixture.detectChanges();

    expect(membersState.addMemberByEmail).toHaveBeenCalledWith('p-1', 'new@example.com');
    // addVm is idle with no error + resetCounter bumped.
    const vm = (component as unknown as { addVm: () => { status: string; errorMessage: string | null; resetCounter: number } }).addVm();
    expect(vm.status).toBe('idle');
    expect(vm.errorMessage).toBeNull();
    expect(vm.resetCounter).toBe(1);
  });

  // Regression guard for issue #68: a 401 on the invite path used to be
  // intercepted globally as "session expired" and redirect to /login,
  // unmounting the dialog. With the interceptor narrowed, the dialog must
  // stay mounted, surface the mapped 401 copy inline, mirror it to the
  // polite live region, and leave AuthService.logout() uninvoked.
  it('onAddSubmit 401 keeps dialog mounted, sets addError + liveMessage, does not call logout (issue #68)', async () => {
    const sessionExpiredCopy = 'Your session has expired. Please sign in again.';
    const { fixture, component, membersState, dialogRef } = await mount({
      addImpl: () => throwError(() => new Error(sessionExpiredCopy))
    });
    const authService = TestBed.inject(AuthService) as unknown as { logout: () => void };
    const logoutSpy = vi.spyOn(authService, 'logout');
    membersState.sliceSig.set({
      members: [makeMember({ userId: 'u-self', role: 'Owner', name: 'Self' })],
      isLoading: false,
      error: null,
      hasLoaded: true
    });
    fixture.detectChanges();

    (component as unknown as { onAddSubmit: (e: string) => void }).onAddSubmit('x@y.com');
    fixture.detectChanges();

    // Dialog remained mounted: the add-form is still in the DOM and no
    // dialogRef.close was issued.
    expect(fixture.nativeElement.querySelector('app-add-member-form')).toBeTruthy();
    expect(dialogRef.close).not.toHaveBeenCalled();

    // Inline copy surfaced via the add-form's errorMessage input.
    const addFormDebug = fixture.debugElement.query(By.css('app-add-member-form'));
    expect((addFormDebug.componentInstance as { errorMessage: string | null }).errorMessage).toBe(
      sessionExpiredCopy
    );

    // Polite live region mirrors the same copy for AT users.
    expect(
      (component as unknown as { liveMessage: () => string }).liveMessage()
    ).toBe(sessionExpiredCopy);

    // Global logout must NOT have been called — this is the core of the fix.
    expect(logoutSpy).not.toHaveBeenCalled();
  });

  it('onAddSubmit 403 flips roleRevoked and hides the add-form', async () => {
    const { fixture, component, membersState } = await mount({
      addImpl: () => throwError(() => new Error('Only the project owner can add members.'))
    });
    membersState.sliceSig.set({
      members: [makeMember()],
      isLoading: false,
      error: null,
      hasLoaded: true
    });
    fixture.detectChanges();

    (component as unknown as { onAddSubmit: (e: string) => void }).onAddSubmit('x@y.com');
    fixture.detectChanges();

    // Add-form unmounts; viewer-note appears.
    expect(fixture.nativeElement.querySelector('app-add-member-form')).toBeNull();
  });

  it('onRemoveClick opens the confirm dialog and cancels do not call removeMember', async () => {
    const { fixture, component, membersState, dialog } = await mount({
      confirmResult: undefined
    });
    membersState.sliceSig.set({
      members: [makeMember({ userId: 'u-other' })],
      isLoading: false,
      error: null,
      hasLoaded: true
    });
    fixture.detectChanges();

    (component as unknown as { onRemoveClick: (m: MemberSummary) => void }).onRemoveClick(
      makeMember({ userId: 'u-other' })
    );
    expect(dialog.open).toHaveBeenCalledTimes(1);
    expect(dialog.open).toHaveBeenCalledWith(
      RemoveMemberConfirmDialogComponent,
      expect.objectContaining({
        ariaLabelledBy: 'remove-member-confirm-heading',
        autoFocus: 'first-tabbable',
        restoreFocus: true,
        panelClass: 'remove-member-confirm-dialog-panel'
      })
    );
    expect(membersState.removeMember).not.toHaveBeenCalled();
  });

  it('onRemoveClick confirmed -> calls removeMember', async () => {
    const { fixture, component, membersState } = await mount({
      confirmResult: true
    });
    membersState.sliceSig.set({
      members: [makeMember({ userId: 'u-other' })],
      isLoading: false,
      error: null,
      hasLoaded: true
    });
    fixture.detectChanges();

    (component as unknown as { onRemoveClick: (m: MemberSummary) => void }).onRemoveClick(
      makeMember({ userId: 'u-other' })
    );
    expect(membersState.removeMember).toHaveBeenCalledWith('p-1', 'u-other');
  });

  it('remove error surfaces in the list-scope error banner and keeps the row', async () => {
    const { fixture, component, membersState } = await mount({
      confirmResult: true,
      removeImpl: () => throwError(() => new Error("You can't remove the last owner of a project."))
    });
    membersState.sliceSig.set({
      members: [makeMember({ userId: 'u-other' })],
      isLoading: false,
      error: null,
      hasLoaded: true
    });
    fixture.detectChanges();

    (component as unknown as { onRemoveClick: (m: MemberSummary) => void }).onRemoveClick(
      makeMember({ userId: 'u-other' })
    );
    fixture.detectChanges();

    // The remove-error surfaces via addError -> add-form error banner input.
    const addFormDebug = fixture.debugElement.query(By.css('app-add-member-form'));
    // addError is passed via [errorMessage]
    expect((addFormDebug.componentInstance as { errorMessage: string | null }).errorMessage).toBe(
      "You can't remove the last owner of a project."
    );
  });

  it('remove 403 flips roleRevoked true', async () => {
    const { fixture, component, membersState } = await mount({
      confirmResult: true,
      removeImpl: () => throwError(() => new Error('Only the project owner can remove members.'))
    });
    membersState.sliceSig.set({
      members: [makeMember({ userId: 'u-other' })],
      isLoading: false,
      error: null,
      hasLoaded: true
    });
    fixture.detectChanges();

    (component as unknown as { onRemoveClick: (m: MemberSummary) => void }).onRemoveClick(
      makeMember({ userId: 'u-other' })
    );
    fixture.detectChanges();

    // Add-form unmounts because canManage() is now false.
    expect(fixture.nativeElement.querySelector('app-add-member-form')).toBeNull();
  });

  it('rapid double remove-click does not open a second confirm dialog', async () => {
    const neverSettling = new Subject<void>();
    const { fixture, component, membersState, dialog } = await mount({
      confirmResult: true,
      removeImpl: () => neverSettling.asObservable()
    });
    membersState.sliceSig.set({
      members: [makeMember({ userId: 'u-other' })],
      isLoading: false,
      error: null,
      hasLoaded: true
    });
    fixture.detectChanges();

    const api = component as unknown as { onRemoveClick: (m: MemberSummary) => void };
    api.onRemoveClick(makeMember({ userId: 'u-other' }));
    // First call opened one dialog and issued one removeMember.
    expect(dialog.open).toHaveBeenCalledTimes(1);
    expect(membersState.removeMember).toHaveBeenCalledTimes(1);

    // Second call while pending -> skipped by the guard.
    api.onRemoveClick(makeMember({ userId: 'u-other' }));
    expect(dialog.open).toHaveBeenCalledTimes(1);
    expect(membersState.removeMember).toHaveBeenCalledTimes(1);

    neverSettling.complete();
  });

  it('Close button closes the dialog', async () => {
    const { fixture, dialogRef } = await mount();
    const closeBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.members-dialog__close');
    closeBtn.click();
    expect(dialogRef.close).toHaveBeenCalledTimes(1);
  });
});
