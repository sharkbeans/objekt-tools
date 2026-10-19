export const metadata = {
  title: "Objektify: Custom Objekt Maker | objekt.my",
  description:
    "Design your own custom objekt cards with objekt-style borders and fonts, one at a time or in bulk.",
};

export default function ObjektMakerPage() {
  return (
    <div className="-mx-4 -my-6 h-full">
      <iframe
        src="/tools-static/objekt-maker/index.html?embedded=1"
        title="Objektify"
        allow="clipboard-read; clipboard-write; web-share"
        className="w-full h-full border-0"
      />
    </div>
  );
}
