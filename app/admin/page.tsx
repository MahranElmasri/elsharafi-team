import { AppHeader } from "@/components/AppHeader";
import { requireUser } from "@/lib/session";

export default async function AdminPage() {
  const user = await requireUser("admin");
  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto grid max-w-screen-2xl gap-2 px-4 py-8">
        <h1 className="text-3xl font-extrabold tracking-tight">Übersicht</h1>
      </main>
    </>
  );
}
