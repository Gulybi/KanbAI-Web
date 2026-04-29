import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
import { LoginContextBannerComponent } from './context-banner.component';

describe('LoginContextBannerComponent', () => {
  let component: LoginContextBannerComponent;
  let fixture: ComponentFixture<LoginContextBannerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginContextBannerComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(LoginContextBannerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('returnUrl', '/board');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the returnUrl in the meta line', () => {
    const urlNode = fixture.debugElement.query(By.css('.context-banner__return-url'));
    expect(urlNode).toBeTruthy();
    expect(urlNode.nativeElement.textContent).toContain('/board');
  });

  it('renders a role="status" container for polite screen-reader announcement', () => {
    const banner = fixture.nativeElement.querySelector('.context-banner');
    expect(banner).toBeTruthy();
    expect(banner.getAttribute('role')).toBe('status');
  });

  it('emits cancel when the Cancel button is clicked', () => {
    const spy = vi.fn();
    component.cancel.subscribe(spy);

    const cancelBtn = fixture.debugElement.query(By.css('.context-banner__cancel'));
    cancelBtn.nativeElement.click();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('renders returnUrl as text (never as HTML)', () => {
    fixture.componentRef.setInput('returnUrl', '<img src=x onerror=alert(1)>');
    fixture.detectChanges();

    const urlNode = fixture.debugElement.query(By.css('.context-banner__return-url'));
    // Angular's default interpolation encodes as text; no <img> element should exist.
    expect(urlNode.nativeElement.querySelector('img')).toBeNull();
    expect(urlNode.nativeElement.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
