import { Component, Input } from '@angular/core';
import {CommonModule} from '@angular/common';

@Component({
  selector: 'app-form-button',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './form-button.component.html',
  styleUrl: './form-button.component.scss'
})
export class FormButtonComponent {
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() disabled:boolean = false;
  @Input() fullWidth:boolean = false;
}
