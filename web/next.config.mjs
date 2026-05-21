import pkg from '@next/env';
const { loadEnvConfig } = pkg;

if (!process.env.NEXT_PRIVATE_WORKER) {
  const { combinedEnv } = loadEnvConfig(process.cwd());
  const mode = combinedEnv.NEXT_PUBLIC_DEBUG_MODE === 'true' ? 'DEBUG' : 'PRODUCTION';
  console.log(`[Azul Web] Mode: ${mode}`);
}

/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
