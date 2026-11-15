import type { Metadata } from 'next'
import { Newsreader, Instrument_Sans } from 'next/font/google'
import './globals.css'

const newsreader = Newsreader({
  variable: '--font-newsreader', subsets: ['latin'], weight: ['500', '600'], display: 'swap',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
})
const instrumentSans = Instrument_Sans({
  variable: '--font-instrument-sans', subsets: ['latin'], weight: ['500', '600'], display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
})

export const metadata: Metadata = {
  title: 'Sample Factory · Dashboard',
  description: 'Programs, orders, styles and production progress.',
  applicationName: 'Sample Factory Dashboard',
  icons: { icon: [{ url: '/brand/hf-badge.svg', type: 'image/svg+xml' }], apple: [{ url: '/brand/hf-badge.svg' }] },
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${newsreader.variable} ${instrumentSans.variable} h-full antialiased`}>
      <body className="min-h-full bg-paper text-ink">{children}</body>
    </html>
  )
}
