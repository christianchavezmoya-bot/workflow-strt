import { useEffect, useMemo, useState } from "react";
import { useActiveOffice } from "./useActiveOffice";
import { useAuth } from "./useAuth";
import { officesService } from "../services/officesService";
import type { Office } from "../components/GlobalOfficeMap";
import { inferTimeZoneFromLocation, inferTimeZoneFromOfficeLabel } from "../utils/officeTimeZone";
import { isValidTimeZone } from "../utils/datetime";

/** IANA zone for the active global office filter (sidebar country/region). */
export function useOfficeTimeZone(): { zone: string | undefined; label: string } {
  const { activeOffice } = useActiveOffice();
  const { user } = useAuth();
  const [offices, setOffices] = useState<Office[]>([]);

  useEffect(() => {
    let active = true;
    void officesService.getAll().then((list) => {
      if (active) setOffices(list);
    }).catch(() => {});
    const handler = () => {
      void officesService.getAll().then((list) => setOffices(list)).catch(() => {});
    };
    window.addEventListener("repo:offices:updated", handler);
    return () => {
      active = false;
      window.removeEventListener("repo:offices:updated", handler);
    };
  }, []);

  return useMemo(() => {
    if (activeOffice === "All") {
      return { zone: undefined, label: "All offices" };
    }
    const match = offices.find(
      (o) => o.country === activeOffice || o.city === activeOffice || o.state === activeOffice,
    );
    const zone = match
      ? inferTimeZoneFromLocation(match.country, match.state)
      : inferTimeZoneFromLocation(activeOffice, undefined);
    const fromLabel = inferTimeZoneFromOfficeLabel(activeOffice);
    const fromUser = inferTimeZoneFromOfficeLabel(user?.office);
    const valid = isValidTimeZone(zone)
      ? zone
      : isValidTimeZone(fromLabel)
        ? fromLabel
        : isValidTimeZone(fromUser)
          ? fromUser
          : undefined;
    return { zone: valid, label: activeOffice };
  }, [activeOffice, offices, user?.office]);
}
