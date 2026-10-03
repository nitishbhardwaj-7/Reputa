import { assertFeature, PlanError } from "../services/billingService";
import { Router } from "express";
import { generateExcelReport, ExcelExportOptions } from "../services/excelService";
import { orgOf } from "../middleware/auth";

export const exportRouter = Router();

// GET /excel?scope=&keyword=&platform=&sentiment=&dateFrom=&dateTo=&search=&author=
exportRouter.get("/excel", async (req, res) => {
  try {
    await assertFeature(orgOf(req), "exports");
    const scope = (["brand", "competitor", "all"].includes(String(req.query.scope)) ? String(req.query.scope) : "all") as ExcelExportOptions["scope"];
    const sentimentRaw = req.query.sentiment ? String(req.query.sentiment).toUpperCase() : undefined;
    const options: ExcelExportOptions = {
      scope,
      keyword: req.query.keyword ? String(req.query.keyword) : undefined,
      platform: req.query.platform ? String(req.query.platform) : undefined,
      sentiment: sentimentRaw && ["POSITIVE", "NEGATIVE", "NEUTRAL"].includes(sentimentRaw) ? (sentimentRaw as any) : undefined,
      dateFrom: req.query.dateFrom ? new Date(String(req.query.dateFrom)) : undefined,
      dateTo: req.query.dateTo ? new Date(String(req.query.dateTo)) : undefined,
      search: req.query.search ? String(req.query.search) : undefined,
      author: req.query.author ? String(req.query.author) : undefined,
    };

    const buffer = await generateExcelReport(orgOf(req), options);
    const filename = `Mentions_Report_${scope}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err: any) {
    if (err instanceof PlanError) return res.status(402).json({ error: err.message, code: err.code, upgrade: true });
    console.error("Excel export error:", err);
    res.status(500).json({ error: err?.message || "Failed to generate the report." });
  }
});
