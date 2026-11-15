import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { NoConnectionComponent } from './pages/no-connection/no-connection.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'no-connection', component: NoConnectionComponent },
  { path: 'admin', loadChildren: () => import('./pages/admin/admin.routes').then((m) => m.ADMIN_ROUTES) },
  { path: 'grid', loadComponent: () => import('./pages/grid/grid.component').then((m) => m.GridComponent) },
];
