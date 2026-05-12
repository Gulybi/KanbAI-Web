import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  input,
  output
} from '@angular/core';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';

import { ProjectSummary } from '../../../projects/models/project.model';
import { DELETE_PROJECT_DISABLED_COPY } from '../../../projects/constants/delete-project-copy';

/**
 * Top-of-board strip (issue #96). Renders the project title and an actions
 * kebab whose only item is "Delete project". The enabled / aria-disabled
 * state of the Delete row mirrors `ProjectCardComponent` exactly — both
 * surfaces share the {@link DELETE_PROJECT_DISABLED_COPY} constant so their
 * hint copy cannot drift.
 *
 * Presentational: no HTTP, no state, no router. The smart parent
 * (`BoardPageComponent`) owns the confirmation dialog + delete flow.
 */
@Component({
  selector: 'app-board-header',
  standalone: true,
  imports: [CdkMenuTrigger, CdkMenu, CdkMenuItem],
  templateUrl: './board-header.component.html',
  styleUrl: './board-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class BoardHeaderComponent {
  /** The currently-viewed project. Source of the title + owner role. */
  readonly project = input.required<ProjectSummary>();

  /** Emitted when the menu's Delete item is activated (owner only). */
  readonly deleteProjectRequested = output<void>();

  /** Owner-only enablement mirror of ProjectCardComponent.canDeleteProject. */
  protected readonly canDeleteProject = computed(
    () => this.project().role?.trim().toLowerCase() === 'owner'
  );

  protected readonly deleteDisabledHint = DELETE_PROJECT_DISABLED_COPY;

  protected onDeleteProjectActivate(): void {
    if (!this.canDeleteProject()) {
      return;
    }
    this.deleteProjectRequested.emit();
  }
}
