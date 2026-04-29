import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';

@Component({
  selector: 'app-form-input',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './form-input.component.html',
  styleUrl: './form-input.component.scss'
})
export class FormInputComponent {
  @Input() label: string = '';
  @Input() type: string = 'text';
  @Input() placeholder: string = '';
  @Input() multiline: boolean = false;
  @Input() required: boolean = false;
  @Input() rows: number = 4;
  @Input({required: true}) control!: FormControl;
  inputId: string = `input-${Math.random().toString(36).substring(2, 9)}`;

  get errorId(): string {
    return `${this.inputId}-error`;
  }

  get describedBy(): string | null {
    const c = this.control;
    if (c && c.invalid && (c.dirty || c.touched)) {
      return this.errorId;
    }
    return null;
  }
}
