import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, '../../config.json');

const REQUIRED_FIELDS = ['figmaFileKey', 'pages', 'frames', 'diffProps'];

export function loadConfig(override) {
  const raw = override ?? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  for (const field of REQUIRED_FIELDS) {
    if (!raw[field]) throw new Error(`Missing required config field: ${field}`);
  }
  return raw;
}
