// Checks every translation against en.json. Run with: npm run check:i18n
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'shared', 'i18n');
const read = file => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
const placeholders = text => (text.match(/\{\w+\}/g) || []).sort().join(' ');

const en = read('en.json');
let problems = 0;

for (const file of fs.readdirSync(directory).filter(name => name.endsWith('.json') && name !== 'en.json')) {
  const strings = read(file);
  const missing = Object.keys(en).filter(key => !(key in strings));
  const unknown = Object.keys(strings).filter(key => !(key in en));
  const wrongPlaceholders = Object.keys(strings).filter(key => key in en && placeholders(strings[key]) !== placeholders(en[key]));
  const done = Object.keys(en).length - missing.length;

  console.log(`${file}: ${done}/${Object.keys(en).length} translated`);
  // Missing text only falls back to English, so it is reported but does not fail the check
  if (missing.length) console.log(`  not translated yet: ${missing.join(', ')}`);
  for (const key of unknown) console.log(`  PROBLEM unknown key: ${key}`);
  for (const key of wrongPlaceholders) console.log(`  PROBLEM placeholders differ from English: ${key}`);
  problems += unknown.length + wrongPlaceholders.length;
}

process.exit(problems ? 1 : 0);
