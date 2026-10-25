import { AppNav } from "@/components/app-nav";
import { isMock, requireKiwi } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { username, viewer } = await requireKiwi();
  return (
    <>
      <AppNav username={username} mock={isMock()} isAdmin={viewer.isAdmin} scope={viewer.scope} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">{children}</main>
    </>
  );
}
