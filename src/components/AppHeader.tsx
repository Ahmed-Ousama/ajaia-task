import Link from "next/link";
import Logo from "@/components/Logo";
import UserMenu from "@/components/UserMenu";
import NotificationBell from "@/components/NotificationBell";
import type { CurrentUser } from "@/lib/session";

export default function AppHeader({ user, children }: { user: CurrentUser; children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Link href="/" aria-label="Ajaia Docs home">
          <Logo size={36} />
        </Link>
        <div className="min-w-0 flex-1">{children}</div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <UserMenu name={user.name} email={user.email} />
        </div>
      </div>
    </header>
  );
}
