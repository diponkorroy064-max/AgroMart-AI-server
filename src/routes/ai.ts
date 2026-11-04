import { Router } from "express";
import {
  handleAIChat,
  getAISuggestions,
  getAIHealth,
} from "../controllers/aiController";
import { optionalProtect } from "../middleware/authMiddleware";

const router = Router();

// @route   POST /api/ai/chat
// @desc    Chat with AI Shopping Assistant
// @access  Public (Optional auth for personalized cart/order context)
router.post("/chat", optionalProtect, handleAIChat);

// @route   GET /api/ai/suggestions
// @desc    Get contextual prompt recommendations
// @access  Public
router.get("/suggestions", optionalProtect, getAISuggestions);

// @route   GET /api/ai/health
// @desc    Check AI service health
// @access  Public
router.get("/health", getAIHealth);

export default router;
