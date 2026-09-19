import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 使用原生 <img> 展示远程缩略图，避免图片优化服务的域名白名单问题
  images: { unoptimized: true },
};

export default nextConfig;
