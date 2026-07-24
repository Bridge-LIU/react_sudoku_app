// Expo Router 的根 Layout。类似 Vue Router 里的顶层 <RouterView>，但 Expo Router 是文件系统路由。
// 这里也是挂载全局 provider（i18n、后续的 GameProvider）的地方。

import { Stack } from 'expo-router';
import '@/i18n';   // 副作用初始化 i18next，见 src/i18n/index.ts

export default function RootLayout() {
  // Stack 是导航容器，类似 Vue 里的 <router-view>，但支持原生栈式导航（左滑返回、iOS 头部栏等）
  return <Stack screenOptions={{ headerShown: false }} />;
}
