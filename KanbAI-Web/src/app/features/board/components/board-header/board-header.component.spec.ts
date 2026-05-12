import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, it, expect, beforeEach } from 'vitest';

import { BoardHeaderComponent } from './board-header.component';
import { ProjectSummary } from '../../../projects/models/project.model';

const baseProject: ProjectSummary = {
  id: 'p-1',
  name: 'Q2 Launch',
  description: null,
  role: 'Owner',
  createdAt: '2026-04-10T12:00:00Z',
  updatedAt: '2026-04-10T12:00:00Z'
};

describe('BoardHeaderComponent', () => {
  let fixture: ComponentFixture<BoardHeaderComponent>;

  async function mount(project: ProjectSummary): Promise<void> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [BoardHeaderComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(BoardHeaderComponent);
    fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await mount(baseProject);
  });

  it('renders the project name in an h1', () => {
    const h1 = fixture.debugElement.query(By.css('h1.board-header__title'));
    expect(h1).toBeTruthy();
    expect(h1.nativeElement.textContent.trim()).toBe('Q2 Launch');
  });

  it('renders the kebab trigger with aria-label', () => {
    const btn = fixture.debugElement.query(By.css('.board-header__menu-btn'));
    expect(btn).toBeTruthy();
    expect(btn.nativeElement.getAttribute('aria-label')).toBe('Project actions');
  });

  it('emits deleteProjectRequested when the Delete row is activated (Owner)', () => {
    let fired = 0;
    fixture.componentInstance.deleteProjectRequested.subscribe(() => (fired += 1));
    (fixture.componentInstance as any).onDeleteProjectActivate();
    expect(fired).toBe(1);
  });

  it('does not emit for non-owner', async () => {
    await mount({ ...baseProject, role: 'Member' });
    let fired = 0;
    fixture.componentInstance.deleteProjectRequested.subscribe(() => (fired += 1));
    (fixture.componentInstance as any).onDeleteProjectActivate();
    expect(fired).toBe(0);
  });
});
