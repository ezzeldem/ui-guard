import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { routes } from './app/app.routes';
import { HeaderComponent } from './app/layout/header/header.component';

bootstrapApplication(HeaderComponent, { providers: [provideRouter(routes)] });
