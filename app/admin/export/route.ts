import { exportWorkbook, loadExport } from "@/lib/export";
import { berlinToday } from "@/lib/grid";
import { requireUser } from "@/lib/session";

/** Excel for payroll (R21): one sheet per month plus the year's balances. Admins only. */
export async function GET(request: Request) {
  await requireUser("admin");
  const today = berlinToday();
  const jahr = new URL(request.url).searchParams.get("jahr") ?? "";
  const year = /^\d{4}$/.test(jahr) ? Number(jahr) : Number(today.slice(0, 4));
  const buffer = await exportWorkbook(await loadExport(year, today)).xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Anwesenheit-${year}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
