import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
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
import { ProjectStateService } from '../state/project-state.service';
import { DashboardViewModel } from '../models/dashboard-view-model';
import { ProjectSummary } from '../models/project.model';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    DashboardHeaderComponent,
    DashboardSkeletonComponent,
    DashboardEmptyStateComponent,
    DashboardErrorStateComponent,
    ProjectGridComponent
  ],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardPageComponent implements OnInit {
  private readonly projectState = inject(ProjectStateService);
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);

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
    this.dialog.open<CreateProjectDialogResult>(CreateProjectDialogComponent, {
      ariaLabelledBy: 'create-project-heading',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      disableClose: false,
      panelClass: 'create-project-dialog-panel',
      backdropClass: 'create-project-dialog-backdrop'
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
}
