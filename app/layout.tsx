import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { GA_MEASUREMENT_ID, CLARITY_PROJECT_ID } from '@/app/lib/analytics';

export const metadata: Metadata = {
  title: 'たこつぼ - 法令参照ネットワーク可視化システム',
  description: '日本の法令間の参照関係を可視化し、法改正の影響分析を支援するシステム',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body className="font-sans" suppressHydrationWarning>
        {children}

        {/* ----------------------------------------------------------------
            Google Analytics 4
            Replace G-XXXXXXXXXX in app/lib/analytics.ts before deployment.
        ---------------------------------------------------------------- */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}', {
              send_page_view: true
            });
          `}
        </Script>

        {/* ----------------------------------------------------------------
            Microsoft Clarity
            Replace XXXXXXXXXX in app/lib/analytics.ts before deployment.
        ---------------------------------------------------------------- */}
        <Script id="ms-clarity" strategy="afterInteractive">
          {`
            (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window,document,"clarity","script","${CLARITY_PROJECT_ID}");
          `}
        </Script>
      </body>
    </html>
  );
}
