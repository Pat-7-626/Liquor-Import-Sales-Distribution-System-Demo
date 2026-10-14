import { useToast } from "../components/Toast";
import type { ActionResult } from "./api";
import { useBi } from "./useBi";

/** Shows a server action's outcome: the success message, or the server's own reason it was refused. */
export function useRunAction() {
  const showToast = useToast();
  const bi = useBi();
  return async (pending: ActionResult | Promise<ActionResult>, successMessage: string): Promise<boolean> => {
    const result = await pending;
    if (result.ok) showToast(successMessage);
    else showToast(bi(result.error), "error");
    return result.ok;
  };
}
