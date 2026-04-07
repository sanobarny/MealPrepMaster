import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MealPrepMaster',
  description: 'Your smart meal prep companion',
  manifest: '/manifest.json',
  icons: {
    icon: '/logo.svg',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MealPrep',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <meta name="mobile-web-app-capable" content="yes"/>
        <meta name="theme-color" content="#5aad8e"/>
      </head>
      <body>{children}</body>
    </html>
  )
}
