import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

const RequiredSelect = React.createContext(false);
const encode = (value: string | number) => `value:${value}`;

type SelectFieldProps = Omit<
  React.ComponentProps<typeof SelectTrigger>,
  "value" | "onChange" | "children"
> & {
  value: string | number;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  required?: boolean;
  name?: string;
  placeholder?: string;
};

/** Shared single-select field. Empty filter values remain distinct from placeholders. */
export function SelectField({
  value,
  onValueChange,
  children,
  required = false,
  name,
  disabled,
  placeholder,
  className,
  ...props
}: SelectFieldProps) {
  return (
    <RequiredSelect.Provider value={required}>
      <Select
        value={required && value === "" ? "" : encode(value)}
        onValueChange={(next) => onValueChange(next.replace(/^value:/, ""))}
        required={required}
        name={name}
        disabled={disabled}
      >
        <SelectTrigger
          className={cn("min-w-0 shrink-0 font-sans", className)}
          {...props}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent position="popper" align="start" className="font-sans">
          {children}
        </SelectContent>
      </Select>
    </RequiredSelect.Provider>
  );
}

export function SelectOption({
  value,
  disabled,
  ...props
}: Omit<React.ComponentProps<typeof SelectItem>, "value"> & {
  value: string | number;
}) {
  const required = React.useContext(RequiredSelect);
  return (
    <SelectItem
      value={encode(value)}
      disabled={disabled || (required && value === "")}
      {...props}
    />
  );
}
