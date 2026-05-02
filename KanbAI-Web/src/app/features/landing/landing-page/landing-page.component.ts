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
      id: 'project-dashboard',
      title: 'Project Dashboard',
      description: 'See all your projects in one place. Create new projects and open existing ones from a single overview.',
      icon: 'board'
    },
    {
      id: 'team-members',
      title: 'Team Members',
      description: 'Invite teammates to a project and manage who has access to it.',
      icon: 'team'
    },
    {
      id: 'secure-sign-in',
      title: 'Secure Sign-in',
      description: 'Email and password authentication keeps your projects behind a login.',
      icon: 'lock'
    },
    {
      id: 'ai-assistance',
      title: 'AI Assistance',
      description: 'AI-powered suggestions for planning your work are on the roadmap.',
      icon: 'ai',
      comingSoon: true
    }
  ]);

  onLoginClick(): void {
    this.router.navigate(['/login']);
  }

  onSignUpClick(): void {
    this.router.navigate(['/register'], { queryParams: { mode: 'register' } });
  }
}
