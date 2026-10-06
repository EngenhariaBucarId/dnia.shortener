import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: [
      // `npm run dev:demo` troca o Supabase por um banco em memória com dados
      // de exemplo (src/demo/supabase.ts). Fora desse modo, nada do demo entra.
      ...(mode === "demo"
        ? [
            {
              find: "@/lib/supabase",
              replacement: path.resolve(__dirname, "./src/demo/supabase.ts"),
            },
          ]
        : []),
      { find: "@", replacement: path.resolve(__dirname, "./src") },
    ],
  },
  server: {
    host: "::",
    port: 8080,
  },
}));
