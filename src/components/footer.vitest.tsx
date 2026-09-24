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
      screen.getByText(/Fan-made grid and trade-matching tools/i),
    ).toBeInTheDocument();
  });

  it.each([
    "/match",
    "/extension",
    "/extension-privacy",
  ])("shows the matching disclaimer on %s", (path) => {
    pathnameState.value = path;

    render(<SiteDisclaimerFooter currentSection={null} />);

    expect(
      screen.getByText(/Fan-made Discord trade-matching tool/i),
    ).toBeInTheDocument();
  });

  it("shows the list disclaimer on list routes", () => {
    pathnameState.value = "/list/abc";

    render(<SiteDisclaimerFooter currentSection={null} />);

    expect(
      screen.getByText(/Fan-made HAVE\/WANT poster tool/i),
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
