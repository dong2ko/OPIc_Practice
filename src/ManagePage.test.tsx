import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import { ManagePage } from "./App";
import { demoWorkspace } from "./data/demo";

describe("Manage materials", () => {
  it("filters questions by administrative fields and shows an empty state", () => {
    const workspace = { data: demoWorkspace } as unknown as ComponentProps<typeof ManagePage>["workspace"];
    render(<ManagePage workspace={workspace} />);

    const search = screen.getByRole("searchbox", { name: "Search managed questions" });

    fireEvent.change(search, { target: { value: "DEMO-02" } });
    expect(screen.getByRole("heading", { name: "A memorable music experience" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Describe your home" })).not.toBeInTheDocument();
    expect(screen.getByText("1 of 3 questions")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "호텔" } });
    expect(screen.getByRole("heading", { name: "Change a reservation" })).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "no matching question" } });
    expect(screen.getByRole("heading", { name: "No questions match" })).toBeInTheDocument();
    expect(screen.getByText("0 of 3 questions")).toBeInTheDocument();
  });
});
