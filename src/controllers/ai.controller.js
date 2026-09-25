import { aiService } from '../services/ai.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const handleAiChat = async (req, res, next) => {
  try {
    const userId = req.user?.id || 'user_123';
    const { prompt } = req.body;

    if (!prompt || !prompt.trim()) {
      return ApiResponse.error(res, 'Prompt text is required for AI spend inquiry.', 400);
    }

    const aiResult = await aiService.processChatQuery(userId, prompt.trim());
    return ApiResponse.success(res, 'AI Spend Q&A response generated successfully', aiResult);
  } catch (error) {
    next(error);
  }
};
