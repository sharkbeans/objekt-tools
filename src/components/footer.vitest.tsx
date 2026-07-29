import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteDisclaimerFooter } from "@/components/footer";

const pathnameState = vi.hoisted(() => ({
  value: "/" as string | null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameState.value,
}));

describe("SiteDisclaimerFooter", () => {
  afterEach(() => {
    pathnameState.value = "/";
  });

  it("shows the home disclaimer on the landing page", () => {
    pathnameState.value = "/";

    render(<SiteDisclaimerFooter currentSection={null} />);

    expect(
      screen.getByText(/Fan-made community tools for Cosmo collectors/i),
    ).toBeInTheDocument();
  });

  it("shows the trade disclaimer on trade routes", () => {
    pathnameState.value = "/trades";

    render(<SiteDisclaimerFooter currentSection={null} />);

    expect(
      screen.getByText(/Fan-made trade posting and checking tool/i),
    ).toBeInTheDocument();
  });

  it("does not render on the spin page", () => {
    pathnameState.value = "/spin";

    const { container } = render(
      <SiteDisclaimerFooter currentSection={null} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
