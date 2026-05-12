import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  ViewEncapsulation,
  computed,
  signal
} from '@angular/core';
import { CommonModule, DatePipe, TitleCasePipe } from '@angular/common';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';

import { ProjectSummary } from '../../models/project.model';
import { DELETE_PROJECT_DISABLED_COPY } from '../../constants/delete-project-copy';

@Component({
  selector: 'app-project-card',
  standalone: true,
  imports: [CommonModule, DatePipe, TitleCasePipe, CdkMenuTrigger, CdkMenu, CdkMenuItem],
  templateUrl: './project-card.component.html',
  styleUrl: './project-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // ViewEncapsulation.None so the `.kanbai-menu` CDK-overlay chrome styled
  // alongside this component can reach the menu panel. Every selector the
  // component styles is scoped under `.project-card` or `.kanbai-menu` so
  // the unencapsulated rules never leak onto unrelated surfaces.
  encapsulation: ViewEncapsulation.None
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

  /**
   * Emitted when the kebab menu's "Delete project" item is activated. Only
   * emits when the current viewer's role is Owner (the item is rendered as
   * `aria-disabled` for non-owners — see `canDeleteProject`). Issue #96.
   */
  @Output() deleteProjectRequested = new EventEmitter<ProjectSummary>();

  /**
   * Emitted when the card host is activated (click, Enter, or Space).
   * The Manage-members button and text-selection releases do NOT emit.
   *
   * Note to future contributors: the host `<article>` carries
   * `role="button"` despite containing a nested `<button>` for
   * Manage-members. WAI-ARIA 1.2 discourages this nesting, but the
   * alternatives (role="link" with the same constraint, or no role)
   * are worse in practice — see issue_66_tech_spec.md §"ARIA trade-off".
   * Do not "fix" this by removing the role.
   */
  @Output() openBoard = new EventEmitter<ProjectSummary>();

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

  /** True when the Delete menu item is enabled (owner only). Issue #96. */
  protected readonly canDeleteProject = computed(() => this.roleVariant() === 'owner');

  /** Accessible label for the kebab trigger. Names the project. */
  protected readonly kebabAriaLabel = computed(() => `Actions for ${this.project.name}`);

  /** Hint copy under the disabled Delete row for non-owners. */
  protected readonly deleteDisabledHint = DELETE_PROJECT_DISABLED_COPY;

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

  /**
   * Kebab click handler. Stops propagation so the card host does not also
   * interpret the click as "open board" — CDK's own menu trigger does not
   * stop the DOM event from reaching ancestor handlers.
   */
  protected onKebabClick(event: Event): void {
    event.stopPropagation();
  }

  /** Keyboard activation on the kebab — same concern as onKebabClick. */
  protected onKebabKey(event: Event): void {
    event.stopPropagation();
  }

  /**
   * "Delete project" menu item activation. Only emits when the viewer is
   * Owner; the non-owner row is `aria-disabled` and has no click handler.
   */
  protected onDeleteProjectActivate(): void {
    if (!this.canDeleteProject()) {
      return;
    }
    this.deleteProjectRequested.emit(this.project);
  }

  protected onCardActivate(event: MouseEvent): void {
    if (this.isInsideManageButton(event.target)) {
      return;
    }
    if (this.isTextBeingSelected(event)) {
      return;
    }
    if (event.button !== undefined && event.button !== 0) {
      return;
    }
    this.openBoard.emit(this.project);
  }

  protected onKeyboardActivate(event: Event): void {
    // Angular types `(keydown.enter)` / `(keydown.space)` as `Event`; the
    // runtime instance is always `KeyboardEvent`. `preventDefault()` lives
    // on `Event`, so we do not need to narrow before calling it. Space's
    // default page-scroll is suppressed here.
    if (this.isInsideManageButton(event.target)) {
      return;
    }
    event.preventDefault();
    this.openBoard.emit(this.project);
  }

  private isInsideManageButton(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) {
      return false;
    }
    // The kebab trigger is NOT a Manage button — but it shares the
    // "don't open the board when I click this" contract, so we extend the
    // guard to any header-action button. Keeping the method name for
    // backwards-compat with existing call sites.
    return !!target.closest('.project-card__manage-btn, .project-card__menu-btn');
  }

  private isTextBeingSelected(event: MouseEvent): boolean {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.toString().length === 0) {
      return false;
    }
    const host = event.currentTarget as HTMLElement;
    const anchor = selection.anchorNode;
    return !!anchor && host.contains(anchor);
  }
}
