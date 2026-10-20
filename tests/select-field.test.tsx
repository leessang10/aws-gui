import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SelectField, SelectOption } from "../src/components/ui/select-field";

function Filter() {
  const [value, setValue] = useState("");
  return (
    <>
      <SelectField aria-label="Category" value={value} onValueChange={setValue}>
        <SelectOption value="">All categories</SelectOption>
        <SelectOption value="Compute">Compute</SelectOption>
      </SelectField>
      <output data-testid="value">{value}</output>
    </>
  );
}

describe("SelectField", () => {
  it("can select a category and return to the empty all-categories value", async () => {
    const user = userEvent.setup();
    render(<Filter />);
    const trigger = screen.getByRole("combobox", { name: "Category" });
    expect(trigger).toHaveTextContent("All categories");
    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "Compute" }));
    expect(screen.getByTestId("value")).toHaveTextContent("Compute");
    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "All categories" }));
    expect(screen.getByTestId("value")).toBeEmptyDOMElement();
    expect(trigger).toHaveTextContent("All categories");
  });

  it("supports keyboard opening and Escape without changing the selection", async () => {
    const user = userEvent.setup();
    render(<Filter />);
    const trigger = screen.getByRole("combobox", { name: "Category" });
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(screen.getByTestId("value")).toBeEmptyDOMElement();
  });

  it("keeps required placeholders invalid but accepts the numeric zero option", async () => {
    const user = userEvent.setup();
    function Required() {
      const [value, setValue] = useState("");
      return (
        <form aria-label="Settings">
          <SelectField
            aria-label="Days"
            name="days"
            required
            placeholder="Choose duration"
            value={value}
            onValueChange={setValue}
          >
            <SelectOption value="">Choose duration</SelectOption>
            <SelectOption value={0}>0 days</SelectOption>
            <SelectOption value={7}>7 days</SelectOption>
          </SelectField>
        </form>
      );
    }
    render(<Required />);
    const form = screen.getByRole("form") as HTMLFormElement;
    expect(form.checkValidity()).toBe(false);
    await user.click(screen.getByRole("combobox"));
    expect(
      screen.getByRole("option", { name: "Choose duration" }),
    ).toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByRole("option", { name: "0 days" }));
    expect(form.checkValidity()).toBe(true);
    expect(screen.getByRole("combobox")).toHaveTextContent("0 days");
  });

  it("does not open disabled fields", () => {
    render(
      <SelectField
        aria-label="Profile"
        value="default"
        onValueChange={() => {}}
        disabled
      >
        <SelectOption value="default">default</SelectOption>
      </SelectField>,
    );
    const trigger = screen.getByRole("combobox");
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
