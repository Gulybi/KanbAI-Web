import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FeaturesSectionComponent } from './features-section.component';
import { FeatureHighlight } from '../../models/feature-highlight.interface';
import { By } from '@angular/platform-browser';

describe('FeaturesSectionComponent', () => {
  let component: FeaturesSectionComponent;
  let fixture: ComponentFixture<FeaturesSectionComponent>;

  const mockFeatures: FeatureHighlight[] = [
    {
      id: 'feature-1',
      title: 'Feature One',
      description: 'Description for feature one',
      icon: 'board'
    },
    {
      id: 'feature-2',
      title: 'Feature Two',
      description: 'Description for feature two',
      icon: 'ai'
    },
    {
      id: 'feature-3',
      title: 'Feature Three',
      description: 'Description for feature three',
      icon: 'team'
    }
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeaturesSectionComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(FeaturesSectionComponent);
    component = fixture.componentInstance;
    component.features = mockFeatures;
    fixture.detectChanges();
  });

  describe('Component Creation', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });
  });

  describe('Feature Cards Rendering', () => {
    it('should render correct number of feature cards', () => {
      const featureCards = fixture.debugElement.queryAll(By.css('app-feature-card'));
      expect(featureCards.length).toBe(3);
    });

    it('should pass feature data to each card', () => {
      const featureCards = fixture.debugElement.queryAll(By.css('app-feature-card'));

      expect(featureCards[0].componentInstance.feature).toEqual(mockFeatures[0]);
      expect(featureCards[1].componentInstance.feature).toEqual(mockFeatures[1]);
      expect(featureCards[2].componentInstance.feature).toEqual(mockFeatures[2]);
    });

    it('should render section header', () => {
      const heading = fixture.debugElement.query(By.css('h2'));
      expect(heading).toBeTruthy();
      expect(heading.nativeElement.textContent).toContain('Why Choose KanbAI?');
    });

    it('should render section description', () => {
      const description = fixture.debugElement.query(By.css('p'));
      expect(description).toBeTruthy();
      expect(description.nativeElement.textContent).toContain('Powerful features');
    });
  });

  describe('trackByFeatureId() Method', () => {
    it('should return feature id', () => {
      const result = component.trackByFeatureId(0, mockFeatures[0]);
      expect(result).toBe('feature-1');
    });

    it('should return correct id for different features', () => {
      expect(component.trackByFeatureId(0, mockFeatures[0])).toBe('feature-1');
      expect(component.trackByFeatureId(1, mockFeatures[1])).toBe('feature-2');
      expect(component.trackByFeatureId(2, mockFeatures[2])).toBe('feature-3');
    });

    it('should ignore index parameter and use feature id', () => {
      expect(component.trackByFeatureId(999, mockFeatures[0])).toBe('feature-1');
    });
  });

  describe('Empty State', () => {
    it('should handle empty features array', () => {
      fixture.componentRef.setInput('features', []);
      fixture.detectChanges();

      const featureCards = fixture.debugElement.queryAll(By.css('app-feature-card'));
      expect(featureCards.length).toBe(0);
    });

    it('should still render section header with empty features', () => {
      fixture.componentRef.setInput('features', []);
      fixture.detectChanges();

      const heading = fixture.debugElement.query(By.css('h2'));
      expect(heading).toBeTruthy();
    });
  });

  describe('Dynamic Updates', () => {
    it('should update when features input changes', () => {
      const newFeatures: FeatureHighlight[] = [
        {
          id: 'new-feature',
          title: 'New Feature',
          description: 'New description',
          icon: 'automation'
        }
      ];

      fixture.componentRef.setInput('features', newFeatures);
      fixture.detectChanges();

      const featureCards = fixture.debugElement.queryAll(By.css('app-feature-card'));
      expect(featureCards.length).toBe(1);
      expect(featureCards[0].componentInstance.feature).toEqual(newFeatures[0]);
    });

    it('should handle adding features', () => {
      const initialLength = mockFeatures.length;

      const expandedFeatures = [
        ...mockFeatures,
        {
          id: 'feature-4',
          title: 'Feature Four',
          description: 'Description four',
          icon: 'automation'
        }
      ];
      fixture.componentRef.setInput('features', expandedFeatures);
      fixture.detectChanges();

      const featureCards = fixture.debugElement.queryAll(By.css('app-feature-card'));
      expect(featureCards.length).toBe(initialLength + 1);
    });
  });

  describe('Grid Layout', () => {
    it('should use grid layout class', () => {
      const gridContainer = fixture.debugElement.query(By.css('.grid'));
      expect(gridContainer).toBeTruthy();
    });

    it('should have responsive grid classes', () => {
      const gridContainer = fixture.debugElement.query(By.css('.grid'));
      const classes = gridContainer.nativeElement.className;

      expect(classes).toContain('grid-cols-1');
      expect(classes).toContain('sm:grid-cols-2');
      expect(classes).toContain('lg:grid-cols-4');
    });
  });

  describe('Accessibility', () => {
    it('should use semantic section tag', () => {
      const section = fixture.debugElement.query(By.css('section'));
      expect(section).toBeTruthy();
    });

    it('should have proper heading hierarchy', () => {
      const h2 = fixture.debugElement.query(By.css('h2'));
      expect(h2).toBeTruthy();
      // h3 tags should be in feature cards
    });
  });

  describe('Edge Cases', () => {
    it('should handle single feature', () => {
      fixture.componentRef.setInput('features', [mockFeatures[0]]);
      fixture.detectChanges();

      const featureCards = fixture.debugElement.queryAll(By.css('app-feature-card'));
      expect(featureCards.length).toBe(1);
    });

    it('should handle maximum number of features', () => {
      const manyFeatures: FeatureHighlight[] = Array.from({ length: 10 }, (_, i) => ({
        id: `feature-${i}`,
        title: `Feature ${i}`,
        description: `Description ${i}`,
        icon: 'board'
      }));

      fixture.componentRef.setInput('features', manyFeatures);
      fixture.detectChanges();

      const featureCards = fixture.debugElement.queryAll(By.css('app-feature-card'));
      expect(featureCards.length).toBe(10);
    });
  });
});
