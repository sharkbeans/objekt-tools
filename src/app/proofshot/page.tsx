import { ProofshotEditor } from "./_components/proofshot-editor";

export const metadata = {
  title: "Proofshot Maker | objekt.my",
  description:
    "Make proofshot images for your objekts: place your cards over a photo background, date-stamp them, and save as an image or GIF.",
};

export default function ProofshotPage() {
  return (
    <div className="-mx-4 -my-6 h-full p-4 overflow-hidden">
      <ProofshotEditor />
    </div>
  );
}
