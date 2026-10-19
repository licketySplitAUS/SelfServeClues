import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      input: { main: 'index.html', history: 'history-preview.html', admin: 'history-admin.html' },
    },
  },
});
