import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ProjectGridComponent } from './project-grid.component';
import { ProjectSummary } from '../../models/project.model';
import { ProjectCardComponent } from '../project-card/project-card.component';

function makeProjects(count: number): ProjectSummary[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p-${i}`,
    name: `Project ${i}`,
    description: null,
    role: 'Owner',
    createdAt: '2026-04-10T00:00:00Z',
    updatedAt: '2026-04-10T00:00:00Z'
  }));
}

describe('ProjectGridComponent', () => {
  let fixture: ComponentFixture<ProjectGridComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ProjectGridComponent] }).compileComponents();
    fixture = TestBed.createComponent(ProjectGridComponent);
  });

  it('renders one card per project', () => {
    fixture.componentRef.setInput('projects', makeProjects(3));
    fixture.detectChanges();

    const cards = fixture.debugElement.queryAll(By.directive(ProjectCardComponent));
    expect(cards.length).toBe(3);
  });

  it('renders nothing when the project array is empty', () => {
    fixture.componentRef.setInput('projects', []);
    fixture.detectChanges();

    const cards = fixture.debugElement.queryAll(By.directive(ProjectCardComponent));
    expect(cards.length).toBe(0);
  });

  it('wraps each card in a listitem', () => {
    fixture.componentRef.setInput('projects', makeProjects(2));
    fixture.detectChanges();

    const items = fixture.debugElement.queryAll(By.css('[role="listitem"]'));
    expect(items.length).toBe(2);
  });

  // QA gap-filler (issue #30): tech-spec Unit Test Matrix row "trackBy
  // returns the project id (covered by triggering an array replace with
  // same ids → no DOM re-creation)". Also locks the `project.id` contract
  // — future refactors that accidentally key on `index` will fail loudly.
  it('preserves card DOM identity when the projects array is replaced with equal ids', () => {
    // Arrange: initial render with three projects.
    fixture.componentRef.setInput('projects', makeProjects(3));
    fixture.detectChanges();
    const firstPassCards = fixture.debugElement.queryAll(By.directive(ProjectCardComponent));
    const firstPassNodes = firstPassCards.map(c => c.nativeElement);

    // Act: replace with a NEW array containing the SAME ids. trackBy
    // by id means Angular reuses the DOM nodes; trackBy by index
    // would also work here (same length), but trackBy by reference
    // would re-create every node.
    fixture.componentRef.setInput('projects', makeProjects(3));
    fixture.detectChanges();
    const secondPassCards = fixture.debugElement.queryAll(By.directive(ProjectCardComponent));
    const secondPassNodes = secondPassCards.map(c => c.nativeElement);

    // Assert: same count, same DOM nodes (identity-equal).
    expect(secondPassCards.length).toBe(firstPassCards.length);
    for (let i = 0; i < firstPassNodes.length; i++) {
      expect(secondPassNodes[i]).toBe(firstPassNodes[i]);
    }
  });

  it('trackById returns the project id (direct call — contract guard)', () => {
    // Arrange
    const project = makeProjects(1)[0];
    // Act: invoke the trackBy function the way Angular does internally.
    const key = (fixture.componentInstance as unknown as {
      trackById: (i: number, p: typeof project) => string;
    }).trackById(0, project);
    // Assert
    expect(key).toBe(project.id);
  });

  // ------------------------------------------------------------------
  // manageMembersClick re-emit (issue #33)
  // ------------------------------------------------------------------
  it('re-emits manageMembersClick from a child card', () => {
    const projects = makeProjects(2);
    fixture.componentRef.setInput('projects', projects);
    fixture.detectChanges();

    let emitted: ProjectSummary | undefined;
    fixture.componentInstance.manageMembersClick.subscribe(p => (emitted = p));

    const cards = fixture.debugElement.queryAll(By.directive(ProjectCardComponent));
    (cards[1].componentInstance as ProjectCardComponent).manageMembersClick.emit(projects[1]);
    expect(emitted).toEqual(projects[1]);
  });
});
