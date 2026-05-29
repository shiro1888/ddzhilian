/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  output: 'export',
  trailingSlash: false,
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
