import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { WritableSignal, signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskDetailPanelComponent } from './task-detail-panel.component';
import { BoardTask } from '../../state/board-state.model';
import type { DropzoneFileSelectedEvent } from '../../../attachments/models/dropzone.model';
import { AttachmentsStateService } from '../../../attachments/state/attachments-state.service';
import { AttachmentUpload } from '../../../attachments/models/attachment-upload.model';
import { UPLOAD_BLOCKED_REASON } from '../../../attachments/constants/upload-errors';

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

function makeUpload(partial?: Partial<AttachmentUpload>): AttachmentUpload {
  return {
    id: 'u-1',
    taskId: 't-1',
    file: new File([new Uint8Array(4)], 'spec.pdf'),
    fileSizeDisplay: '3.8 MB',
    phase: 'uploading',
    progress: 42,
    assetId: null,
    error: null,
    startedAt: 0,
    ...partial
  };
}

interface MockAttachmentsState {
  uploadsByTaskId: WritableSignal<Record<string, AttachmentUpload[]>>;
  completedByTaskId: WritableSignal<Record<string, unknown[]>>;
  cancel: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
  dismiss: ReturnType<typeof vi.fn>;
  startUpload: ReturnType<typeof vi.fn>;
  uploadsForTask: (taskId: string) => WritableSignal<AttachmentUpload[]>;
  isUploadingForTask: (taskId: string) => WritableSignal<boolean>;
}

function createMockAttachmentsState(): MockAttachmentsState {
  const uploadsByTaskId = signal<Record<string, AttachmentUpload[]>>({});
  const completedByTaskId = signal<Record<string, unknown[]>>({});
  return {
    uploadsByTaskId,
    completedByTaskId,
    cancel: vi.fn(),
    retry: vi.fn(),
    dismiss: vi.fn(),
    startUpload: vi.fn(),
    uploadsForTask: (taskId: string) => {
      const sig = signal<AttachmentUpload[]>([]);
      sig.set(uploadsByTaskId()[taskId] ?? []);
      return sig;
    },
    isUploadingForTask: (taskId: string) => {
      const sig = signal<boolean>(false);
      sig.set(
        (uploadsByTaskId()[taskId] ?? []).some(
          u => u.phase === 'uploading' || u.phase === 'processing'
        )
      );
      return sig;
    }
  };
}

describe('TaskDetailPanelComponent', () => {
  let fixture: ComponentFixture<TaskDetailPanelComponent>;
  let component: TaskDetailPanelComponent;
  let mockState: MockAttachmentsState;
  let closedCount: number;
  let selected: DropzoneFileSelectedEvent[];

  beforeEach(async () => {
    closedCount = 0;
    selected = [];
    mockState = createMockAttachmentsState();

    await TestBed.configureTestingModule({
      imports: [TaskDetailPanelComponent],
      providers: [
        { provide: AttachmentsStateService, useValue: mockState }
      ]
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

  describe('upload rows', () => {
    it('renders no upload row when uploadsForTask is empty', () => {
      const list = fixture.debugElement.query(By.css('.task-detail-panel__upload-list'));
      expect(list).toBeNull();
    });

    it('renders an app-upload-progress-row for each upload', () => {
      mockState.uploadsByTaskId.set({
        't-1': [makeUpload({ id: 'u-a' }), makeUpload({ id: 'u-b', phase: 'processing' })]
      });
      fixture.detectChanges();

      const rows = fixture.debugElement.queryAll(By.css('app-upload-progress-row'));
      expect(rows.length).toBe(2);
    });

    it('delegates cancel/retry/dismiss to the state service', () => {
      component.handleCancel('u-a');
      component.handleRetry('u-b');
      component.handleDismiss('u-c');
      expect(mockState.cancel).toHaveBeenCalledWith('u-a');
      expect(mockState.retry).toHaveBeenCalledWith('u-b');
      expect(mockState.dismiss).toHaveBeenCalledWith('u-c');
    });
  });

  describe('disabled-during-upload', () => {
    it('sets dropzone disabled=true and disabledReason=UPLOAD_BLOCKED_REASON while a row is uploading', () => {
      mockState.uploadsByTaskId.set({
        't-1': [makeUpload({ phase: 'uploading' })]
      });
      fixture.detectChanges();

      expect(component.resolvedDisabled()).toBe(true);
      expect(component.resolvedDisabledReason()).toBe(UPLOAD_BLOCKED_REASON);
    });

    it('stays enabled when the only row is in error phase', () => {
      mockState.uploadsByTaskId.set({
        't-1': [
          makeUpload({
            phase: 'error',
            error: { code: 'HTTP_500', userMessage: 'boom' }
          })
        ]
      });
      fixture.detectChanges();

      expect(component.resolvedDisabled()).toBe(false);
      expect(component.resolvedDisabledReason()).toBeNull();
    });

    it('preserves externally-provided disabled/reason over the upload-in-progress reason', () => {
      mockState.uploadsByTaskId.set({
        't-1': [makeUpload()]
      });
      fixture.componentRef.setInput('disabled', true);
      fixture.componentRef.setInput('disabledReason', 'custom');
      fixture.detectChanges();

      expect(component.resolvedDisabledReason()).toBe('custom');
    });
  });

  describe('upload live region', () => {
    it('announces "Uploading {filename}" while uploading', () => {
      mockState.uploadsByTaskId.set({
        't-1': [makeUpload({ file: new File([new Uint8Array(1)], 'x.pdf') })]
      });
      fixture.detectChanges();
      expect(component.uploadLiveMessage()).toBe('Uploading x.pdf');
    });

    it('announces "Processing {filename}" when processing', () => {
      mockState.uploadsByTaskId.set({
        't-1': [
          makeUpload({
            phase: 'processing',
            assetId: 'a-1',
            file: new File([new Uint8Array(1)], 'y.pdf')
          })
        ]
      });
      fixture.detectChanges();
      expect(component.uploadLiveMessage()).toBe('Processing y.pdf');
    });

    it('is empty when no rows are uploading / processing', () => {
      expect(component.uploadLiveMessage()).toBe('');
    });
  });
});
