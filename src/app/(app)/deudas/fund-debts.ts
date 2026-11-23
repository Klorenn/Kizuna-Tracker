import type { GroupLoaded } from "@/lib/groups-contract";
import type { MyFundDebts } from "@/lib/groups-fines-contract";

/** The fund loader's result as `GroupFundsSection` takes it: the data, or null when the read failed (the section shows LoadFailed). */
export function fundDebtsForSection(res: GroupLoaded<MyFundDebts>): MyFundDebts | null {
  return res.ok ? res.data : null;
}
