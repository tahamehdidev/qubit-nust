import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { RoleGate } from "./RoleGate.jsx";

vi.mock("../../context/AuthContext.jsx", () => ({
  useAuth: vi.fn(),
}));

function renderAt(role) {
  useAuth.mockReturnValue({ user: { id: "u1", role } });
  return render(
    <MemoryRouter initialEntries={["/admin/users"]}>
      <Routes>
        <Route element={<RoleGate allow={["admin"]} />}>
          <Route path="/admin/users" element={<div>Admin content</div>} />
        </Route>
        <Route path="/dashboard" element={<div>Dashboard page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

test("renders the wrapped route when the caller's role is in the allow list", () => {
  renderAt("admin");
  expect(screen.getByText("Admin content")).toBeInTheDocument();
});

test("redirects to /dashboard instead of rendering when the role isn't allowed", () => {
  renderAt("instructor");
  expect(screen.getByText("Dashboard page")).toBeInTheDocument();
  expect(screen.queryByText("Admin content")).not.toBeInTheDocument();
});
