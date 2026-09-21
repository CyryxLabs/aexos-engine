'use strict';

const path = require('path');
const fs = require('fs');
const {
  TRANSLATIONS,
  getLanguage,
  getLanguageChoices,
  setLanguage,
  t,
  tf,
} = require('../../packages/installer/src/wizard/i18n');
const { getLanguageQuestion } = require('../../packages/installer/src/wizard/questions');

function placeholders(value) {
  return [...String(value).matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).sort();
}

describe('installer localized runtime contract', () => {
  afterEach(() => setLanguage('en'));

  test.each(['pt', 'es'])('%s exposes every English key with matching placeholders', (locale) => {
    expect(Object.keys(TRANSLATIONS[locale]).sort()).toEqual(Object.keys(TRANSLATIONS.en).sort());
    for (const key of Object.keys(TRANSLATIONS.en)) {
      expect(placeholders(TRANSLATIONS[locale][key])).toEqual(placeholders(TRANSLATIONS.en[key]));
    }
  });

  test.each([
    ['pt', 'Selecione o idioma:', 'Instalação Completa!'],
    ['es', 'Seleccione idioma:', '¡Instalación Completa!'],
  ])('setLanguage(%s) selects translated installer text', (locale, languagePrompt, complete) => {
    setLanguage(locale);
    expect(getLanguage()).toBe(locale);
    expect(t('selectLanguage')).toBe(languagePrompt);
    expect(t('installComplete')).toBe(complete);
    expect(tf('proIncorrectPassword', { remaining: 2 })).toContain('2');
  });

  test('language question offers the three implemented locales', () => {
    expect(getLanguageChoices()).toEqual([
      { name: 'English', value: 'en' },
      { name: 'Português', value: 'pt' },
      { name: 'Español', value: 'es' },
    ]);
    expect(getLanguageQuestion().choices).toEqual(getLanguageChoices());
  });

  test.each(['pt', 'es'])('%s preserves current AEXOS product commands and endpoints', (locale) => {
    const translations = Object.values(TRANSLATIONS[locale]).join('\n');
    expect(translations).toContain('npx @aexos/core init');
    expect(translations).toContain('npx @aexos/core pro setup');
    expect(translations).toContain('npx -y @aexos/pro-cli@latest recover');
    expect(translations).toContain('https://pro.cyryx.ai');
    expect(translations).toContain('https://aexos-license-server.vercel.app/reset-password');
    expect(translations).not.toMatch(/AIOX|@aiox|aiox-core|synkra\.ai|SynkraAI|AIOX_PRO/);
  });

  test('localized runtime is included by the package files contract', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'package.json')));
    expect(packageJson.files).toContain('packages/');
    expect(fs.existsSync(path.resolve(__dirname, '..', '..', 'packages/installer/src/wizard/i18n.js'))).toBe(true);
  });
});
