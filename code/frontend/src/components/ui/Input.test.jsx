import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "./Input.jsx";

test("renders a labelled input, associated via htmlFor/id", () => {
  render(<Input label="Email" id="email" />);
  const input = screen.getByLabelText("Email");
  expect(input).toBeInTheDocument();
  expect(input).toHaveAttribute("id", "email");
});

test("generates an id when none is passed, keeping label association intact", () => {
  render(<Input label="Email" />);
  expect(screen.getByLabelText("Email")).toBeInTheDocument();
});

test("renders no error message and no aria-invalid by default", () => {
  render(<Input label="Email" />);
  const input = screen.getByLabelText("Email");
  expect(input).not.toHaveAttribute("aria-invalid");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("renders an error message wired to the input via aria-describedby/aria-invalid", () => {
  render(<Input label="Email" error="Enter a valid email address." />);
  const input = screen.getByLabelText("Email");
  const error = screen.getByRole("alert");

  expect(error).toHaveTextContent("Enter a valid email address.");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAttribute("aria-describedby", error.id);
});

test("renders a persistent hint, wired via aria-describedby, when there's no error", () => {
  render(<Input label="Password" hint="At least 8 characters" />);
  const input = screen.getByLabelText("Password");
  const hint = screen.getByText("At least 8 characters");

  expect(input).toHaveAttribute("aria-describedby", hint.id);
  expect(input).not.toHaveAttribute("aria-invalid");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("an error replaces the hint rather than showing both at once", () => {
  render(
    <Input
      label="Password"
      hint="At least 8 characters"
      error="Password must be at least 8 characters."
    />
  );

  expect(screen.getByRole("alert")).toHaveTextContent("Password must be at least 8 characters.");
  expect(screen.queryByText("At least 8 characters")).not.toBeInTheDocument();
});

test("passes through native input props (type, disabled, value, onChange)", () => {
  render(<Input label="Password" type="password" disabled value="secret" onChange={() => {}} />);
  const input = screen.getByLabelText("Password");
  expect(input).toHaveAttribute("type", "password");
  expect(input).toBeDisabled();
  expect(input).toHaveValue("secret");
});

test("a password field gets a show/hide toggle; other field types don't", () => {
  render(<Input label="Password" type="password" onChange={() => {}} />);
  expect(screen.getByRole("button", { name: "Show password" })).toBeInTheDocument();

  render(<Input label="Email" type="email" onChange={() => {}} />);
  expect(screen.getAllByRole("button")).toHaveLength(1); // only the password field's toggle
});

test("the show/hide toggle reveals and re-hides the password without submitting the form", async () => {
  const user = userEvent.setup();
  render(<Input label="Password" type="password" onChange={() => {}} />);
  const input = screen.getByLabelText("Password");
  const toggle = screen.getByRole("button", { name: "Show password" });

  expect(input).toHaveAttribute("type", "password");
  expect(toggle).toHaveAttribute("type", "button");

  await user.click(toggle);
  expect(input).toHaveAttribute("type", "text");
  expect(screen.getByRole("button", { name: "Hide password" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Hide password" }));
  expect(input).toHaveAttribute("type", "password");
});
