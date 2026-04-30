import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';
import { ProjectCardComponent } from '../project-card/project-card.component';
import { ProjectSummary } from '../../models/project.model';

@Component({
  selector: 'app-project-grid',
  standalone: true,
  imports: [ProjectCardComponent],
  templateUrl: './project-grid.component.html',
  styleUrl: './project-grid.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectGridComponent {
  @Input({ required: true }) projects: ProjectSummary[] = [];

  /** Re-emitted from `ProjectCardComponent`'s owner-only Manage button. */
  @Output() manageMembersClick = new EventEmitter<ProjectSummary>();

  protected trackById(_index: number, project: ProjectSummary): string {
    return project.id;
  }
}
