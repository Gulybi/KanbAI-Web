import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  EnvironmentInjector,
  OnInit,
  ViewEncapsulation,
  inject,
  runInInjectionContext,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DialogRef } from '@angular/cdk/dialog';

import { FormInputComponent } from '../../../auth/components/form-input/form-input.component';
import { FormButtonComponent } from '../../../auth/components/form-button/form-button.component';
import { ProjectStateService } from '../../state/project-state.service';
import { ProjectInput } from '../../state/project-state.model';
import { whitespaceOnlyValidator } from '../../validators/whitespace.validator';
import {
  CreateProjectDialogResult,
  CreateProjectFormShape
} from './create-project-dialog.types';

/**
 * Modal form that captures Title + Description and submits to
 * `ProjectStateService.createProject`.
 *
 * ViewEncapsulation is disabled so that the `.create-project-dialog-panel`
 * class (applied by CDK to the overlay pane via `panelClass`) can be
 * styled from this component's stylesheet. Every selector in the SCSS is
 * prefixed with `.create-project-dialog-panel` or `:host` to prevent leaks.
 */
@Component({
  selector: 'app-create-project-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormInputComponent, FormButtonComponent],
  templateUrl: './create-project-dialog.component.html',
  styleUrl: './create-project-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class CreateProjectDialogComponent implements OnInit {
  private readonly dialogRef = inject<DialogRef<CreateProjectDialogResult>>(DialogRef);
  private readonly projectState = inject(ProjectStateService);
  private readonly appInjector = inject(EnvironmentInjector);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly submitting = signal<boolean>(false);
  protected readonly errorMessage = signal<string | null>(null);

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
    })
  });

  protected get nameControl(): FormControl<string> {
    return this.form.controls.name;
  }

  protected get descriptionControl(): FormControl<string> {
    return this.form.controls.description;
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

    const input: ProjectInput = {
      name: rawName.trim(),
      description: rawDescription.trim().length === 0 ? null : rawDescription
    };

    this.submitting.set(true);
    this.errorMessage.set(null);

    // Subscribe inside the application-root injector so the HTTP request is
    // NOT cancelled if the dialog is destroyed mid-flight. `ProjectStateService`'s
    // internal `tap()` updates the cache regardless of dialog lifetime.
    runInInjectionContext(this.appInjector, () => {
      this.projectState.createProject(input).subscribe({
        next: (created) => {
          this.dialogRef.close({ created });
        },
        error: (err: Error) => {
          this.submitting.set(false);
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
}
