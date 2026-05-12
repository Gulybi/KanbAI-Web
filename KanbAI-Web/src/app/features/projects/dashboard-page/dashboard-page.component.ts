import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';

import { DashboardHeaderComponent } from '../components/dashboard-header/dashboard-header.component';
import { DashboardSkeletonComponent } from '../components/dashboard-skeleton/dashboard-skeleton.component';
import { DashboardEmptyStateComponent } from '../components/dashboard-empty-state/dashboard-empty-state.component';
import { DashboardErrorStateComponent } from '../components/dashboard-error-state/dashboard-error-state.component';
import { ProjectGridComponent } from '../components/project-grid/project-grid.component';
import { CreateProjectDialogComponent } from '../components/create-project-dialog/create-project-dialog.component';
import { CreateProjectDialogResult } from '../components/create-project-dialog/create-project-dialog.types';
import { MembersDialogComponent } from '../components/members-dialog/members-dialog.component';
import {
  MembersDialogData,
  MembersDialogResult
} from '../components/members-dialog/members-dialog.types';
import { PartialFailureToastComponent } from '../components/partial-failure-toast/partial-failure-toast.component';
import { DeleteProjectConfirmDialogComponent } from '../components/delete-project-confirm-dialog/delete-project-confirm-dialog.component';
import {
  DeleteProjectConfirmData,
  DeleteProjectConfirmResult
} from '../components/delete-project-confirm-dialog/delete-project-confirm-dialog.types';
import { ProjectStateService } from '../state/project-state.service';
import { ProjectsApiService } from '../services/projects-api.service';
import { DashboardViewModel } from '../models/dashboard-view-model';
import { ProjectSummary } from '../models/project.model';
import { ToastService } from '../../../core/services/toast.service';
import { DELETE_PROJECT_DISABLED_COPY } from '../constants/delete-project-copy';

/**
 * State of the dashboard's partial-failure toast. Non-null while the
 * toast is visible; the template renders an `<app-partial-failure-toast>`
 * from it.
 */
interface PartialFailureToastState {
  project: ProjectSummary;
  message: string;
}

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    DashboardHeaderComponent,
    DashboardSkeletonComponent,
    DashboardEmptyStateComponent,
    DashboardErrorStateComponent,
    ProjectGridComponent,
    PartialFailureToastComponent
  ],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardPageComponent implements OnInit {
  private readonly projectState = inject(ProjectStateService);
  private readonly projectsApi = inject(ProjectsApiService);
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  /** Non-null while the toast is visible. */
  protected readonly partialFailureToast = signal<PartialFailureToastState | null>(null);

  /** Smart-parent-owned per-dialog state for the delete-project flow (issue #96). */
  private readonly deleteProjectSubmitting = signal<boolean>(false);
  private readonly deleteProjectError = signal<string | null>(null);

  /**
   * Discriminated-union view model collapsed from the four state-service
   * signals. Template still reads `vm().status` through the existing
   * `@switch` block — visual output is unchanged from #30.
   *
   * Branch precedence:
   *  1. `error` present -> 'error' (the cache may still hold last-known-good
   *     projects, but the page-level error panel takes over).
   *  2. `isLoading` and never-yet-loaded -> 'loading' (initial skeleton).
   *  3. `hasLoaded` and empty -> 'empty'.
   *  4. `projects.length > 0` -> 'success'.
   *  5. Fallback -> 'loading' (covers the initial state before ngOnInit
   *     has triggered `loadProjects()`).
   */
  protected readonly vm = computed<DashboardViewModel>(() => {
    const isLoading = this.projectState.isLoading();
    const error = this.projectState.error();
    const projects = this.projectState.projects();
    const hasLoaded = this.projectState.hasLoaded();

    if (error) {
      return { status: 'error', message: error };
    }
    if (isLoading && !hasLoaded) {
      return { status: 'loading' };
    }
    if (hasLoaded && projects.length === 0) {
      return { status: 'empty' };
    }
    if (projects.length > 0) {
      return { status: 'success', projects };
    }
    return { status: 'loading' };
  });

  ngOnInit(): void {
    this.projectState.loadProjects();
  }

  protected retry(): void {
    this.projectState.loadProjects();
  }

  protected openCreateDialog(): void {
    const ref = this.dialog.open<CreateProjectDialogResult>(CreateProjectDialogComponent, {
      ariaLabelledBy: 'create-project-heading',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      disableClose: false,
      panelClass: 'create-project-dialog-panel',
      backdropClass: 'create-project-dialog-backdrop'
    });

    // Subscribe to the dialog's close result. `'partial'` surfaces the
    // dashboard-scoped `PartialFailureToastComponent`.
    ref.closed.subscribe(result => {
      if (result && result.status === 'partial') {
        this.partialFailureToast.set({
          project: result.project,
          message: result.message
        });
      }
    });
  }

  protected openBoard(project: ProjectSummary): void {
    this.router.navigate(['/board', project.id]);
  }

  protected openMembersDialog(project: ProjectSummary): void {
    this.dialog.open<MembersDialogResult, MembersDialogData, MembersDialogComponent>(
      MembersDialogComponent,
      {
        data: { project },
        ariaLabelledBy: 'members-dialog-title',
        autoFocus: 'first-tabbable',
        restoreFocus: true,
        disableClose: false,
        panelClass: 'members-dialog-panel',
        backdropClass: 'members-dialog-backdrop'
      }
    );
  }

  protected onPartialToastOpenBoard(): void {
    const toast = this.partialFailureToast();
    if (!toast) {
      return;
    }
    this.partialFailureToast.set(null);
    this.router.navigate(['/board', toast.project.id]);
  }

  protected onPartialToastDismiss(): void {
    this.partialFailureToast.set(null);
  }

  /**
   * Delete-project flow entry point (issue #96 sub-feature A). Opens the
   * destructive-confirm dialog, wires the child's `confirmClicked` to the
   * HTTP submit, and branches on the result per the copy matrix.
   */
  protected openDeleteProjectDialog(project: ProjectSummary): void {
    this.deleteProjectSubmitting.set(false);
    this.deleteProjectError.set(null);

    const ref = this.dialog.open<
      DeleteProjectConfirmResult,
      DeleteProjectConfirmData,
      DeleteProjectConfirmDialogComponent
    >(DeleteProjectConfirmDialogComponent, {
      data: { projectName: project.name },
      ariaLabelledBy: 'delete-project-confirm-heading',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      disableClose: false,
      panelClass: 'delete-project-confirm-panel',
      backdropClass: 'delete-project-confirm-backdrop'
    });

    // `output()` exposes `.subscribe(fn)` and returns a `SubscriptionLike`.
    // CDK's `DialogRef.closed` completes when the dialog is destroyed, so
    // wire teardown through that so the subscription is released deterministically.
    const sub = ref.componentInstance?.confirmClicked.subscribe(() =>
      this.submitDeleteProject(project, ref)
    );
    ref.closed.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      sub?.unsubscribe();
    });

    this.syncDialogInputs(ref);
  }

  private syncDialogInputs(
    ref: DialogRef<DeleteProjectConfirmResult, DeleteProjectConfirmDialogComponent>
  ): void {
    if (!ref.componentInstance) {
      return;
    }
    ref.componentRef?.setInput('submitting', this.deleteProjectSubmitting());
    ref.componentRef?.setInput('inlineError', this.deleteProjectError());
  }

  private submitDeleteProject(
    project: ProjectSummary,
    ref: DialogRef<DeleteProjectConfirmResult, DeleteProjectConfirmDialogComponent>
  ): void {
    if (this.deleteProjectSubmitting()) {
      return;
    }
    this.deleteProjectSubmitting.set(true);
    this.deleteProjectError.set(null);
    this.syncDialogInputs(ref);

    // Call the API directly so the raw HttpErrorResponse reaches the branch
    // table below. ProjectStateService.deleteProject wraps errors in a plain
    // Error (for other callers that want mapped copy), but #96's dashboard
    // path needs status-code routing.
    this.projectsApi
      .deleteProject(project.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.onDeleteSuccess(project, ref),
        error: err => this.onDeleteError(project, err, ref)
      });
  }

  private onDeleteSuccess(
    project: ProjectSummary,
    ref: DialogRef<DeleteProjectConfirmResult, DeleteProjectConfirmDialogComponent>
  ): void {
    this.deleteProjectSubmitting.set(false);
    this.projectState.applyDeletedProject(project.id);
    ref.close(true);
    this.toastService.show(`Project '${project.name}' was deleted`);
    this.toastService.announce('Project deleted');
  }

  private onDeleteError(
    project: ProjectSummary,
    err: unknown,
    ref: DialogRef<DeleteProjectConfirmResult, DeleteProjectConfirmDialogComponent>
  ): void {
    this.deleteProjectSubmitting.set(false);
    const status = err instanceof HttpErrorResponse ? err.status : null;

    // 404 → treat as success (server-authoritative: project is gone).
    if (status === 404) {
      this.onDeleteSuccess(project, ref);
      return;
    }
    // 403 → close + info toast; no state change.
    if (status === 403) {
      ref.close(undefined);
      this.toastService.show(DELETE_PROJECT_DISABLED_COPY, 'info');
      return;
    }
    // Network → stay open with retryable inline error.
    if (status === 0) {
      this.deleteProjectError.set("Couldn't reach the server — try again");
      this.syncDialogInputs(ref);
      return;
    }
    // 5xx, other, parse failure → stay open with generic inline error.
    this.deleteProjectError.set("Couldn't delete project — please try again");
    this.syncDialogInputs(ref);
  }
}
