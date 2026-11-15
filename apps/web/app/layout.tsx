import type { Metadata, Viewport } from 'next'
import { Newsreader, Instrument_Sans } from 'next/font/google'
import './globals.css'

// Newsreader carries display headings. Instrument Sans carries labels, pills
// and button text. Both fall back to a real stack when the webfont is slow.
const newsreader = Newsreader({
  variable: '--font-newsreader',
  subsets: ['latin'],
  weight: ['500', '600'],
  display: 'swap',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
})

const instrumentSans = Instrument_Sans({
  variable: '--font-instrument-sans',
  subsets: ['latin'],
  weight: ['500', '600'],
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
})

export const metadata: Metadata = {
  title: 'Sample Factory',
  description: 'Piece tracking for the Sample Factory factory floor.',
  applicationName: 'Sample Factory',
  icons: {
    icon: [{ url: '/brand/hf-badge.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/brand/hf-badge.svg' }],
  },
}

// Phone-first: lock the initial scale so a mis-tap never zooms the bench screen,
// and paint the browser chrome in paper so the app does not end at a white seam.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f2efe8',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${instrumentSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink">{children}</body>
    </html>
  )
}
