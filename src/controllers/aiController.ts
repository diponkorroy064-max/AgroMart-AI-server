import { Response } from "express";
import { AuthenticatedRequest } from "../types/express";
import { processAIChatMessage } from "../services/aiShoppingService";

/**
 * @route   POST /api/ai/chat
 * @desc    Process user chat message with AI Shopping Assistant
 * @access  Public (Optional authentication attaches user context)
 */
export const handleAIChat = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { message, history } = req.body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "বার্তা প্রদান করা আবশ্যক (Message is required)",
      });
    }

    const cleanMessage = message.trim().slice(0, 1000);
    const cleanHistory = Array.isArray(history)
      ? history.slice(-10).map((h: any) => ({
          role: h.role === "assistant" ? "assistant" : "user",
          content: String(h.content || "").slice(0, 1000),
        }))
      : [];

    const response = await processAIChatMessage(cleanMessage, cleanHistory, req.user);

    return res.status(200).json({
      success: true,
      ...response,
    });
  } catch (error: any) {
    console.error("AI Assistant Controller Error:", error);
    return res.status(500).json({
      success: false,
      message: "এআই অ্যাসিস্ট্যান্ট সার্ভারে সমস্যা দেখা দিয়েছে। পুনরায় চেষ্টা করুন।",
      reply: "দুঃখিত, সংযোগে সাময়িক বিলম্ব হচ্ছে। অনুগ্রহ করে একটু পর আবার প্রশ্ন করুন।",
      action: "general",
      suggestions: ["উন্নত জাতের বীজ", "জৈব সার", "খামার যন্ত্রপাতি"],
    });
  }
};

/**
 * @route   GET /api/ai/suggestions
 * @desc    Get contextual prompt starters for agricultural shopping
 * @access  Public
 */
export const getAISuggestions = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const isAuth = !!req.user;
    const basePrompts = [
      {
        id: "seed_budget",
        text: "৫০০ টাকার মধ্যে সবজির বীজ দেখাও",
        category: "বীজ",
      },
      {
        id: "organic_fert",
        text: "জৈব ও ভার্মিকম্পোস্ট সার আছে?",
        category: "সার",
      },
      {
        id: "machinery_spray",
        text: "স্প্রে মেশিন ও সেচ পাম্প দেখাও",
        category: "যন্ত্রপাতি",
      },
      {
        id: "compare_inputs",
        text: "ইউরিয়া এবং ভার্মিকম্পোস্ট সার তুলনা করো",
        category: "তুলনা",
      },
    ];

    if (isAuth) {
      basePrompts.unshift({
        id: "order_status",
        text: "আমার সর্বশেষ অর্ডারের অবস্থা কী?",
        category: "অর্ডার ট্র্যাকিং",
      });
    }

    return res.status(200).json({
      success: true,
      suggestions: basePrompts,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "পরামর্শ লোড করতে ব্যর্থ হয়েছে",
    });
  }
};

/**
 * @route   GET /api/ai/health
 * @desc    Check AI service status and active provider
 * @access  Public
 */
export const getAIHealth = async (req: AuthenticatedRequest, res: Response) => {
  const hasGeminiKey = !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());

  return res.status(200).json({
    status: "ok",
    service: "AgroMart AI Shopping Assistant",
    provider: hasGeminiKey ? "Google Gemini + Real DB Tools" : "Built-in Intelligent Agri Engine + Real DB",
    hasExternalKey: hasGeminiKey,
    timestamp: new Date(),
  });
};
