/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',  // Creates a standalone build that can be embedded
  reactStrictMode: true,
  
  // Runtime public config (accessible in browser)
  publicRuntimeConfig: {
    apiUrl: process.env.NEXT_PUBLIC_API_URL || process.env.API_URL,
  },
  
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || process.env.API_URL,
  },
}

module.exports = nextConfig
