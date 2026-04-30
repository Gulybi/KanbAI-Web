import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { MemberRowComponent } from '../member-row/member-row.component';
import { MemberSummary } from '../../../models/member.model';

/**
 * Roster container. Semantic `<ul role="list">` of `MemberRowComponent`
 * rows. Loading (skeleton) and empty states are rendered by the parent
 * via its `listVm` switch; this component only renders the `success`
 * branch's list. The dialog-level error is also owned by the parent.
 */
@Component({
  selector: 'app-members-list',
  standalone: true,
  imports: [CommonModule, MemberRowComponent],
  templateUrl: './members-list.component.html',
  styleUrl: './members-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MembersListComponent {
  @Input({ required: true }) members: MemberSummary[] = [];
  @Input({ required: true }) currentUserId: string | null = null;
  @Input({ required: true }) isOwner: boolean = false;
  @Input() pendingRemovalUserId: string | null = null;

  @Output() removeClick = new EventEmitter<MemberSummary>();

  protected trackByUserId(_index: number, member: MemberSummary): string {
    return member.userId;
  }

  protected isSelf(member: MemberSummary): boolean {
    return this.currentUserId !== null && member.userId === this.currentUserId;
  }

  /**
   * The owner cannot remove themselves and cannot remove another Owner
   * (backend enforces "cannot remove last owner"). Non-owners never get
   * a Remove button.
   */
  protected canRemove(member: MemberSummary): boolean {
    if (!this.isOwner) return false;
    if (this.isSelf(member)) return false;
    const role = member.role?.trim().toLowerCase();
    if (role === 'owner') return false;
    return true;
  }

  protected isPending(member: MemberSummary): boolean {
    return this.pendingRemovalUserId === member.userId;
  }

  protected onRowRemove(member: MemberSummary): void {
    this.removeClick.emit(member);
  }
}
