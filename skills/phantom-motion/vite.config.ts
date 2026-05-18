import { resolve } from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Phantom Motion Hybrid Drive Build Configuration
export default defineConfig({
	plugins: [react(), tailwindcss()],
	build: {
		rollupOptions: {
			input: {
				main: resolve(__dirname, "index.html"), // 编辑器 UI 入口 (Chrome)
				stage: resolve(__dirname, "stage.html"), // 影视渲染引擎入口 (Stage)
			},
		},
	},
	resolve: {
		alias: {
			"@": resolve(__dirname, "./src"),
		},
	},
	server: {
		port: 3000,
		open: true,
	},
});
