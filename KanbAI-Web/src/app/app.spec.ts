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

  describe('Tailwind CSS Integration', () => {
    it('should render title with Tailwind utility classes', async () => {
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('h1')?.textContent).toContain('Tailwind CSS is Working!');
    });

    it('should apply Tailwind flex layout classes to container', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();

      const container = fixture.debugElement.query(By.css('.flex'));
      expect(container).toBeTruthy();
      expect(container.nativeElement.classList.contains('items-center')).toBe(true);
      expect(container.nativeElement.classList.contains('justify-center')).toBe(true);
      expect(container.nativeElement.classList.contains('min-h-screen')).toBe(true);
      expect(container.nativeElement.classList.contains('bg-gray-100')).toBe(true);
    });

    it('should apply Tailwind card styling classes', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();

      const card = fixture.debugElement.query(By.css('.bg-white'));
      expect(card).toBeTruthy();
      expect(card.nativeElement.classList.contains('p-8')).toBe(true);
      expect(card.nativeElement.classList.contains('rounded-lg')).toBe(true);
      expect(card.nativeElement.classList.contains('shadow-md')).toBe(true);
    });

    it('should apply Tailwind typography classes to heading', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();

      const heading = fixture.debugElement.query(By.css('h1'));
      expect(heading).toBeTruthy();
      expect(heading.nativeElement.classList.contains('text-2xl')).toBe(true);
      expect(heading.nativeElement.classList.contains('font-bold')).toBe(true);
      expect(heading.nativeElement.classList.contains('text-blue-600')).toBe(true);
    });

    it('should apply Tailwind spacing and color classes to paragraph', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();

      const paragraph = fixture.debugElement.query(By.css('p'));
      expect(paragraph).toBeTruthy();
      expect(paragraph.nativeElement.classList.contains('mt-4')).toBe(true);
      expect(paragraph.nativeElement.classList.contains('text-gray-700')).toBe(true);
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
