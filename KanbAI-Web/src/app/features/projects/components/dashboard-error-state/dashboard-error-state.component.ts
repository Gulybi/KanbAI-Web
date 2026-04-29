import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-dashboard-error-state',
  standalone: true,
  imports: [],
  templateUrl: './dashboard-error-state.component.html',
  styleUrl: './dashboard-error-state.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardErrorStateComponent {
  @Input({ required: true }) message!: string;
  @Output() retry = new EventEmitter<void>();

  protected onRetry(): void {
    this.retry.emit();
  }
}
