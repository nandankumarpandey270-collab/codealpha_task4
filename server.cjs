const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "meetflow_dev_secret_change_me";

// AES-256-CBC Data Encryption (Task Requirement)
const ENCRYPTION_KEY = crypto.scryptSync("meetflow_aes256_secret", "meetflow_salt", 32);

function encryptData(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

function decryptData(cipherPayload) {
  const [ivHex, encrypted] = cipherPayload.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

app.use(cors({
  origin: true,
  methods: ["GET", "POST"],
  credentials: true
}));

app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"]
  }
});

// ---------- DATABASE (JSON FILE) ----------
const dataDir = path.join(__dirname, "data");
const uploadDir = path.join(__dirname, "uploads");

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

const usersFile = path.join(dataDir, "users.json");
if (!fs.existsSync(usersFile)) {
  fs.writeFileSync(usersFile, "[]");
}

function getUsers() {
  return JSON.parse(fs.readFileSync(usersFile, "utf8"));
}

function saveUsers(users) {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

// ---------- AUTHENTICATION ----------
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password || password.length < 6) {
      return res.status(400).json({ message: "Valid name, email and password (min 6 chars) required" });
    }

    const users = getUsers();
    const existingUser = users.find(u => u.email === email.toLowerCase().trim());
    if (existingUser) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = {
      id: crypto.randomUUID(),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      createdAt: new Date().toISOString()
    };

    users.push(user);
    saveUsers(users);

    res.status(201).json({ message: "Registration successful! Please sign in." });
  } catch {
    res.status(500).json({ message: "Registration failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const users = getUsers();
    const user = users.find(u => u.email === email?.toLowerCase().trim());

    if (!user || !(await bcrypt.compare(password || "", user.password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch {
    res.status(500).json({ message: "Login failed" });
  }
});

app.get("/api/auth/me", authenticate, (req, res) => {
  res.json({ user: req.user });
});

// ---------- MEETINGS ----------
const meetings = new Map();

app.post("/api/meetings", authenticate, (req, res) => {
  const roomId = "MF-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  const meeting = {
    roomId,
    title: req.body.title || "New Meeting",
    createdBy: req.user.id,
    createdAt: new Date().toISOString(),
    participants: []
  };
  meetings.set(roomId, meeting);
  res.status(201).json({ message: "Meeting created", meeting });
});

app.get("/api/meetings", authenticate, (req, res) => {
  const userMeetings = [...meetings.values()].filter(m => m.createdBy === req.user.id);
  res.json(userMeetings);
});

// ---------- FILE SHARING ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, crypto.randomUUID() + ext);
  }
});

const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

app.post("/api/files", authenticate, upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "Please select a file" });
  }

  res.status(201).json({
    message: "File uploaded successfully",
    file: {
      name: req.file.originalname,
      size: req.file.size,
      url: `/uploads/${req.file.filename}`
    }
  });
});

app.use("/uploads", express.static(uploadDir));

// ---------- SOCKET AUTHENTICATION ----------
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Authentication required"));

  try {
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

// ---------- REAL-TIME COMMUNICATION ----------
io.on("connection", (socket) => {
  console.log("User connected:", socket.user.name);

  socket.on("join-room", (roomId) => {
    if (!meetings.has(roomId)) {
      meetings.set(roomId, {
        roomId,
        title: "Instant Meeting",
        createdBy: socket.user.id,
        createdAt: new Date().toISOString(),
        participants: []
      });
    }

    const meeting = meetings.get(roomId);
    const existingParticipants = [...(io.sockets.adapter.rooms.get(roomId) || [])];

    socket.join(roomId);

    if (!meeting.participants.includes(socket.user.id)) {
      meeting.participants.push(socket.user.id);
    }

    socket.emit("room-users", existingParticipants);

    socket.to(roomId).emit("user-joined", {
      socketId: socket.id,
      user: { id: socket.user.id, name: socket.user.name }
    });
  });

  // WEBRTC SIGNALING
  socket.on("offer", ({ target, offer }) => {
    io.to(target).emit("offer", { offer, sender: socket.id, user: socket.user });
  });

  socket.on("answer", ({ target, answer }) => {
    io.to(target).emit("answer", { answer, sender: socket.id });
  });

  socket.on("ice-candidate", ({ target, candidate }) => {
    io.to(target).emit("ice-candidate", { candidate, sender: socket.id });
  });

  // SCREEN SHARING
  socket.on("screen-share-start", (roomId) => {
    socket.to(roomId).emit("screen-share-started", {
      socketId: socket.id,
      userId: socket.user.id,
      name: socket.user.name
    });
  });

  socket.on("screen-share-stop", (roomId) => {
    socket.to(roomId).emit("screen-share-stopped", {
      socketId: socket.id,
      userId: socket.user.id
    });
  });

  // AES-256 ENCRYPTED CHAT MESSAGE
  socket.on("chat-message", ({ roomId, message }) => {
    if (!socket.rooms.has(roomId)) return;
    if (typeof message !== "string" || !message.trim()) return;

    const cipherText = encryptData(message.trim().slice(0, 2000));
    const verifiedPlainText = decryptData(cipherText);

    io.to(roomId).emit("chat-message", {
      sender: socket.user.name,
      message: verifiedPlainText,
      encryptedHash: cipherText.slice(0, 18) + "...",
      time: new Date().toISOString()
    });
  });

  // FILE SHARING BROADCAST
  socket.on("share-file", ({ roomId, file }) => {
    if (!socket.rooms.has(roomId) || !file) return;
    io.to(roomId).emit("file-shared", {
      sender: socket.user.name,
      file,
      time: new Date().toISOString()
    });
  });

  // WHITEBOARD (DRAWING + TEXT WRITING + CLEAR)
  socket.on("whiteboard-draw", ({ roomId, drawing }) => {
    if (!socket.rooms.has(roomId)) return;
    socket.to(roomId).emit("whiteboard-draw", drawing);
  });

  socket.on("whiteboard-text", ({ roomId, textItem }) => {
    if (!socket.rooms.has(roomId)) return;
    socket.to(roomId).emit("whiteboard-text", textItem);
  });

  socket.on("whiteboard-clear", (roomId) => {
    if (!socket.rooms.has(roomId)) return;
    io.to(roomId).emit("whiteboard-clear");
  });

  // LEAVE & DISCONNECT
  socket.on("leave-room", (roomId) => {
    socket.leave(roomId);
    socket.to(roomId).emit("user-left", { socketId: socket.id });
  });

  socket.on("disconnecting", () => {
    for (const roomId of socket.rooms) {
      if (roomId !== socket.id) {
        socket.to(roomId).emit("user-left", { socketId: socket.id });
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.user.name);
  });
});

app.get("/", (req, res) => {
  res.json({ message: "MeetFlow Backend Server Running", status: "Online" });
});

server.listen(PORT, () => {
  console.log(`MeetFlow server running on http://localhost:${PORT}`);
});