import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, it, expect } from 'vitest';

import { MemberRowComponent } from './member-row.component';
import { MemberSummary } from '../../../models/member.model';

function makeMember(partial?: Partial<MemberSummary>): MemberSummary {
  return {
    userId: 'u-1',
    name: 'Alice Example',
    email: 'alice@example.com',
    role: 'Member',
    joinedAt: '2026-04-29T14:12:00Z',
    ...partial
  };
}

async function mount(inputs: {
  member: MemberSummary;
  isSelf?: boolean;
  canRemove?: boolean;
  isPending?: boolean;
}): Promise<ComponentFixture<MemberRowComponent>> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({ imports: [MemberRowComponent] }).compileComponents();
  const fixture = TestBed.createComponent(MemberRowComponent);
  fixture.componentRef.setInput('member', inputs.member);
  fixture.componentRef.setInput('isSelf', inputs.isSelf ?? false);
  fixture.componentRef.setInput('canRemove', inputs.canRemove ?? false);
  fixture.componentRef.setInput('isPending', inputs.isPending ?? false);
  fixture.detectChanges();
  return fixture;
}

describe('MemberRowComponent', () => {
  it('renders the name and email', async () => {
    const fixture = await mount({ member: makeMember() });
    const name = fixture.debugElement.query(By.css('.member-row__name')).nativeElement;
    const email = fixture.debugElement.query(By.css('.member-row__email')).nativeElement;
    expect(name.textContent.trim()).toBe('Alice Example');
    expect(email.textContent.trim()).toBe('alice@example.com');
  });

  it('renders the role via the reused badge classes (titlecase)', async () => {
    const fixture = await mount({ member: makeMember({ role: 'owner' }) });
    const badge = fixture.debugElement.query(By.css('.project-card__badge'));
    expect(badge.nativeElement.textContent.trim()).toBe('Owner');
    expect(badge.nativeElement.classList.contains('project-card__badge--owner')).toBe(true);
  });

  it('shows "(You)" only when isSelf=true', async () => {
    const self = await mount({ member: makeMember(), isSelf: true });
    expect(self.debugElement.query(By.css('.member-row__self-indicator'))).toBeTruthy();

    const other = await mount({ member: makeMember(), isSelf: false });
    expect(other.debugElement.query(By.css('.member-row__self-indicator'))).toBeNull();
  });

  it('renders the Remove button iff canRemove=true', async () => {
    const withRemove = await mount({ member: makeMember(), canRemove: true });
    expect(withRemove.debugElement.query(By.css('.member-row__remove'))).toBeTruthy();

    const withoutRemove = await mount({ member: makeMember(), canRemove: false });
    expect(withoutRemove.debugElement.query(By.css('.member-row__remove'))).toBeNull();
  });

  it('includes the member name in the Remove button aria-label', async () => {
    const fixture = await mount({ member: makeMember({ name: 'Alice Example' }), canRemove: true });
    const btn: HTMLButtonElement = fixture.debugElement.query(By.css('.member-row__remove')).nativeElement;
    expect(btn.getAttribute('aria-label')).toBe('Remove Alice Example');
  });

  it('disables the Remove button when isPending=true and renders "Removing…" copy', async () => {
    const fixture = await mount({ member: makeMember(), canRemove: true, isPending: true });
    const btn: HTMLButtonElement = fixture.debugElement.query(By.css('.member-row__remove')).nativeElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain('Removing');
  });

  it('emits removeClick with the member when the Remove button is activated', async () => {
    const member = makeMember();
    const fixture = await mount({ member, canRemove: true });
    let emitted: MemberSummary | undefined;
    fixture.componentInstance.removeClick.subscribe(m => (emitted = m));

    const btn: HTMLButtonElement = fixture.debugElement.query(By.css('.member-row__remove')).nativeElement;
    btn.click();
    expect(emitted).toEqual(member);
  });

  it('does not emit when isPending (double-click guard)', async () => {
    const fixture = await mount({ member: makeMember(), canRemove: true, isPending: true });
    let emissions = 0;
    fixture.componentInstance.removeClick.subscribe(() => (emissions += 1));

    const btn: HTMLButtonElement = fixture.debugElement.query(By.css('.member-row__remove')).nativeElement;
    btn.click();
    expect(emissions).toBe(0);
  });
});
