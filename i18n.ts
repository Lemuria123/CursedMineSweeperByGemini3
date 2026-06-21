import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import zh from './locales/zh.json';
import en from './locales/en.json';

i18n
  // 使用浏览器语言检测插件，自动读取 navigator.language
  .use(LanguageDetector)
  // 注入 React 绑定
  .use(initReactI18next)
  .init({
    // 直接 import 翻译文件，无需 HTTP 后端加载
    resources: {
      zh: { translation: zh },
      en: { translation: en },
    },

    // 英文作为回退语言：非 zh 前缀的设备语言一律显示英文
    fallbackLng: 'en',

    // 语言检测顺序：用户手动选择的语言（localStorage）优先于设备语言
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },

    // 只取 language 部分（zh-CN → zh），不区分地区变体
    load: 'languageOnly',

    // React 已处理 XSS，无需 i18next 的 escapeValue
    // 显式使用单花括号 {variable} 而非默认的 {{variable}} 双花括号
    interpolation: {
      escapeValue: false,
      prefix: '{',
      suffix: '}',
    },
  });

export default i18n;
