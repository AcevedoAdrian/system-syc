import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { THEME_STORAGE_KEY } from "@/lib/theme";

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("en claro ofrece activar el modo oscuro, y viceversa", async () => {
    render(<ThemeToggle />);

    await userEvent.click(screen.getByRole("button", { name: "Activar modo oscuro" }));

    expect(document.documentElement).toHaveClass("dark");
    expect(screen.getByRole("button", { name: "Activar modo claro" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Activar modo claro" }));

    expect(document.documentElement).not.toHaveClass("dark");
    expect(screen.getByRole("button", { name: "Activar modo oscuro" })).toBeInTheDocument();
  });

  it("guarda la elección", async () => {
    render(<ThemeToggle />);

    await userEvent.click(screen.getByRole("button", { name: "Activar modo oscuro" }));

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("arranca con la etiqueta que corresponde al tema que ya está aplicado", () => {
    document.documentElement.classList.add("dark");

    render(<ThemeToggle />);

    expect(screen.getByRole("button", { name: "Activar modo claro" })).toBeInTheDocument();
  });

  it("dos interruptores en pantalla se mantienen sincronizados", async () => {
    render(
      <>
        <ThemeToggle />
        <ThemeToggle />
      </>,
    );

    await userEvent.click(
      screen.getAllByRole("button", { name: "Activar modo oscuro" })[0] as HTMLElement,
    );

    expect(screen.getAllByRole("button", { name: "Activar modo claro" })).toHaveLength(2);
  });
});
