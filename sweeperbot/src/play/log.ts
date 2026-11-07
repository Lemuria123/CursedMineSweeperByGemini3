/**
 * 把每一步和终局写成 jsonl，并把关键画面存成 png，方便事后对照。
 */
import fs from 'node:fs';
import path from 'node:path';
import { encodePng, type RgbaImage } from '../image';

export class SessionLog {
  readonly file: string;
  private readonly dir: string;

  constructor(logDir: string) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.dir = path.resolve(logDir);
    fs.mkdirSync(this.dir, { recursive: true });
    this.file = path.join(this.dir, `${stamp}.jsonl`);
  }

  event(data: Record<string, unknown>): void {
    const line = JSON.stringify({ t: new Date().toISOString(), ...data });
    fs.appendFileSync(this.file, `${line}\n`);
  }

  /** 返回写入的路径，调用方把它记进同一条终局记录。 */
  saveImage(name: string, image: RgbaImage): string {
    const file = path.join(this.dir, `${name}.png`);
    fs.writeFileSync(file, encodePng(image));
    return file;
  }
}
