// Publiek deel (download- en uitnodigingspagina's) — géén login vereist.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {children}
    </div>
  )
}
