import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TimeWatcherApp from "../src/components/TimeWatcherApp";

describe("TimeWatcher application", () => {
  beforeEach(() => localStorage.clear());

  it("shows exactly four initial answers", () => {
    render(<TimeWatcherApp />);
    expect(screen.getAllByRole("button", { name: /view details for/i })).toHaveLength(4);
  });

  it("teaches comparison at one selection and enables it at two", async () => {
    const user = userEvent.setup();
    render(<TimeWatcherApp />);
    const addButtons = screen.getAllByRole("button", { name: /add .* to comparison/i });
    await user.click(addButtons[0]);
    expect(screen.getByRole("button", { name: "1 / 4 selected" })).toBeDisabled();
    await user.click(addButtons[1]);
    expect(screen.getByRole("button", { name: "Compare 2 / 4 →" })).toBeEnabled();
  });
});
