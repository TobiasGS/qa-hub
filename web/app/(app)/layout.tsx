import { AppNav } from "@/components/app-nav";
import { isMock, requireKiwi } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { username } = await requireKiwi();
  return (
    <>
      <AppNav username={username} mock={isMock()} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">{children}</main>
    </>
  );
}
