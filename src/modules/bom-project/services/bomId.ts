import { randomId } from "../../../utils/randomId";

export function createBomId(prefix = "bom"): string {
  return randomId(prefix);
}
