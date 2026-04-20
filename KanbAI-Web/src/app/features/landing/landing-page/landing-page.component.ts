import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HeroSectionComponent } from '../components/hero-section/hero-section.component';
import { FeaturesSectionComponent } from '../components/features-section/features-section.component';
import { FeatureHighlight } from '../models/feature-highlight.interface';

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [CommonModule, HeroSectionComponent, FeaturesSectionComponent],
  templateUrl: './landing-page.component.html',
  styleUrls: ['./landing-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LandingPageComponent {
  private readonly router = inject(Router);

  features = signal<FeatureHighlight[]>([
    {
      id: 'realtime-kanban',
      title: 'Real-time Kanban Boards',
      description: 'Collaborate seamlessly with your team on dynamic boards that update instantly across all devices.',
      icon: 'board'
    },
    {
      id: 'ai-insights',
      title: 'AI-Driven Insights',
      description: 'Leverage machine learning to identify bottlenecks, predict sprint velocity, and optimize workflows.',
      icon: 'ai'
    },
    {
      id: 'team-collaboration',
      title: 'Team Collaboration',
      description: 'Built-in chat, mentions, and notifications keep your team aligned and productive.',
      icon: 'team'
    },
    {
      id: 'smart-automation',
      title: 'Smart Automation',
      description: 'Automate repetitive tasks with intelligent rules that adapt to your workflow patterns.',
      icon: 'automation'
    }
  ]);

  onLoginClick(): void {
    this.router.navigate(['/login']);
  }

  onSignUpClick(): void {
    // Route doesn't exist yet, navigate to login with query param or show message
    this.router.navigate(['/login'], { queryParams: { mode: 'register' } });
  }
}
