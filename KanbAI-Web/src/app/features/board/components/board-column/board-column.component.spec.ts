import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Component } from '@angular/core';
import { CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { describe, it, expect, beforeEach } from 'vitest';

import { BoardColumnComponent } from './board-column.component';
import { BoardColumn, BoardTask } from '../../state/board-state.model';

function makeColumn(partial?: Partial<BoardColumn>): BoardColumn {
  return {
    id: 'col-1',
    name: 'To Do',
    colorCode: null,
    columnOrder: 1,
    projectId: 'p-1',
    ...partial
  };
}

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

@Component({
  standalone: true,
  imports: [BoardColumnComponent],
  template: `
    <app-board-column
      [column]="column"
      [tasks]="tasks"
      [connectedDropListIds]="connectedDropListIds"
      [activeTaskId]="activeTaskId"
      (taskDropped)="onDropped($event)"
      (taskOpened)="onOpened($event)"
    />
  `
})
class BoardColumnHostComponent {
  column: BoardColumn = makeColumn();
  tasks: BoardTask[] = [];
  connectedDropListIds: string[] = [];
  activeTaskId: string | null = null;
  dropped: CdkDragDrop<BoardTask[]> | null = null;
  opened: BoardTask | null = null;

  onDropped(event: CdkDragDrop<BoardTask[]>): void {
    this.dropped = event;
  }

  onOpened(task: BoardTask): void {
    this.opened = task;
  }
}

describe('BoardColumnComponent', () => {
  let fixture: ComponentFixture<BoardColumnHostComponent>;
  let host: BoardColumnHostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BoardColumnHostComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(BoardColumnHostComponent);
    host = fixture.componentInstance;
  });

  describe('Rendering', () => {
    it('renders the column name in an h2 heading', () => {
      fixture.detectChanges();
      const heading = fixture.debugElement.query(By.css('h2.board-column__name'));
      expect(heading).toBeTruthy();
      expect(heading.nativeElement.textContent.trim()).toBe('To Do');
    });

    it('renders the task count pill', () => {
      host.tasks = [makeTask({ id: 't-1' }), makeTask({ id: 't-2' })];
      fixture.detectChanges();
      const count = fixture.debugElement.query(By.css('.board-column__count'));
      expect(count.nativeElement.textContent.trim()).toBe('2');
    });

    it('renders the color accent strip when colorCode is non-null', () => {
      host.column = makeColumn({ colorCode: '#FF00FF' });
      fixture.detectChanges();
      const accent = fixture.debugElement.query(By.css('.board-column__accent'));
      expect(accent).toBeTruthy();
      // The style is set via [style.background] — jsdom sometimes normalises
      // hex colors, so just confirm the style is present.
      expect(accent.nativeElement.getAttribute('style')).toContain('background');
    });

    it('omits the color accent when colorCode is null', () => {
      fixture.detectChanges();
      const accent = fixture.debugElement.query(By.css('.board-column__accent'));
      expect(accent).toBeNull();
    });

    it('renders the empty-zone with the exact "Drop a task here." copy when tasks is empty', () => {
      fixture.detectChanges();
      const hint = fixture.debugElement.query(By.css('.board-column__empty-hint'));
      expect(hint).toBeTruthy();
      expect(hint.nativeElement.textContent.trim()).toBe('Drop a task here.');
    });

    it('renders a TaskCard per task when tasks is non-empty', () => {
      host.tasks = [
        makeTask({ id: 't-1', title: 'First' }),
        makeTask({ id: 't-2', title: 'Second' })
      ];
      fixture.detectChanges();

      const cards = fixture.debugElement.queryAll(By.css('app-task-card'));
      expect(cards.length).toBe(2);
    });

    it('sets a stable drop-list id in the form "drop-list-{columnId}"', () => {
      fixture.detectChanges();
      const list = fixture.debugElement.query(By.css('.board-column__list'));
      expect(list.nativeElement.id).toBe('drop-list-col-1');
    });

    it('sets role=list and an aria-label with the column name and task count', () => {
      host.tasks = [makeTask({ id: 't-1' }), makeTask({ id: 't-2' })];
      fixture.detectChanges();
      const list = fixture.debugElement.query(By.css('.board-column__list'));
      expect(list.nativeElement.getAttribute('role')).toBe('list');
      expect(list.nativeElement.getAttribute('aria-label')).toBe('To Do column, 2 tasks');
    });
  });

  describe('taskOpened output', () => {
    it('re-emits the task payload when a child TaskCard emits cardActivated', () => {
      const task = makeTask({ id: 't-77', title: 'Open me' });
      host.tasks = [task];
      fixture.detectChanges();

      const cardDe = fixture.debugElement.query(By.css('app-task-card'));
      // Trigger the output via the component instance directly — the
      // pointer-classification logic is covered in task-card.component.spec.
      // Here we just assert the re-emission wiring.
      cardDe.componentInstance.cardActivated.emit();

      expect(host.opened).toBe(task);
    });
  });

  describe('taskDropped output', () => {
    it('re-emits the CdkDragDrop event verbatim when CDK fires cdkDropListDropped', () => {
      host.tasks = [makeTask({ id: 't-1' })];
      fixture.detectChanges();

      const fakeEvent = {
        previousIndex: 0,
        currentIndex: 0,
        item: { data: host.tasks[0] }
      } as unknown as CdkDragDrop<BoardTask[]>;

      // Access the directive instance on the drop-list element and emit.
      const dropListDe = fixture.debugElement.query(By.directive(CdkDropList));
      expect(dropListDe).toBeTruthy();
      const dropList = dropListDe.injector.get(CdkDropList);
      dropList.dropped.emit(fakeEvent);

      expect(host.dropped).toBe(fakeEvent);
    });
  });
});
