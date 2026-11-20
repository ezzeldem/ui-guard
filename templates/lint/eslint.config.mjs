// ui-guard ESLint flat config (angular-eslint). Lives in <project>/.ui-guard/lint/.
// The project root re-exports it (or merges it into an existing config — ui-guard asks first).
import angular from 'angular-eslint';
import tseslint from 'typescript-eslint';

const template = {
  '@angular-eslint/template/alt-text': 'warn', // ACCESS-02
  '@angular-eslint/template/elements-content': 'warn', // ACCESS-02
  '@angular-eslint/template/label-has-associated-control': 'warn', // ACCESS-01
  '@angular-eslint/template/click-events-have-key-events': 'warn', // ACCESS-05
  '@angular-eslint/template/interactive-supports-focus': 'warn', // ACCESS-05
  '@angular-eslint/template/no-positive-tabindex': 'warn', // ACCESS-05
  '@angular-eslint/template/valid-aria': 'warn', // ACCESS-03
  '@angular-eslint/template/role-has-required-aria': 'warn', // ACCESS-03
  '@angular-eslint/template/table-scope': 'warn', // ACCESS-04
  '@angular-eslint/template/no-autofocus': 'warn', // ACCESS-05
  '@angular-eslint/template/no-distracting-elements': 'warn', // ACCESS-04
  '@angular-eslint/template/button-has-type': 'warn', // ACCESS-04
};

export const uiGuardConfigs = [
  {
    files: ['**/*.ts'],
    ignores: ['**/*.spec.ts', '**/*.d.ts'],
    languageOptions: { parser: tseslint.parser },
    processor: angular.processInlineTemplates,
    rules: {
      'no-eval': 'error', // SAFE-03
      'no-implied-eval': 'error', // SAFE-03
      'no-new-func': 'error', // SAFE-03
      'no-console': 'warn', // SAFE-08
    },
  },
  {
    // Plain scripts (ASP.NET MVC wwwroot / Scripts, jQuery): the same SAFE rules as TypeScript.
    files: ['**/*.js'],
    ignores: ['**/*.min.js', '**/wwwroot/lib/**'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'script' },
    rules: {
      'no-eval': 'error', // SAFE-03
      'no-implied-eval': 'error', // SAFE-03
      'no-new-func': 'error', // SAFE-03
      'no-console': 'warn', // SAFE-08
    },
  },
  {
    files: ['**/*.html'],
    languageOptions: { parser: angular.templateParser },
    plugins: { '@angular-eslint/template': angular.templatePlugin },
    rules: template,
  },
];

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.angular/**', '**/coverage/**', '**/bin/**', '**/obj/**', '.ui-guard/**'] },
  ...uiGuardConfigs,
];
