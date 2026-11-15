import { Routes } from '@angular/router';
import { UsersComponent } from './users/users.component';

export const ADMIN_ROUTES: Routes = [
  { path: '', redirectTo: 'users', pathMatch: 'full' },
  { path: 'users', component: UsersComponent },
];
