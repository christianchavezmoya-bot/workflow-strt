import { describe, expect, it } from "vitest";
import { getDocumentPreviewFileType } from "./documentPreview";

describe("getDocumentPreviewFileType", () => {
  it("detects xlsx before generic openxmlformats docx", () => {
    expect(
      getDocumentPreviewFileType(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "AIM100_Motherboard RevD BOM.xlsx",
      ),
    ).toBe("xlsx");
  });

  it("detects docx from extension", () => {
    expect(
      getDocumentPreviewFileType(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Shuttle Car.docx",
      ),
    ).toBe("docx");
  });

  it("detects dwg and dxf CAD extensions", () => {
    expect(getDocumentPreviewFileType("application/octet-stream", "panel-layout.dwg")).toBe("dwg");
    expect(getDocumentPreviewFileType(null, "export.dxf")).toBe("dxf");
  });
});
