import { Router } from "express";
import {
  toggleFavorite,
  checkFavorite,
  getMyFavorites,
  removeFavorite,
} from "../controllers/favoriteController";
import { protect } from "../middleware/authMiddleware";

const router = Router();

// All favorite routes require authentication
router.post("/:productId", protect, toggleFavorite);
router.post("/toggle/:productId", protect, toggleFavorite);
router.get("/check/:productId", protect, checkFavorite);
router.get("/", protect, getMyFavorites);
router.delete("/:productId", protect, removeFavorite);

export default router;
