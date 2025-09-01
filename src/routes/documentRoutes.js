import express from "express";
import pool from "../db.js";
import redisClient from "../redis.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { title } = req.body;
  const result = await pool.query(
    `INSERT INTO documents (title, content) VALUES ($1, '') RETURNING *`,
    [title]
  );
  res.json(result.rows[0]);
});

router.get("/", async (req, res) => {
  const docs = await pool.query(
    `SELECT id, title, updated_at FROM documents ORDER BY updated_at DESC`
  );

  const withCounts = await Promise.all(
    docs.rows.map(async (doc) => {
      const activeCount = await redisClient.sCard(`doc:${doc.id}:users`);
      return { ...doc, activeUsers: activeCount };
    })
  );

  res.json(withCounts);
});

router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const doc = await pool.query(`SELECT * FROM documents WHERE id=$1`, [id]);
  const chat = await pool.query(
    `SELECT * FROM chat_messages WHERE document_id=$1 ORDER BY created_at DESC LIMIT 20`,
    [id]
  );
  res.json({ document: doc.rows[0], chat: chat.rows.reverse() });
});

export default router;
