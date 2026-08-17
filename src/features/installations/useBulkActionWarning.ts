import { useCallback, useRef, useState } from "react";
import type { BulkWarnRow } from "./assetInstallationBulkActions";

type ShowBulkWarningParams = {
  title: string;
  body: string;
  rows: BulkWarnRow[];
  onProceed: () => void;
};

export function useBulkActionWarning() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [rows, setRows] = useState<BulkWarnRow[]>([]);
  const proceedRef = useRef<(() => void) | null>(null);

  const closeBulkWarning = useCallback(() => {
    setOpen(false);
  }, []);

  const showBulkWarning = useCallback(({ title: nextTitle, body: nextBody, rows: nextRows, onProceed }: ShowBulkWarningParams) => {
    setTitle(nextTitle);
    setBody(nextBody);
    setRows(nextRows);
    proceedRef.current = onProceed;
    setOpen(true);
  }, []);

  const proceedBulkWarning = useCallback(() => {
    setOpen(false);
    proceedRef.current?.();
  }, []);

  return {
    bulkWarnOpen: open,
    bulkWarnTitle: title,
    bulkWarnBody: body,
    bulkWarnRows: rows,
    showBulkWarning,
    closeBulkWarning,
    proceedBulkWarning,
  };
}
