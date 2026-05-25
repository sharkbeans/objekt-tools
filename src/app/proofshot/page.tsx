export const metadata = { title: "Proofshot — objekt.my" };

export default function ProofshotPage() {
  return (
    <div className="-mx-4 -my-6 h-full">
      <iframe
        src="/tools-static/proofshot/index.html?embedded=1"
        title="Proofshot"
        allow="camera; clipboard-read; clipboard-write; web-share"
        className="w-full h-full border-0"
      />
    </div>
  );
}
