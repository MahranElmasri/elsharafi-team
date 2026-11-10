import { AppHeader } from "@/components/AppHeader";
import { requireUser } from "@/lib/session";

export default async function MePage() {
  const user = await requireUser();
  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto grid max-w-xl gap-2 px-4 py-8">
        <h1 className="text-3xl font-extrabold tracking-tight">Guten Tag, {user.fullName}</h1>
      </main>
    </>
  );
}
