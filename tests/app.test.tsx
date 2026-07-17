import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TimeWatcherApp from "../src/components/TimeWatcherApp";

describe("TimeWatcher application", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

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

  it("opens watch details from a result card", async () => {
    const user = userEvent.setup();
    render(<TimeWatcherApp />);

    await user.click(screen.getAllByRole("button", { name: /view details for/i })[0]);

    expect(screen.getByRole("heading", { name: "Royal Oak" })).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector(".detail-modal")).toHaveAttribute("open"));
  });

  it("runs a suggested search and falls back to four local matches when the API is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const user = userEvent.setup();
    render(<TimeWatcherApp />);

    await user.click(screen.getByRole("button", { name: /vintage-feeling field watch/i }));

    expect(await screen.findByDisplayValue("vintage-feeling field watch with a cream dial")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /matches for.*vintage-feeling field watch/i })).toBeInTheDocument();
    expect(await screen.findByText("Local preview")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /view details for/i })).toHaveLength(4);
    });
  });
});
