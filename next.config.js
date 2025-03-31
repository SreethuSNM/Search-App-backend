/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: true,
  },
  webpack: (config, { isServer }) => {
    // Handle paths with spaces
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': __dirname,
    };
    return config;
  },
  // Add OpenNext specific configuration
  openNext: {
    buildCommand: 'npm run build',
    devCommand: 'npm run dev',
    installCommand: 'npm install',
    outputDirectory: '.next',
    serverComponentsExternalPackages: ['@opennextjs/cloudflare'],
  },
}

module.exports = nextConfig 