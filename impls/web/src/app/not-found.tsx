import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <h1 className="text-3xl font-bold">Link not found</h1>
      <p className="mt-4">
        <Link href="/" className="text-blue-800 underline">
          Back to all links
        </Link>
      </p>
    </>
  );
}
