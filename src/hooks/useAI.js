import { useState, useCallback } from 'react';
import aiService from './aiService';

/**
 * useAI - Custom hook for AI operations with error handling
 */
export function useAI() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const chat = useCallback(async (message, history = []) => {
    setLoading(true);
    setError(null);
    try {
      const result = await aiService.chat(message, history);
      setData(result);
      return result;
    } catch (err) {
      const errorMessage = err.message || 'Failed to get AI response';
      setError(errorMessage);
      console.error('Chat error:', errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const summarize = useCallback(async (text) => {
    setLoading(true);
    setError(null);
    try {
      const result = await aiService.summarize(text);
      setData(result);
      return result;
    } catch (err) {
      const errorMessage = err.message || 'Failed to summarize';
      setError(errorMessage);
      console.error('Summarize error:', errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const generateText = useCallback(async (prompt) => {
    setLoading(true);
    setError(null);
    try {
      const result = await aiService.generateText(prompt);
      setData(result);
      return result;
    } catch (err) {
      const errorMessage = err.message || 'Failed to generate text';
      setError(errorMessage);
      console.error('Generate error:', errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { loading, error, data, chat, summarize, generateText, clearError };
}

export default useAI;
