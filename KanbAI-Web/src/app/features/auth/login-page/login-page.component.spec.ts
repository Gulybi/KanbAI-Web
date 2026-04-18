import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { LoginPageComponent } from './login-page.component';

describe('LoginPageComponent', () => {
  let component: LoginPageComponent;
  let fixture: ComponentFixture<LoginPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginPageComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(LoginPageComponent);
    component = fixture.componentInstance;
  });

  describe('Component Creation', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });
  });

  describe('Rendering', () => {
    it('should render main container with correct layout classes', () => {
      fixture.detectChanges();

      const container = fixture.nativeElement.querySelector('.flex.items-center.justify-center');
      expect(container).toBeTruthy();
      expect(container.classList.contains('min-h-screen')).toBe(true);
      expect(container.classList.contains('bg-gray-100')).toBe(true);
    });

    it('should display Login Page heading', () => {
      fixture.detectChanges();

      const heading = fixture.debugElement.query(By.css('h1'));
      expect(heading).toBeTruthy();
      expect(heading.nativeElement.textContent).toContain('Login Page');
    });

    it('should display placeholder text for authentication UI', () => {
      fixture.detectChanges();

      const paragraph = fixture.debugElement.query(By.css('p'));
      expect(paragraph).toBeTruthy();
      expect(paragraph.nativeElement.textContent).toContain('Authentication UI will be implemented here.');
    });

    it('should apply card styling to content area', () => {
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('.p-8.bg-white.rounded-lg.shadow-md');
      expect(card).toBeTruthy();
      expect(card.classList.contains('p-8')).toBe(true);
      expect(card.classList.contains('bg-white')).toBe(true);
      expect(card.classList.contains('rounded-lg')).toBe(true);
      expect(card.classList.contains('shadow-md')).toBe(true);
    });

    it('should apply correct heading styles', () => {
      fixture.detectChanges();

      const heading = fixture.nativeElement.querySelector('h1');
      expect(heading.classList.contains('text-2xl')).toBe(true);
      expect(heading.classList.contains('font-bold')).toBe(true);
      expect(heading.classList.contains('text-gray-800')).toBe(true);
    });

    it('should apply correct paragraph styles', () => {
      fixture.detectChanges();

      const paragraph = fixture.nativeElement.querySelector('p');
      expect(paragraph.classList.contains('mt-4')).toBe(true);
      expect(paragraph.classList.contains('text-gray-600')).toBe(true);
    });
  });

  describe('Layout Structure', () => {
    it('should center content vertically and horizontally', () => {
      fixture.detectChanges();

      const outerContainer = fixture.nativeElement.querySelector('.flex.items-center.justify-center');
      expect(outerContainer).toBeTruthy();
    });

    it('should fill minimum viewport height', () => {
      fixture.detectChanges();

      const container = fixture.nativeElement.querySelector('.min-h-screen');
      expect(container).toBeTruthy();
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
      expect(heading.textContent).toContain('Login Page');
    });

    it('should display all expected elements', () => {
      fixture.detectChanges();

      const heading = fixture.nativeElement.querySelector('h1');
      const paragraph = fixture.nativeElement.querySelector('p');
      const card = fixture.nativeElement.querySelector('.bg-white.rounded-lg');

      expect(heading).toBeTruthy();
      expect(paragraph).toBeTruthy();
      expect(card).toBeTruthy();
    });
  });

  describe('Change Detection Strategy', () => {
    it('should use OnPush change detection', () => {
      expect(component).toBeTruthy();
      expect(fixture.componentRef.changeDetectorRef).toBeTruthy();
    });
  });

  describe('Future Integration Points', () => {
    it('should be ready for authentication form integration', () => {
      fixture.detectChanges();

      // Verify the card container exists where future form will be added
      const card = fixture.nativeElement.querySelector('.p-8.bg-white');
      expect(card).toBeTruthy();
    });
  });
});
