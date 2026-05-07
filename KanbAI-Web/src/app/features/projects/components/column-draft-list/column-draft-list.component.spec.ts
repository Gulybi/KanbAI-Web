import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  Component,
  ChangeDetectionStrategy,
  signal
} from '@angular/core';
import { FormArray, FormGroup } from '@angular/forms';
import { describe, it, expect, beforeEach } from 'vitest';

import { ColumnDraftListComponent } from './column-draft-list.component';
import {
  ColumnDraftFormShape,
  buildColumnDraftGroup
} from '../create-project-dialog/column-draft.model';
import {
  duplicateColumnNamesValidator,
  minColumnsValidator
} from '../../validators/column-array.validators';

/**
 * Host wrapper so we can drive the signal inputs the way a real parent would.
 */
@Component({
  standalone: true,
  imports: [ColumnDraftListComponent],
  template: `
    <app-column-draft-list
      [formArray]="array"
      [disabled]="disabled()"
    ></app-column-draft-list>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
class HostComponent {
  readonly array = new FormArray<FormGroup<ColumnDraftFormShape>>(
    [
      buildColumnDraftGroup('To Do'),
      buildColumnDraftGroup('In Progress'),
      buildColumnDraftGroup('Done')
    ],
    { validators: [minColumnsValidator, duplicateColumnNamesValidator] }
  );
  readonly disabled = signal<boolean>(false);
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function mount(): Promise<ComponentFixture<HostComponent>> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [HostComponent]
  }).compileComponents();
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  await flushAsync();
  fixture.detectChanges();
  return fixture;
}

describe('ColumnDraftListComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(async () => {
    fixture = await mount();
    host = fixture.componentInstance;
  });

  it('renders one row per FormArray entry', () => {
    const rows = fixture.nativeElement.querySelectorAll(
      '.column-draft-list__row'
    );
    expect(rows.length).toBe(3);
  });

  it('renders the empty-list hint when the array is empty', () => {
    host.array.clear();
    fixture.detectChanges();

    const empty = fixture.nativeElement.querySelector(
      '.column-draft-list__empty'
    );
    expect(empty).toBeTruthy();
    const rows = fixture.nativeElement.querySelectorAll(
      '.column-draft-list__row'
    );
    expect(rows.length).toBe(0);
  });

  it('addColumn() pushes an empty row onto the FormArray', () => {
    const addBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.column-draft-list__add'
    );
    addBtn.click();
    fixture.detectChanges();

    expect(host.array.length).toBe(4);
    expect(host.array.at(3).controls.name.value).toBe('');
  });

  it('removeColumn() deletes the row at the given index', () => {
    const removeButtons: NodeListOf<HTMLButtonElement> =
      fixture.nativeElement.querySelectorAll('.column-draft-list__remove');
    removeButtons[0].click();
    fixture.detectChanges();

    expect(host.array.length).toBe(2);
    expect(host.array.at(0).controls.name.value).toBe('In Progress');
    expect(host.array.at(1).controls.name.value).toBe('Done');
  });

  it('moveUp() swaps the row with its previous sibling', () => {
    const upButtons: NodeListOf<HTMLButtonElement> =
      fixture.nativeElement.querySelectorAll('.column-draft-list__reorder--up');
    // Click up on row index 1 (In Progress) — should swap with To Do.
    upButtons[1].click();
    fixture.detectChanges();

    expect(host.array.at(0).controls.name.value).toBe('In Progress');
    expect(host.array.at(1).controls.name.value).toBe('To Do');
    expect(host.array.at(2).controls.name.value).toBe('Done');
  });

  it('moveUp() on row 0 is a no-op (button disabled)', () => {
    const upButtons: NodeListOf<HTMLButtonElement> =
      fixture.nativeElement.querySelectorAll('.column-draft-list__reorder--up');
    expect(upButtons[0].disabled).toBe(true);
  });

  it('moveDown() swaps the row with its next sibling', () => {
    const downButtons: NodeListOf<HTMLButtonElement> =
      fixture.nativeElement.querySelectorAll(
        '.column-draft-list__reorder--down'
      );
    // Click down on row index 0 (To Do) — should swap with In Progress.
    downButtons[0].click();
    fixture.detectChanges();

    expect(host.array.at(0).controls.name.value).toBe('In Progress');
    expect(host.array.at(1).controls.name.value).toBe('To Do');
  });

  it('moveDown() on the last row is disabled', () => {
    const downButtons: NodeListOf<HTMLButtonElement> =
      fixture.nativeElement.querySelectorAll(
        '.column-draft-list__reorder--down'
      );
    expect(downButtons[2].disabled).toBe(true);
  });

  it('surfaces the duplicate flag on the row index returned by the array validator', async () => {
    // Rename row 1 to collide with row 0 ("To Do").
    host.array.at(1).controls.name.setValue('to do');
    host.array.updateValueAndValidity();
    // Let statusChanges flush and CD rerun.
    await flushAsync();
    fixture.detectChanges();

    const rows: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll(
      '.column-draft-list__row'
    );
    // The later index is flagged per validator contract (index 1 here).
    expect(rows[1].classList.contains('column-draft-list__row--duplicate')).toBe(
      true
    );
    expect(rows[0].classList.contains('column-draft-list__row--duplicate')).toBe(
      false
    );
  });

  it('disables every nested control when [disabled] is true (fieldset cascade)', () => {
    host.disabled.set(true);
    fixture.detectChanges();

    const fieldset: HTMLFieldSetElement = fixture.nativeElement.querySelector(
      '.column-draft-list'
    );
    expect(fieldset.disabled).toBe(true);

    const addBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.column-draft-list__add'
    );
    expect(addBtn.disabled).toBe(true);
  });

  it('interpolates the current name into the reorder button aria-labels', () => {
    const downButtons: NodeListOf<HTMLButtonElement> =
      fixture.nativeElement.querySelectorAll(
        '.column-draft-list__reorder--down'
      );
    expect(downButtons[0].getAttribute('aria-label')).toBe(
      "Move column 'To Do' down"
    );
  });

  it('interpolates the current name into the remove button aria-label', () => {
    const removeButtons: NodeListOf<HTMLButtonElement> =
      fixture.nativeElement.querySelectorAll('.column-draft-list__remove');
    expect(removeButtons[1].getAttribute('aria-label')).toBe(
      "Remove column 'In Progress'"
    );
  });
});
