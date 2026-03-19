import { useEffect, useState } from "react";
import { fieldService, FieldDefinition } from "../services/fieldService";

const EVENT_NAME = "field-definitions-changed";

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

  useEffect(() => {
    const handler = () => reload();
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, []);

  return { definitions, loading, reload };
};
