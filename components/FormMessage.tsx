/** One line under a form: an error (what's wrong, how to fix it) or a confirmation. */
export function FormMessage({ error, ok }: { error?: string; ok?: string }) {
  if (error) {
    return (
      <p role="alert" className="border-l-4 border-krank pl-3 text-sm text-krank">
        {error}
      </p>
    );
  }
  if (ok) {
    return (
      <p role="status" className="border-l-4 border-urlaub pl-3 text-sm">
        {ok}
      </p>
    );
  }
  return null;
}
