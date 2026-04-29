import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { DashboardHeaderComponent } from './dashboard-header.component';

describe('DashboardHeaderComponent', () => {
  let component: DashboardHeaderComponent;
  let fixture: ComponentFixture<DashboardHeaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardHeaderComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardHeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('renders the Projects h1', () => {
    const h1 = fixture.debugElement.query(By.css('h1'));
    expect(h1).toBeTruthy();
    expect(h1.nativeElement.textContent.trim()).toBe('Projects');
  });

  it('renders a subtitle paragraph', () => {
    const p = fixture.debugElement.query(By.css('p'));
    expect(p).toBeTruthy();
    expect(p.nativeElement.textContent.length).toBeGreaterThan(0);
  });

  it('renders a "New Project" button with an accessible name', () => {
    const button: HTMLButtonElement | null = fixture.nativeElement.querySelector(
      'button.dashboard-header__new-project-btn'
    );
    expect(button).toBeTruthy();
    expect(button?.textContent?.trim()).toContain('New Project');
    expect(button?.getAttribute('type')).toBe('button');
  });

  it('emits createClick when the New Project button is clicked', () => {
    const spy = vi.fn();
    component.createClick.subscribe(spy);

    const button: HTMLButtonElement = fixture.nativeElement.querySelector(
      'button.dashboard-header__new-project-btn'
    );
    button.click();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
