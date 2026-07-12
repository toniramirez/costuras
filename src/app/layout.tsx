import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';

import { BrandColors } from '@/components/brand-colors';
import { getBranding } from '@/lib/settings';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const { academyName } = await getBranding();

  return {
    title: {
      default: academyName,
      template: `%s · ${academyName}`,
    },
    description: 'Gestión de la academia de costura.',
    manifest: '/manifest.webmanifest',
    applicationName: academyName,
    appleWebApp: {
      capable: true,
      title: academyName,
      statusBarStyle: 'default',
    },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: '#faf8f6',
  width: 'device-width',
  initialScale: 1,
  // A propósito NO fijamos maximumScale: bloquear el zoom rompe la
  // accesibilidad. El zoom automático de iOS ya se evita con font-size ≥ 16px.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={inter.variable}>
      <body className="min-h-dvh antialiased">
        {/* Colores de marca configurables desde el panel de administración. */}
        <BrandColors />
        {children}
        <Toaster
          position="top-center"
          richColors
          closeButton
          toastOptions={{ className: 'rounded-xl' }}
        />
      </body>
    </html>
  );
}
