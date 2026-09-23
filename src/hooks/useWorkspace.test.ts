import { renderHook, waitFor } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { useWorkspace } from "./useWorkspace";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("../lib/supabase", () => ({
  supabase: { from },
}));

function createQuery() {
  const result = Promise.resolve({ data: [], error: null });
  const query = {
    select: vi.fn(),
    is: vi.fn(),
    not: vi.fn(),
    order: vi.fn(),
    then: result.then.bind(result),
  };
  query.select.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.not.mockReturnValue(query);
  query.order.mockReturnValue(query);
  return query;
}

function session(userId: string, accessToken: string): Session {
  return {
    access_token: accessToken,
    refresh_token: "refresh-token",
    expires_in: 3600,
    token_type: "bearer",
    user: { id: userId },
  } as Session;
}

describe("useWorkspace", () => {
  it("does not reload data when Supabase refreshes the same user's session", async () => {
    from.mockImplementation(() => createQuery());

    const { rerender, result } = renderHook(
      ({ currentSession }) => useWorkspace(currentSession),
      { initialProps: { currentSession: session("owner-1", "token-1") } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(from).toHaveBeenCalledTimes(14);

    rerender({ currentSession: session("owner-1", "token-2") });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(from).toHaveBeenCalledTimes(14);
  });
});
