export const metadata = { title: "Proofshot — objekt.my" };

export default function ProofshotPage() {
  return (
    <div className="-mx-4 -my-6 h-full">
      <iframe
        src="/tools-static/proofshot/index.html"
        title="Proofshot"
        className="w-full h-full border-0"
      />
    </div>
  );
}
