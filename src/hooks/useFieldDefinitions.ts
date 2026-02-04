import { useEffect, useState } from "react";
import { fieldService, FieldDefinition } from "../services/fieldService";

export const useFieldDefinitions = () => {
  const [definitions, setDefinitions] = useState<FieldDefinition[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const data = await fieldService.getDefinitions();
      setDefinitions(data);
    } catch {
      setDefinitions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  return { definitions, loading, reload };
};
