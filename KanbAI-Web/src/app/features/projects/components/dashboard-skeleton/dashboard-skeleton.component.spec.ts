import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardSkeletonComponent } from './dashboard-skeleton.component';

describe('DashboardSkeletonComponent', () => {
  let fixture: ComponentFixture<DashboardSkeletonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DashboardSkeletonComponent] }).compileComponents();
    fixture = TestBed.createComponent(DashboardSkeletonComponent);
  });

  it('renders 6 placeholder cards by default', () => {
    fixture.detectChanges();
    const cards = fixture.nativeElement.querySelectorAll('.skeleton-card');
    expect(cards.length).toBe(6);
  });

  it('respects the count input when provided', () => {
    fixture.componentRef.setInput('count', 3);
    fixture.detectChanges();
    const cards = fixture.nativeElement.querySelectorAll('.skeleton-card');
    expect(cards.length).toBe(3);
  });

  it('hides the grid from screen readers via aria-hidden', () => {
    fixture.detectChanges();
    const grid = fixture.nativeElement.querySelector('.skeleton-grid');
    expect(grid.getAttribute('aria-hidden')).toBe('true');
    expect(grid.getAttribute('tabindex')).toBe('-1');
  });

  it('provides a polite live region announcing loading', () => {
    fixture.detectChanges();
    const status = fixture.nativeElement.querySelector('.skeleton-status');
    expect(status).toBeTruthy();
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toContain('Loading projects');
  });
});
