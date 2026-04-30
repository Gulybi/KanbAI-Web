import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  computed,
  signal
} from '@angular/core';
import { CommonModule, TitleCasePipe } from '@angular/common';

import { MemberSummary } from '../../../models/member.model';

/**
 * Presentational row inside the members roster. Shows name, email, a role
 * badge (reusing the owner/member classes from `project-card.component.scss`
 * — DO NOT redeclare them here), an optional "(You)" self-indicator, and
 * a destructive Remove button when `canRemove` is true.
 */
@Component({
  selector: 'app-member-row',
  standalone: true,
  imports: [CommonModule, TitleCasePipe],
  templateUrl: './member-row.component.html',
  styleUrl: './member-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MemberRowComponent {
  private readonly _member = signal<MemberSummary | null>(null);

  @Input({ required: true })
  set member(value: MemberSummary) {
    this._member.set(value);
  }
  get member(): MemberSummary {
    return this._member()!;
  }

  /** True when the row represents the currently-authenticated user. */
  @Input({ required: true }) isSelf: boolean = false;

  /**
   * True when the viewer is permitted to remove this row.
   *
   * The parent composes this from (isOwner && !isSelf && member.role !== 'Owner').
   * The row never recomputes those predicates.
   */
  @Input({ required: true }) canRemove: boolean = false;

  /** True while this row's remove is in flight. */
  @Input({ required: true }) isPending: boolean = false;

  @Output() removeClick = new EventEmitter<MemberSummary>();

  protected readonly roleVariant = computed<'owner' | 'member' | 'default'>(() => {
    const current = this._member();
    if (!current) return 'default';
    const normalized = current.role?.trim().toLowerCase();
    if (normalized === 'owner') return 'owner';
    if (normalized === 'member') return 'member';
    return 'default';
  });

  protected readonly initials = computed(() => {
    const current = this._member();
    if (!current) return '';
    const name = current.name.trim();
    if (name.length === 0) {
      return current.email.charAt(0).toUpperCase();
    }
    const parts = name.split(/\s+/);
    const first = parts[0]?.charAt(0) ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1]?.charAt(0) ?? '' : '';
    return (first + last).toUpperCase();
  });

  protected onRemove(): void {
    if (this.isPending || !this.canRemove) {
      return;
    }
    this.removeClick.emit(this.member);
  }
}
