/**
 * 纯像素图。机器人只消费截图像素，不读取页面 DOM 里的棋盘状态。
 */
import { PNG } from 'pngjs';

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface RgbaImage {
  width: number;
  height: number;
  /** 每像素 4 字节，顺序 R G B A，行优先 */
  data: Buffer;
}

export function createImage(width: number, height: number, fill: RGB): RgbaImage {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = fill.r;
    data[i * 4 + 1] = fill.g;
    data[i * 4 + 2] = fill.b;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

export function getPixel(image: RgbaImage, x: number, y: number): RGB {
  const i = (y * image.width + x) * 4;
  return { r: image.data[i], g: image.data[i + 1], b: image.data[i + 2] };
}

export function setPixel(image: RgbaImage, x: number, y: number, color: RGB): void {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const i = (y * image.width + x) * 4;
  image.data[i] = color.r;
  image.data[i + 1] = color.g;
  image.data[i + 2] = color.b;
  image.data[i + 3] = 255;
}

export function fillRect(image: RgbaImage, x: number, y: number, w: number, h: number, color: RGB): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(image.width, x + w);
  const y1 = Math.min(image.height, y + h);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) setPixel(image, xx, yy, color);
  }
}

export function crop(image: RgbaImage, x: number, y: number, w: number, h: number): RgbaImage {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(image.width, x + w);
  const y1 = Math.min(image.height, y + h);
  const out = createImage(Math.max(1, x1 - x0), Math.max(1, y1 - y0), { r: 0, g: 0, b: 0 });
  for (let yy = 0; yy < out.height; yy++) {
    for (let xx = 0; xx < out.width; xx++) setPixel(out, xx, yy, getPixel(image, x0 + xx, y0 + yy));
  }
  return out;
}

export function decodePng(buffer: Buffer): RgbaImage {
  const png = PNG.sync.read(buffer);
  return { width: png.width, height: png.height, data: Buffer.from(png.data) };
}

export function encodePng(image: RgbaImage): Buffer {
  const png = new PNG({ width: image.width, height: image.height });
  image.data.copy(png.data);
  return PNG.sync.write(png);
}

/** 亮度，用来对齐截图和判断遮罩。 */
export function luma(color: RGB): number {
  return (color.r + color.g + color.b) / 3;
}

export function colorDist(a: RGB, b: RGB): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}
