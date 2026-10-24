
/* =========================================================
   GRACEVILLE CONSERVATIVE BAPTIST CHURCH
   Backend API Server
   File: server.js
   ========================================================= */

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const cors = require("cors");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;

// Assumes server.js is inside a backend folder and the website
// files are in the parent project folder.
// Adjust these paths if your folder structure is different.
const ROOT = path.join(__dirname, "..");
const DATA_FILE = path.join(__dirname, "data.json");
const UPLOAD_DIR = path.join(ROOT, "uploads");

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const MAX_ORDER_QUANTITY = 1000;

const ALLOWED_PAGES = [
    "alab",
    "beacons",
    "fireflies",
    "mens-ministry",
    "women-of-grace"
];

const ALLOWED_STATUSES = [
    "pending",
    "processing",
    "completed",
    "cancelled"
];

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


/* -------------------------
   DIRECTORY SETUP
------------------------- */

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.disable("x-powered-by");

// For a same-origin deployment, CORS is generally unnecessary.
// If your frontend is hosted on a different origin, configure
// CORS with your exact trusted frontend URL instead of "*".
app.use(cors());

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// Serve HTML, CSS, JavaScript, and uploaded images.
app.use(express.static(ROOT));


/* -------------------------
   DATABASE HELPERS
------------------------- */

function createDefaultDB() {
    return JSON.parse(JSON.stringify(DEFAULT_DB));
}

function readDB() {
    try {
        const raw = fs.readFileSync(DATA_FILE, "utf8");
        const db = JSON.parse(raw);

        if (
            !db ||
            typeof db !== "object" ||
            Array.isArray(db)
        ) {
            throw new Error("Invalid database format.");
        }

        return {
            orders: Array.isArray(db.orders) ? db.orders : [],
            events: Array.isArray(db.events) ? db.events : [],
            products: Array.isArray(db.products)
                ? db.products
                : createDefaultDB().products
        };
    } catch (error) {
        if (error.code !== "ENOENT") {
            console.error("Database read error:", error.message);
        }

        // Start with default data if the database file does not exist.
        // Back up or repair a malformed data.json instead of assuming
        // its previous contents can be recovered automatically.
        return createDefaultDB();
    }
}

function saveDB(db) {
    const temporaryFile =
        DATA_FILE + "." + crypto.randomUUID() + ".tmp";

    try {
        fs.writeFileSync(
            temporaryFile,
            JSON.stringify(db, null, 2),
            { encoding: "utf8", flag: "wx" }
        );

        // Atomic replacement on typical local filesystems.
        fs.renameSync(temporaryFile, DATA_FILE);
    } catch (error) {
        try {
            if (fs.existsSync(temporaryFile)) {
                fs.unlinkSync(temporaryFile);
            }
        } catch (cleanupError) {
            console.error("Temporary database cleanup failed.");
        }

        throw error;
    }
}

function cleanText(value, maxLength = 1000) {
    return String(value ?? "").trim().slice(0, maxLength);
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}


/* -------------------------
   ADMIN AUTHENTICATION
------------------------- */

function admin(req, res, next) {
    const password = process.env.ADMIN_PASSWORD;

    if (!password) {
        return res.status(503).json({
            message: "Admin is not configured on the server."
        });
    }

    const supplied = req.get("x-admin-password");

    if (
        typeof supplied !== "string" ||
        Buffer.byteLength(supplied) !== Buffer.byteLength(password)
    ) {
        return res.status(401).json({
            message: "Invalid admin password."
        });
    }

    const suppliedBuffer = Buffer.from(supplied);
    const passwordBuffer = Buffer.from(password);

    if (!crypto.timingSafeEqual(suppliedBuffer, passwordBuffer)) {
        return res.status(401).json({
            message: "Invalid admin password."
        });
    }

    next();
}


/* -------------------------
   IMAGE UPLOAD CONFIGURATION
------------------------- */

const storage = multer.diskStorage({
    destination: (req, file, callback) => {
        callback(null, UPLOAD_DIR);
    },

    filename: (req, file, callback) => {
        const allowedExtensions = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
            "image/gif": ".gif"
        };

        const extension = allowedExtensions[file.mimetype];

        if (!extension) {
            return callback(
                new Error("Only JPG, PNG, WEBP, and GIF images are allowed.")
            );
        }

        callback(null, `${crypto.randomUUID()}${extension}`);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: MAX_IMAGE_SIZE,
        files: 1,
        fields: 10,
        parts: 12
    },
    fileFilter: (req, file, callback) => {
        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif"
        ];

        if (!allowedTypes.includes(file.mimetype)) {
            return callback(
                new Error("Only JPG, PNG, WEBP, and GIF images are allowed.")
            );
        }

        callback(null, true);
    }
});

function deleteUploadedFile(filePath) {
    if (!filePath) {
        return;
    }

    fs.unlink(filePath, error => {
        if (error && error.code !== "ENOENT") {
            console.error("Uploaded file cleanup failed:", error.message);
        }
    });
}


/* -------------------------
   HEALTH CHECK
------------------------- */

app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        service: "Graceville Church API"
    });
});


/* -------------------------
   EVENT GALLERY
------------------------- */

// Public: fetch events for all ministry galleries.
app.get("/api/events", (req, res) => {
    const db = readDB();
    res.json(db.events);
});


/* -------------------------
   UPLOAD AND PUBLISH EVENT
------------------------- */

app.post(
    "/api/events",
    admin,
    upload.single("image"),
    (req, res, next) => {
        if (!req.file) {
            return res.status(400).json({
                message: "Please select an image up to 8MB."
            });
        }

        const page = cleanText(req.body.page, 50).toLowerCase();

        if (!ALLOWED_PAGES.includes(page)) {
            deleteUploadedFile(req.file.path);

            return res.status(400).json({
                message: "Please select a valid ministry page."
            });
        }

        const event = {
            id: crypto.randomUUID(),
            page,
            title: cleanText(req.body.title || "Church event", 120),
            date: cleanText(req.body.date, 40),
            description: cleanText(req.body.description, 1000),
            image: `/uploads/${req.file.filename}`,
            createdAt: new Date().toISOString()
        };

        try {
            const db = readDB();

            db.events.unshift(event);
            saveDB(db);

            return res.status(201).json(event);
        } catch (error) {
            // Remove the image if saving its event record fails.
            deleteUploadedFile(req.file.path);
            next(error);
        }
    }
);


/* -------------------------
   PRODUCTS
------------------------- */

// Public: list available products.
app.get("/api/products", (req, res) => {
    const db = readDB();

    const products = db.products.filter(product =>
        product &&
        typeof product.name === "string" &&
        Number.isFinite(Number(product.price)) &&
        Number(product.price) >= 0
    );

    res.json(products);
});


/* -------------------------
   CUSTOMER ORDER SUBMISSION
------------------------- */

app.post("/api/orders", (req, res, next) => {
    try {
        const body = req.body || {};

        const customerName = cleanText(body.customerName, 120);
        const email = cleanText(body.email, 200);
        const phone = cleanText(body.phone, 40);
        const itemName = cleanText(body.item, 120);
        const quantity = Number(body.quantity);

        if (
            !customerName ||
            !email ||
            !phone ||
            !itemName ||
            !isValidEmail(email) ||
            !Number.isSafeInteger(quantity) ||
            quantity < 1 ||
            quantity > MAX_ORDER_QUANTITY
        ) {
            return res.status(400).json({
                message: "Enter a valid name, email, phone, product, and quantity."
            });
        }

        const db = readDB();

        // Calculate the total using the server's product price.
        // Never trust a total sent by the customer's browser.
        const product = db.products.find(
            product => product.name === itemName
        );

        if (
            !product ||
            !Number.isFinite(Number(product.price)) ||
            Number(product.price) < 0
        ) {
            return res.status(400).json({
                message: "Please select a valid product."
            });
        }

        const total = Number(product.price) * quantity;

        if (!Number.isFinite(total)) {
            return res.status(400).json({
                message: "The order total is invalid."
            });
        }

        const order = {
            id: `ORD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
            customer: customerName,
            email,
            phone,
            item: product.name,
            qty: quantity,
            total,
            status: "pending",
            date: new Date().toISOString().slice(0, 10),
            pickupDate: cleanText(body.pickupDate, 40),
            notes: cleanText(body.notes, 1000)
        };

        db.orders.unshift(order);
        saveDB(db);

        return res.status(201).json(order);
    } catch (error) {
        next(error);
    }
});


/* -------------------------
   ADMIN: VIEW ORDERS
------------------------- */

app.get("/api/orders", admin, (req, res) => {
    const db = readDB();
    res.json(db.orders);
});


/* -------------------------
   ADMIN: UPDATE ORDER STATUS
------------------------- */

app.patch("/api/orders/:id", admin, (req, res, next) => {
    try {
        const status = req.body?.status;

        if (!ALLOWED_STATUSES.includes(status)) {
            return res.status(400).json({
                message: "Invalid order status."
            });
        }

        const db = readDB();

        const order = db.orders.find(
            item => item.id === req.params.id
        );

        if (!order) {
            return res.status(404).json({
                message: "Order not found."
            });
        }

        order.status = status;
        saveDB(db);

        return res.json(order);
    } catch (error) {
        next(error);
    }
});


/* -------------------------
   UNKNOWN API ROUTES
------------------------- */

app.use("/api", (req, res) => {
    res.status(404).json({
        message: `API route not found: ${req.method} ${req.originalUrl}`
    });
});


/* -------------------------
   CENTRAL ERROR HANDLER
------------------------- */

app.use((error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    if (error instanceof multer.MulterError) {
        const message = error.code === "LIMIT_FILE_SIZE"
            ? "Image must be 8MB or smaller."
            : error.message;

        return res.status(400).json({ message });
    }

    if (error instanceof SyntaxError && error.status === 400) {
        return res.status(400).json({
            message: "Invalid JSON request body."
        });
    }

    if (
        error.message &&
        error.message.startsWith("Only JPG, PNG, WEBP")
    ) {
        return res.status(400).json({
            message: error.message
        });
    }

    console.error("Server error:", error);

    return res.status(500).json({
        message: "An unexpected server error occurred."
    });
});


/* -------------------------
   START SERVER
------------------------- */

app.listen(PORT, () => {
    console.log(`Church website running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
});
