import { Router } from "express";
import { register, login, getMe, updateProfile, uploadFile } from "../controllers/authController";
import { protect } from "../middleware/authMiddleware";
import upload from "../config/multer";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", protect, getMe);
router.put("/profile", protect, updateProfile);
router.put("/me", protect, updateProfile);
router.post("/upload", protect, upload.single("file"), uploadFile);

export default router;
