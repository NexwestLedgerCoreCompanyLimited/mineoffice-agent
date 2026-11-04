# Contributing to MineOffice

## Translating

MineOffice ships in English and Thai. Adding a language takes no programming, and a partial translation is welcome: anything you leave out shows in English.

1. Open an issue with the **Translate MineOffice** template, so nobody else starts the same language.
2. Copy `src/shared/i18n/en.json` to `src/shared/i18n/<code>.json`, using the language's [two-letter code](https://en.wikipedia.org/wiki/List_of_ISO_639_language_codes), such as `ja.json`.
3. Translate the text on the right of each line. Do not change the keys on the left.
4. Keep anything in curly braces exactly as it is. In `"Tasks finished: {count}"`, `{count}` is replaced with a number, and you may move it wherever your language needs it.
5. Add your language to `src/shared/i18n/index.ts`:

   ```ts
   import ja from './ja.json';
   ```

   ```ts
   { code: 'ja', name: '日本語', strings: ja }
   ```

6. Run this, which checks for mistakes and shows what is left to translate:

   ```bash
   npm run check:i18n
   ```

7. Run `npm run build`, then `run.bat`, and pick your language at the bottom of the sidebar to see how it looks. Long words can wrap differently, so please look through each page.
8. Open a pull request.

What stays in English on purpose: names of the agents, and the prompts sent to AI models, which live in code rather than in these files.

## Reporting a wrong translation

Open an issue with the same template, and say where you saw it, what it says, and what it should say.

## License of your contribution

MineOffice uses the [MineOffice Business License](LICENSE). By sending a contribution you agree it is covered by that license, as section 5 explains. Please only send work you have the right to give.
