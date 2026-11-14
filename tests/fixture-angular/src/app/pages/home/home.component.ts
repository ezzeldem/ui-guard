import { Component } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

const apiKey = 'sk_live_abcdef1234567890XYZ';
const API_URL = 'http://api.example.com/v1';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  token = '';

  constructor(private translate: TranslateService) {}

  go(): void {
    const title = this.translate.instant('home.title');
    console.log(this.token, title, API_URL, apiKey);
    eval('1 + 1');
    window.open('https://example.com/help');
  }
}
