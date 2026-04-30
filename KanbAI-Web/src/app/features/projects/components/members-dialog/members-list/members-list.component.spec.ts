import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, it, expect } from 'vitest';

import { MembersListComponent } from './members-list.component';
import { MemberRowComponent } from '../member-row/member-row.component';
import { MemberSummary } from '../../../models/member.model';

function makeMember(partial?: Partial<MemberSummary>): MemberSummary {
  return {
    userId: 'u-1',
    name: 'Alice',
    email: 'alice@example.com',
    role: 'Member',
    joinedAt: '2026-04-29T14:12:00Z',
    ...partial
  };
}

async function mount(inputs: {
  members: MemberSummary[];
  currentUserId: string | null;
  isOwner: boolean;
  pendingRemovalUserId?: string | null;
}): Promise<ComponentFixture<MembersListComponent>> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({ imports: [MembersListComponent] }).compileComponents();
  const fixture = TestBed.createComponent(MembersListComponent);
  fixture.componentRef.setInput('members', inputs.members);
  fixture.componentRef.setInput('currentUserId', inputs.currentUserId);
  fixture.componentRef.setInput('isOwner', inputs.isOwner);
  fixture.componentRef.setInput('pendingRemovalUserId', inputs.pendingRemovalUserId ?? null);
  fixture.detectChanges();
  return fixture;
}

describe('MembersListComponent', () => {
  it('renders one row per member', async () => {
    const fixture = await mount({
      members: [makeMember({ userId: 'u-1' }), makeMember({ userId: 'u-2', name: 'Bob' })],
      currentUserId: null,
      isOwner: false
    });
    const rows = fixture.debugElement.queryAll(By.directive(MemberRowComponent));
    expect(rows.length).toBe(2);
  });

  it('uses <ul role="list">', async () => {
    const fixture = await mount({
      members: [makeMember()],
      currentUserId: null,
      isOwner: false
    });
    const ul = fixture.debugElement.query(By.css('ul'));
    expect(ul.nativeElement.getAttribute('role')).toBe('list');
  });

  it('passes canRemove=true for non-self non-owner members when viewer is owner', async () => {
    const fixture = await mount({
      members: [
        makeMember({ userId: 'u-self', name: 'Self', role: 'Owner' }),
        makeMember({ userId: 'u-other', name: 'Other', role: 'Member' })
      ],
      currentUserId: 'u-self',
      isOwner: true
    });
    const rows = fixture.debugElement.queryAll(By.directive(MemberRowComponent));
    expect((rows[0].componentInstance as MemberRowComponent).canRemove).toBe(false); // self
    expect((rows[1].componentInstance as MemberRowComponent).canRemove).toBe(true);  // other
  });

  it('never passes canRemove=true when viewer is not owner', async () => {
    const fixture = await mount({
      members: [makeMember({ userId: 'u-1' }), makeMember({ userId: 'u-2' })],
      currentUserId: 'u-self',
      isOwner: false
    });
    const rows = fixture.debugElement.queryAll(By.directive(MemberRowComponent));
    rows.forEach(r => expect((r.componentInstance as MemberRowComponent).canRemove).toBe(false));
  });

  it('canRemove is false for another Owner (last-owner protection)', async () => {
    const fixture = await mount({
      members: [
        makeMember({ userId: 'u-self', name: 'Self', role: 'Owner' }),
        makeMember({ userId: 'u-co', name: 'Co', role: 'Owner' })
      ],
      currentUserId: 'u-self',
      isOwner: true
    });
    const rows = fixture.debugElement.queryAll(By.directive(MemberRowComponent));
    expect((rows[1].componentInstance as MemberRowComponent).canRemove).toBe(false);
  });

  it('marks the matching row as pending', async () => {
    const fixture = await mount({
      members: [makeMember({ userId: 'u-1' }), makeMember({ userId: 'u-2' })],
      currentUserId: null,
      isOwner: true,
      pendingRemovalUserId: 'u-2'
    });
    const rows = fixture.debugElement.queryAll(By.directive(MemberRowComponent));
    expect((rows[0].componentInstance as MemberRowComponent).isPending).toBe(false);
    expect((rows[1].componentInstance as MemberRowComponent).isPending).toBe(true);
  });

  it('re-emits removeClick from any row', async () => {
    const members = [makeMember({ userId: 'u-1' }), makeMember({ userId: 'u-2' })];
    const fixture = await mount({
      members,
      currentUserId: 'u-self',
      isOwner: true
    });
    let emitted: MemberSummary | undefined;
    fixture.componentInstance.removeClick.subscribe(m => (emitted = m));

    const rows = fixture.debugElement.queryAll(By.directive(MemberRowComponent));
    (rows[0].componentInstance as MemberRowComponent).removeClick.emit(members[0]);
    expect(emitted).toEqual(members[0]);
  });

  it('trackByUserId returns the member.userId', async () => {
    const member = makeMember({ userId: 'u-1' });
    const fixture = await mount({
      members: [member],
      currentUserId: null,
      isOwner: false
    });
    const key = (fixture.componentInstance as unknown as {
      trackByUserId: (i: number, m: MemberSummary) => string;
    }).trackByUserId(0, member);
    expect(key).toBe('u-1');
  });
});
