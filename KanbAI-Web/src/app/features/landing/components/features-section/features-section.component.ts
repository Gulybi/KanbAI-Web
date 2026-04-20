import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FeatureHighlight } from '../../models/feature-highlight.interface';
import { FeatureCardComponent } from '../feature-card/feature-card.component';

@Component({
  selector: 'app-features-section',
  standalone: true,
  imports: [CommonModule, FeatureCardComponent],
  templateUrl: './features-section.component.html',
  styleUrls: ['./features-section.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FeaturesSectionComponent {
  @Input({ required: true }) features: FeatureHighlight[] = [];

  trackByFeatureId(index: number, item: FeatureHighlight): string {
    return item.id;
  }
}
