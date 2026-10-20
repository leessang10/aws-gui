import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Notifications } from "../src/notifications";

test("invalid fields use the themed toast without submitting or showing native validation", async () => {
  const submit = vi.fn((e) => e.preventDefault());
  render(
    <Notifications>
      <form onSubmit={submit}>
        <label htmlFor="required-name">Resource name</label>
        <input id="required-name" required />
        <button type="submit">Submit</button>
      </form>
    </Notifications>,
  );
  const invalid = new Event("invalid", { cancelable: true });
  screen.getByLabelText("Resource name").dispatchEvent(invalid);
  expect(invalid.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  expect(submit).not.toHaveBeenCalled();
  expect(await screen.findByText("Check the input.")).toBeInTheDocument();
});
