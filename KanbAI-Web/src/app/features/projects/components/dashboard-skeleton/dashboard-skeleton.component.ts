import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';

@Component({
  selector: 'app-dashboard-skeleton',
  standalone: true,
  imports: [],
  templateUrl: './dashboard-skeleton.component.html',
  styleUrl: './dashboard-skeleton.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardSkeletonComponent {
  private readonly _count = signal(6);

  @Input()
  set count(value: number) {
    this._count.set(Math.max(0, value | 0));
  }
  get count(): number {
    return this._count();
  }

  protected readonly placeholders = computed(() => Array.from({ length: this._count() }));
}
