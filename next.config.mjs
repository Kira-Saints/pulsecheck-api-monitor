/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Local development only: forward /api/* to the FastAPI server (npm run api).
  // On Vercel the Python function in api/index.py serves /api/* on the same domain.
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    const target = process.env.PULSECHECK_API_URL || "http://127.0.0.1:8000";
    return [{ source: "/api/:path*", destination: `${target}/api/:path*` }];
  },
};
export default nextConfig;
