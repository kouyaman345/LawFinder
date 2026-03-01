import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'ロードマップ - たこつぼ',
  description: '法令参照ネットワーク「たこつぼ」の今後の開発予定機能',
};

interface RoadmapFeature {
  number: number;
  title: string;
  description: string;
  icon: string;
  accentColor: string;
  accentBg: string;
  accentBorder: string;
}

const features: RoadmapFeature[] = [
  {
    number: 1,
    title: 'AI（LLM）を活用した法令分析',
    description:
      '大規模言語モデルを活用し、法令条文の意味解析、類似条文の検出、法令間の関連性分析を自動化します。',
    icon: '\u{1F9E0}',
    accentColor: 'text-indigo-700',
    accentBg: 'bg-indigo-50',
    accentBorder: 'border-indigo-200',
  },
  {
    number: 2,
    title: 'AI（LLM）による参照外ハネ改正の検出',
    description:
      '条文の明示的な参照関係だけでなく、意味的な関連性からハネ改正の可能性がある箇所をAIが検出・提案します。',
    icon: '\u{1F50D}',
    accentColor: 'text-amber-700',
    accentBg: 'bg-amber-50',
    accentBorder: 'border-amber-200',
  },
  {
    number: 3,
    title: 'AI（LLM）による校正・改正案の提案',
    description:
      '法令改正時の条文校正を支援し、改正に伴う関連条文の修正案をAIが自動生成します。',
    icon: '\u{270F}\u{FE0F}',
    accentColor: 'text-emerald-700',
    accentBg: 'bg-emerald-50',
    accentBorder: 'border-emerald-200',
  },
  {
    number: 4,
    title: '未施行法案との衝突検出',
    description:
      '施行前の法案と既存法令の潜在的な矛盾・衝突を自動検出し、立法過程における整合性チェックを支援します。',
    icon: '\u{26A0}\u{FE0F}',
    accentColor: 'text-rose-700',
    accentBg: 'bg-rose-50',
    accentBorder: 'border-rose-200',
  },
];

export default function RoadmapPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-[#003f8e] text-white">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">
              たこつぼ
              <span className="ml-3 text-sm font-normal opacity-80">
                ロードマップ
              </span>
            </h1>
            <Link
              href="/"
              className="text-sm text-white/80 hover:text-white transition-colors"
            >
              ホーム
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full">
        {/* Page Introduction */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            今後の開発予定
          </h2>
          <p className="text-gray-600 text-sm leading-relaxed max-w-2xl">
            「たこつぼ」では、法令参照ネットワークの可視化に加え、以下の機能を開発予定です。
            AI技術を活用し、法令分析・改正支援の高度化を目指します。
          </p>
        </div>

        {/* Timeline line (visible on desktop) */}
        <div className="relative">
          <div
            className="hidden md:block absolute left-1/2 top-0 bottom-0 w-0.5 bg-gray-200 -translate-x-1/2"
            aria-hidden="true"
          />

          {/* Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {features.map((feature) => (
              <div
                key={feature.number}
                className={`bg-white rounded-lg shadow hover:shadow-md transition-shadow border-l-4 ${feature.accentBorder}`}
              >
                <div className="p-6">
                  {/* Card Header */}
                  <div className="flex items-start gap-4 mb-4">
                    <div
                      className={`flex-shrink-0 w-12 h-12 rounded-lg ${feature.accentBg} flex items-center justify-center text-2xl`}
                      aria-hidden="true"
                    >
                      {feature.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-gray-400">
                          #{String(feature.number).padStart(2, '0')}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${feature.accentBg} ${feature.accentColor}`}
                        >
                          開発予定
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-gray-800 leading-snug">
                        {feature.title}
                      </h3>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-gray-300 mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="border-t border-gray-700 pt-4">
            <p className="text-[11px] text-gray-500 text-center leading-relaxed">
              本サービスで提供される情報は、法令間の参照関係の可視化を目的とした参考情報であり、法的助言を構成するものではありません。
              情報の正確性・完全性・最新性について保証するものではなく、本サービスの利用により生じたいかなる損害についても、株式会社NanNaruは責任を負いかねます。
            </p>
            <p className="text-[10px] text-gray-600 text-center mt-2">&copy; 株式会社NanNaru. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
