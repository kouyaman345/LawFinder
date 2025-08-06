/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 静的生成のタイムアウトを延長（大きなXMLファイル対応）
  staticPageGenerationTimeout: 180, // 3分
  // 出力ファイルサイズの制限を増やす
  generateBuildId: async () => {
    // ビルドIDを固定（開発中のみ）
    return 'lawfinder-build-1'
  },
};

module.exports = nextConfig;