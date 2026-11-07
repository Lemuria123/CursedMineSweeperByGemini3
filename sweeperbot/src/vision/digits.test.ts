/** 雷数模板能把自己认回来。实机截图若字体不同，更换 fixtures 里的 png。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { decodePng } from '../image';
import { readMineCounter } from './digits';

const dir = fileURLToPath(new URL('../../fixtures/', import.meta.url));

describe('readMineCounter', () => {
  for (let digit = 0; digit <= 9; digit++) {
    it(`认出模板 ${digit}`, () => {
      const image = decodePng(fs.readFileSync(path.join(dir, `${digit}.png`)));
      assert.equal(readMineCounter(image), digit);
    });
  }
});
