import { SpinClient } from "./spin-client";

export const metadata = {
  title: "Cosmo Spin Simulator | objekt.my",
  description:
    "Simulate a Cosmo Spin: pick a season objekt to spin and see which class you'd draw.",
};

export default function SpinPage() {
  return <SpinClient />;
}
