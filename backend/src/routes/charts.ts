import { Router } from "express";
import {
  getSentimentDistribution,
  getSentimentByKeyword,
  getSentimentByPlatform,
  getSentimentOverTime,
} from "../services/queryService";

export const chartsRouter = Router();

// GET /api/charts/distribution?keyword=&platform=&dateFrom=&dateTo=
chartsRouter.get("/distribution", async (req, res) => {
  const keyword = req.query.keyword ? String(req.query.keyword) : undefined;
  const platform = req.query.platform ? String(req.query.platform) : undefined;
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : undefined;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : undefined;
  const data = await getSentimentDistribution(keyword, platform, dateFrom, dateTo);
  res.json(data);
});

// GET /api/charts/by-keyword
chartsRouter.get("/by-keyword", async (_req, res) => {
  const data = await getSentimentByKeyword();
  res.json(data);
});

// GET /api/charts/by-platform?keyword=&dateFrom=&dateTo=
chartsRouter.get("/by-platform", async (req, res) => {
  const keyword = req.query.keyword ? String(req.query.keyword) : undefined;
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : undefined;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : undefined;
  const data = await getSentimentByPlatform(keyword, dateFrom, dateTo);
  res.json(data);
});

// GET /api/charts/over-time?keyword=&platform=&dateFrom=&dateTo=
chartsRouter.get("/over-time", async (req, res) => {
  const keyword = req.query.keyword ? String(req.query.keyword) : undefined;
  const platform = req.query.platform ? String(req.query.platform) : undefined;
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : undefined;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : undefined;
  const data = await getSentimentOverTime(keyword, platform, dateFrom, dateTo);
  res.json(data);
});
