import { useState, useCallback, useRef, useEffect } from 'react';
import { Message, GeneratedImage } from '../types';

/**
 * Custom hook for managing message state with immutable updates
 * Uses useRef to always access the latest messages (fixes multi-turn conversation bug)
 */
export function useMessageState() {
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesRef = useRef<Message[]>([]);

  // Keep ref in sync with state
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Get latest messages (solves closure problem)
  const getLatestMessages = useCallback(() => {
    return messagesRef.current;
  }, []);

  const addMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const addMessages = useCallback((newMessages: Message[]) => {
    setMessages((prev) => [...prev, ...newMessages]);
  }, []);

  const updateMessage = useCallback((
    messageId: string,
    updates: Partial<Message>
  ) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId ? { ...msg, ...updates } : msg
      )
    );
  }, []);

  const addImageToMessage = useCallback((
    messageId: string,
    image: GeneratedImage
  ) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id === messageId) {
          const updatedImages = [...(msg.images || []), image];
          return { ...msg, images: updatedImages };
        }
        return msg;
      })
    );
  }, []);

  const addTextToMessage = useCallback((messageId: string, text: string) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id === messageId) {
          const currentVariations = msg.textVariations || [];

          // Avoid duplicates
          if (currentVariations.includes(text)) {
            return msg;
          }

          const nextVariations = [...currentVariations, text];
          return {
            ...msg,
            text: nextVariations[0], // Display first variation
            textVariations: nextVariations
          };
        }
        return msg;
      })
    );
  }, []);

  const selectImage = useCallback((messageId: string, imageId: string) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id === messageId) {
          // Toggle selection: if already selected, deselect it
          const newSelection =
            msg.selectedImageId === imageId ? undefined : imageId;
          return { ...msg, selectedImageId: newSelection };
        }
        return msg;
      })
    );
  }, []);

  const deleteMessagesFrom = useCallback((messageId: string) => {
    setMessages((prev) => {
      const messageIndex = prev.findIndex((msg) => msg.id === messageId);
      if (messageIndex === -1) return prev;
      return prev.slice(0, messageIndex);
    });
  }, []);

  const clearAllMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const replaceAllMessages = useCallback((newMessages: Message[]) => {
    setMessages(newMessages);
  }, []);

  return {
    messages,
    getLatestMessages,
    addMessage,
    addMessages,
    updateMessage,
    addImageToMessage,
    addTextToMessage,
    selectImage,
    deleteMessagesFrom,
    clearAllMessages,
    replaceAllMessages
  };
}
