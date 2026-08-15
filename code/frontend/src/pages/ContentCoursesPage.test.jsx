import { test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { courseService } from "../services/course.service.js";
import { ContentCoursesPage } from "./ContentCoursesPage.jsx";

vi.mock("../context/AuthContext.jsx", () => ({
  useAuth: vi.fn(),
}));
vi.mock("../services/course.service.js", () => ({
  courseService: { list: vi.fn(), create: vi.fn() },
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/admin/content"]}>
      <Routes>
        <Route path="/admin/content" element={<ContentCoursesPage />} />
        <Route path="/admin/content/courses/:courseId" element={<div>Course detail page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ user: { id: "i1", role: "instructor" } });
});

test("renders courses, tagging which ones the caller owns", async () => {
  courseService.list.mockResolvedValue({
    courses: [
      { id: 1, title: "Quantum Algorithms", created_by_id: "i1" },
      { id: 2, title: "Quantum Hardware", created_by_id: "i2" },
    ],
  });
  renderPage();

  expect(await screen.findByText("Quantum Algorithms")).toBeInTheDocument();
  expect(screen.getByText("Yours")).toBeInTheDocument();
  expect(screen.getByText("Not yours -- read only")).toBeInTheDocument();
});

test("admin sees a neutral ownership label instead of read-only", async () => {
  useAuth.mockReturnValue({ user: { id: "a1", role: "admin" } });
  courseService.list.mockResolvedValue({
    courses: [{ id: 1, title: "Quantum Algorithms", created_by_id: "i1" }],
  });
  renderPage();

  expect(await screen.findByText("By another instructor")).toBeInTheDocument();
});

test("shows an empty state when there are no courses", async () => {
  courseService.list.mockResolvedValue({ courses: [] });
  renderPage();

  expect(await screen.findByText(/No courses yet/)).toBeInTheDocument();
});

test("creating a course navigates straight to its detail page", async () => {
  const user = userEvent.setup();
  courseService.list.mockResolvedValue({ courses: [] });
  courseService.create.mockResolvedValue({ id: 9, title: "New Course" });
  renderPage();

  await screen.findByText(/No courses yet/);
  await user.type(screen.getByLabelText("Title"), "New Course");
  await user.click(screen.getByRole("button", { name: "Create course" }));

  expect(courseService.create).toHaveBeenCalledWith({ title: "New Course", narrative: undefined });
  expect(await screen.findByText("Course detail page")).toBeInTheDocument();
});

test("a failed create shows an error banner without navigating away", async () => {
  const user = userEvent.setup();
  courseService.list.mockResolvedValue({ courses: [] });
  courseService.create.mockRejectedValue({
    response: { data: { error: { code: "VALIDATION_ERROR", message: "Title is required." } } },
  });
  renderPage();

  await screen.findByText(/No courses yet/);
  await user.type(screen.getByLabelText("Title"), "X");
  await user.click(screen.getByRole("button", { name: "Create course" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Title is required.");
  expect(screen.queryByText("Course detail page")).not.toBeInTheDocument();
});

test("a failed list shows an error banner with a retry that re-fetches", async () => {
  const user = userEvent.setup();
  courseService.list.mockRejectedValueOnce({
    response: { data: { error: { code: "FORBIDDEN", message: "Not allowed." } } },
  });
  renderPage();

  expect(await screen.findByRole("alert")).toHaveTextContent("Not allowed.");

  courseService.list.mockResolvedValueOnce({ courses: [] });
  await user.click(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByText(/No courses yet/)).toBeInTheDocument();
});
