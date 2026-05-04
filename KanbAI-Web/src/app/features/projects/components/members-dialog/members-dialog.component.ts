import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  EnvironmentInjector,
  OnInit,
  ViewChild,
  ViewEncapsulation,
  computed,
  inject,
  runInInjectionContext,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';

import { AuthService } from '../../../../core/services/AuthService';
import { MembersStateService } from '../../state/members-state.service';
import { MemberSummary } from '../../models/member.model';
import { MembersListComponent } from './members-list/members-list.component';
import { AddMemberFormComponent } from './add-member-form/add-member-form.component';
import { RemoveMemberConfirmDialogComponent } from './remove-member-confirm-dialog/remove-member-confirm-dialog.component';
import {
  RemoveMemberConfirmData,
  RemoveMemberConfirmResult
} from './remove-member-confirm-dialog/remove-member-confirm-dialog.types';
import {
  AddMemberViewModel,
  MembersDialogData,
  MembersDialogResult,
  MembersListViewModel
} from './members-dialog.types';

/** Copy for the list-scope error banner when mutations return 403. */
const OWNER_ONLY_ADD_COPY = 'Only the project owner can add members.';
const OWNER_ONLY_REMOVE_COPY = 'Only the project owner can remove members.';

/**
 * Smart container for the Members surface. Orchestrates:
 *  - list load via `MembersStateService.loadMembers`;
 *  - add via `addMemberByEmail` + child `AddMemberFormComponent`;
 *  - remove via `removeMember` + a child `RemoveMemberConfirmDialogComponent`;
 *  - a live region for screen readers.
 *
 * ViewEncapsulation.None scopes styles via `.members-dialog-panel`.
 */
@Component({
  selector: 'app-members-dialog',
  standalone: true,
  imports: [CommonModule, MembersListComponent, AddMemberFormComponent],
  templateUrl: './members-dialog.component.html',
  styleUrl: './members-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class MembersDialogComponent implements OnInit {
  private readonly dialogRef = inject<DialogRef<MembersDialogResult>>(DialogRef);
  protected readonly data: MembersDialogData = inject(DIALOG_DATA);
  private readonly membersState = inject(MembersStateService);
  private readonly authService = inject(AuthService);
  private readonly dialog = inject(Dialog);
  private readonly appInjector = inject(EnvironmentInjector);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild(AddMemberFormComponent)
  private addForm?: AddMemberFormComponent;

  /** True at open time when the caller's cached role is Owner. */
  protected readonly isOwner: boolean =
    (this.data.project.role?.trim().toLowerCase() ?? '') === 'owner';

  /** Flipped to true on a 403 from any mutation (server-authoritative). */
  protected readonly roleRevoked = signal<boolean>(false);

  protected readonly canManage = computed(() => this.isOwner && !this.roleRevoked());

  /** Local add-form state. */
  private readonly addSubmitting = signal<boolean>(false);
  private readonly addError = signal<string | null>(null);
  private readonly resetCounter = signal<number>(0);

  /** At most one remove at a time (enforced by UI). */
  protected readonly pendingRemovalUserId = signal<string | null>(null);

  /** Polite live-region message surfaced to screen readers. */
  protected readonly liveMessage = signal<string>('');

  /** Current user id from AuthService — drives the "(You)" indicator. */
  protected readonly currentUserId = computed<string | null>(
    () => this.authService.currentUser()?.id ?? null
  );

  /** List-branch view-model (loading / success / empty / error). */
  protected readonly listVm = computed<MembersListViewModel>(() => {
    const slice = this.membersState.selectForProject(this.data.project.id)();
    if (slice.error !== null) {
      return { status: 'error', message: slice.error };
    }
    if (slice.isLoading && !slice.hasLoaded) {
      return { status: 'loading' };
    }
    if (slice.hasLoaded && slice.members.length === 0) {
      return { status: 'empty' };
    }
    if (slice.members.length > 0) {
      return { status: 'success', members: slice.members };
    }
    return { status: 'loading' };
  });

  /** Add-form view-model. */
  protected readonly addVm = computed<AddMemberViewModel>(() => {
    if (this.addSubmitting()) {
      return { status: 'submitting', errorMessage: null, resetCounter: this.resetCounter() };
    }
    return {
      status: 'idle',
      errorMessage: this.addError(),
      resetCounter: this.resetCounter()
    };
  });

  ngOnInit(): void {
    this.liveMessage.set('Loading members…');
    // Attribute `MemberAdded` realtime events to this project while the
    // dialog is open — the event payload carries no projectId (see
    // `MembersStateService.onMemberAdded`). Context is cleared on destroy.
    this.membersState.setCurrentProjectContext(this.data.project.id);
    this.destroyRef.onDestroy(() => {
      this.membersState.clearCurrentProjectContext();
    });
    this.membersState.loadMembers(this.data.project.id);
  }

  protected onClose(): void {
    this.dialogRef.close();
  }

  protected onRetryLoad(): void {
    this.liveMessage.set('Loading members…');
    this.membersState.loadMembers(this.data.project.id, true);
  }

  protected onAddSubmit(email: string): void {
    if (this.addSubmitting()) {
      return;
    }
    this.addSubmitting.set(true);
    this.addError.set(null);
    this.liveMessage.set('Adding member…');

    // Run subscription in the application-root injector so the HTTP call
    // isn't cancelled if the dialog closes mid-flight (mirrors
    // CreateProjectDialogComponent).
    runInInjectionContext(this.appInjector, () => {
      this.membersState.addMemberByEmail(this.data.project.id, email).subscribe({
        next: (member: MemberSummary) => {
          this.addSubmitting.set(false);
          this.resetCounter.update(n => n + 1);
          this.liveMessage.set(`Added ${member.name}.`);
        },
        error: (err: Error) => {
          this.addSubmitting.set(false);
          const message = err?.message ?? 'Something went wrong. Please try again.';
          if (message === OWNER_ONLY_ADD_COPY) {
            this.roleRevoked.set(true);
          }
          this.addError.set(message);
          this.liveMessage.set(message);
        }
      });
    });
  }

  protected onRemoveClick(member: MemberSummary): void {
    if (this.pendingRemovalUserId() !== null) {
      return;
    }

    const confirmRef = this.dialog.open<
      RemoveMemberConfirmResult,
      RemoveMemberConfirmData,
      RemoveMemberConfirmDialogComponent
    >(RemoveMemberConfirmDialogComponent, {
      data: { member, projectName: this.data.project.name },
      ariaLabelledBy: 'remove-member-confirm-heading',
      ariaDescribedBy: 'remove-member-confirm-body',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      panelClass: 'remove-member-confirm-dialog-panel',
      backdropClass: 'remove-member-confirm-dialog-backdrop'
    });

    confirmRef.closed.subscribe(result => {
      if (result !== true) {
        return;
      }
      this.performRemove(member);
    });
  }

  private performRemove(member: MemberSummary): void {
    this.pendingRemovalUserId.set(member.userId);
    this.addError.set(null);

    runInInjectionContext(this.appInjector, () => {
      this.membersState.removeMember(this.data.project.id, member.userId).subscribe({
        next: () => {
          this.pendingRemovalUserId.set(null);
          this.liveMessage.set(`Removed ${member.name}.`);
          // Focus management post-remove: try add-form input, else close btn.
          this.focusAfterRemove();
        },
        error: (err: Error) => {
          this.pendingRemovalUserId.set(null);
          const message = err?.message ?? 'Something went wrong. Please try again.';
          if (message === OWNER_ONLY_REMOVE_COPY) {
            this.roleRevoked.set(true);
          }
          this.addError.set(message);
          this.liveMessage.set(message);
        }
      });
    });
  }

  private focusAfterRemove(): void {
    // Prefer the add-form input when still rendered (owner, not role-revoked).
    queueMicrotask(() => {
      if (this.canManage() && this.addForm) {
        this.addForm.focusInput();
      }
    });
  }
}
