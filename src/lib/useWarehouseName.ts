import { useData } from "../state/DataContext";
import { useBi } from "./useBi";

/** Warehouse display name from the Warehouse Master (falls back to the code for unknown warehouses). */
export function useWarehouseName() {
  const { warehouses } = useData();
  const bi = useBi();
  return (code: string) => {
    const w = warehouses.find((x) => x.code === code);
    return w ? bi(w.name) : code;
  };
}
