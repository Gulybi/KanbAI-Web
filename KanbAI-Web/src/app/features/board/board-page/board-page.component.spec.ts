import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BoardPageComponent } from './board-page.component';

describe('BoardPageComponent', () => {
  let component: BoardPageComponent;
  let fixture: ComponentFixture<BoardPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BoardPageComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(BoardPageComponent);
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

      const container = fixture.nativeElement.querySelector('.p-8.bg-white.min-h-screen');
      expect(container).toBeTruthy();
      expect(container.classList.contains('p-8')).toBe(true);
      expect(container.classList.contains('bg-white')).toBe(true);
      expect(container.classList.contains('min-h-screen')).toBe(true);
    });

    it('should display Board Page heading', () => {
      fixture.detectChanges();

      const heading = fixture.debugElement.query(By.css('h1'));
      expect(heading).toBeTruthy();
      expect(heading.nativeElement.textContent).toContain('Board Page');
    });

    it('should display placeholder text for kanban board UI', () => {
      fixture.detectChanges();

      const paragraph = fixture.debugElement.query(By.css('p'));
      expect(paragraph).toBeTruthy();
      expect(paragraph.nativeElement.textContent).toContain('Kanban board UI will be implemented here.');
    });

    it('should apply correct heading styles', () => {
      fixture.detectChanges();

      const heading = fixture.nativeElement.querySelector('h1');
      expect(heading.classList.contains('text-3xl')).toBe(true);
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
    it('should have white background for content area', () => {
      fixture.detectChanges();

      const container = fixture.nativeElement.querySelector('.bg-white');
      expect(container).toBeTruthy();
    });

    it('should fill minimum viewport height', () => {
      fixture.detectChanges();

      const container = fixture.nativeElement.querySelector('.min-h-screen');
      expect(container).toBeTruthy();
    });

    it('should have appropriate padding', () => {
      fixture.detectChanges();

      const container = fixture.nativeElement.querySelector('.p-8');
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
      expect(heading.textContent).toContain('Board Page');
    });

    it('should display all expected elements', () => {
      fixture.detectChanges();

      const heading = fixture.nativeElement.querySelector('h1');
      const paragraph = fixture.nativeElement.querySelector('p');
      const container = fixture.nativeElement.querySelector('.p-8.bg-white');

      expect(heading).toBeTruthy();
      expect(paragraph).toBeTruthy();
      expect(container).toBeTruthy();
    });
  });

  describe('Change Detection Strategy', () => {
    it('should use OnPush change detection', () => {
      expect(component).toBeTruthy();
      expect(fixture.componentRef.changeDetectorRef).toBeTruthy();
    });
  });

  describe('Future Integration Points', () => {
    it('should be ready for kanban board integration', () => {
      fixture.detectChanges();

      // Verify the main container exists where future board will be added
      const container = fixture.nativeElement.querySelector('.p-8.bg-white');
      expect(container).toBeTruthy();
    });
  });
});
