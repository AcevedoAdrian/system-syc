import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Logo } from "@/components/common/Logo";

describe("Logo", () => {
  it("es una imagen con el nombre del sistema", () => {
    render(<Logo />);

    expect(screen.getByRole("img", { name: "system-syc" })).toBeInTheDocument();
  });

  it("escala todo con el alto recibido", () => {
    render(<Logo height={72} />);

    expect(screen.getByRole("img", { name: "system-syc" }).style.getPropertyValue("--h")).toBe(
      "72px",
    );
  });

  it("no repite el nombre a los lectores de pantalla", () => {
    render(<Logo />);

    expect(screen.getByText("system")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("syc")).toHaveAttribute("aria-hidden", "true");
  });
});
