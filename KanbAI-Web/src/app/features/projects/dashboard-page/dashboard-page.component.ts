import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DashboardHeaderComponent } from '../components/dashboard-header/dashboard-header.component';
import { DashboardSkeletonComponent } from '../components/dashboard-skeleton/dashboard-skeleton.component';
import { DashboardEmptyStateComponent } from '../components/dashboard-empty-state/dashboard-empty-state.component';
import { DashboardErrorStateComponent } from '../components/dashboard-error-state/dashboard-error-state.component';
import { ProjectGridComponent } from '../components/project-grid/project-grid.component';
import { ProjectsApiService, mapErrorToUserMessage } from '../services/projects-api.service';
import { DashboardViewModel, INITIAL_DASHBOARD_VM } from '../models/dashboard-view-model';

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
  private readonly projectsApi = inject(ProjectsApiService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly vm = signal<DashboardViewModel>(INITIAL_DASHBOARD_VM);

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.vm.set({ status: 'loading' });

    this.projectsApi
      .listProjects()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: projects => {
          if (projects.length === 0) {
            this.vm.set({ status: 'empty' });
          } else {
            this.vm.set({ status: 'success', projects });
          }
        },
        error: err => {
          // Developer diagnostics only — never surfaced to the UI.
          // The user-safe message comes from mapErrorToUserMessage.
          console.error('Failed to load projects', err);
          this.vm.set({ status: 'error', message: mapErrorToUserMessage(err) });
        }
      });
  }

  protected retry(): void {
    this.load();
  }

  protected onCreatePlaceholder(): void {
    // Placeholder for #32 — the create-project modal will replace this handler.
    // Intentionally a no-op for #30.
  }
}
