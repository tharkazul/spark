/**
 * "What your coach knows about you": the athlete reads, edits and deletes the
 * facts and metrics the coach uses (Profile -> Coach).
 */
const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../services/auth");
const facts = require("../services/athleteFacts");

router.get("/api/facts", authenticateToken, async (req, res) => {
  try {
    await facts.migrateUser(req.user.id);
    const [list, metrics] = await Promise.all([facts.listFacts(req.user.id), facts.listMetrics(req.user.id)]);
    res.json({
      facts: list.map((f) => ({
        id: f.id,
        category: f.category,
        text: f.text,
        source: f.source,
        until: f.valid_until,
        updatedAt: f.updated_at,
      })),
      metrics,
    });
  } catch (e) {
    console.error("[Facts] list failed:", e);
    res.status(500).json({ error: "Could not load what your coach knows." });
  }
});

router.post("/api/facts", authenticateToken, async (req, res) => {
  const { category, text, until } = req.body || {};
  if (!String(text || "").trim()) return res.status(400).json({ error: "Text is required." });
  const id = await facts.addFact(req.user.id, { category, text, until, source: "athlete" });
  await facts.renderMemory(req.user.id);
  res.json({ success: true, id });
});

router.put("/api/facts/:id", authenticateToken, async (req, res) => {
  const { category, text, until } = req.body || {};
  const ok = await facts.updateFact(req.user.id, Number(req.params.id), { category, text, until });
  if (!ok) return res.status(404).json({ error: "Not found." });
  await facts.renderMemory(req.user.id);
  res.json({ success: true });
});

router.delete("/api/facts/:id", authenticateToken, async (req, res) => {
  const ok = await facts.deleteFact(req.user.id, Number(req.params.id));
  if (!ok) return res.status(404).json({ error: "Not found." });
  await facts.renderMemory(req.user.id);
  res.json({ success: true });
});

router.put("/api/athlete-metrics/:key", authenticateToken, async (req, res) => {
  const value = String((req.body || {}).value ?? "").trim();
  if (!value) return res.status(400).json({ error: "Value is required." });
  const key = await facts.setMetric(req.user.id, req.params.key, value, "athlete");
  if (!key) return res.status(400).json({ error: "Unknown metric." });
  res.json({ success: true, key });
});

router.delete("/api/athlete-metrics/:key", authenticateToken, async (req, res) => {
  const ok = await facts.deleteMetric(req.user.id, req.params.key);
  if (!ok) return res.status(404).json({ error: "Not found." });
  res.json({ success: true });
});

module.exports = router;
