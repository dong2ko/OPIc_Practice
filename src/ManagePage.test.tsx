import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ManagePage } from "./App";
import { demoWorkspace } from "./data/demo";

afterEach(cleanup);

describe("Manage materials", () => {
  it("searches question and answer fields and shows an empty state", () => {
    const workspace = { data: demoWorkspace } as unknown as ComponentProps<typeof ManagePage>["workspace"];
    render(<ManagePage workspace={workspace} />);

    const search = screen.getByRole("searchbox", { name: "Search managed questions and answers" });

    fireEvent.change(search, { target: { value: "DEMO-02" } });
    expect(screen.getByRole("heading", { name: "A memorable music experience" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Describe your home" })).not.toBeInTheDocument();
    expect(screen.getByText("1 of 3 questions")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "호텔" } });
    expect(screen.getByRole("heading", { name: "Change a reservation" })).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "demanding day" } });
    expect(screen.getByRole("heading", { name: "A memorable music experience" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Describe your home" })).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "no matching question" } });
    expect(screen.getByRole("heading", { name: "No questions or answers match" })).toBeInTheDocument();
    expect(screen.getByText("0 of 3 questions")).toBeInTheDocument();
  });

  it("groups multiple sample answers under their question", () => {
    const workspace = {
      data: {
        ...demoWorkspace,
        answers: [...demoWorkspace.answers, { ...demoWorkspace.answers[0], id: "answer-home-short", label: "Short version", english_text: "A concise second answer." }],
      },
    } as unknown as ComponentProps<typeof ManagePage>["workspace"];
    render(<ManagePage workspace={workspace} />);

    expect(screen.queryByRole("button", { name: "Answers" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Questions & answers" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Short version")).toBeInTheDocument();
    expect(screen.getByText("3 sample answers")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Add sample answer/ })).toHaveLength(3);
  });
});
