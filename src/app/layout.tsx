export const metadata = {
  title: 'Ark-i',
  description: 'Ark-i AI Concierge',
  icons: {
    icon: [
      { url: '/icon/icon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon/icon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [{ url: '/icon/icon-152x152.png', sizes: '152x152', type: 'image/png' }],
    shortcut: ['/icon/icon-32x32.png'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev'

  return (
    <html lang="ja">
      <body style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', margin: 0 }}>
        <main style={{ flex: 1 }}>{children}</main>
        <footer
          style={{
            borderTop: '1px solid #e5e7eb',
            padding: '10px 16px',
            fontSize: '12px',
            color: '#6b7280',
            textAlign: 'center',
            backgroundColor: '#fff',
          }}
        >
          ©NFTDrive.inc　|　Version: {appVersion}
        </footer>
      </body>
    </html>
  )
}
