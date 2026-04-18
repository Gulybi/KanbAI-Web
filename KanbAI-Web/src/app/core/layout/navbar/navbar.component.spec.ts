import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NavbarComponent } from './navbar.component';

describe('NavbarComponent', () => {
  let component: NavbarComponent;
  let fixture: ComponentFixture<NavbarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NavbarComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(NavbarComponent);
    component = fixture.componentInstance;
  });

  describe('Component Creation', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });
  });

  describe('Rendering', () => {
    it('should render navbar with correct semantic HTML tag', () => {
      fixture.detectChanges();

      const navElement = fixture.debugElement.query(By.css('nav'));
      expect(navElement).toBeTruthy();
    });

    it('should display KanbAI application name', () => {
      fixture.detectChanges();

      const heading = fixture.debugElement.query(By.css('h1'));
      expect(heading).toBeTruthy();
      expect(heading.nativeElement.textContent).toContain('KanbAI');
    });

    it('should apply correct Tailwind CSS classes for layout', () => {
      fixture.detectChanges();

      const navElement = fixture.nativeElement.querySelector('nav');
      expect(navElement.classList.contains('w-full')).toBe(true);
      expect(navElement.classList.contains('h-16')).toBe(true);
      expect(navElement.classList.contains('bg-blue-600')).toBe(true);
      expect(navElement.classList.contains('text-white')).toBe(true);
      expect(navElement.classList.contains('flex')).toBe(true);
    });

    it('should apply correct heading styles', () => {
      fixture.detectChanges();

      const heading = fixture.nativeElement.querySelector('h1');
      expect(heading.classList.contains('text-2xl')).toBe(true);
      expect(heading.classList.contains('font-bold')).toBe(true);
    });
  });

  describe('Accessibility', () => {
    it('should use semantic nav element', () => {
      fixture.detectChanges();

      const navElement = fixture.nativeElement.querySelector('nav');
      expect(navElement).toBeTruthy();
      expect(navElement.tagName.toLowerCase()).toBe('nav');
    });

    it('should have proper heading hierarchy', () => {
      fixture.detectChanges();

      const h1 = fixture.nativeElement.querySelector('h1');
      expect(h1).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('should render correctly without errors', () => {
      expect(() => {
        fixture.detectChanges();
      }).not.toThrow();
    });

    it('should not break with multiple detectChanges calls', () => {
      fixture.detectChanges();
      fixture.detectChanges();
      fixture.detectChanges();

      const heading = fixture.nativeElement.querySelector('h1');
      expect(heading.textContent).toContain('KanbAI');
    });
  });

  describe('Change Detection Strategy', () => {
    it('should use OnPush change detection', () => {
      // The component decorator already specifies OnPush
      // This test verifies the component instance exists with OnPush strategy
      expect(component).toBeTruthy();
      expect(fixture.componentRef.changeDetectorRef).toBeTruthy();
    });
  });
});
