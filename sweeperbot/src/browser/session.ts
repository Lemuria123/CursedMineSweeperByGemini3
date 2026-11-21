/**
 * 机器人自己的浏览器。只负责打开页面、截图和点击，不读游戏状态。
 */
import { chromium, type Browser, type CDPSession, type Page } from 'playwright';
import type { BotConfig } from '../config';
import { decodePng, type RgbaImage } from '../image';
import { installTemplates } from '../vision/digits';
import { withTimeout } from '../timeout';

export class GameSession {
  private inputSession: CDPSession | null = null;

  private constructor(
    private readonly browser: Browser,
    readonly page: Page,
  ) {}

  /** 复用一条调试通道，避免每次点击都新开连接。 */
  private async input(): Promise<CDPSession> {
    if (!this.inputSession) this.inputSession = await this.page.context().newCDPSession(this.page);
    return this.inputSession;
  }

  static async open(config: BotConfig): Promise<GameSession> {
    // 优先用 Playwright 自带的 Chromium。没装浏览器时改用本机 Chrome，这样不依赖额外下载也能跑。
    // 关掉 Chrome 的翻译条。页面里中英混排时它会弹出来，把整页往下顶，看起来像棋盘在抖。
    const options = {
      headless: config.headless,
      args: ['--disable-features=Translate,TranslateUI'],
    };
    let browser: Browser;
    try {
      browser = await chromium.launch(options);
    } catch {
      browser = await chromium.launch({ ...options, channel: 'chrome' });
    }
    const page = await browser.newPage({
      viewport: { width: config.viewportWidth, height: config.viewportHeight },
      deviceScaleFactor: 1,
      locale: 'zh-CN',
    });
    // 右键是插旗。这里只拦掉浏览器自己的菜单，避免菜单挡住下一手。
    // 光标和按下动画也关掉：鼠标在格子间跳、格子跟着下沉，看起来就是整盘在抖。
    await page.addInitScript(() => {
      window.addEventListener('contextmenu', (event) => event.preventDefault(), true);
      // 机器人连点时：光标乱跳、格子下沉、framer 缩放、整页被滚轮拖，看起来就像屏幕在抖。
      // 一律掐掉动画/过渡，并锁住滚动位置（需要拼图时再由 bot 显式 wheel）。
      const style = document.createElement('style');
      style.textContent = [
        'html, body, * { cursor: none !important; scroll-behavior: auto !important; }',
        '*, *::before, *::after { animation: none !important; transition: none !important; }',
        '.cell-body, .cell-body:active, [data-cell], [data-cell] * { transform: none !important; }',
        'html, body { overflow: hidden !important; }',
      ].join(' ');
      document.documentElement.appendChild(style);
      const lockScroll = () => { window.scrollTo(0, 0); };
      lockScroll();
      window.addEventListener('scroll', lockScroll, true);
    });
    if (config.offline) {
      // 游戏页面写死了 localhost:38001。沙盒只提供前端快照，这些请求不能落到正在改的 API 上。
      await page.route('**/*', (route) => {
        const url = route.request().url();
        if (/^https?:\/\/(localhost|127\.0\.0\.1):38001\b/.test(url)) return route.abort();
        return route.continue();
      });
    }
    return new GameSession(browser, page);
  }

  async learnCounterFont(): Promise<boolean> {
    const page = await this.browser.newPage({
      viewport: { width: 420, height: 80 },
      deviceScaleFactor: 1,
    });
    try {
      // 与标题栏相同：font-mono、text-2xl、font-bold、text-red-400。每个数字单独一块，避免粘连。
      const spans = Array.from({ length: 10 }, (_, digit) => (
        `<span style="display:inline-block;font:700 24px Consolas,ui-monospace,monospace;color:#f87171;background:#020617;padding:6px 8px">${digit}</span>`
      )).join('');
      await page.setContent(`<!doctype html><body style="margin:0;background:#020617">${spans}</body>`);
      const image = decodePng(await page.screenshot({ type: 'png' }));
      return installTemplates(image);
    } finally {
      await page.close();
    }
  }

  async goto(url: string): Promise<void> {
    try {
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`打不开 ${url}。请先另开一个终端把游戏跑起来（在仓库根目录 npm run dev）。${message}`);
    }
  }

  async screenshot(): Promise<RgbaImage> {
    // CDP 截图；页面主线程卡死时必须超时，否则整批对局会静默冻住。
    return withTimeout((async () => {
      const cdp = await this.input();
      const metrics = await cdp.send('Page.getLayoutMetrics');
      const view = metrics.cssVisualViewport ?? metrics.visualViewport;
      const cssWidth = metrics.cssContentSize?.width ?? view.clientWidth;
      const deviceWidth = metrics.contentSize?.width ?? cssWidth;
      const deviceScale = cssWidth > 0 ? deviceWidth / cssWidth : 1;
      const shot = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
        clip: {
          x: view.pageX ?? 0,
          y: view.pageY ?? 0,
          width: view.clientWidth,
          height: view.clientHeight,
          scale: 1 / deviceScale,
        },
      });
      return decodePng(Buffer.from(shot.data, 'base64'));
    })(), 15000, 'screenshot');
  }

  async click(x: number, y: number, button: 'left' | 'right' = 'left'): Promise<void> {
    await withTimeout((async () => {
      const cdp = await this.input();
      const name = button === 'right' ? 'right' : 'left';
      const buttons = button === 'right' ? 2 : 1;
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mousePressed', x, y, button: name, buttons, clickCount: 1,
      });
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased', x, y, button: name, buttons: 0, clickCount: 1,
      });
    })(), 8000, 'click');
  }

  async wheel(x: number, y: number, deltaY: number): Promise<void> {
    await withTimeout((async () => {
      const cdp = await this.input();
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel', x, y, deltaX: 0, deltaY,
      });
    })(), 8000, 'wheel');
  }

  async close(): Promise<void> {
    await this.inputSession?.detach().catch(() => undefined);
    this.inputSession = null;
    await this.browser.close();
  }
}
