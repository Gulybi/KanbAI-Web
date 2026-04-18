import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  describe('Component Creation', () => {
    it('should create the app', () => {
      const fixture = TestBed.createComponent(App);
      const app = fixture.componentInstance;
      expect(app).toBeTruthy();
    });
  });

  describe('Shell Layout', () => {
    it('should render navbar with application title', async () => {
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('app-navbar h1')?.textContent).toContain('KanbAI');
    });

    it('should apply shell layout flex structure', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();

      const container = fixture.debugElement.query(By.css('.flex.flex-col.h-screen'));
      expect(container).toBeTruthy();
    });

    it('should render navbar component', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();

      const navbar = fixture.debugElement.query(By.css('app-navbar'));
      expect(navbar).toBeTruthy();
    });

    it('should render sidebar component', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();

      const sidebar = fixture.debugElement.query(By.css('app-sidebar'));
      expect(sidebar).toBeTruthy();
    });

    it('should apply main content area styling', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();

      const mainContent = fixture.debugElement.query(By.css('main'));
      expect(mainContent).toBeTruthy();
      expect(mainContent.nativeElement.classList.contains('flex-1')).toBe(true);
      expect(mainContent.nativeElement.classList.contains('overflow-y-auto')).toBe(true);
    });

    it('should include router-outlet for navigation', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();

      const routerOutlet = fixture.debugElement.query(By.css('router-outlet'));
      expect(routerOutlet).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('should handle component initialization without errors', () => {
      expect(() => {
        const fixture = TestBed.createComponent(App);
        fixture.detectChanges();
      }).not.toThrow();
    });
  });
});
