import express from "express";
const router = express.Router();

router.post("/login", async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "Username required" });
  res.json({ username });
});

export default router;
