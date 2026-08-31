import AuthGate from '@/components/AuthGate'

// Afgeschermd deel van de app: alles hierbinnen vereist inloggen.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>
}
