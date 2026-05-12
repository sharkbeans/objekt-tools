export const metadata = { title: "Objektify — objekt.my" };

export default function ObjektMakerPage() {
  return (
    <div className="-mx-4 -my-6 h-full">
      <iframe
        src="/tools-static/objekt-maker/index.html"
        title="Objektify"
        className="w-full h-full border-0"
      />
    </div>
  );
}
