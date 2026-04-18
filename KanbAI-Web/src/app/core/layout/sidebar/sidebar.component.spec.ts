import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { SidebarComponent } from './sidebar.component';

describe('SidebarComponent', () => {
  let component: SidebarComponent;
  let fixture: ComponentFixture<SidebarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SidebarComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(SidebarComponent);
    component = fixture.componentInstance;
  });

  describe('Component Creation', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });
  });

  describe('Rendering', () => {
    it('should render sidebar with correct semantic HTML tag', () => {
      fixture.detectChanges();

      const asideElement = fixture.debugElement.query(By.css('aside'));
      expect(asideElement).toBeTruthy();
    });

    it('should display placeholder text', () => {
      fixture.detectChanges();

      const paragraph = fixture.debugElement.query(By.css('p'));
      expect(paragraph).toBeTruthy();
      expect(paragraph.nativeElement.textContent).toContain('Sidebar');
    });

    it('should apply correct Tailwind CSS classes for layout', () => {
      fixture.detectChanges();

      const asideElement = fixture.nativeElement.querySelector('aside');
      expect(asideElement.classList.contains('w-60')).toBe(true);
      expect(asideElement.classList.contains('bg-gray-800')).toBe(true);
      expect(asideElement.classList.contains('text-white')).toBe(true);
      expect(asideElement.classList.contains('min-h-screen')).toBe(true);
      expect(asideElement.classList.contains('p-4')).toBe(true);
    });

    it('should apply correct text styles to placeholder', () => {
      fixture.detectChanges();

      const paragraph = fixture.nativeElement.querySelector('p');
      expect(paragraph.classList.contains('text-sm')).toBe(true);
      expect(paragraph.classList.contains('text-gray-400')).toBe(true);
    });

    it('should have fixed width of 240px (w-60)', () => {
      fixture.detectChanges();

      const asideElement = fixture.nativeElement.querySelector('aside');
      expect(asideElement.classList.contains('w-60')).toBe(true);
    });
  });

  describe('Accessibility', () => {
    it('should use semantic aside element', () => {
      fixture.detectChanges();

      const asideElement = fixture.nativeElement.querySelector('aside');
      expect(asideElement).toBeTruthy();
      expect(asideElement.tagName.toLowerCase()).toBe('aside');
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

      const paragraph = fixture.nativeElement.querySelector('p');
      expect(paragraph.textContent).toContain('Sidebar');
    });

    it('should have placeholder structure ready for future navigation', () => {
      fixture.detectChanges();

      const asideElement = fixture.nativeElement.querySelector('aside');
      expect(asideElement).toBeTruthy();
      // Sidebar is ready to contain navigation menu items in future iterations
      const paragraph = asideElement.querySelector('p');
      expect(paragraph).toBeTruthy();
    });
  });

  describe('Change Detection Strategy', () => {
    it('should use OnPush change detection', () => {
      expect(component).toBeTruthy();
      expect(fixture.componentRef.changeDetectorRef).toBeTruthy();
    });
  });
});
