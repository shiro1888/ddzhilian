/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  output: 'export',
  trailingSlash: false,
  turbopack: {
    resolveAlias: {
      fs: './src/lib/browser-empty-module.ts',
      path: './src/lib/browser-empty-module.ts',
      'ort.bundle.min.mjs': './node_modules/onnxruntime-web/dist/ort.bundle.min.mjs',
    },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
