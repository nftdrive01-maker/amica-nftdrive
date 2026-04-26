export const metadata = {
  title: 'Amica BtoB SaaS',
  description: 'AI Concierge',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}
