/**
 * bomTemplateGenerator
 * Generates a downloadable Excel BOM template pre-formatted with
 * the correct column headers, example rows, and column widths.
 *
 * Columns:
 *   Part Number | Description | Brand | Supplier / Manufacturer |
 *   Alt Part Number | Price / Unit | Qty | Total Cost | Link
 */

import * as XLSX from "xlsx";

const HEADERS = [
  "Part Number",
  "Description",
  "Brand",
  "Supplier / Manufacturer",
  "Alt Part Number",
  "Price / Unit",
  "Qty",
  "Total Cost",
  "Link",
];

const EXAMPLE_ROWS = [
  [
    "CAM-4K-001",
    "IP Camera 4K Outdoor",
    "Hikvision",
    "Hikvision Australia",
    "DS-2CD2143G2-I",
    185.00,
    4,
    740.00,
    "https://www.hikvision.com/au/products/IP-Camera/",
  ],
  [
    "NVR-16CH-002",
    "16-Channel NVR",
    "Hikvision",
    "Hikvision Australia",
    "DS-7616NXI-I2",
    420.00,
    1,
    420.00,
    "https://www.hikvision.com/au/products/NVR/",
  ],
  [
    "CAT6-CBL-003",
    "Cat6 Network Cable (per metre)",
    "CommScope",
    "Cablex Australia",
    "",
    1.20,
    80,
    96.00,
    "",
  ],
];

const COL_WIDTHS = [18, 32, 18, 28, 20, 14, 8, 14, 40];

export function downloadBomTemplate(): void {
  const wb = XLSX.utils.book_new();

  // ── Instructions sheet ──────────────────────────────────────────────────────
  const instructions = [
    ["Commtrac BOM Template — Instructions"],
    [""],
    ["1. Go to the 'BOM' sheet and fill in your equipment list."],
    ["2. Each row = one feature/part (e.g. a camera, cable run, NVR)."],
    ["3. Part Number is required. All other fields are optional but recommended."],
    ["4. Total Cost = Price / Unit × Qty (you can leave it blank — the app will calculate it)."],
    ["5. Link can be a URL to a product page, datasheet, or supplier listing."],
    ["6. Delete the example rows before uploading, or leave them — the app will skip rows it cannot map."],
    ["7. Save as .xlsx and upload via the BOM to Project importer."],
    [""],
    ["Column Reference:"],
    ["Part Number", "Your internal or supplier part/SKU number"],
    ["Description", "Full name or description of the item"],
    ["Brand", "Manufacturer brand (e.g. Hikvision, Axis, CommScope)"],
    ["Supplier / Manufacturer", "Who you purchase it from"],
    ["Alt Part Number", "Alternative or substitute part number"],
    ["Price / Unit", "Cost per single unit (ex-GST recommended)"],
    ["Qty", "Quantity required for this project"],
    ["Total Cost", "Price / Unit × Qty — can be left blank"],
    ["Link", "URL to product page, datasheet, or supplier listing"],
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instructions);
  wsInstr["!cols"] = [{ wch: 36 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsInstr, "Instructions");

  // ── BOM sheet ───────────────────────────────────────────────────────────────
  const data = [HEADERS, ...EXAMPLE_ROWS];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = COL_WIDTHS.map((w) => ({ wch: w }));

  // Freeze the header row
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };

  XLSX.utils.book_append_sheet(wb, ws, "BOM");

  XLSX.writeFile(wb, "Commtrac_BOM_Template.xlsx");
}
