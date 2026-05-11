import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of, throwError } from 'rxjs';
import { Dialog } from '@angular/cdk/dialog';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { TaskDescriptionSectionComponent } from './task-description-section.component';
import {
  TASK_DESCRIPTION_COPY,
  TASK_DESCRIPTION_MAX_LENGTH
} from './task-description-copy';
import { BoardTask } from '../../state/board-state.model';
import { BoardStateService } from '../../state/board-state.service';
import { TasksApiService } from '../../services/tasks-api.service';
import { TaskResponseDto } from '../../models/task.model';

function makeTask(partial?: Partial<BoardTask>): BoardTask {
  return {
    id: 't-1',
    title: 'Design login page',
    content: null,
    taskOrder: 0,
    columnId: 'col-1',
    assignedId: null,
    ...partial
  };
}

function makeTaskDto(partial?: Partial<TaskResponseDto>): TaskResponseDto {
  return {
    id: 't-1',
    title: 'Design login page',
    content: 'saved',
    taskOrder: 0,
    columnId: 'col-1',
    assignedId: null,
    createdAt: '2026-05-08T00:00:00Z',
    updatedAt: '2026-05-08T00:00:00Z',
    ...partial
  };
}

interface TasksApiMock {
  updateTaskDescription: ReturnType<typeof vi.fn>;
  clearTaskDescription: ReturnType<typeof vi.fn>;
}

interface DialogMock {
  open: ReturnType<typeof vi.fn>;
  _closed: Subject<true | undefined>;
}

interface BoardStateMock {
  applyLocalTaskUpdateFromDto: ReturnType<typeof vi.fn>;
  applyLocalTaskDescriptionCleared: ReturnType<typeof vi.fn>;
}

function makeDialogMock(): DialogMock {
  const closed = new Subject<true | undefined>();
  return {
    _closed: closed,
    open: vi.fn(() => ({ closed }))
  };
}

describe('TaskDescriptionSectionComponent', () => {
  let fixture: ComponentFixture<TaskDescriptionSectionComponent>;
  let component: TaskDescriptionSectionComponent;
  let tasksApi: TasksApiMock;
  let dialog: DialogMock;
  let boardState: BoardStateMock;
  let notFoundCount: number;

  beforeEach(async () => {
    tasksApi = {
      updateTaskDescription: vi.fn(() => of(makeTaskDto({ content: 'new' }))),
      clearTaskDescription: vi.fn(() => of(void 0))
    };
    dialog = makeDialogMock();
    boardState = {
      applyLocalTaskUpdateFromDto: vi.fn(),
      applyLocalTaskDescriptionCleared: vi.fn()
    };
    notFoundCount = 0;

    await TestBed.configureTestingModule({
      imports: [TaskDescriptionSectionComponent],
      providers: [
        { provide: TasksApiService, useValue: tasksApi },
        { provide: Dialog, useValue: dialog },
        { provide: BoardStateService, useValue: boardState }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TaskDescriptionSectionComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('task', makeTask());
    component.taskNotFound.subscribe(() => (notFoundCount += 1));
    fixture.detectChanges();
  });

  describe('read mode', () => {
    it('renders the empty-state button with the canonical placeholder when content is null', () => {
      const btn = fixture.debugElement.query(
        By.css('.task-description__empty')
      );
      expect(btn).toBeTruthy();
      expect(btn.nativeElement.textContent.trim()).toBe(
        TASK_DESCRIPTION_COPY.EMPTY_PLACEHOLDER
      );
    });

    it('renders the empty-state when content is whitespace-only', () => {
      fixture.componentRef.setInput('task', makeTask({ content: '   \n  ' }));
      fixture.detectChanges();
      expect(
        fixture.debugElement.query(By.css('.task-description__empty'))
      ).toBeTruthy();
    });

    it('renders the text-button with preserved content when content is non-empty', () => {
      fixture.componentRef.setInput('task', makeTask({ content: 'line1\nline2' }));
      fixture.detectChanges();
      const btn = fixture.debugElement.query(
        By.css('.task-description__text-button')
      );
      expect(btn).toBeTruthy();
      expect(btn.nativeElement.textContent).toContain('line1');
      expect(btn.nativeElement.textContent).toContain('\n');
    });

    it('shows Clear affordance only when content is non-null', () => {
      fixture.componentRef.setInput('task', makeTask({ content: 'hi' }));
      fixture.detectChanges();
      const buttons = Array.from(
        fixture.nativeElement.querySelectorAll('button')
      ) as HTMLButtonElement[];
      expect(
        buttons.some(
          b => b.getAttribute('aria-label') === TASK_DESCRIPTION_COPY.CLEAR_BUTTON_LABEL
        )
      ).toBe(true);

      fixture.componentRef.setInput('task', makeTask({ content: null }));
      fixture.detectChanges();
      const buttons2 = Array.from(
        fixture.nativeElement.querySelectorAll('button')
      ) as HTMLButtonElement[];
      expect(
        buttons2.some(
          b => b.getAttribute('aria-label') === TASK_DESCRIPTION_COPY.CLEAR_BUTTON_LABEL
        )
      ).toBe(false);
    });
  });

  describe('entering edit mode', () => {
    it('click on empty-state opens the textarea with empty value', () => {
      fixture.debugElement.query(By.css('.task-description__empty')).nativeElement.click();
      fixture.detectChanges();
      const ta = fixture.debugElement.query(By.css('.task-description__editor'));
      expect(ta).toBeTruthy();
      expect((ta.nativeElement as HTMLTextAreaElement).value).toBe('');
    });

    it('click on the text-button opens the textarea pre-filled', () => {
      fixture.componentRef.setInput('task', makeTask({ content: 'original' }));
      fixture.detectChanges();
      fixture.debugElement.query(By.css('.task-description__text-button')).nativeElement.click();
      fixture.detectChanges();
      const ta = fixture.debugElement.query(By.css('.task-description__editor'));
      expect((ta.nativeElement as HTMLTextAreaElement).value).toBe('original');
    });
  });

  describe('save validation + counter', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('task', makeTask({ content: 'x' }));
      fixture.detectChanges();
      // Enter edit mode.
      fixture.debugElement
        .query(By.css('.task-description__text-button'))
        .nativeElement.click();
      fixture.detectChanges();
    });

    function typeInto(value: string): void {
      const ta = fixture.debugElement.query(
        By.css('.task-description__editor')
      ).nativeElement as HTMLTextAreaElement;
      ta.value = value;
      ta.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }

    it('disables Save when the trimmed draft is empty', () => {
      typeInto('   ');
      const save = fixture.debugElement.query(
        By.css('.task-description__save')
      ).nativeElement as HTMLButtonElement;
      expect(save.disabled).toBe(true);
    });

    it('disables Save when rawLength >= MAX_LENGTH', () => {
      typeInto('a'.repeat(TASK_DESCRIPTION_MAX_LENGTH));
      const save = fixture.debugElement.query(
        By.css('.task-description__save')
      ).nativeElement as HTMLButtonElement;
      expect(save.disabled).toBe(true);
    });

    it('enables Save at 9999 chars', () => {
      typeInto('a'.repeat(TASK_DESCRIPTION_MAX_LENGTH - 1));
      const save = fixture.debugElement.query(
        By.css('.task-description__save')
      ).nativeElement as HTMLButtonElement;
      expect(save.disabled).toBe(false);
    });

    it('hides counter under 9001 chars and shows it at 9001', () => {
      typeInto('a'.repeat(9000));
      expect(
        fixture.debugElement.query(By.css('.task-description__counter'))
      ).toBeNull();
      typeInto('a'.repeat(9001));
      expect(
        fixture.debugElement.query(By.css('.task-description__counter'))
      ).toBeTruthy();
    });

    it('applies over-limit styling class when at limit', () => {
      typeInto('a'.repeat(TASK_DESCRIPTION_MAX_LENGTH));
      const counter = fixture.debugElement.query(
        By.css('.task-description__counter')
      );
      expect(
        counter.nativeElement.classList.contains('task-description__counter--over-limit')
      ).toBe(true);
    });
  });

  describe('save flow', () => {
    function openEditor(initial: string): HTMLTextAreaElement {
      fixture.componentRef.setInput('task', makeTask({ content: initial }));
      fixture.detectChanges();
      fixture.debugElement
        .query(By.css('.task-description__text-button'))
        .nativeElement.click();
      fixture.detectChanges();
      return fixture.debugElement.query(By.css('.task-description__editor'))
        .nativeElement as HTMLTextAreaElement;
    }

    it('200: flips back to read mode, clears draft, calls service with trimmed value', () => {
      const ta = openEditor('hi');
      ta.value = '  new body  ';
      ta.dispatchEvent(new Event('input'));
      fixture.debugElement
        .query(By.css('.task-description__save'))
        .nativeElement.click();
      fixture.detectChanges();

      expect(tasksApi.updateTaskDescription).toHaveBeenCalledWith('t-1', {
        content: 'new body'
      });
      // Back in read mode.
      expect(
        fixture.debugElement.query(By.css('.task-description__editor'))
      ).toBeNull();
    });

    it('200: calls boardState.applyLocalTaskUpdateFromDto with the returned DTO (issue #94)', () => {
      const returnedDto = makeTaskDto({ content: 'authoritative new' });
      tasksApi.updateTaskDescription.mockReturnValueOnce(of(returnedDto));

      const ta = openEditor('hi');
      ta.value = 'authoritative new';
      ta.dispatchEvent(new Event('input'));
      fixture.debugElement
        .query(By.css('.task-description__save'))
        .nativeElement.click();
      fixture.detectChanges();

      expect(boardState.applyLocalTaskUpdateFromDto).toHaveBeenCalledTimes(1);
      expect(boardState.applyLocalTaskUpdateFromDto).toHaveBeenCalledWith(returnedDto);
    });

    it('200: applyLocalTaskUpdateFromDto fires AFTER exitEditMode flips mode to read (issue #94)', () => {
      // Ordering guarantee: the remote-update effect early-exits when
      // mode !== 'edit'. If the state apply fired before exitEditMode, the
      // effect would trip the "updated by someone else" banner on the
      // user's own save. Verify by reading component.mode() from inside
      // the spy body.
      let modeAtApplyTime: string | null = null;
      boardState.applyLocalTaskUpdateFromDto.mockImplementation(() => {
        modeAtApplyTime = (component as unknown as { mode: () => string }).mode();
      });
      tasksApi.updateTaskDescription.mockReturnValueOnce(
        of(makeTaskDto({ content: 'x' }))
      );

      const ta = openEditor('hi');
      ta.value = 'x';
      ta.dispatchEvent(new Event('input'));
      fixture.debugElement
        .query(By.css('.task-description__save'))
        .nativeElement.click();
      fixture.detectChanges();

      expect(modeAtApplyTime).toBe('read');
    });

    it('renders the first server-errors string on 400', () => {
      tasksApi.updateTaskDescription.mockReturnValueOnce(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 400,
              error: { errors: ['server: too long'] }
            })
        )
      );
      const ta = openEditor('hi');
      ta.value = 'abc';
      ta.dispatchEvent(new Event('input'));
      fixture.debugElement
        .query(By.css('.task-description__save'))
        .nativeElement.click();
      fixture.detectChanges();

      const err = fixture.debugElement.query(
        By.css('.task-description__error')
      );
      expect(err.nativeElement.textContent).toContain('server: too long');
      // Editor stays open and no state mutation fires on error (issue #94).
      expect(
        fixture.debugElement.query(By.css('.task-description__editor'))
      ).toBeTruthy();
      expect(boardState.applyLocalTaskUpdateFromDto).not.toHaveBeenCalled();
    });

    it('falls back to generic save copy on 400 with empty errors[]', () => {
      tasksApi.updateTaskDescription.mockReturnValueOnce(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 400,
              error: { errors: [] }
            })
        )
      );
      const ta = openEditor('hi');
      ta.value = 'abc';
      ta.dispatchEvent(new Event('input'));
      fixture.debugElement
        .query(By.css('.task-description__save'))
        .nativeElement.click();
      fixture.detectChanges();

      const err = fixture.debugElement.query(
        By.css('.task-description__error')
      );
      expect(err.nativeElement.textContent).toContain(
        TASK_DESCRIPTION_COPY.INLINE_ERROR_GENERIC_SAVE
      );
    });

    it('maps 403 to permission copy inline', () => {
      tasksApi.updateTaskDescription.mockReturnValueOnce(
        throwError(() => new HttpErrorResponse({ status: 403 }))
      );
      const ta = openEditor('hi');
      ta.value = 'abc';
      ta.dispatchEvent(new Event('input'));
      fixture.debugElement
        .query(By.css('.task-description__save'))
        .nativeElement.click();
      fixture.detectChanges();

      const err = fixture.debugElement.query(
        By.css('.task-description__error')
      );
      expect(err.nativeElement.textContent).toContain(
        TASK_DESCRIPTION_COPY.INLINE_ERROR_PERMISSION
      );
      expect(boardState.applyLocalTaskUpdateFromDto).not.toHaveBeenCalled();
    });

    it('emits taskNotFound on 404 and does not mutate mode itself', () => {
      tasksApi.updateTaskDescription.mockReturnValueOnce(
        throwError(() => new HttpErrorResponse({ status: 404 }))
      );
      const ta = openEditor('hi');
      ta.value = 'abc';
      ta.dispatchEvent(new Event('input'));
      fixture.debugElement
        .query(By.css('.task-description__save'))
        .nativeElement.click();
      fixture.detectChanges();

      expect(notFoundCount).toBe(1);
      // Editor stays open — host panel owns the close.
      expect(
        fixture.debugElement.query(By.css('.task-description__editor'))
      ).toBeTruthy();
      expect(boardState.applyLocalTaskUpdateFromDto).not.toHaveBeenCalled();
    });

    it('maps status=0 to network copy', () => {
      tasksApi.updateTaskDescription.mockReturnValueOnce(
        throwError(() => new HttpErrorResponse({ status: 0 }))
      );
      const ta = openEditor('hi');
      ta.value = 'abc';
      ta.dispatchEvent(new Event('input'));
      fixture.debugElement
        .query(By.css('.task-description__save'))
        .nativeElement.click();
      fixture.detectChanges();

      const err = fixture.debugElement.query(
        By.css('.task-description__error')
      );
      expect(err.nativeElement.textContent).toContain(
        TASK_DESCRIPTION_COPY.INLINE_ERROR_NETWORK
      );
      expect(boardState.applyLocalTaskUpdateFromDto).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('Cancel button returns to read mode and discards the draft', () => {
      fixture.componentRef.setInput('task', makeTask({ content: 'orig' }));
      fixture.detectChanges();
      fixture.debugElement
        .query(By.css('.task-description__text-button'))
        .nativeElement.click();
      fixture.detectChanges();

      const ta = fixture.debugElement.query(
        By.css('.task-description__editor')
      ).nativeElement as HTMLTextAreaElement;
      ta.value = 'dirty';
      ta.dispatchEvent(new Event('input'));
      fixture.debugElement
        .query(By.css('.task-description__cancel'))
        .nativeElement.click();
      fixture.detectChanges();

      expect(
        fixture.debugElement.query(By.css('.task-description__editor'))
      ).toBeNull();
      // Re-enter; draft should be the original content, not the abandoned draft.
      fixture.debugElement
        .query(By.css('.task-description__text-button'))
        .nativeElement.click();
      fixture.detectChanges();
      const ta2 = fixture.debugElement.query(
        By.css('.task-description__editor')
      ).nativeElement as HTMLTextAreaElement;
      expect(ta2.value).toBe('orig');
    });
  });

  describe('clear flow', () => {
    it('opening and cancelling the confirm does not fire DELETE', () => {
      fixture.componentRef.setInput('task', makeTask({ content: 'hi' }));
      fixture.detectChanges();

      const clearBtn = (
        Array.from(
          fixture.nativeElement.querySelectorAll('button')
        ) as HTMLButtonElement[]
      ).find(
        b => b.getAttribute('aria-label') === TASK_DESCRIPTION_COPY.CLEAR_BUTTON_LABEL
      ) as HTMLButtonElement;
      clearBtn.click();
      expect(dialog.open).toHaveBeenCalled();
      dialog._closed.next(undefined);
      expect(tasksApi.clearTaskDescription).not.toHaveBeenCalled();
    });

    it('confirming fires DELETE; 204 applies the local clear via BoardStateService (issue #94)', () => {
      fixture.componentRef.setInput('task', makeTask({ content: 'hi' }));
      fixture.detectChanges();

      const clearBtn = (
        Array.from(
          fixture.nativeElement.querySelectorAll('button')
        ) as HTMLButtonElement[]
      ).find(
        b => b.getAttribute('aria-label') === TASK_DESCRIPTION_COPY.CLEAR_BUTTON_LABEL
      ) as HTMLButtonElement;
      clearBtn.click();
      dialog._closed.next(true);
      expect(tasksApi.clearTaskDescription).toHaveBeenCalledWith('t-1');
      expect(boardState.applyLocalTaskDescriptionCleared).toHaveBeenCalledTimes(1);
      expect(boardState.applyLocalTaskDescriptionCleared).toHaveBeenCalledWith('t-1');
    });

    it('404 on clear emits taskNotFound and does not apply a local clear (issue #94)', () => {
      tasksApi.clearTaskDescription.mockReturnValueOnce(
        throwError(() => new HttpErrorResponse({ status: 404 }))
      );
      fixture.componentRef.setInput('task', makeTask({ content: 'hi' }));
      fixture.detectChanges();
      const clearBtn = (
        Array.from(
          fixture.nativeElement.querySelectorAll('button')
        ) as HTMLButtonElement[]
      ).find(
        b => b.getAttribute('aria-label') === TASK_DESCRIPTION_COPY.CLEAR_BUTTON_LABEL
      ) as HTMLButtonElement;
      clearBtn.click();
      dialog._closed.next(true);
      expect(notFoundCount).toBe(1);
      expect(boardState.applyLocalTaskDescriptionCleared).not.toHaveBeenCalled();
    });

    it('403 on clear surfaces permission copy and does not apply a local clear (issue #94)', () => {
      tasksApi.clearTaskDescription.mockReturnValueOnce(
        throwError(() => new HttpErrorResponse({ status: 403 }))
      );
      fixture.componentRef.setInput('task', makeTask({ content: 'hi' }));
      fixture.detectChanges();
      const clearBtn = (
        Array.from(
          fixture.nativeElement.querySelectorAll('button')
        ) as HTMLButtonElement[]
      ).find(
        b => b.getAttribute('aria-label') === TASK_DESCRIPTION_COPY.CLEAR_BUTTON_LABEL
      ) as HTMLButtonElement;
      clearBtn.click();
      dialog._closed.next(true);
      expect(boardState.applyLocalTaskDescriptionCleared).not.toHaveBeenCalled();
    });

    it('status=0 on clear surfaces network copy and does not apply a local clear (issue #94)', () => {
      tasksApi.clearTaskDescription.mockReturnValueOnce(
        throwError(() => new HttpErrorResponse({ status: 0 }))
      );
      fixture.componentRef.setInput('task', makeTask({ content: 'hi' }));
      fixture.detectChanges();
      const clearBtn = (
        Array.from(
          fixture.nativeElement.querySelectorAll('button')
        ) as HTMLButtonElement[]
      ).find(
        b => b.getAttribute('aria-label') === TASK_DESCRIPTION_COPY.CLEAR_BUTTON_LABEL
      ) as HTMLButtonElement;
      clearBtn.click();
      dialog._closed.next(true);
      expect(boardState.applyLocalTaskDescriptionCleared).not.toHaveBeenCalled();
    });
  });

  describe('remote update while editing', () => {
    it('raises the banner when task().content diverges from snapshot', () => {
      fixture.componentRef.setInput('task', makeTask({ content: 'original' }));
      fixture.detectChanges();
      fixture.debugElement
        .query(By.css('.task-description__text-button'))
        .nativeElement.click();
      fixture.detectChanges();

      // Simulate the SignalR echo reconciling the task with a new content.
      fixture.componentRef.setInput(
        'task',
        makeTask({ content: 'remote updated' })
      );
      fixture.detectChanges();

      const banner = fixture.debugElement.query(
        By.css('.task-description__banner')
      );
      expect(banner).toBeTruthy();
      expect(banner.nativeElement.textContent).toContain(
        TASK_DESCRIPTION_COPY.BANNER_REMOTE_UPDATED
      );
    });

    it('Discard action returns to read mode showing the remote content', () => {
      fixture.componentRef.setInput('task', makeTask({ content: 'original' }));
      fixture.detectChanges();
      fixture.debugElement
        .query(By.css('.task-description__text-button'))
        .nativeElement.click();
      fixture.detectChanges();

      // remote update fires while in edit mode
      fixture.componentRef.setInput('task', makeTask({ content: 'remote' }));
      fixture.detectChanges();

      const discard = fixture.debugElement.query(
        By.css('.task-description__banner-action')
      );
      discard.nativeElement.click();
      fixture.detectChanges();

      expect(
        fixture.debugElement.query(By.css('.task-description__editor'))
      ).toBeNull();
      const text = fixture.debugElement.query(
        By.css('.task-description__text-button')
      );
      expect(text.nativeElement.textContent.trim()).toBe('remote');
    });
  });
});
