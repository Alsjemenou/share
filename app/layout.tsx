import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/ThemeProvider'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist', preload: false })

export const metadata: Metadata = {
  title: 'Deel',
  description: 'Bestanden veilig delen — je eigen NAS & WeTransfer',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={`${geist.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full bg-gray-950 text-gray-100 antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
