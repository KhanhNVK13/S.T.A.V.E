import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const apiOrigin = originOf(process.env.NEXT_PUBLIC_API_URL);
const supabaseOrigin = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);

const connectSources = [
  "'self'",
  apiOrigin,
  supabaseOrigin,
  supabaseOrigin?.replace(/^http/, "ws") ?? null,
  "https://*.supabase.co",
  "wss://*.supabase.co",
  isDev ? "http://localhost:*" : null,
  isDev ? "ws://localhost:*" : null,
].filter((source): source is string => Boolean(source));

const mediaSources = ["'self'", "blob:", "data:", supabaseOrigin, "https://*.supabase.co"].filter(
  (source): source is string => Boolean(source),
);

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' blob:${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  `media-src ${mediaSources.join(" ")}`,
  "font-src 'self' data:",
  `connect-src ${connectSources.join(" ")}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  devIndicators: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
