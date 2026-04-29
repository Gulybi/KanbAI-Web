import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
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

  protected trackById(_index: number, project: ProjectSummary): string {
    return project.id;
  }
}
