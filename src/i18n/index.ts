// i18next 初始化。副作用式导入：外层组件只需 import '@/i18n' 一次。
// 对比 Vue：类似 createI18n() 后 app.use(i18n)。

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { detectInitialLanguage } from './detectLanguage';
import ja from './ja.json';
import zh from './zh.json';
import en from './en.json';

// 端末言語検出は detectInitialLanguage() に共通化 (gameReducer 側と同じロジック使用)
// これにより i18n.language と state.settings.language が起動時に必ず一致する。
const initialLng = detectInitialLanguage();

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
