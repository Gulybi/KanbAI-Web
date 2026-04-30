import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  computed,
  signal
} from '@angular/core';
import { CommonModule, DatePipe, TitleCasePipe } from '@angular/common';
import { ProjectSummary } from '../../models/project.model';

@Component({
  selector: 'app-project-card',
  standalone: true,
  imports: [CommonModule, DatePipe, TitleCasePipe],
  templateUrl: './project-card.component.html',
  styleUrl: './project-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectCardComponent {
  private readonly _project = signal<ProjectSummary | null>(null);

  @Input({ required: true })
  set project(value: ProjectSummary) {
    this._project.set(value);
  }
  get project(): ProjectSummary {
    // Guarded by @Input({ required: true }); template is only rendered after set.
    return this._project()!;
  }

  /** Emitted when the owner-only Manage-members icon-button is activated. */
  @Output() manageMembersClick = new EventEmitter<ProjectSummary>();

  /** Stable id used by the template for aria-labelledby. */
  protected readonly titleId = computed(() => {
    const current = this._project();
    return current ? `project-card-title-${current.id}` : 'project-card-title';
  });

  /** True when description should render the "No description" placeholder. */
  protected readonly isDescriptionEmpty = computed(() => {
    const current = this._project();
    if (!current) return true;
    return current.description == null || current.description.trim() === '';
  });

  /** Lower-cased role keyword used to pick the badge variant class. */
  protected readonly roleVariant = computed<'owner' | 'member' | 'default'>(() => {
    const current = this._project();
    if (!current) return 'default';
    const normalized = current.role?.trim().toLowerCase();
    if (normalized === 'owner') return 'owner';
    if (normalized === 'member') return 'member';
    return 'default';
  });

  /** True when the viewer owns this project and can manage its members. */
  protected readonly canManage = computed(() => this.roleVariant() === 'owner');

  /** Formatted date string, or "—" if the ISO value is unparseable. */
  protected readonly formattedDate = computed(() => {
    const current = this._project();
    if (!current) return '—';
    const parsed = new Date(current.createdAt);
    if (Number.isNaN(parsed.getTime())) {
      return '—';
    }
    return null; // signals template to use DatePipe on project.createdAt
  });

  /** True when the formatted date is the fallback dash. */
  protected readonly isDateEmpty = computed(() => this.formattedDate() === '—');

  protected onManageMembers(event: Event): void {
    // Prevent the parent card's click/tabindex interactions from firing.
    event.stopPropagation();
    this.manageMembersClick.emit(this.project);
  }
}
