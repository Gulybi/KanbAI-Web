import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FeatureCardComponent } from './feature-card.component';
import { FeatureHighlight } from '../../models/feature-highlight.interface';
import { By } from '@angular/platform-browser';

describe('FeatureCardComponent', () => {
  let component: FeatureCardComponent;
  let fixture: ComponentFixture<FeatureCardComponent>;

  const mockFeature: FeatureHighlight = {
    id: 'test-feature',
    title: 'Test Feature',
    description: 'This is a test feature description with some detail.',
    icon: 'board'
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeatureCardComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(FeatureCardComponent);
    component = fixture.componentInstance;
    component.feature = mockFeature;
    fixture.detectChanges();
  });

  describe('Component Creation', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });
  });

  describe('Feature Rendering', () => {
    it('should display feature title', () => {
      const titleElement = fixture.debugElement.query(By.css('h3'));
      expect(titleElement).toBeTruthy();
      expect(titleElement.nativeElement.textContent.trim()).toBe('Test Feature');
    });

    it('should display feature description', () => {
      const descriptionElement = fixture.debugElement.query(By.css('p'));
      expect(descriptionElement).toBeTruthy();
      expect(descriptionElement.nativeElement.textContent.trim()).toContain('test feature description');
    });

    it('should render icon container with correct class', () => {
      const iconContainer = fixture.debugElement.query(By.css('.icon-board'));
      expect(iconContainer).toBeTruthy();
    });

    it('should display icon symbol', () => {
      const iconElement = fixture.debugElement.query(By.css('.icon-board span'));
      expect(iconElement).toBeTruthy();
      expect(iconElement.nativeElement.textContent.trim()).toBe('📊');
    });
  });

  describe('getIconSymbol() Method', () => {
    it('should return correct icon for "board"', () => {
      expect(component.getIconSymbol('board')).toBe('📊');
    });

    it('should return correct icon for "ai"', () => {
      expect(component.getIconSymbol('ai')).toBe('🤖');
    });

    it('should return correct icon for "team"', () => {
      expect(component.getIconSymbol('team')).toBe('👥');
    });

    it('should return correct icon for "automation"', () => {
      expect(component.getIconSymbol('automation')).toBe('⚡');
    });

    it('should return default icon for unknown type', () => {
      expect(component.getIconSymbol('unknown')).toBe('✨');
    });

    it('should return default icon for empty string', () => {
      expect(component.getIconSymbol('')).toBe('✨');
    });
  });

  describe('Input Property Changes', () => {
    it('should update display when feature input changes', () => {
      const newFeature: FeatureHighlight = {
        id: 'new-feature',
        title: 'New Feature',
        description: 'New description',
        icon: 'ai'
      };

      fixture.componentRef.setInput('feature', newFeature);
      fixture.detectChanges();

      const titleElement = fixture.debugElement.query(By.css('h3'));
      expect(titleElement.nativeElement.textContent.trim()).toBe('New Feature');

      const iconContainer = fixture.debugElement.query(By.css('.icon-ai'));
      expect(iconContainer).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('should handle long feature title', () => {
      const longFeature = {
        id: 'long-title',
        title: 'This is a very long feature title that should be handled gracefully by the component',
        description: 'Description',
        icon: 'board'
      };
      fixture.componentRef.setInput('feature', longFeature);
      fixture.detectChanges();

      const titleElement = fixture.debugElement.query(By.css('h3'));
      expect(titleElement.nativeElement.textContent.length).toBeGreaterThan(50);
    });

    it('should handle long feature description', () => {
      const longDescFeature = {
        id: 'long-desc',
        title: 'Title',
        description: 'This is a very long description that contains multiple sentences. It should wrap correctly and maintain readability even with extensive content. The component should handle this gracefully without any overflow or layout issues.',
        icon: 'team'
      };
      fixture.componentRef.setInput('feature', longDescFeature);
      fixture.detectChanges();

      const descElement = fixture.debugElement.query(By.css('p'));
      expect(descElement.nativeElement.textContent.length).toBeGreaterThan(100);
    });

    it('should handle special characters in description', () => {
      const specialCharsFeature = {
        id: 'special-chars',
        title: 'Special & <Characters>',
        description: 'Description with "quotes" and \'apostrophes\' & <tags>',
        icon: 'automation'
      };
      fixture.componentRef.setInput('feature', specialCharsFeature);
      fixture.detectChanges();

      const titleElement = fixture.debugElement.query(By.css('h3'));
      expect(titleElement.nativeElement.textContent).toContain('&');
    });
  });

  describe('Accessibility', () => {
    it('should use semantic HTML (article tag)', () => {
      const article = fixture.debugElement.query(By.css('article'));
      expect(article).toBeTruthy();
    });

    it('should have aria-hidden on decorative icon', () => {
      const iconSpan = fixture.debugElement.query(By.css('.icon-board span'));
      expect(iconSpan.nativeElement.getAttribute('aria-hidden')).toBe('true');
    });
  });
});
