import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const isDev = mode === "development";

  const requiredEnv = (key: string, devFallback: string) => {
    const value = env[key];
    if (value) return value;
    if (isDev) return devFallback;
    throw new Error(`${key} must be configured for production builds`);
  };

  const apiUrl = requiredEnv("VITE_API_URL", "http://localhost:8081");
  const baseUrl = requiredEnv("VITE_BASE_URL", "http://localhost:5173");
  const wsUrl = requiredEnv("VITE_WS_URL", "ws://localhost:8081");

  const connectSrcBase = `'self' https://cdn.discordapp.com https://sentry.tkts.bot ${apiUrl} ${wsUrl}`;
  const scriptSrcBase = "'self' https://cdn.jsdelivr.net";

  // Allowlisted image hosts. Not a blanket `https:` -- image URLs are author-supplied,
  // so this keeps them from pointing a viewer's browser at an arbitrary host.
  const imgSrcHosts = [
    // First-party and Discord
    "https://image-cdn.tickets.bot",
    "https://cdn.discordapp.com",
    "https://media.discordapp.net",
    "https://dbl-static.b-cdn.net",
    "https://avatar.iran.liara.run",
    // Common third-party image hosts
    "https://imgur.com",
    "https://i.imgur.com",
    "https://i.ibb.co",
    "https://i.postimg.cc",
    "https://files.catbox.moe",
    "https://i.gyazo.com",
    "https://image.prntscr.com",
    "https://raw.githubusercontent.com",
    "https://user-images.githubusercontent.com",
    "https://res.cloudinary.com",
    "https://images.unsplash.com",
    "https://upload.wikimedia.org",
    "https://lh3.googleusercontent.com",
    "https://media.tenor.com",
    "https://c.tenor.com",
    "https://media.giphy.com",
    "https://i.giphy.com",
  ].join(" ");

  const csp = [
    "default-src 'self'",
    // Dev requires 'unsafe-inline' for Vite HMR and React refresh preamble
    isDev ? `script-src ${scriptSrcBase} 'unsafe-inline'` : `script-src ${scriptSrcBase}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    `img-src 'self' data: blob: ${imgSrcHosts}`,
    isDev
      ? `connect-src ${connectSrcBase} ws://localhost:* http://localhost:*`
      : `connect-src ${connectSrcBase}`,
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
    "worker-src 'self' blob:",
  ].join("; ");

  const securityHeaders = {
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };

  return {
    server: {
      port: 5173,
      open: true,
      allowedHosts: ["localhost", new URL(baseUrl).hostname],
      headers: securityHeaders,
    },
    preview: {
      headers: securityHeaders,
    },
    plugins: [react(), tailwindcss(), tsconfigPaths()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ["react", "react-dom", "react-router"],
            ui: ["@fortawesome/react-fontawesome", "@fortawesome/fontawesome-svg-core"],
            state: ["zustand", "@tanstack/react-query"],
            http: ["axios"],
          },
        },
      },
      target: "es2015",
      minify: "terser",
      sourcemap: false,
    },
  };
});
