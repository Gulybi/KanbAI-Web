import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './core/layout/navbar/navbar.component';
import { ToastHostComponent } from './core/components/toast-host/toast-host.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavbarComponent, ToastHostComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('KanbAI-Web');
}
