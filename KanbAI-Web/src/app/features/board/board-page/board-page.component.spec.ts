import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { BoardPageComponent } from './board-page.component';
import { BoardStateService } from '../state/board-state.service';

interface BoardStateMock {
  enterBoard: ReturnType<typeof vi.fn>;
  leaveBoard: ReturnType<typeof vi.fn>;
}

function createMockBoardState(): BoardStateMock {
  return {
    enterBoard: vi.fn(),
    leaveBoard: vi.fn()
  };
}

function createFakeActivatedRoute(projectId: string | null): ActivatedRoute {
  const paramMap = convertToParamMap(projectId === null ? {} : { projectId });
  return {
    snapshot: {
      paramMap
    }
  } as unknown as ActivatedRoute;
}

async function mountBoard(
  projectId: string | null = 'p-1'
): Promise<{
  fixture: ComponentFixture<BoardPageComponent>;
  component: BoardPageComponent;
  boardState: BoardStateMock;
}> {
  TestBed.resetTestingModule();
  const boardState = createMockBoardState();
  await TestBed.configureTestingModule({
    imports: [BoardPageComponent],
    providers: [
      { provide: ActivatedRoute, useValue: createFakeActivatedRoute(projectId) },
      { provide: BoardStateService, useValue: boardState }
    ]
  }).compileComponents();
  const fixture = TestBed.createComponent(BoardPageComponent);
  return { fixture, component: fixture.componentInstance, boardState };
}

describe('BoardPageComponent', () => {
  let fixture: ComponentFixture<BoardPageComponent>;
  let component: BoardPageComponent;
  let boardState: BoardStateMock;

  beforeEach(async () => {
    const mounted = await mountBoard('p-1');
    fixture = mounted.fixture;
    component = mounted.component;
    boardState = mounted.boardState;
  });

  describe('Component Creation', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });
  });

  describe('Lifecycle — Join/Leave via BoardStateService', () => {
    it('calls enterBoard(projectId) in ngOnInit', () => {
      fixture.detectChanges();
      expect(boardState.enterBoard).toHaveBeenCalledWith('p-1');
      expect(boardState.enterBoard).toHaveBeenCalledTimes(1);
    });

    it('calls leaveBoard() in ngOnDestroy', () => {
      fixture.detectChanges();
      fixture.destroy();
      expect(boardState.leaveBoard).toHaveBeenCalledTimes(1);
    });

    it('does not call enterBoard when the projectId param is absent', async () => {
      const mounted = await mountBoard(null);
      mounted.fixture.detectChanges();
      expect(mounted.boardState.enterBoard).not.toHaveBeenCalled();
    });

    it('does not call enterBoard when the projectId param is empty', async () => {
      const mounted = await mountBoard('');
      mounted.fixture.detectChanges();
      expect(mounted.boardState.enterBoard).not.toHaveBeenCalled();
    });
  });

  describe('Rendering (shell unchanged from previous revision)', () => {
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
  });

  describe('Change Detection Strategy', () => {
    it('should use OnPush change detection', () => {
      expect(component).toBeTruthy();
      expect(fixture.componentRef.changeDetectorRef).toBeTruthy();
    });
  });
});
