import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Dev-mode fetch logging would print the MUJ feed URL, which contains a personal token.
  logging: false,
};

export default nextConfig;
