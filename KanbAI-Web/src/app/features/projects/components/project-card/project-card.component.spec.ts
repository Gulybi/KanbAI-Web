import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
import { ProjectCardComponent } from './project-card.component';
import { ProjectSummary } from '../../models/project.model';

const base: ProjectSummary = {
  id: 'abc-123',
  name: 'Alpha',
  description: 'First project',
  role: 'Owner',
  createdAt: '2026-04-10T12:00:00Z',
  updatedAt: '2026-04-10T12:00:00Z'
};

async function mount(project: ProjectSummary): Promise<ComponentFixture<ProjectCardComponent>> {
  await TestBed.configureTestingModule({ imports: [ProjectCardComponent] }).compileComponents();
  const fixture = TestBed.createComponent(ProjectCardComponent);
  fixture.componentRef.setInput('project', project);
  fixture.detectChanges();
  return fixture;
}

describe('ProjectCardComponent', () => {
  it('renders the project name, description, and date', async () => {
    const fixture = await mount(base);
    const title = fixture.debugElement.query(By.css('.project-card__title'));
    expect(title.nativeElement.textContent.trim()).toBe('Alpha');

    const description = fixture.debugElement.query(By.css('.project-card__description'));
    expect(description.nativeElement.textContent.trim()).toBe('First project');

    const date = fixture.debugElement.query(By.css('.project-card__meta-date'));
    expect(date.nativeElement.textContent.trim().length).toBeGreaterThan(0);
    expect(date.nativeElement.textContent).not.toContain('—');
  });

  it('renders "No description" when description is null', async () => {
    const fixture = await mount({ ...base, description: null });
    const description = fixture.debugElement.query(By.css('.project-card__description--empty'));
    expect(description).toBeTruthy();
    expect(description.nativeElement.textContent.trim()).toBe('No description');
  });

  it('renders "No description" when description is an empty string', async () => {
    const fixture = await mount({ ...base, description: '' });
    const description = fixture.debugElement.query(By.css('.project-card__description--empty'));
    expect(description).toBeTruthy();
  });

  it('renders "—" when createdAt is unparseable', async () => {
    const fixture = await mount({ ...base, createdAt: 'not-a-date' });
    const empty = fixture.debugElement.query(By.css('.project-card__meta-date--empty'));
    expect(empty).toBeTruthy();
    expect(empty.nativeElement.textContent.trim()).toBe('—');
  });

  it('exposes a title attribute mirroring the name for truncated content', async () => {
    const longName = 'A'.repeat(180);
    const fixture = await mount({ ...base, name: longName });
    const title = fixture.debugElement.query(By.css('.project-card__title'));
    expect(title.nativeElement.getAttribute('title')).toBe(longName);
  });

  it('exposes a title attribute mirroring the description', async () => {
    const longDesc = 'B'.repeat(450);
    const fixture = await mount({ ...base, description: longDesc });
    const desc = fixture.debugElement.query(By.css('.project-card__description'));
    expect(desc.nativeElement.getAttribute('title')).toBe(longDesc);
  });

  it('renders the role title-cased on the badge', async () => {
    const fixture = await mount({ ...base, role: 'member' });
    const badge = fixture.debugElement.query(By.css('.project-card__badge'));
    expect(badge.nativeElement.textContent.trim()).toBe('Member');
  });

  it('applies the owner badge variant for role "owner"', async () => {
    const fixture = await mount({ ...base, role: 'Owner' });
    const badge = fixture.debugElement.query(By.css('.project-card__badge'));
    expect(badge.nativeElement.classList.contains('project-card__badge--owner')).toBe(true);
  });

  it('applies the member badge variant for role "member"', async () => {
    const fixture = await mount({ ...base, role: 'Member' });
    const badge = fixture.debugElement.query(By.css('.project-card__badge'));
    expect(badge.nativeElement.classList.contains('project-card__badge--member')).toBe(true);
  });

  it('applies the default badge variant for unknown roles', async () => {
    const fixture = await mount({ ...base, role: 'Guest' });
    const badge = fixture.debugElement.query(By.css('.project-card__badge'));
    expect(badge.nativeElement.classList.contains('project-card__badge--default')).toBe(true);
  });

  it('uses <article tabindex="0"> for keyboard reachability', async () => {
    const fixture = await mount(base);
    const article = fixture.nativeElement.querySelector('article');
    expect(article).toBeTruthy();
    expect(article.getAttribute('tabindex')).toBe('0');
  });

  it('links the article to the title via aria-labelledby', async () => {
    const fixture = await mount(base);
    const article = fixture.nativeElement.querySelector('article');
    const title = fixture.nativeElement.querySelector('.project-card__title');
    expect(article.getAttribute('aria-labelledby')).toBe(title.getAttribute('id'));
  });

  // QA gap-filler (issue #30): AC "Heading hierarchy is semantic: one
  // <h1> for the page title; card titles use <h2> or <h3>; no heading
  // levels are skipped." The page <h1> lives in DashboardHeaderComponent;
  // card titles must be <h2> (not <h3>/<h4>/<div>) to keep the hierarchy
  // flat and screen-reader-friendly.
  it('uses a real <h2> element for the card title (semantic heading hierarchy)', async () => {
    const fixture = await mount(base);
    const heading = fixture.nativeElement.querySelector('.project-card__title');
    expect(heading.tagName).toBe('H2');
  });

  it('renders the createdAt value via DatePipe (never the raw ISO string) on the happy path', async () => {
    // Arrange: a valid ISO value — DatePipe mediumDate format strips
    // the "T00:00:00Z" suffix, proving the date is formatted (not raw).
    const fixture = await mount(base);
    const date = fixture.debugElement.query(By.css('.project-card__meta-date'));
    const text = date.nativeElement.textContent.trim();

    // Assert: no raw ISO fragments leak into the UI.
    expect(text).not.toContain('T00:00:00');
    expect(text).not.toContain('Z');
    // The mediumDate pipe always outputs the 4-digit year somewhere in the string.
    expect(text).toMatch(/2026/);
  });

  // ------------------------------------------------------------------
  // Manage-members icon-button (issue #33)
  // ------------------------------------------------------------------
  it('renders the Manage-members icon-button when role is Owner', async () => {
    const fixture = await mount({ ...base, role: 'Owner' });
    const btn = fixture.nativeElement.querySelector('.project-card__manage-btn');
    expect(btn).toBeTruthy();
  });

  it('does NOT render the Manage-members icon-button when role is Member', async () => {
    const fixture = await mount({ ...base, role: 'Member' });
    const btn = fixture.nativeElement.querySelector('.project-card__manage-btn');
    expect(btn).toBeNull();
  });

  it('is tolerant of non-canonical role casing ("owner")', async () => {
    const fixture = await mount({ ...base, role: 'owner' });
    const btn = fixture.nativeElement.querySelector('.project-card__manage-btn');
    expect(btn).toBeTruthy();
  });

  it('includes the project name in the aria-label of the Manage button', async () => {
    const fixture = await mount({ ...base, role: 'Owner', name: 'Q2 Launch Plan' });
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.project-card__manage-btn');
    expect(btn.getAttribute('aria-label')).toBe('Manage members for Q2 Launch Plan');
  });

  it('emits manageMembersClick with the project when the button is clicked', async () => {
    const fixture = await mount({ ...base, role: 'Owner' });
    let emitted: ProjectSummary | undefined;
    fixture.componentInstance.manageMembersClick.subscribe(p => (emitted = p));

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.project-card__manage-btn');
    btn.click();
    expect(emitted).toBeTruthy();
    expect(emitted!.id).toBe(base.id);
  });

  it('stops click propagation so the card does not also receive the click', async () => {
    const fixture = await mount({ ...base, role: 'Owner' });
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.project-card__manage-btn');

    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    const stopPropagation = vi.spyOn(ev, 'stopPropagation');
    btn.dispatchEvent(ev);
    expect(stopPropagation).toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // openBoard activation (issue #66)
  // ------------------------------------------------------------------

  afterEach(() => window.getSelection()?.removeAllRanges());

  it('exposes role="button" on the <article> host', async () => {
    const fixture = await mount(base);
    const article = fixture.nativeElement.querySelector('article');
    expect(article.getAttribute('role')).toBe('button');
  });

  it('emits openBoard with the project when the article is clicked', async () => {
    const fixture = await mount(base);
    let emitted: ProjectSummary | undefined;
    fixture.componentInstance.openBoard.subscribe(p => (emitted = p));

    const article: HTMLElement = fixture.nativeElement.querySelector('article');
    article.click();

    expect(emitted).toBeTruthy();
    expect(emitted!.id).toBe(base.id);
  });

  it('emits openBoard with the project when Enter is pressed on the article', async () => {
    const fixture = await mount(base);
    let emitted: ProjectSummary | undefined;
    fixture.componentInstance.openBoard.subscribe(p => (emitted = p));

    const article: HTMLElement = fixture.nativeElement.querySelector('article');
    article.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

    expect(emitted).toBeTruthy();
    expect(emitted!.id).toBe(base.id);
  });

  it('emits openBoard with the project when Space is pressed on the article, and prevents default', async () => {
    const fixture = await mount(base);
    let emitted: ProjectSummary | undefined;
    fixture.componentInstance.openBoard.subscribe(p => (emitted = p));

    const article: HTMLElement = fixture.nativeElement.querySelector('article');
    const ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    const preventDefault = vi.spyOn(ev, 'preventDefault');
    article.dispatchEvent(ev);

    expect(emitted).toBeTruthy();
    expect(emitted!.id).toBe(base.id);
    expect(preventDefault).toHaveBeenCalled();
  });

  it('does NOT emit openBoard when the Manage-members button is clicked', async () => {
    const fixture = await mount({ ...base, role: 'Owner' });
    let emitted: ProjectSummary | undefined;
    fixture.componentInstance.openBoard.subscribe(p => (emitted = p));

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.project-card__manage-btn');
    btn.click();

    expect(emitted).toBeUndefined();
  });

  it('does NOT emit openBoard when Enter is pressed while the Manage-members button is the target', async () => {
    const fixture = await mount({ ...base, role: 'Owner' });
    let emitted: ProjectSummary | undefined;
    fixture.componentInstance.openBoard.subscribe(p => (emitted = p));

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.project-card__manage-btn');
    // Dispatch from the button — target resolves inside `.project-card__manage-btn`
    // and the card host handler skips activation.
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

    expect(emitted).toBeUndefined();
  });

  it('does NOT emit openBoard when a text selection exists inside the card at click time', async () => {
    const fixture = await mount(base);
    let emitted: ProjectSummary | undefined;
    fixture.componentInstance.openBoard.subscribe(p => (emitted = p));

    const article: HTMLElement = fixture.nativeElement.querySelector('article');
    const title: HTMLElement = fixture.nativeElement.querySelector('.project-card__title');

    // Attach to the document so window.getSelection() can observe the selection.
    document.body.appendChild(article);

    const range = document.createRange();
    range.selectNodeContents(title);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    article.click();

    expect(emitted).toBeUndefined();
  });

  it('does NOT emit openBoard on right-click (button !== 0)', async () => {
    const fixture = await mount(base);
    let emitted: ProjectSummary | undefined;
    fixture.componentInstance.openBoard.subscribe(p => (emitted = p));

    const article: HTMLElement = fixture.nativeElement.querySelector('article');
    article.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 2 }));

    expect(emitted).toBeUndefined();
  });
});
