import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { DashboardPageComponent } from './dashboard-page.component';
import { ProjectsApiService } from '../services/projects-api.service';
import { ProjectSummary } from '../models/project.model';
import { DashboardSkeletonComponent } from '../components/dashboard-skeleton/dashboard-skeleton.component';
import { ProjectGridComponent } from '../components/project-grid/project-grid.component';
import { DashboardEmptyStateComponent } from '../components/dashboard-empty-state/dashboard-empty-state.component';
import { DashboardErrorStateComponent } from '../components/dashboard-error-state/dashboard-error-state.component';

type ListProjectsReturn = ReturnType<ProjectsApiService['listProjects']>;

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

async function mount(listProjects: () => ListProjectsReturn): Promise<ComponentFixture<DashboardPageComponent>> {
  const stub = { listProjects: vi.fn(listProjects) };

  await TestBed.configureTestingModule({
    imports: [DashboardPageComponent],
    providers: [{ provide: ProjectsApiService, useValue: stub }]
  }).compileComponents();

  const fixture = TestBed.createComponent(DashboardPageComponent);
  fixture.detectChanges();
  return fixture;
}

describe('DashboardPageComponent', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // The container logs a dev-diagnostic via console.error on the error
    // branch; we don't want that polluting the test output.
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('renders the skeleton while the subscription is pending', async () => {
    // Never-emitting subject — the VM stays in "loading" forever.
    const pending = new Subject<ProjectSummary[]>();
    const fixture = await mount(() => pending.asObservable());

    const skeleton = fixture.debugElement.query(By.directive(DashboardSkeletonComponent));
    expect(skeleton).toBeTruthy();

    const grid = fixture.debugElement.query(By.directive(ProjectGridComponent));
    expect(grid).toBeNull();
  });

  it('renders the grid on a success response with >=1 project', async () => {
    const projects = makeProjects(3);
    const fixture = await mount(() => of(projects));

    const grid = fixture.debugElement.query(By.directive(ProjectGridComponent));
    expect(grid).toBeTruthy();
    expect((grid.componentInstance as ProjectGridComponent).projects).toEqual(projects);
  });

  it('renders the empty state on a success response with 0 projects', async () => {
    const fixture = await mount(() => of([]));

    const empty = fixture.debugElement.query(By.directive(DashboardEmptyStateComponent));
    expect(empty).toBeTruthy();

    const grid = fixture.debugElement.query(By.directive(ProjectGridComponent));
    expect(grid).toBeNull();
  });

  it('renders the error state with the mapped message on HTTP failure', async () => {
    const fixture = await mount(() =>
      throwError(() => new HttpErrorResponse({ status: 500, statusText: 'Server Error' }))
    );

    const error = fixture.debugElement.query(By.directive(DashboardErrorStateComponent));
    expect(error).toBeTruthy();
    const instance = error.componentInstance as DashboardErrorStateComponent;
    expect(instance.message).toBe('Something went wrong on our end. Please try again in a moment.');
  });

  it('renders the error state when the envelope reports success: false', async () => {
    const fixture = await mount(() => throwError(() => new Error('bad envelope')));

    const error = fixture.debugElement.query(By.directive(DashboardErrorStateComponent));
    expect(error).toBeTruthy();
    const instance = error.componentInstance as DashboardErrorStateComponent;
    // Plain Error maps to the generic-load message.
    expect(instance.message).toBe("We couldn't load your projects. Please try again.");
  });

  it('re-subscribes on retry and flips back to loading', async () => {
    let call = 0;
    const fixture = await mount(() => {
      call += 1;
      if (call === 1) {
        return throwError(() => new HttpErrorResponse({ status: 500, statusText: 'x' }));
      }
      return new Subject<ProjectSummary[]>().asObservable();
    });

    const error = fixture.debugElement.query(By.directive(DashboardErrorStateComponent));
    expect(error).toBeTruthy();

    // Trigger retry.
    (error.componentInstance as DashboardErrorStateComponent).retry.emit();
    fixture.detectChanges();

    const skeleton = fixture.debugElement.query(By.directive(DashboardSkeletonComponent));
    expect(skeleton).toBeTruthy();
  });

  it('does not throw when the empty-state CTA is clicked (no-op for #30)', async () => {
    const fixture = await mount(() => of([]));
    const empty = fixture.debugElement.query(By.directive(DashboardEmptyStateComponent));

    expect(() => {
      (empty.componentInstance as DashboardEmptyStateComponent).createClick.emit();
      fixture.detectChanges();
    }).not.toThrow();
  });

  it('always renders the dashboard header regardless of VM state', async () => {
    const pending = new Subject<ProjectSummary[]>();
    const fixture = await mount(() => pending.asObservable());

    const header = fixture.nativeElement.querySelector('app-dashboard-header');
    expect(header).toBeTruthy();
  });

  // QA gap-filler (issue #30): edge case explicitly enumerated in the
  // tech-spec "Edge Cases to Test" — Component destroyed mid-fetch should
  // NOT flip the VM after destruction, thanks to takeUntilDestroyed.
  it('does not update the VM after fixture.destroy() while a subscription is in flight', async () => {
    // Arrange: a subject we control so the fetch is still pending.
    const pending = new Subject<ProjectSummary[]>();
    const fixture = await mount(() => pending.asObservable());

    // Sanity: VM is loading while pending.
    const instance = fixture.componentInstance as unknown as { vm: () => { status: string } };
    expect(instance.vm().status).toBe('loading');

    // Act: destroy the component, then attempt to emit.
    fixture.destroy();
    pending.next([
      {
        id: 'late-1',
        name: 'Late project',
        description: null,
        role: 'Owner',
        createdAt: '2026-04-10T00:00:00Z',
        updatedAt: '2026-04-10T00:00:00Z'
      }
    ]);
    pending.complete();

    // Assert: VM was NOT transitioned to success after destruction.
    // (takeUntilDestroyed unsubscribed before the emission arrived.)
    expect(instance.vm().status).toBe('loading');
  });
});
