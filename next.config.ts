import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // .wgsl 셰이더 파일을 문자열로 import (Turbopack: next dev / next build 기본값)
  turbopack: {
    rules: {
      "*.wgsl": {
        loaders: ["raw-loader"],
        as: "*.js",
      },
    },
  },
  // `next build --webpack` 으로 빌드할 때를 위한 동일 설정
  webpack(config) {
    config.module.rules.push({ test: /\.wgsl$/, type: "asset/source" });
    return config;
  },
};

export default nextConfig;
