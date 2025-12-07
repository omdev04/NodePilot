/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',  // Creates a standalone build that can be embedded
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9001',
  },
}

module.exports = nextConfig
