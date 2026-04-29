import { ChangeDetectionStrategy, Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'app-dashboard-empty-state',
  standalone: true,
  imports: [],
  templateUrl: './dashboard-empty-state.component.html',
  styleUrl: './dashboard-empty-state.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardEmptyStateComponent {
  @Output() createClick = new EventEmitter<void>();

  protected onCreateClick(): void {
    this.createClick.emit();
  }
}
