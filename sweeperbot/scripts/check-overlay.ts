import fs from 'node:fs';
import { decodePng } from '../src/image';
import { detectOverlay } from '../src/vision/overlay';
const img = decodePng(fs.readFileSync('logs/debug-difficulty/03-settings.png'));
console.log(JSON.stringify(detectOverlay(img), null, 2));
