import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Custom plugin to remove the Import Map from index.html when running locally.
// This allows local Vite to use node_modules instead of the CDN links used in the AI Studio.
const removeImportMap = () => {
  return {
    name: 'remove-import-map',
    transformIndexHtml(html: string) {
      // Removes the <script type="importmap">...</script> block
      return html.replace(/<script type="importmap">[\s\S]*?<\/script>/, '');
    },
  };
};

export default defineConfig({
  plugins: [
    removeImportMap(),
    react()
  ],
  server: {
    host: true
  }
});