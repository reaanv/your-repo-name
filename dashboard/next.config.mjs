import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The repo root also has a lockfile (the GitHub Action lives there), so pin
  // tracing to this package instead of letting Next infer the parent directory.
  outputFileTracingRoot: here,
  eslint: {
    // Lint is run explicitly in CI; do not let it block a production build.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
