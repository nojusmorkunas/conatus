export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-2xl animate-pulse p-6">
      <div className="mb-6 h-7 w-40 rounded bg-muted" />
      <div className="flex flex-col gap-2">
        <div className="h-10 rounded-md bg-muted" />
        <div className="h-10 rounded-md bg-muted" />
      </div>
    </div>
  );
}
