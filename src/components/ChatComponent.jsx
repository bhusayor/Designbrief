import { useState } from 'react';
import useAI from '../hooks/useAI';
import FileUploadModal from './FileUploadModal';
import './ChatComponent.css';

export function ChatComponent() {
  const { loading, error, chat, clearError } = useAI();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() && attachedFiles.length === 0) return;

    const userMessage = input;
    setInput('');
    setAttachedFiles([]);

    // Add user message to chat
    setMessages((prev) => [...prev, { role: 'user', content: userMessage, files: attachedFiles }]);

    try {
      // Call AI service
      const response = await chat(userMessage, messages);

      // Add AI response to chat
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: response.message },
      ]);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const handleFilesSelected = (files, type) => {
    setAttachedFiles((prev) => [...prev, ...files.map(f => ({ ...f, type }))]);
  };

  return (
    <div className="flex flex-col h-screen sm:h-auto sm:max-h-96 md:max-h-[500px] border border-border rounded-lg bg-white overflow-hidden shadow-lg">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-border bg-white">
        <h2 className="text-lg sm:text-xl font-semibold text-text-h m-0">AI Chat Assistant</h2>
        {error && (
          <div className="mt-3 p-3 bg-red-100 text-red-700 rounded text-sm flex justify-between items-center">
            <span>{error}</span>
            <button onClick={clearError} className="ml-2 font-bold hover:text-red-900">
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 flex flex-col gap-3">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-center px-4">
            <p className="text-sm sm:text-base">Start a conversation with the AI assistant</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex gap-3 mb-1 animate-slideIn ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <span
                className={`font-bold text-sm sm:text-base whitespace-nowrap ${
                  msg.role === 'user' ? 'text-blue-600' : 'text-gray-600'
                }`}
              >
                {msg.role === 'user' ? 'You' : 'AI'}:
              </span>
              <p
                className={`px-3 sm:px-4 py-2 rounded-lg text-sm sm:text-base m-0 max-w-xs sm:max-w-sm md:max-w-md ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {msg.content}
              </p>
            </div>
          ))
        )}
        {loading && (
          <div className="flex gap-3 items-center animate-slideIn">
            <span className="loader inline-block w-2 h-2 bg-blue-600 rounded-full"></span>
            <span className="text-gray-600 text-sm sm:text-base">Thinking...</span>
          </div>
        )}
      </div>

      {/* Attached Files Preview */}
      {attachedFiles.length > 0 && (
        <div className="px-4 sm:px-6 py-2 border-t border-border bg-gray-50 flex flex-wrap gap-2">
          {attachedFiles.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-200 rounded-full text-xs sm:text-sm"
            >
              {file.type === 'image' && '🖼️'}
              {file.type === 'document' && '📄'}
              <span className="truncate max-w-[120px]">{file.name}</span>
              <button
                type="button"
                onClick={() => setAttachedFiles((prev) => prev.filter((f) => f.id !== file.id))}
                className="text-blue-600 hover:text-blue-800"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Form */}
      <form
        onSubmit={handleSendMessage}
        className="flex gap-2 sm:gap-3 px-4 sm:px-6 py-3 border-t border-border bg-gray-50"
      >
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          disabled={loading}
          className="flex-shrink-0 p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Add files or images"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z" />
          </svg>
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          disabled={loading}
          className="flex-1 px-3 py-2 text-sm sm:text-base border border-gray-300 rounded bg-white disabled:bg-gray-100 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={loading || (!input.trim() && attachedFiles.length === 0)}
          className="px-4 py-2 bg-blue-600 text-white text-sm sm:text-base rounded font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Sending...' : 'Send'}
        </button>
      </form>

      {/* File Upload Modal */}
      <FileUploadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onFilesSelected={handleFilesSelected}
      />
    </div>
  );
}

export default ChatComponent;
