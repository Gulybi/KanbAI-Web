import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FeatureHighlight } from '../../models/feature-highlight.interface';

@Component({
  selector: 'app-feature-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './feature-card.component.html',
  styleUrls: ['./feature-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FeatureCardComponent {
  @Input({ required: true }) feature!: FeatureHighlight;

  getIconSymbol(icon: string): string {
    const iconMap: Record<string, string> = {
      'board': '📊',
      'ai': '🤖',
      'team': '👥',
      'automation': '⚡'
    };
    return iconMap[icon] || '✨';
  }
}
