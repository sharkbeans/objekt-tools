import { ProofshotEditor } from "./_components/proofshot-editor";

export const metadata = { title: "Proofshot — objekt.my" };

export default function ProofshotPage() {
  return (
    <div className="-mx-4 -my-6 h-full p-4 overflow-hidden">
      <ProofshotEditor />
    </div>
  );
}
