import { Checkbox, ListItemText, Menu, MenuItem } from "@mui/material";

type Props = {
  anchorEl: HTMLElement | null;
  columnKey: string;
  filterOptions: string[];
  selectedOptions: Set<string> | undefined;
  onClose: () => void;
  onApplySort: (direction: "asc" | "desc") => void;
  onClearSort: () => void;
  onToggleFilterOption: (option: string) => void;
};

export default function AssetInstallationColumnFilterMenu({
  anchorEl,
  columnKey,
  filterOptions,
  selectedOptions,
  onClose,
  onApplySort,
  onClearSort,
  onToggleFilterOption,
}: Props) {
  const isDateColumn = columnKey === "dateCreated" || columnKey === "dateClosed";

  return (
    <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={onClose}>
      {isDateColumn ? (
        <>
          <MenuItem onClick={() => { onApplySort("asc"); onClose(); }}>Sort oldest first</MenuItem>
          <MenuItem onClick={() => { onApplySort("desc"); onClose(); }}>Sort newest first</MenuItem>
        </>
      ) : (
        <>
          <MenuItem onClick={() => { onApplySort("asc"); onClose(); }}>Sort A → Z</MenuItem>
          <MenuItem onClick={() => { onApplySort("desc"); onClose(); }}>Sort Z → A</MenuItem>
        </>
      )}
      <MenuItem onClick={() => { onClearSort(); onClose(); }}>Clear sort</MenuItem>
      {filterOptions.map((option) => {
        const label = option || "(Blank)";
        const selected = !!selectedOptions?.has(option);
        return (
          <MenuItem
            key={`${columnKey}-${option}`}
            onClick={() => onToggleFilterOption(option)}
          >
            <Checkbox checked={selected} size="small" />
            <ListItemText primary={label} />
          </MenuItem>
        );
      })}
    </Menu>
  );
}
