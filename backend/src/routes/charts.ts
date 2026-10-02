import { Router } from "express";
import {
  getSentimentDistribution,
  getSentimentByKeyword,
  getSentimentByPlatform,
  getSentimentOverTime,
} from "../services/queryService";
import { orgOf } from "../middleware/auth";
import { parseFilters } from "./items";

export const chartsRouter = Router();

chartsRouter.get("/distribution", async (req, res, next) => {
  try {
    const f = parseFilters(req.query);
    res.json(await getSentimentDistribution(orgOf(req), f.keyword, f.platform, f.dateFrom, f.dateTo));
  } catch (err) {
    next(err);
  }
});

chartsRouter.get("/by-keyword", async (req, res, next) => {
  try { res.json(await getSentimentByKeyword(orgOf(req))); } catch (err) { next(err); }
});

chartsRouter.get("/by-platform", async (req, res, next) => {
  try {
    const f = parseFilters(req.query);
    res.json(await getSentimentByPlatform(orgOf(req), f.keyword, f.dateFrom, f.dateTo));
  } catch (err) {
    next(err);
  }
});

chartsRouter.get("/over-time", async (req, res, next) => {
  try {
    const f = parseFilters(req.query);
    res.json(await getSentimentOverTime(orgOf(req), f.keyword, f.platform, f.dateFrom, f.dateTo));
  } catch (err) {
    next(err);
  }
});
