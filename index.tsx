import React from 'react';
import ReactDOM from 'react-dom/client';
// Tailwind CSS（本地构建，不依赖 CDN）
import './src/index.css';
// 在渲染前导入 i18n 配置，确保 i18next 初始化完成
import './i18n';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);