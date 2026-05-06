import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { TaskDetailPanelComponent } from './task-detail-panel.component';
import { BoardTask } from '../../state/board-state.model';
import type { DropzoneFileSelectedEvent } from '../../../attachments/models/dropzone.model';

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

describe('TaskDetailPanelComponent', () => {
  let fixture: ComponentFixture<TaskDetailPanelComponent>;
  let component: TaskDetailPanelComponent;
  let closedCount: number;
  let selected: DropzoneFileSelectedEvent[];

  beforeEach(async () => {
    closedCount = 0;
    selected = [];

    await TestBed.configureTestingModule({
      imports: [TaskDetailPanelComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(TaskDetailPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('task', makeTask());
    fixture.componentRef.setInput('disabled', false);
    fixture.componentRef.setInput('disabledReason', null);

    component.panelClosed.subscribe(() => (closedCount += 1));
    component.fileSelected.subscribe(e => selected.push(e));

    fixture.detectChanges();
  });

  it('renders the task title in a heading with a stable id', () => {
    const title = fixture.debugElement.query(By.css('.task-detail-panel__title'));
    expect(title).toBeTruthy();
    expect(title.nativeElement.textContent.trim()).toBe('Design login page');
    expect(title.nativeElement.id).toBe('task-detail-title-t-1');
  });

  it('sets role=dialog, aria-modal=false, aria-labelledby wired to the title id', () => {
    const panel = fixture.debugElement.query(By.css('.task-detail-panel'));
    expect(panel.nativeElement.getAttribute('role')).toBe('dialog');
    expect(panel.nativeElement.getAttribute('aria-modal')).toBe('false');
    expect(panel.nativeElement.getAttribute('aria-labelledby')).toBe('task-detail-title-t-1');
  });

  it('renders the placeholder badge so the stub nature is visible', () => {
    const badge = fixture.debugElement.query(By.css('.task-detail-panel__placeholder-badge'));
    expect(badge).toBeTruthy();
  });

  it('close button click emits panelClosed', () => {
    const close = fixture.debugElement.query(By.css('.task-detail-panel__close'));
    close.nativeElement.click();
    expect(closedCount).toBe(1);
  });

  it('close button has an aria-label', () => {
    const close = fixture.debugElement.query(By.css('.task-detail-panel__close'));
    expect(close.nativeElement.getAttribute('aria-label')).toBe('Close task details');
  });

  it('Escape key on document emits panelClosed', () => {
    component.handleEscape();
    expect(closedCount).toBe(1);
  });

  it('hosts the app-file-dropzone with the task id', () => {
    const dropzone = fixture.debugElement.query(By.css('app-file-dropzone'));
    expect(dropzone).toBeTruthy();
  });

  it('re-emits fileSelected from the embedded dropzone', () => {
    const event: DropzoneFileSelectedEvent = {
      file: new File([new Uint8Array(1)], 'spec.pdf'),
      taskId: 't-1'
    };
    component.handleDropzoneFileSelected(event);
    expect(selected.length).toBe(1);
    expect(selected[0]).toBe(event);
  });
});
