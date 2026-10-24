
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const cors = require("cors");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;

// Adjust these paths to match your actual project structure.
const ROOT = path.join(__dirname, "..");
const DATA_FILE = path.join(__dirname, "data.json");
const UPLOAD_DIR = path.join(ROOT, "uploads");

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(ROOT));

// Temporary local-storage implementation.
// For Vercel production, replace this with persistent storage.
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const DEFAULT_DB = {
  orders: [],
  events: [],
  products: [
    {
      id: "shirt",
      name: "Church T-Shirt",
      price: 350,
      description: "Graceville church shirt"
    },
    {
      id: "mug",
      name: "ALAB Mug",
      price: 250,
      description: "Ministry mug"
    },
    {
      id: "tote",
      name: "Church Tote Bag",
      price: 200,
      description: "Reusable church tote"
    }
  ]
};

function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (error) {
    return JSON.parse(JSON.stringify(DEFAULT_DB));
  }
}

function saveDB(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function admin(req, res, next) {
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    return res.status(503).json({
      message: "Admin is not configured on the server."
    });
  }

  const supplied = req.get("x-admin-password");

  if (
    !supplied ||
    supplied.length !== password.length ||
    !crypto.timingSafeEqual(
      Buffer.from(supplied),
      Buffer.from(password)
    )
  ) {
    return res.status(401).json({
      message: "Invalid admin password."
    });
  }

  next();
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];

    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Only JPG, PNG, WEBP, and GIF images are allowed."));
    }

    cb(null, true);
  }
});

const allowedPages = [
  "alab",
  "beacons",
  "fireflies",
  "mens-ministry",
  "women-of-grace"
];

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Events
app.get("/api/events", (req, res) => {
  res.json(readDB().events);
});

// Upload and publish event photo
app.post(
  "/api/events",
  admin,
  upload.single("image"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        message: "Please select a valid image, up to 8MB."
      });
    }

    const page = String(req.body.page || "").toLowerCase();

    if (!allowedPages.includes(page)) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({
        message: "Please select a valid ministry page."
      });
    }

    const db = readDB();

    const event = {
      id: crypto.randomUUID(),
      page,
      title: String(req.body.title || "Church event").slice(0, 120),
      date: String(req.body.date || ""),
      description: String(req.body.description || "").slice(0, 1000),
      image: `/uploads/${req.file.filename}`,
      createdAt: new Date().toISOString()
    };

    db.events.unshift(event);
    saveDB(db);

    res.status(201).json(event);
  }
);

// Products
app.get("/api/products", (req, res) => {
  res.json(readDB().products);
});

// Orders
app.get("/api/orders", admin, (req, res) => {
  res.json(readDB().orders);
});

app.post("/api/orders", (req, res) => {
  const body = req.body || {};
  const quantity = Number(body.quantity);

  if (
    !body.customerName ||
    !body.email ||
    !body.phone ||
    !body.item ||
    !Number.isInteger(quantity) ||
    quantity < 1
  ) {
    return res.status(400).json({
      message: "Please complete all required fields."
    });
  }

  const db = readDB();
  const product = db.products.find(p => p.name === body.item);

  if (!product) {
    return res.status(400).json({
      message: "Please select a valid product."
    });
  }

  const order = {
    id: `ORD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    customer: String(body.customerName).slice(0, 120),
    email: String(body.email).slice(0, 200),
    phone: String(body.phone).slice(0, 40),
    item: product.name,
    qty: quantity,
    total: product.price * quantity,
    status: "pending",
    date: new Date().toISOString().slice(0, 10),
    pickupDate: String(body.pickupDate || ""),
    notes: String(body.notes || "").slice(0, 1000)
  };

  db.orders.unshift(order);
  saveDB(db);

  res.status(201).json(order);
});

app.patch("/api/orders/:id", admin, (req, res) => {
  const allowedStatuses = [
    "pending",
    "processing",
    "completed",
    "cancelled"
  ];

  if (!allowedStatuses.includes(req.body?.status)) {
    return res.status(400).json({
      message: "Invalid order status."
    });
  }

  const db = readDB();
  const order = db.orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.status(404).json({
      message: "Order not found."
    });
  }

  order.status = req.body.status;
  saveDB(db);

  res.json(order);
});

// JSON errors instead of generic HTML errors
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "Image must be 8MB or smaller."
        : err.message;

    return res.status(400).json({ message });
  }

  if (err) {
    return res.status(400).json({
      message: err.message || "Request failed."
    });
  }

  next();
});

app.use("/api", (req, res) => {
  res.status(404).json({
    message: `API route not found: ${req.method} ${req.originalUrl}`
  });
});

app.listen(PORT, () => {
  console.log(`Church site running on port ${PORT}`);
});
