/**
 * v2.0：为 324 个宝物获取 500×500 透明底 PNG 图标
 *
 * 搜索策略（v2.0 重写）：
 *   1. MediaWiki API — 直接从游戏 Wiki 获取物品信息框原图（最精准）
 *   2. Google Images — Wiki 拿不到时的回退方案
 *   完全移除 Bing/DDG 搜索引擎，它们返回的游戏物品匹配率极低
 *
 * 用法：
 *   set HTTPS_PROXY=http://127.0.0.1:10808 && node scripts/artifacts/fetch-real-icons.mjs [--start=N] [--end=N] [--slugs=x,y]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import https from 'https';
import http from 'http';
import { HttpsProxyAgent } from 'https-proxy-agent';
import initSqlJs from '../../server/node_modules/sql.js/dist/sql-wasm.js';

// ═══════════ 重定向所有日志到 stderr，stdout 只输出 CANDIDATES JSON ═══════════
// 避免日志与结构化输出混在一起导致父进程解析串货
const originalLog = console.log;
console.log = (...args) => process.stderr.write(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ') + '\n');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const RESOURCE_ICONS = path.join(ROOT, 'resource/icons');
const PUBLIC_ICONS = path.join(ROOT, 'public/icons');
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'server/data/cursed.db');

const args = process.argv.slice(2);
const START = parseInt(args.find(a => a.startsWith('--start='))?.split('=')[1] || '0', 10);
const END = parseInt(args.find(a => a.startsWith('--end='))?.split('=')[1] || '999', 10);
/** 按精确 slug 列表过滤（逗号分隔），只处理这些宝物，提升单件重找/补图速度 */
const SLUGS_FILTER = args.find(a => a.startsWith('--slugs='))?.split('=')[1]?.split(',').filter(Boolean).map(s => s.trim()) || null;
/** 按 rows-cols 坐标过滤（逗号分隔），如 9×20 → "9-20"；比 slug 更精确，避免占位图 slug 碰撞 */
const COORDS_FILTER = args.find(a => a.startsWith('--coords='))?.split('=')[1]?.split(',').filter(Boolean).map(s => s.trim()) || null;
// --retry：此宝物之前搜过一次以上，应改变搜索策略避免返回相同结果
const IS_RETRY = args.includes('--retry');
// --exclude-urls：重搜时排除之前出现过的图片 URL（空格分隔），防止反复返回相同候选
const EXCLUDE_URLS = new Set(
  (args.find(a => a.startsWith('--exclude-urls='))?.split('=')[1] || '')
    .split(/\s+/)
    .filter(u => u.startsWith('http'))
);

/** 处理后的目标尺寸 */
const ICON_SIZE = 500;

/** 通过环境变量读取代理配置 */
const PROXY_URL = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || '';
/** 代理 agent 实例（存在代理 URL 时创建，否则为 null 走直连） */
const proxyAgent = PROXY_URL ? new HttpsProxyAgent(PROXY_URL) : null;

/** 通用的 User-Agent，模拟 Chrome 浏览器 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

console.log(`[fetch-real-icons v2.0] 共 324 个宝物，目标 ${ICON_SIZE}×${ICON_SIZE} 透明 PNG`);
if (proxyAgent) {
  console.log(`[fetch-real-icons v2.0] 使用代理: ${PROXY_URL}\n`);
} else {
  console.log(`[fetch-real-icons v2.0] 直连模式（未设置 HTTPS_PROXY）\n`);
}

// ════════════════════════ HTTP 工具 ════════════════════════

/**
 * 通用 HTTP/HTTPS GET 请求，跟随重定向（最多 3 次），自动收集和传递 Cookie
 * 当设置了 proxyAgent 时，自动通过代理连接
 * @param {string} urlStr - 目标 URL
 * @param {number} [timeout=15000] - 超时毫秒
 * @param {object} [extraHeaders={}] - 额外的请求头
 * @param {number} [redirects=0] - 当前重定向次数（内部用）
 * @param {string} [cookie=''] - 本次请求携带的 Cookie 字符串（内部用）
 * @returns {Promise<{body: Buffer, cookies: string}>} body 为响应体，cookies 为累积的 Cookie
 */
function httpGet(urlStr, timeout = 15000, extraHeaders = {}, redirects = 0, cookie = '') {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const mod = url.protocol === 'https:' ? https : http;
    const headers = {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,image/avif,image/webp,*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      ...extraHeaders,
    };
    // 如果有积累的 Cookie，自动带上
    if (cookie) { headers['Cookie'] = cookie; }
    const options = { timeout, headers };
    // 如果有代理，将 agent 注入请求选项
    if (proxyAgent) { options.agent = proxyAgent; }
    const req = mod.get(urlStr, options, (res) => {
      // 从响应头收集 Set-Cookie 并合并到 cookie 变量
      let mergedCookie = cookie;
      if (res.headers['set-cookie']) {
        const setCookies = Array.isArray(res.headers['set-cookie']) ? res.headers['set-cookie'] : [res.headers['set-cookie']];
        for (const sc of setCookies) {
          const kv = sc.split(';')[0]; // 只取 key=value，不要 Path/HttpOnly 等
          const [k] = kv.split('=');
          // 覆盖同名 cookie
          const re = new RegExp(`(^|;\\s*)${k}=[^;]*`);
          if (mergedCookie.match(re)) {
            mergedCookie = mergedCookie.replace(re, `$1${kv}`);
          } else {
            mergedCookie = mergedCookie ? `${mergedCookie}; ${kv}` : kv;
          }
        }
      }
      // 跟随重定向（把 Cookie 带过去）
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 3) {
        const newUrl = new URL(res.headers.location, urlStr).href;
        httpGet(newUrl, timeout, extraHeaders, redirects + 1, mergedCookie).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ body: Buffer.concat(chunks), cookies: mergedCookie }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

/** 简化版：只返回 body Buffer，不关心 Cookie（向后兼容） */
async function httpGetBody(urlStr, timeout, extraHeaders) {
  const r = await httpGet(urlStr, timeout, extraHeaders);
  return r.body;
}

// ════════════════════════ 图片搜索引擎 ════════════════════════

/** 垃圾域名黑名单：新闻站、素材图库、AI 生成站、旅游/电商 — 绝对不可能有游戏道具图 */
const BAD_DOMAINS = [
  'sinaimg.cn', 'sina.com.cn', 'sohu.com', '163.com', 'ifeng.com',
  '699pic.com', 'nipic.com', 'quanjing.com', 'veer.com', 'shutterstock', 'istock', 'gettyimages', 'dreamstime', '123rf.com', 'stock.', 'fotolia',
  'miaobi', 'aigc', 'midjourney', 'stablediffusion', 'openai', 'dall-e',
  'ctrip.com', 'qunar.com', 'mafengwo', 'tuniu.com',
  'jd.com', 'taobao', 'tmall', '1688.com', 'alicdn.com', 'aliexpress',
  'dljs.net', 'desk.', 'wallpaper', 'bzzi', 'bizhi',
  'imgs.rednet.cn', 'k.sinaimg.cn', 'n.sinaimg.cn', 'nimg.ws.126.net',
  'youimg', 'selfimg', 'fuhuang.cn', 'vogue', 'quword',
  'bdstatic.com', 'bdimg.share',
  // 国内新闻/政府/宣传/党校/党建网站 — 绝不会有游戏道具图
  'people.com.cn', 'xinhuanet', 'cctv.com', 'china.com.cn', 'gmw.cn', 'youth.cn', 'cpc.', 'qstheory', 'gov.cn', 'dangjian', 'xuexi.cn', '12371.cn', 'zzb.', 'zgdsw', 'dsb.',
  // 更多垃圾素材/SEO 站
  'ui.cn', 'zcool.com', 'huaban.com', 'tuchong.com', '58pic.com', 'tooopen.com', 'photophoto.cn', 'cc0.cn', 'pexels', 'unsplash', 'pixabay', 'freepik', 'vecteezy', 'pngtree', 'pngwing', 'cleanpng', 'stickpng', 'kindpng', 'favpng', 'seekpng',
];

function isBadDomain(url) {
  try { return BAD_DOMAINS.some(d => new URL(url).hostname.toLowerCase().includes(d)); } catch { return false; }
}

/** 优质域名：游戏 Wiki、Steam CDN、Imgur 等 */
const GOOD_DOMAINS = [
  'fandom.com', 'gamepedia.com', 'wikia.com', 'wiki.gg',
  'steamstatic.com', 'steamcdn.com', 'steampowered.com', 'cdn.akamai.steamstatic.com',
  'imgur.com', 'redd.it', 'redditmedia.com',
  'deviantart.net', 'artstation.com',
];

function isGoodDomain(url) {
  try { return GOOD_DOMAINS.some(d => new URL(url).hostname.toLowerCase().includes(d)); } catch { return false; }
}

/**
 * Bing Images 搜图 — 解析 Bing 图片搜索结果页提取原图 URL
 * Bing 对爬虫相对宽容，作为 Wiki API 拿不到图片时的回退渠道
 */
async function searchBingImages(query, count = 10) {
  try {
    const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1`;
    const res = await httpGet(url, 15000, {
      'Accept': 'text/html,application/xhtml+xml,*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Referer': 'https://www.bing.com/',
    });
    const body = res.body.toString('utf8');

    // Bing 在 HTML 中内嵌的图片 URL 模式，所有引号都是 HTML 实体 &quot;
    // 格式: &quot;murl&quot;:&quot;https://...&quot; 或 &quot;mediaurl&quot;:&quot;https://...&quot;
    const imageUrls = new Set();

    // 方法1: 匹配 murl 字段（原图地址）
    const murlMatches = body.match(/&quot;murl&quot;:&quot;(https?:\/\/[^&]+)/g);
    if (murlMatches) {
      for (const m of murlMatches) {
        const u = m.replace(/&quot;murl&quot;:&quot;/, '');
        if (!u || u.startsWith('data:') || u.includes('bing.com') || u.includes('th?id=')) continue;
        if (isBadDomain(u)) continue;
        imageUrls.add(u);
      }
    }

    // 方法2: 匹配 mediaurl 字段（备选原图）
    const mediaurlMatches = body.match(/&quot;mediaurl&quot;:&quot;(https?:\/\/[^&]+)/g);
    if (mediaurlMatches) {
      for (const m of mediaurlMatches) {
        const u = m.replace(/&quot;mediaurl&quot;:&quot;/, '');
        if (!u || u.startsWith('data:') || u.includes('bing.com') || u.includes('th?id=')) continue;
        if (isBadDomain(u)) continue;
        imageUrls.add(u);
      }
    }

    const goodUrls = [];
    const normalUrls = [];
    for (const u of imageUrls) {
      if (isGoodDomain(u)) { goodUrls.push(u); } else { normalUrls.push(u); }
    }
    console.log(`  [bing] 提取 ${goodUrls.length + normalUrls.length} 个（优质 ${goodUrls.length}）`);
    return [...goodUrls, ...normalUrls].slice(0, count);
  } catch (e) {
    console.log(`  [bing] ${e.message?.substring(0, 60)}`);
    return [];
  }
}

/**
 * DuckDuckGo Images 搜图 — 解析 DDG 图片搜索结果页提取原图 URL
 */
async function searchDuckDuckGoImages(query, count = 10) {
  try {
    const url = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`;
    const res = await httpGet(url, 15000, {
      'Accept': 'text/html,*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    });
    const body = res.body.toString('utf8');
    const urls = new Set();
    const matches = body.match(/https?:\/\/[^"'\s<>\]]+\.(?:png|jpg|jpeg|webp)/gi);
    if (matches) {
      for (const m of matches) {
        if (m.includes('duckduckgo.com') || m.includes('favicon') || isBadDomain(m)) continue;
        urls.add(m);
      }
    }
    const arr = [...urls].slice(0, count);
    console.log(`  [ddg] 提取 ${arr.length} 个`);
    return arr;
  } catch (e) {
    console.log(`  [ddg] ${e.message?.substring(0, 60)}`);
    return [];
  }
}

/**
 * Google Images 搜图 — 解析 Google 图片搜索结果页
 */
async function searchGoogleImages(query, count = 10) {
  try {
    const url = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
    const res = await httpGet(url, 15000, {
      'Accept': 'text/html,*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    });
    const body = res.body.toString('utf8');
    const urls = new Set();
    const matches = body.match(/https?:\/\/[^"'\s<>\]]+\.(?:png|jpg|jpeg|webp)/gi);
    if (matches) {
      for (const m of matches) {
        if (m.includes('google.com') || m.includes('gstatic.com') || m.includes('favicon') || isBadDomain(m)) continue;
        urls.add(m);
      }
    }
    const arr = [...urls].slice(0, count);
    console.log(`  [google] 提取 ${arr.length} 个`);
    return arr;
  } catch (e) {
    console.log(`  [google] ${e.message?.substring(0, 60)}`);
    return [];
  }
}

// ═══════ 游戏 Wiki 域名映射：游戏 IP → 对应的资料站域名，定向搜索 ═══════
const GAME_WIKI_MAP = {
  '我的世界': 'minecraft.wiki',
  'minecraft': 'minecraft.wiki',
  '空洞骑士': 'hollowknight.wiki',
  'hollowknight': 'hollowknight.wiki',
  '只狼': 'sekiro.fandom.com',
  'sekiro': 'sekiro.fandom.com',
  '黑暗之魂': 'darksouls.fandom.com',
  'darksouls': 'darksouls.fandom.com',
  '血源诅咒': 'bloodborne.fandom.com',
  'bloodborne': 'bloodborne.fandom.com',
  '艾尔登法环': 'eldenring.fandom.com',
  'eldenring': 'eldenring.fandom.com',
  '星露谷物语': 'stardewvalleywiki.com',
  'stardew': 'stardewvalleywiki.com',
  '泰拉瑞亚': 'terraria.fandom.com',
  'terraria': 'terraria.fandom.com',
  '饥荒': 'dontstarve.fandom.com',
  'dontstarve': 'dontstarve.fandom.com',
  '以撒的结合': 'bindingofisaac.fandom.com',
  'boi': 'bindingofisaac.fandom.com',
  '明日方舟': 'arknights.fandom.com',
  'arknights': 'arknights.fandom.com',
  '原神': 'genshin-impact.fandom.com',
  'genshin': 'genshin-impact.fandom.com',
  '崩坏': 'honkai-star-rail.fandom.com',
  '最终幻想': 'finalfantasy.fandom.com',
  'finalfantasy': 'finalfantasy.fandom.com',
  'dq': 'dragonquest.fandom.com',
  '勇者斗恶龙': 'dragonquest.fandom.com',
  '塞尔达': 'zelda.fandom.com',
  'zelda': 'zelda.fandom.com',
  '魔兽世界': 'wowpedia.fandom.com',
  'wow': 'wowpedia.fandom.com',
  '暗黑破坏神': 'diablo.fandom.com',
  'diablo': 'diablo.fandom.com',
  'cs:go': 'counterstrike.fandom.com',
  '文明': 'civilization.fandom.com',
  '生化危机': 'residentevil.fandom.com',
  'residentevil': 'residentevil.fandom.com',
  '上古卷轴': 'elderscrolls.fandom.com',
  'skyrim': 'elderscrolls.fandom.com',
  '辐射': 'fallout.fandom.com',
  'fallout': 'fallout.fandom.com',
  '命运': 'destiny.fandom.com',
  'destiny': 'destiny.fandom.com',
  '宝可梦': 'bulbapedia.bulbagarden.net',
  'pokemon': 'bulbapedia.bulbagarden.net',
  '怪物猎人': 'monsterhunter.fandom.com',
  'mh': 'monsterhunter.fandom.com',
  '鬼泣': 'devilmaycry.fandom.com',
  'dmc': 'devilmaycry.fandom.com',
  '生化奇兵': 'bioshock.fandom.com',
  '质量效应': 'masseffect.fandom.com',
  '龙腾世纪': 'dragonage.fandom.com',
  '仁王': 'nioh.fandom.com',
  'nioh': 'nioh.fandom.com',
  '环世界': 'rimworldwiki.com',
  'rimworld': 'rimworldwiki.com',
  '哈迪斯': 'hades.fandom.com',
  'hades': 'hades.fandom.com',
  '死亡细胞': 'deadcells.fandom.com',
  'deadcells': 'deadcells.fandom.com',
  '蔚蓝': 'celestegame.fandom.com',
  'celeste': 'celestegame.fandom.com',
  '旺达与巨像': 'teamico.fandom.com',
  'sotc': 'teamico.fandom.com',
  '旺达': 'teamico.fandom.com',
  '杀出重围': 'deusex.fandom.com',
  'deusex': 'deusex.fandom.com',
};

// ════════════════════════ Wiki API：直接获取物品页面信息框图片 ════════════════════════

/**
 * MediaWiki pageimages API — 获取 wiki 页面主图（信息框图片原件）
 */
async function fetchWikiPageImage(wikiDomain, pageName) {
  const urls = [];
  try {
    const apiUrl = `https://${wikiDomain}/api.php?action=query&titles=${encodeURIComponent(pageName)}&prop=pageimages&format=json&piprop=original|thumbnail&pithumbsize=500`;
    const body = (await httpGet(apiUrl, 10000, {
      'Accept': 'application/json',
      'User-Agent': 'CursedMinesweeper/1.0 (bot; image resource collection)',
    })).body.toString('utf8');
    const data = JSON.parse(body);
    if (data.query && data.query.pages) {
      for (const page of Object.values(data.query.pages)) {
        if (page.original && page.original.source) {
          const src = page.original.source;
          if (src && !isBadDomain(src)) {
            urls.push(src);
            console.log(`    Wiki API: ✓ ${src.substring(0, 80)}`);
          }
        }
        if (page.thumbnail && page.thumbnail.source) {
          const src = page.thumbnail.source;
          if (src && !isBadDomain(src) && !urls.includes(src)) urls.push(src);
        }
      }
    }
  } catch (e) {
    console.log(`    Wiki API: ${e.message?.substring(0, 60)}`);
  }
  return urls;
}

/**
 * 通过 MediaWiki parse API 获取物品页面中信息框内的所有图片 URL
 * 取代直接页面抓取，避免 Fandom/minecraft.wiki 的 WAF/403 拦截
 * 使用批量 imageinfo 查询一次获取多个图片 URL
 * @param {string} wikiDomain - wiki 域名
 * @param {string} pageName - 页面名（下划线格式）
 * @param {string} itemNameEn - 物品英文名，用于文件名相关性过滤（防收其他道具图）
 */
async function scrapeWikiPageImages(wikiDomain, pageName, itemNameEn = '') {
  const urls = new Set();
  const pageSlug = pageName.replace(/ /g, '_');
  const wikiUA = 'CursedMinesweeper/1.0 (bot; image resource collection)';
  
  // 从物品英文名拆出关键词，用于过滤 wiki 页面上的无关图片
  // 例：itemNameEn = "Golden Strawberry" → keywords = ["golden", "strawberry"]
  const itemKeywords = itemNameEn.toLowerCase().replace(/['']/g, '').split(/[\s_-]+/).filter(k => k.length >= 3);
  
  try {
    // 1. parse API 获取页面所有图片标题（一次调用，快）
    const parseUrl = `https://${wikiDomain}/api.php?action=parse&page=${encodeURIComponent(pageSlug)}&prop=images&format=json`;
    const parseBody = (await httpGet(parseUrl, 10000, {
      'Accept': 'application/json',
      'User-Agent': wikiUA,
    })).body.toString('utf8');
    const parseData = JSON.parse(parseBody);
    if (!parseData.parse || !parseData.parse.images) {
      return [];
    }
    const allTitles = [...parseData.parse.images];
    console.log(`    Parse: ${allTitles.length} 张图`);

    // 2. 过滤：只留 png/jpg/gif/jpeg，跳过 SVG/音频/UI 装饰，
    //    额外检查文件名是否与物品名相关（防止收导航图标、其他道具图）
    const relevant = allTitles.filter(t => {
      const l = t.toLowerCase();
      if (!l.startsWith('file:')) return false;
      if (l.endsWith('.svg') || l.endsWith('.ogg') || l.endsWith('.ogv') || l.endsWith('.mp3') || l.endsWith('.wav')) return false;
      if (/(favicon|wikia-wordmark|wiki-wordmark|community-header|site-background|site-logo|skin-|cursor-|pixel-|spacer|icon-.*-\d+x\d+|stub_icon|play_button|badge|avatar)/i.test(l)) return false;
      // 文件名相关性检查：至少包含一个物品名关键词
      if (itemKeywords.length > 0) {
        const hasKeyword = itemKeywords.some(kw => l.includes(kw));
        if (!hasKeyword) return false;
      }
      return true;
    });
    if (relevant.length === 0) return [];

    // 3. 批量查询 imageinfo（每批 10 个 title，用 | 连接）
    const BATCH_SIZE = 10;
    const batches = [];
    for (let i = 0; i < relevant.length && i < 30; i += BATCH_SIZE) {
      batches.push(relevant.slice(i, i + BATCH_SIZE));
    }
    
    for (const batch of batches) {
      try {
        const titles = batch.map(t => encodeURIComponent(t)).join('|');
        const infoUrl = `https://${wikiDomain}/api.php?action=query&titles=${titles}&prop=imageinfo&iiprop=url&format=json`;
        const infoBody = (await httpGet(infoUrl, 8000, {
          'Accept': 'application/json',
          'User-Agent': wikiUA,
        })).body.toString('utf8');
        const infoData = JSON.parse(infoBody);
        if (infoData.query && infoData.query.pages) {
          for (const page of Object.values(infoData.query.pages)) {
            if (page.imageinfo && page.imageinfo[0] && page.imageinfo[0].url) {
              const src = page.imageinfo[0].url;
              if (!isBadDomain(src)) urls.add(src);
            }
          }
        }
      } catch (e) {
        // 单批失败不影响整体
      }
    }
    console.log(`    Wiki 页面关联图片: ${urls.size} 个`);
  } catch (e) {
    console.log(`    Wiki 页面: ${e.message?.substring(0, 80)}`);
  }
  return [...urls];
}

/**
 * Wiki search API：当页面名不精确匹配时，搜索最接近的页面标题
 */
async function searchWikiPages(wikiDomain, query) {
  try {
    const url = `https://${wikiDomain}/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json`;
    const body = (await httpGet(url, 8000, {
      'Accept': 'application/json',
      'User-Agent': 'CursedMinesweeper/1.0 (bot; image resource collection)',
    })).body.toString('utf8');
    const data = JSON.parse(body);
    const titles = [];
    if (data.query && data.query.search) {
      for (const r of data.query.search) {
        titles.push(r.title);
      }
    }
    return titles;
  } catch (e) {
    return [];
  }
}
// ════════════════════════ 主流程 ════════════════════════

async function main() {
  let allItems;

  // 统一从 SQLite DB 读取完整宝物信息（name + name_en + source_ip），确保搜索词有游戏上下文
  const SQL = await initSqlJs();
  const dbBuf = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(dbBuf);
  const dbRows = db.exec(`SELECT rows, cols, name, name_en, source_ip, icon FROM reward_templates ORDER BY rows, cols`);
  db.close();

  if (!dbRows.length) throw new Error('DB 无数据');

  // 解析所有宝物条目
  const fullItems = dbRows[0].values.map(r => {
    const slug = (r[5] || '').replace('/icons/', '').replace('.png', '');
    return { slug, name: r[2], nameEn: r[3] || r[2], ip: r[4] || '', rows: r[0], cols: r[1] };
  });

  // 若指定了 --coords=，按 rows-cols 坐标精确筛选（比 slug 更可靠，避免占位图 slug 碰撞）
  if (COORDS_FILTER && COORDS_FILTER.length > 0) {
    console.log(`[fetch-real-icons v3.0] 仅处理指定坐标: ${COORDS_FILTER.join(', ')}`);
    allItems = fullItems.filter(item => COORDS_FILTER.includes(`${item.rows}-${item.cols}`));
  } else if (SLUGS_FILTER && SLUGS_FILTER.length > 0) {
    console.log(`[fetch-real-icons v3.0] 仅处理指定宝物: ${SLUGS_FILTER.join(', ')}`);
    allItems = fullItems.filter(item => SLUGS_FILTER.includes(item.slug));
  } else {
    allItems = fullItems;
  }

  fs.mkdirSync(RESOURCE_ICONS, { recursive: true });
  fs.mkdirSync(PUBLIC_ICONS, { recursive: true });

  const results = { searched: 0, skipped: 0, failed: 0 };
  const items = allItems.slice(START, Math.min(END, allItems.length));

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // 跳过已有有效图标的宝物
    const filename = `${item.slug}.png`;
    const resPath = path.join(RESOURCE_ICONS, filename);
    if (fs.existsSync(resPath) && fs.statSync(resPath).size > 1000) {
      results.skipped++;
      continue;
    }

    const marker = `[${START + i + 1}/${allItems.length}]`;
    console.log(`${marker} ${item.name} (${item.nameEn}) [${item.ip}]`);

    /** 从 source_ip 提取游戏中文名和英文缩写，用于精确搜索 */
    let { gameCn, gameEn } = (() => {
      if (!item.ip) return { gameCn: '', gameEn: '' };
      // source_ip 格式: "英文缩写 中文游戏名" 或纯中文名 或纯英文缩写
      const parts = item.ip.split(' ');
      // 第一部分是全半角字母/数字则当作英文缩写，其余为中文名
      const firstIsEn = parts[0] && /^[a-zA-Z0-9]+$/.test(parts[0]);
      if (firstIsEn && parts.length >= 2) {
        return { gameCn: parts.slice(1).join(' '), gameEn: parts[0] };
      }
      // 纯中文或纯英文
      if (firstIsEn) return { gameCn: '', gameEn: parts[0] };
      return { gameCn: item.ip, gameEn: '' };
    })();

    // 游戏缩写 → 完整中文名映射，确保搜索词精准（如 "er" → "艾尔登法环"）
    const GAME_ABBR_MAP = {
      'er':  { cn: '艾尔登法环', en: 'Elden Ring' },
      'ern': { cn: '艾尔登法环', en: 'Elden Ring' },
    };
    if (GAME_ABBR_MAP[gameEn]) {
      const full = GAME_ABBR_MAP[gameEn];
      if (!gameCn || !gameCn.startsWith('艾尔登')) {
        gameCn = full.cn;
      }
      gameEn = full.en;
    }

    // 构建精准搜索词：宝物名 + 游戏名
    const searchCnBase = gameCn ? `${item.name} ${gameCn}` : item.name;
    const searchEnBase = gameEn ? `${item.nameEn} ${gameEn}` : item.nameEn;

    // 判断是否命中了已知游戏 Wiki 域名，优先定向搜索
    // gameCn 可能是"最终幻想XV"/"我的世界 下界"这种格式
    let wikiDomain = null;
    if (gameCn || gameEn) {
      // 先精确匹配 gameCn
      wikiDomain = GAME_WIKI_MAP[gameCn];
      // 再尝试 gameCn 的每个子词（如"我的世界 下界" → "我的世界"）
      if (!wikiDomain && gameCn) {
        for (const part of gameCn.split(' ')) {
          wikiDomain = GAME_WIKI_MAP[part];
          if (wikiDomain) break;
        }
      }
      // 子串匹配：gameCn 可能包含已知游戏名（如"最终幻想XV"包含"最终幻想"）
      if (!wikiDomain && gameCn) {
        for (const key of Object.keys(GAME_WIKI_MAP)) {
          if (key.length >= 3 && gameCn.includes(key)) {
            wikiDomain = GAME_WIKI_MAP[key];
            break;
          }
        }
      }
      // 最后尝试 gameEn
      if (!wikiDomain && gameEn) {
        wikiDomain = GAME_WIKI_MAP[gameEn.toLowerCase()];
      }
    }

    // ═══════════ 搜图阶段：Wiki API（精准）→ Google Images（回退）═══════════

    const candidateUrls = new Set();

    // ──── 1. Wiki API：直接从游戏资料站获取物品信息框原图（最精准来源）────
    if (wikiDomain) {
      const pageName = item.nameEn.replace(/ /g, '_');
      const pageNameSp = item.nameEn;
      console.log(`  → Wiki: ${wikiDomain}/wiki/${pageName}`);

      // pageimages API — 获取信息框主图
      let wu = await fetchWikiPageImage(wikiDomain, pageName);
      if (wu.length === 0 && pageName !== pageNameSp) {
        wu = await fetchWikiPageImage(wikiDomain, pageNameSp);
      }
      for (const u of wu) candidateUrls.add(u);

      // parse API — 获取页面内所有图片（传物品英文名做文件名相关性过滤）
      let scraped = await scrapeWikiPageImages(wikiDomain, pageName, item.nameEn);
      if (scraped.length === 0 && pageName !== pageNameSp) {
        scraped = await scrapeWikiPageImages(wikiDomain, pageNameSp, item.nameEn);
      }
      for (const u of scraped) candidateUrls.add(u);

      console.log(`  → Wiki 候选: ${candidateUrls.size}`);

      // 页面名不精确时，用 search API 找最匹配的页面重试
      if (candidateUrls.size === 0) {
        const hits = await searchWikiPages(wikiDomain, item.nameEn);
        if (hits.length > 0) {
          console.log(`  → Wiki 搜索命中: ${hits[0]}`);
          for (const hitPage of hits.slice(0, 3)) {
            const wu2 = await fetchWikiPageImage(wikiDomain, hitPage);
            for (const u of wu2) candidateUrls.add(u);
            const sp2 = await scrapeWikiPageImages(wikiDomain, hitPage, item.nameEn);
            for (const u of sp2) candidateUrls.add(u);
            if (candidateUrls.size >= 5) break;
          }
        }
      }
    }

    // ──── 2. Bing Images 回退（Wiki 候选不足 5 张时触发）────
    // 只搜物品渲染图：transparent png + 负向排除 logo/封面/截图/海报/带字图
    if (candidateUrls.size < 5) {
      const ctx = gameEn || (gameCn || '').split(/[\s]+/).filter(Boolean)[0] || '';
      // 负向排除词：排除游戏logo、封面、壁纸、截图、海报、标题图
      const noLogo = '-logo -cover -wallpaper -box -art -banner -poster -title -screenshot -hd -4k';
      const bQ1 = IS_RETRY
        ? `${item.nameEn} ${ctx} game item icon transparent png ${noLogo}`.trim()
        : `"${item.nameEn}" ${ctx} game item render transparent png ${noLogo}`.trim();
      console.log(`  → Bing${IS_RETRY ? ' [重搜]' : ''}: ${bQ1}`);
      const b1 = await searchBingImages(bQ1, 10);
      for (const u of b1) candidateUrls.add(u);

      // 中文搜索（兜底）：双引号强制不分词 + "游戏道具" 标签排除实物
      if (candidateUrls.size < 5 && item.name && item.name !== item.nameEn) {
        const bQ2 = IS_RETRY
          ? `${item.name} ${gameCn || ''} 游戏道具 图标 png ${noLogo}`.trim()
          : `"${item.name}" ${gameCn || ''} 游戏道具 图标 png ${noLogo}`.trim();
        console.log(`  → BingCN${IS_RETRY ? ' [重搜]' : ''}: ${bQ2}`);
        const b2 = await searchBingImages(bQ2, 10);
        for (const u of b2) candidateUrls.add(u);
      }
    }

    // ──── 3. DuckDuckGo Images 回退（Bing 候选不足 5 张时触发）────
    if (candidateUrls.size < 5) {
      const ctx = gameEn || (gameCn || '').split(/[\s]+/).filter(Boolean)[0] || '';
      const noLogo = '-logo -cover -wallpaper -art -banner -poster -screenshot';
      const dQ = IS_RETRY
        ? `${item.nameEn} ${ctx} game item icon transparent png ${noLogo}`.trim()
        : `"${item.nameEn}" ${ctx} game item render png ${noLogo}`.trim();
      console.log(`  → DDG${IS_RETRY ? ' [重搜]' : ''}: ${dQ}`);
      const d1 = await searchDuckDuckGoImages(dQ, 10);
      for (const u of d1) candidateUrls.add(u);
    }

    // ──── 4. Google Images 回退（DDG 候选仍不足 5 张时触发）────
    if (candidateUrls.size < 5) {
      const ctx = gameEn || (gameCn || '').split(/[\s]+/).filter(Boolean)[0] || '';
      const noLogo = '-logo -cover -wallpaper -box -art -banner -poster -title -screenshot -hd';
      const gQ = IS_RETRY
        ? `${item.nameEn} ${ctx} game item icon transparent png ${noLogo}`.trim()
        : `"${item.nameEn}" ${ctx} game item render png ${noLogo}`.trim();
      console.log(`  → Google${IS_RETRY ? ' [重搜]' : ''}: ${gQ}`);
      const g1 = await searchGoogleImages(gQ, 10);
      for (const u of g1) candidateUrls.add(u);
    }

    console.log(`  → 候选总数: ${candidateUrls.size}`);

    // ═══════════ v3.0：只收集 URL 不下载，输出 CANDIDATES JSON 到 stdout 供父进程读取 ═══════════
    const candidates = [];
    for (const u of candidateUrls) {
      // 过滤动图：跳过 .gif 和 animated .webp（Wiki/Bing 图标只需要静态图）
      const lower = u.toLowerCase();
      if (lower.endsWith('.gif') || lower.includes('animated') || lower.includes('_gif_')) continue;
      // 过滤之前出现过的旧 URL（重搜时排除，防反反复复返回相同候选）
      if (EXCLUDE_URLS.size > 0 && EXCLUDE_URLS.has(u)) { console.log(`    ⏭ 排除旧图: ${u.substring(0, 80)}...`); continue; }
      let source = 'bing';
      // 判断 URL 来源：Wiki 域名 → wiki，搜索引擎 → 对应引擎名
      if (u.includes('fandom.com') || u.includes('wiki.gg') || u.includes('wikia.com') || u.includes('gamepedia.com') || u.includes('wikipedia.org') || u.includes('stardewvalleywiki') || u.includes('rimworldwiki') || u.includes('bulbapedia') || u.includes('minecraft.wiki') || u.includes('hollowknight.wiki')) {
        source = 'wiki';
      }
      candidates.push({ url: u, source });
    }
    // 限制最多 10 个候选，避免 JSON 过大
    const limited = candidates.slice(0, 10);

    // 输出到 stdout：CANDIDATES= 开头的 JSON 行，供 admin.ts stepAutoFetch 解析
    process.stdout.write(`CANDIDATES=${JSON.stringify({ slug: item.slug, rows: item.rows, cols: item.cols, name: item.name, nameEn: item.nameEn, candidates: limited })}\n`);

    if (limited.length > 0) {
      results.searched++;
      console.log(`    📦 收集 ${limited.length} 个候选 URL`);
    } else {
      console.log(`    ❌ 无可用候选`);
      results.failed++;
    }
  }

  console.log(`\n[fetch-real-icons v3.0] 完成`);
  console.log(`  搜索: ${results.searched} | 跳过: ${results.skipped} | 失败: ${results.failed}`);
}

main().catch(e => {
  console.error('[fetch-real-icons v2.0] 致命错误:', e.message);
  process.exit(1);
});
