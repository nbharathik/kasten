// For the tests: let the browser draw a frame, as the code that waits for a frame to focus a field does.

import { act } from "@testing-library/react";

/** Lets `count` frames go by, inside `act` so React has settled after each. */
export async function frames(count = 1): Promise<void> {
  for (let n = 0; n < count; n++) {
    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
  }
}
