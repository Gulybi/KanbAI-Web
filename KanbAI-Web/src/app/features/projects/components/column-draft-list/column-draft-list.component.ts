import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  QueryList,
  ViewChildren,
  afterNextRender,
  computed,
  inject,
  input,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormGroup, ReactiveFormsModule } from '@angular/forms';
import {
  CdkDragDrop,
  DragDropModule
} from '@angular/cdk/drag-drop';
import { Injector } from '@angular/core';

import { FormInputComponent } from '../../../auth/components/form-input/form-input.component';
import {
  ColumnDraftFormShape,
  buildColumnDraftGroup
} from '../create-project-dialog/column-draft.model';

/**
 * Presentational list of column drafts. Owns no HTTP, no state services —
 * it mutates the parent's `FormArray` in place (Angular Reactive Forms'
 * standard pattern) and announces its mutations through a visually hidden
 * live region.
 *
 * The reorder path for keyboard users is the up/down buttons. The drag
 * handle is pointer-only (discoverable via Tab for screen readers).
 */
@Component({
  selector: 'app-column-draft-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormInputComponent, DragDropModule],
  templateUrl: './column-draft-list.component.html',
  styleUrl: './column-draft-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ColumnDraftListComponent implements AfterViewInit {
  /** The array from the parent, passed by reference so edits propagate. */
  readonly formArray =
    input.required<FormArray<FormGroup<ColumnDraftFormShape>>>();

  /**
   * Set `true` while the parent's `submitting()` is true. Cascades to every
   * control via the root `<fieldset [disabled]>` binding.
   */
  readonly disabled = input<boolean>(false);

  /** Row groups in their current order — template iterates this. */
  protected readonly columnGroups = computed(
    () =>
      this.formArray().controls as FormGroup<ColumnDraftFormShape>[]
  );

  /**
   * Signal that mirrors the array's `errors` via a `statusChanges` subscription
   * (established after `AfterViewInit`). The computed reads this signal plus
   * the FormArray's errors object each CD cycle.
   */
  private readonly arrayErrorTick = signal<number>(0);

  /**
   * Row indices flagged as duplicates by the array-level
   * `duplicateColumnNamesValidator`. Re-reads on each `arrayErrorTick` bump.
   */
  protected readonly duplicateFlags = computed<Set<number>>(() => {
    // Read the tick to make this computed reactive to status changes.
    this.arrayErrorTick();
    const errors = this.formArray().errors;
    const duplicates = errors?.['duplicateNames']?.duplicates as
      | number[]
      | undefined;
    return new Set<number>(duplicates ?? []);
  });

  /** Visually-hidden live-region message. */
  protected readonly liveMessage = signal<string>('');

  @ViewChildren('nameInput', { read: ElementRef })
  private readonly nameInputs!: QueryList<ElementRef<HTMLElement>>;

  @ViewChildren('addButton', { read: ElementRef })
  private readonly addButtonRefs!: QueryList<ElementRef<HTMLElement>>;

  private readonly injector = inject(Injector);

  constructor() {
    // Hook onto the FormArray so status changes (including array-level
    // duplicate flagging) propagate into `duplicateFlags`.
    queueMicrotask(() => {
      const array = this.formArray();
      array.statusChanges.subscribe(() => {
        this.arrayErrorTick.update(n => n + 1);
      });
      // Initial tick so duplicates flagged at construction render.
      this.arrayErrorTick.update(n => n + 1);
    });
  }

  ngAfterViewInit(): void {
    // No-op: ViewChildren lists are available here; we use them lazily.
  }

  // --------------------------------------------------------------------
  // Mutations
  // --------------------------------------------------------------------

  protected addColumn(): void {
    const array = this.formArray();
    array.push(buildColumnDraftGroup(''));
    const total = array.length;
    this.liveMessage.set(`Column added. Column ${total} of ${total}.`);

    // Defer focus to the new input until Angular has rendered it.
    afterNextRender(
      () => {
        this.focusInputAt(total - 1);
      },
      { injector: this.injector }
    );
  }

  protected removeColumn(index: number): void {
    const array = this.formArray();
    if (index < 0 || index >= array.length) {
      return;
    }
    array.removeAt(index);
    const remaining = array.length;
    this.liveMessage.set(
      remaining === 0
        ? 'No columns. Add at least one column to continue.'
        : `Column removed. ${remaining} column${
            remaining === 1 ? '' : 's'
          } remaining.`
    );

    afterNextRender(
      () => {
        if (remaining === 0) {
          this.focusAddButton();
          return;
        }
        // Focus target: previous row's input, else new row 0.
        if (index > 0) {
          this.focusInputAt(index - 1);
        } else {
          this.focusInputAt(0);
        }
      },
      { injector: this.injector }
    );
  }

  protected moveUp(index: number): void {
    if (index <= 0) {
      return;
    }
    this.swap(index, index - 1);
  }

  protected moveDown(index: number): void {
    const array = this.formArray();
    if (index >= array.length - 1) {
      return;
    }
    this.swap(index, index + 1);
  }

  protected onDrop(event: CdkDragDrop<unknown>): void {
    const { previousIndex, currentIndex } = event;
    const array = this.formArray();
    if (
      previousIndex === currentIndex ||
      previousIndex < 0 ||
      previousIndex >= array.length ||
      currentIndex < 0 ||
      currentIndex >= array.length
    ) {
      return;
    }
    const group = array.at(previousIndex);
    array.removeAt(previousIndex);
    array.insert(currentIndex, group);

    const name =
      (group.controls.name.value ?? '').trim() || `Column ${currentIndex + 1}`;
    this.liveMessage.set(
      `Column '${name}' moved to position ${currentIndex + 1} of ${array.length}.`
    );
  }

  // --------------------------------------------------------------------
  // Template helpers
  // --------------------------------------------------------------------

  protected nameOf(index: number): string {
    const array = this.formArray();
    if (index < 0 || index >= array.length) {
      return '';
    }
    const raw = array.at(index).controls.name.value;
    const trimmed = (raw ?? '').trim();
    return trimmed.length > 0 ? trimmed : `Column ${index + 1}`;
  }

  protected labelFor(index: number): string {
    return `Column ${index + 1} name`;
  }

  protected moveUpLabel(index: number): string {
    return `Move column '${this.nameOf(index)}' up`;
  }

  protected moveDownLabel(index: number): string {
    return `Move column '${this.nameOf(index)}' down`;
  }

  protected removeLabel(index: number): string {
    return `Remove column '${this.nameOf(index)}'`;
  }

  protected dragHandleLabel(index: number): string {
    return `Drag column '${this.nameOf(index)}' to reorder. Use the up and down buttons for keyboard reorder.`;
  }

  protected trackByGroup(
    _index: number,
    group: FormGroup<ColumnDraftFormShape>
  ): FormGroup<ColumnDraftFormShape> {
    return group;
  }

  // --------------------------------------------------------------------
  // Internals
  // --------------------------------------------------------------------

  private swap(from: number, to: number): void {
    const array = this.formArray();
    const group = array.at(from);
    array.removeAt(from);
    array.insert(to, group);

    const name =
      (group.controls.name.value ?? '').trim() || `Column ${to + 1}`;
    this.liveMessage.set(
      `Column '${name}' moved to position ${to + 1} of ${array.length}.`
    );

    afterNextRender(
      () => {
        this.focusInputAt(to);
      },
      { injector: this.injector }
    );
  }

  private focusInputAt(index: number): void {
    const refs = this.nameInputs?.toArray() ?? [];
    if (index < 0 || index >= refs.length) {
      return;
    }
    const host = refs[index]?.nativeElement;
    // FormInputComponent renders its input one level deep; find it.
    const input = host?.querySelector<HTMLElement>('input, textarea');
    input?.focus();
  }

  private focusAddButton(): void {
    const refs = this.addButtonRefs?.toArray() ?? [];
    const button = refs[0]?.nativeElement;
    button?.focus();
  }
}
