// i18next 初始化。副作用式导入：外层组件只需 import '@/i18n' 一次。
// 对比 Vue：类似 createI18n() 后 app.use(i18n)。

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import ja from './ja.json';
import zh from './zh.json';
import en from './en.json';

// expo-localization 读取用户设备语言（对应浏览器的 navigator.language）
const deviceLanguage = Localization.getLocales()[0]?.languageCode ?? 'ja';
const supported: Record<string, 'ja' | 'zh' | 'en'> = { ja: 'ja', zh: 'zh', en: 'en' };
const initialLng: 'ja' | 'zh' | 'en' = supported[deviceLanguage] ?? 'ja';

// eslint-disable-next-line import/no-named-as-default-member -- i18next の慣用的 fluent API: i18n.use().init()
i18n.use(initReactI18next).init({
  resources: {
    ja: { translation: ja },
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: initialLng,
  fallbackLng: 'ja',
  interpolation: { escapeValue: false }, // React 已经防 XSS，不需要 i18next 再转义
});

export default i18n;
