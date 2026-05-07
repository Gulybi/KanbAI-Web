import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  EnvironmentInjector,
  OnInit,
  ViewEncapsulation,
  computed,
  inject,
  runInInjectionContext,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DialogRef } from '@angular/cdk/dialog';

import { FormInputComponent } from '../../../auth/components/form-input/form-input.component';
import { FormButtonComponent } from '../../../auth/components/form-button/form-button.component';
import { ProjectCreationService } from '../../services/project-creation.service';
import { ProjectWithColumnsInput } from '../../services/project-creation.service';
import { whitespaceOnlyValidator } from '../../validators/whitespace.validator';
import {
  duplicateColumnNamesValidator,
  minColumnsValidator
} from '../../validators/column-array.validators';
import {
  ColumnDraftFormShape,
  DEFAULT_COLUMN_NAMES,
  buildColumnDraftGroup
} from './column-draft.model';
import { ColumnDraftListComponent } from '../column-draft-list/column-draft-list.component';
import {
  CreateProjectDialogResult,
  CreateProjectFormShape
} from './create-project-dialog.types';

/**
 * Modal form that captures Title + Description and an editable list of
 * initial columns, then submits them atomically (from the user's
 * perspective) to `ProjectCreationService.createProjectWithColumns`.
 *
 * ViewEncapsulation is disabled so that the `.create-project-dialog-panel`
 * class (applied by CDK to the overlay pane via `panelClass`) can be
 * styled from this component's stylesheet. Every selector in the SCSS is
 * prefixed with `.create-project-dialog-panel` or `:host` to prevent leaks.
 */
@Component({
  selector: 'app-create-project-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormInputComponent,
    FormButtonComponent,
    ColumnDraftListComponent
  ],
  templateUrl: './create-project-dialog.component.html',
  styleUrl: './create-project-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class CreateProjectDialogComponent implements OnInit {
  private readonly dialogRef =
    inject<DialogRef<CreateProjectDialogResult>>(DialogRef);
  private readonly projectCreation = inject(ProjectCreationService);
  private readonly appInjector = inject(EnvironmentInjector);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly submitting = signal<boolean>(false);
  protected readonly errorMessage = signal<string | null>(null);
  /** Names of columns whose POST failed after a successful project POST. */
  protected readonly partialFailureNames = signal<string[]>([]);
  /** Progress state for the phase-aware submit label + sr-only copy. */
  protected readonly creationPhase = signal<'idle' | 'project' | 'columns'>(
    'idle'
  );

  protected readonly form = new FormGroup<CreateProjectFormShape>({
    name: new FormControl<string>('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.maxLength(200),
        whitespaceOnlyValidator
      ]
    }),
    description: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.maxLength(500)]
    }),
    columns: this.buildColumnsArray()
  });

  protected readonly canSubmit = computed(
    () => !this.submitting() && !this.form.invalid
  );

  protected get nameControl(): FormControl<string> {
    return this.form.controls.name;
  }

  protected get descriptionControl(): FormControl<string> {
    return this.form.controls.description;
  }

  protected get columnsArray(): FormArray<FormGroup<ColumnDraftFormShape>> {
    return this.form.controls.columns;
  }

  ngOnInit(): void {
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.errorMessage() !== null) {
          this.errorMessage.set(null);
        }
      });
  }

  protected onCancel(): void {
    // Belt-and-braces: template disables Cancel while submitting, but
    // guard programmatic callers (e.g. Escape-key CDK closer).
    if (this.submitting()) {
      return;
    }
    this.dialogRef.close();
  }

  protected onSubmit(): void {
    if (this.submitting()) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const rawName = this.form.controls.name.value;
    const rawDescription = this.form.controls.description.value;
    const rawColumns = this.columnsArray.controls.map(
      g => g.controls.name.value
    );

    const input: ProjectWithColumnsInput = {
      name: rawName.trim(),
      description: rawDescription.trim().length === 0 ? null : rawDescription,
      columnNames: rawColumns.map(n => n.trim())
    };

    this.submitting.set(true);
    this.errorMessage.set(null);
    this.partialFailureNames.set([]);
    this.creationPhase.set('project');

    // Subscribe inside the application-root injector so the HTTP chain is
    // NOT cancelled if the dialog is destroyed mid-flight. The orchestrator's
    // internal side effects (state-service cache prepend; sequential column
    // POSTs) must complete regardless of dialog lifetime.
    runInInjectionContext(this.appInjector, () => {
      this.projectCreation.createProjectWithColumns(input).subscribe({
        next: result => {
          // Both 'success' and 'partial' close the dialog; the partial
          // payload is forwarded to the caller (dashboard) which renders
          // the PartialFailureToastComponent from the returned message.
          this.dialogRef.close(result);
        },
        error: (err: Error) => {
          this.submitting.set(false);
          this.creationPhase.set('idle');
          const message = err?.message;
          this.errorMessage.set(
            message && message.length > 0
              ? message
              : 'Something went wrong. Please try again.'
          );
        }
      });
    });
  }

  /**
   * Constructs the initial FormArray from DEFAULT_COLUMN_NAMES with the
   * array-level validators attached. Factored so tests can inspect it.
   */
  private buildColumnsArray(): FormArray<FormGroup<ColumnDraftFormShape>> {
    const groups = DEFAULT_COLUMN_NAMES.map(name => buildColumnDraftGroup(name));
    return new FormArray<FormGroup<ColumnDraftFormShape>>(groups, {
      validators: [minColumnsValidator, duplicateColumnNamesValidator]
    });
  }
}
