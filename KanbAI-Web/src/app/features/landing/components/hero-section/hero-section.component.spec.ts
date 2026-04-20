import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HeroSectionComponent } from './hero-section.component';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';

describe('HeroSectionComponent', () => {
  let component: HeroSectionComponent;
  let fixture: ComponentFixture<HeroSectionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeroSectionComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(HeroSectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('Component Creation', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });
  });

  describe('Content Rendering', () => {
    it('should display KanbAI brand name', () => {
      const brandElement = fixture.debugElement.query(By.css('.hero-title'));
      expect(brandElement).toBeTruthy();
      expect(brandElement.nativeElement.textContent.trim()).toBe('KanbAI');
    });

    it('should display main headline', () => {
      const headlines = fixture.debugElement.queryAll(By.css('h2'));
      const mainHeadline = headlines.find(h =>
        h.nativeElement.textContent.includes('AI-Powered Kanban Boards')
      );
      expect(mainHeadline).toBeTruthy();
    });

    it('should display subheading', () => {
      const subheading = fixture.debugElement.query(By.css('p'));
      expect(subheading).toBeTruthy();
      expect(subheading.nativeElement.textContent).toContain('Streamline your workflow');
    });

    it('should display trust indicator', () => {
      const trustIndicator = fixture.debugElement.queryAll(By.css('p')).find(p =>
        p.nativeElement.textContent.includes('No credit card required')
      );
      expect(trustIndicator).toBeTruthy();
    });
  });

  describe('CTA Buttons', () => {
    it('should render "Get Started Free" button', () => {
      const buttons = fixture.debugElement.queryAll(By.css('button'));
      const getStartedBtn = buttons.find(b =>
        b.nativeElement.textContent.includes('Get Started Free')
      );
      expect(getStartedBtn).toBeTruthy();
    });

    it('should render "Login" button', () => {
      const buttons = fixture.debugElement.queryAll(By.css('button'));
      const loginBtn = buttons.find(b =>
        b.nativeElement.textContent.trim() === 'Login'
      );
      expect(loginBtn).toBeTruthy();
    });

    it('should have correct ARIA labels on buttons', () => {
      const buttons = fixture.debugElement.queryAll(By.css('button'));

      const getStartedBtn = buttons.find(b =>
        b.nativeElement.textContent.includes('Get Started')
      );
      const loginBtn = buttons.find(b =>
        b.nativeElement.textContent.trim() === 'Login'
      );

      expect(getStartedBtn?.nativeElement.getAttribute('aria-label')).toBe('Get started with KanbAI');
      expect(loginBtn?.nativeElement.getAttribute('aria-label')).toBe('Login to your account');
    });
  });

  describe('Output Events', () => {
    it('should emit signUpClick when "Get Started" button is clicked', () => {
      vi.spyOn(component.signUpClick, 'emit');

      const buttons = fixture.debugElement.queryAll(By.css('button'));
      const getStartedBtn = buttons.find(b =>
        b.nativeElement.textContent.includes('Get Started')
      );

      getStartedBtn?.nativeElement.click();

      expect(component.signUpClick.emit).toHaveBeenCalledWith();
      expect(component.signUpClick.emit).toHaveBeenCalledTimes(1);
    });

    it('should emit loginClick when "Login" button is clicked', () => {
      vi.spyOn(component.loginClick, 'emit');

      const buttons = fixture.debugElement.queryAll(By.css('button'));
      const loginBtn = buttons.find(b =>
        b.nativeElement.textContent.trim() === 'Login'
      );

      loginBtn?.nativeElement.click();

      expect(component.loginClick.emit).toHaveBeenCalledWith();
      expect(component.loginClick.emit).toHaveBeenCalledTimes(1);
    });

    it('should emit independent events for each button', () => {
      vi.spyOn(component.signUpClick, 'emit');
      vi.spyOn(component.loginClick, 'emit');

      const buttons = fixture.debugElement.queryAll(By.css('button'));
      const getStartedBtn = buttons.find(b => b.nativeElement.textContent.includes('Get Started'));
      const loginBtn = buttons.find(b => b.nativeElement.textContent.trim() === 'Login');

      getStartedBtn?.nativeElement.click();
      expect(component.signUpClick.emit).toHaveBeenCalledTimes(1);
      expect(component.loginClick.emit).not.toHaveBeenCalled();

      loginBtn?.nativeElement.click();
      expect(component.loginClick.emit).toHaveBeenCalledTimes(1);
    });
  });

  describe('Button Styling', () => {
    it('should have primary button with blue background', () => {
      const buttons = fixture.debugElement.queryAll(By.css('button'));
      const primaryBtn = buttons.find(b =>
        b.nativeElement.textContent.includes('Get Started')
      );

      const classes = primaryBtn?.nativeElement.className;
      expect(classes).toContain('bg-blue-600');
    });

    it('should have secondary button with white background and border', () => {
      const buttons = fixture.debugElement.queryAll(By.css('button'));
      const secondaryBtn = buttons.find(b =>
        b.nativeElement.textContent.trim() === 'Login'
      );

      const classes = secondaryBtn?.nativeElement.className;
      expect(classes).toContain('bg-white');
      expect(classes).toContain('border-blue-600');
    });

    it('should have focus ring classes on buttons', () => {
      const buttons = fixture.debugElement.queryAll(By.css('button'));

      buttons.forEach(btn => {
        const classes = btn.nativeElement.className;
        expect(classes).toContain('focus:ring-4');
      });
    });
  });

  describe('Responsive Layout', () => {
    it('should have responsive container classes', () => {
      const container = fixture.debugElement.query(By.css('.container'));
      expect(container).toBeTruthy();

      const classes = container.nativeElement.className;
      expect(classes).toContain('mx-auto');
    });

    it('should have responsive button layout', () => {
      const buttonContainer = fixture.debugElement.query(By.css('.flex'));
      expect(buttonContainer).toBeTruthy();

      const classes = buttonContainer.nativeElement.className;
      expect(classes).toContain('flex-col');
      expect(classes).toContain('sm:flex-row');
    });
  });

  describe('Accessibility', () => {
    it('should use semantic section tag', () => {
      const section = fixture.debugElement.query(By.css('section'));
      expect(section).toBeTruthy();
    });

    it('should have proper heading hierarchy', () => {
      const h1 = fixture.debugElement.query(By.css('h1'));
      const h2 = fixture.debugElement.query(By.css('h2'));

      expect(h1).toBeTruthy();
      expect(h2).toBeTruthy();
    });

    it('should use button elements for interactive controls', () => {
      const buttons = fixture.debugElement.queryAll(By.css('button'));
      expect(buttons.length).toBeGreaterThanOrEqual(2);

      buttons.forEach(btn => {
        expect(btn.nativeElement.tagName.toLowerCase()).toBe('button');
      });
    });

    it('should have keyboard accessible buttons', () => {
      const buttons = fixture.debugElement.queryAll(By.css('button'));

      buttons.forEach(btn => {
        expect(btn.nativeElement.disabled).toBe(false);
        expect(btn.nativeElement.tabIndex).not.toBe(-1);
      });
    });
  });

  describe('Gradient Background', () => {
    it('should have hero gradient class on section', () => {
      const section = fixture.debugElement.query(By.css('section'));
      expect(section.nativeElement.classList.contains('hero-gradient')).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid button clicks', () => {
      vi.spyOn(component.loginClick, 'emit');

      const buttons = fixture.debugElement.queryAll(By.css('button'));
      const loginBtn = buttons.find(b => b.nativeElement.textContent.trim() === 'Login');

      loginBtn?.nativeElement.click();
      loginBtn?.nativeElement.click();
      loginBtn?.nativeElement.click();

      expect(component.loginClick.emit).toHaveBeenCalledTimes(3);
    });

    it('should handle events from both buttons in quick succession', () => {
      vi.spyOn(component.loginClick, 'emit');
      vi.spyOn(component.signUpClick, 'emit');

      const buttons = fixture.debugElement.queryAll(By.css('button'));
      const getStartedBtn = buttons.find(b => b.nativeElement.textContent.includes('Get Started'));
      const loginBtn = buttons.find(b => b.nativeElement.textContent.trim() === 'Login');

      getStartedBtn?.nativeElement.click();
      loginBtn?.nativeElement.click();
      getStartedBtn?.nativeElement.click();

      expect(component.signUpClick.emit).toHaveBeenCalledTimes(2);
      expect(component.loginClick.emit).toHaveBeenCalledTimes(1);
    });
  });
});
