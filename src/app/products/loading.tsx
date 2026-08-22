export default function ProductsLoading() {
  return (
    <main className="mx-auto max-w-7xl px-5 py-10 sm:px-6 sm:py-14">
      <div className="mb-12 max-w-2xl">
        <div className="skeleton h-3 w-28" />
        <div className="skeleton mt-4 h-12 w-72" />
        <div className="skeleton mt-4 h-4 w-full max-w-xl" />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-2 sm:gap-7 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i}>
            <div className="skeleton aspect-[0.94] rounded-[1.7rem]" />
            <div className="skeleton mt-4 h-3 w-20" />
            <div className="skeleton mt-2 h-4 w-40" />
            <div className="skeleton mt-2 h-4 w-16" />
          </div>
        ))}
      </div>
    </main>
  );
}
