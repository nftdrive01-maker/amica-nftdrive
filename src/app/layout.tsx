export const metadata = {
  title: 'Ark-i',
  description: 'Ark-i AI Concierge',
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
