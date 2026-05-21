import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const tools = [
  {
    title: "Trades",
    description: "Browse, post, and match Cosmo objekt trades.",
    href: "/trades",
  },
  {
    title: "Objektify",
    description: "Create custom objekt cards with your own images and text.",
    href: "/objekt-maker",
  },
  {
    title: "Proofshot",
    description: "Generate photocard proofshot images for trades.",
    href: "/proofshot",
  },
  {
    title: "Poster",
    description: "Turn your trade list into a shareable poster image.",
    href: "/post",
  },
  {
    title: "Spin",
    description: "Try a client-side objekt spin animation.",
    href: "/spin",
  },
];

export default function HomePage() {
  return (
    <div className="max-w-2xl mx-auto py-4">
      <h1 className="text-2xl font-bold mb-2">objekt.my</h1>
      <p className="text-muted-foreground mb-8">Tools for Cosmo collectors.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {tools.map((tool) => (
          <Link key={tool.href} href={tool.href} className="group">
            <Card className="h-full transition-colors group-hover:border-foreground/40">
              <CardHeader>
                <CardTitle className="text-base">{tool.title}</CardTitle>
                <CardDescription>{tool.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
