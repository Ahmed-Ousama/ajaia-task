import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-gray-900">Document not found</h1>
        <p className="mt-2 text-sm text-gray-500">It may have been deleted, or it hasn&apos;t been shared with you.</p>
        <Link href="/" className="mt-6 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          Back to documents
        </Link>
      </div>
    </main>
  );
}
