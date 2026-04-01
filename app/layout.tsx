import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MealPrepMaster',
  description: 'Created with Claude Chat → Vercel Deploy',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
