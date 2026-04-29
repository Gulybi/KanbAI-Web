import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
import { DashboardEmptyStateComponent } from './dashboard-empty-state.component';

describe('DashboardEmptyStateComponent', () => {
  let component: DashboardEmptyStateComponent;
  let fixture: ComponentFixture<DashboardEmptyStateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DashboardEmptyStateComponent] }).compileComponents();
    fixture = TestBed.createComponent(DashboardEmptyStateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('renders an h2 with "No projects yet"', () => {
    const h2 = fixture.debugElement.query(By.css('h2'));
    expect(h2.nativeElement.textContent.trim()).toBe('No projects yet');
  });

  it('renders a native button for the CTA', () => {
    const btn = fixture.debugElement.query(By.css('button.empty-state__cta'));
    expect(btn).toBeTruthy();
    expect((btn.nativeElement as HTMLButtonElement).type).toBe('button');
  });

  it('emits createClick when the CTA is clicked', () => {
    const handler = vi.fn();
    component.createClick.subscribe(handler);

    const btn = fixture.debugElement.query(By.css('button.empty-state__cta'));
    btn.nativeElement.click();

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
