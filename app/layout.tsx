import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LawFinder - 法令検索・法改正支援システム',
  description: '日本の法令を検索し、条文間の参照関係を可視化するシステム',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="font-sans" suppressHydrationWarning>{children}</body>
    </html>
  );
}
