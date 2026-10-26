import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { connectDB } from "./db/db";
import authRoutes from "./routes/auth";
import productRoutes from "./routes/product";
import orderRoutes from "./routes/order";
import adminRoutes from "./routes/admin";
import favoriteRoutes from "./routes/favorite";
import inventoryRoutes from "./routes/inventory";
import categoryRoutes from "./routes/category";
import blogRoutes from "./routes/blog";
import { seedCategoriesIfEmpty } from "./controllers/categoryController";
import { seedBlogsIfEmpty } from "./controllers/blogController";
import { UPLOAD_DIR } from "./config/multer";

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// Auto-connect DB middleware
app.use(async (req, res, next) => {
  try {
    await connectDB();
  } catch (err) {
    console.error("DB connection error:", err);
  }
  next();
});

app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));
app.use('/uploads', express.static(path.resolve(__dirname, 'uploads')));

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/favorites", favoriteRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/blogs", blogRoutes);

app.get("/api/health", (req: Request, res: Response) => {
  res.json({ status: "ok", service: "AgroMart AI Server", timestamp: new Date() });
});

app.get("/", (req: Request, res: Response) => {
  res.send("Express + TypeScript Server for AgroMart AI");
});

const startServer = async () => {
  await connectDB();
  await seedCategoriesIfEmpty();
  await seedBlogsIfEmpty();
  app.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
  });
};

if (!process.env.VERCEL) {
  startServer();
}

export default app;
