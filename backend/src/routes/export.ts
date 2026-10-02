import { Router } from "express";
import { generateExcelReport, ExcelExportOptions } from "../services/excelService";

export const exportRouter = Router();

// GET /api/export/excel?scope=...&keyword=...&platform=...&sentiment=...&dateFrom=...&dateTo=...
exportRouter.get("/excel", async (req, res) => {
  try {
    const scope = (req.query.scope as any) || "all";
    const keyword = req.query.keyword ? String(req.query.keyword) : undefined;
    const platform = req.query.platform ? String(req.query.platform) : undefined;
    const sentiment = req.query.sentiment ? (String(req.query.sentiment).toUpperCase() as any) : undefined;
    const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : undefined;
    const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : undefined;
    const search = req.query.search ? String(req.query.search) : undefined;
    const author = req.query.author ? String(req.query.author) : undefined;

    const options: ExcelExportOptions = {
      scope,
      keyword,
      platform,
      sentiment,
      dateFrom,
      dateTo,
      search,
      author,
    };

    const buffer = await generateExcelReport(options);

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `ORM_Report_${scope}_${timestamp}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err: any) {
    console.error("Excel export error:", err);
    res.status(500).json({ error: err.message || "Failed to generate Excel report." });
  }
});
