import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import pool from "./db.js";
import redisClient from "./redis.js";

import userRoutes from "./routes/userRoutes.js";
import documentRoutes from "./routes/documentRoutes.js";

dotenv.config();

const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  "https://collab-editor-frontend-xi.vercel.app",
];

// ✅ Apply CORS for API
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.use(express.json());

// ✅ Routes
app.use("/api/users", userRoutes);
app.use("/api/documents", documentRoutes);

// ✅ Server + Socket.IO
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Test endpoint (to debug 502)
app.get("/", (req, res) => {
  res.send("✅ Backend is running");
});

// Redis presence helpers
const addUserToDoc = async (docId, username) => {
  await redisClient.sAdd(`doc:${docId}:users`, username);
};
const removeUserFromDoc = async (docId, username) => {
  await redisClient.sRem(`doc:${docId}:users`, username);
};
const getUsersInDoc = async (docId) => {
  return await redisClient.sMembers(`doc:${docId}:users`);
};

// Socket.IO events
io.on("connection", (socket) => {
  console.log("🔌 User connected:", socket.id);

  socket.on("joinDocument", async ({ docId, username }) => {
    socket.join(docId);
    await addUserToDoc(docId, username);

    const timestamp = new Date();

    io.to(docId).emit("chatMessage", {
      username: "System",
      message: `${username} joined the document`,
      timestamp,
      system: true,
    });

    const users = await getUsersInDoc(docId);
    io.to(docId).emit("presenceUpdate", users);
  });

  socket.on("editDocument", async ({ docId, content }) => {
    socket.to(docId).emit("documentUpdate", content);
    await pool.query(
      `UPDATE documents SET content=$1, updated_at=NOW() WHERE id=$2`,
      [content, docId]
    );
  });

  socket.on("chatMessage", async ({ docId, username, message }) => {
    const timestamp = new Date();
    await pool.query(
      `INSERT INTO chat_messages (document_id, username, message, created_at) VALUES ($1,$2,$3,$4)`,
      [docId, username, message, timestamp]
    );
    io.to(docId).emit("chatMessage", { username, message, timestamp });
  });

  socket.on("leaveDocument", async ({ docId, username }) => {
    await removeUserFromDoc(docId, username);

    const timestamp = new Date();

    io.to(docId).emit("chatMessage", {
      username: "System",
      message: `${username} left the document`,
      timestamp,
      system: true,
    });

    const users = await getUsersInDoc(docId);
    io.to(docId).emit("presenceUpdate", users);
  });

  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
  });
});

// ✅ Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
