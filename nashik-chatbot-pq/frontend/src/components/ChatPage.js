import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import "./ChatPage.css";
import Sidebar from "./Sidebar";
import ChatArea from "./ChatArea";
import PdfViewerModal from "./PdfViewerModal";
import { conversationService } from "../services/api";

function ChatPage() {
  const [searchParams] = useSearchParams();
  const feature = searchParams.get("feature");

  // Map landing-page feature key → backend agent_type
  const getAgentType = (feat) => {
    if (feat === "guideline") return "standards_guidelines";
    return "analyst";
  };

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [messages, setMessages] = useState([]);
  const [recentChats, setRecentChats] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [agentType, setAgentType] = useState(() => getAgentType(feature));
  const [thinkingSteps, setThinkingSteps] = useState([]);
  const [currentThinkingStep, setCurrentThinkingStep] = useState("");
  
  // PDF Viewer State
  const [isPdfOpen, setIsPdfOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfScrollTo, setPdfScrollTo] = useState(null);

  const websocketRef = useRef(null);

  // Message ref to track without causing re-renders (like Agentic-AI-Framework)
  const messagesRef = useRef([]);

  // Scroll management refs (like Agentic-AI-Framework)
  const isNearBottomRef = useRef(true);
  const scrollTimeoutRef = useRef(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);

  const userName = "User";

  // Determine bot name based on feature
  const getBotName = () => {
    const featureNames = {
      traceability: "Traceability Bot",
      "quality-assistant": "Qlense Quality Assistant",
      guideline: "Qlense Guideline Bot",
      diagnostic: "Diagnostic Support Bot",
    };
    return featureNames[feature] || "Quality Assistant Bot";
  };

  // Sync agentType when the URL feature param changes
  useEffect(() => {
    setAgentType(getAgentType(feature));
  }, [feature]);

  // Load conversation history on mount / when agentType changes
  useEffect(() => {
    loadConversationHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentType]);

  // Keep messagesRef in sync with messages state (like Agentic-AI-Framework)
  useEffect(() => {
    messagesRef.current = messages;
  });

  // Cleanup WebSocket and timers on unmount
  useEffect(() => {
    return () => {
      if (websocketRef.current) {
        websocketRef.current.close();
      }
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Show welcome message based on feature
  useEffect(() => {
    if (feature && messages.length === 0) {
      const welcomeMessages = {
        traceability:
          "Welcome to Traceability! Ask me about tracking quality issues across your production chain.",
        "quality-assistant":
          "Welcome to Qlense Quality Assistant! I can help you with AI-powered quality analysis and insights.",
        guideline:
          "Welcome to Qlense Guidelines! Ask me about quality standards and guidelines.",
        diagnostic:
          "Welcome to Diagnostic Support! I can assist you with diagnostic tools for quality control.",
      };

      if (welcomeMessages[feature]) {
        setMessages([
          {
            id: `welcome-${Date.now()}`,
            text: welcomeMessages[feature],
            sender: "bot",
            time: new Date().toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
        ]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature, messages.length]);

  const loadConversationHistory = async () => {
    try {
      const history = await conversationService.getConversationHistory(
        agentType
      );
      setRecentChats(
        history.map((chat) => ({
          id: chat.conversation_id,
          message: chat.chat_title,
          time: new Date(chat.creation_ts).toLocaleDateString(),
        }))
      );
    } catch (error) {
      console.error("Error loading conversation history:", error);
    }
  };

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  const handleOpenPdf = (url, scrollTo) => {
      setPdfUrl(url);
      setPdfScrollTo(scrollTo);
      setIsPdfOpen(true);
      // Auto-collapse left sidebar to give room
      setIsSidebarCollapsed(true);
  };

  const handleClosePdf = () => {
      setIsPdfOpen(false);
      setPdfUrl(null);
      setPdfScrollTo(null);
      // Restore left sidebar
      setIsSidebarCollapsed(false);
  };

  const handleNewChat = async () => {
    try {
      // Close existing WebSocket if any
      if (websocketRef.current) {
        websocketRef.current.close();
        websocketRef.current = null;
      }

      // Clear current messages, conversation, and thinking states
      setMessages([]);
      messagesRef.current = [];
      setCurrentConversationId(null);
      setThinkingSteps([]);
      setCurrentThinkingStep("");
      setIsLoading(false);
      isNearBottomRef.current = true;
      setIsUserScrolling(false);
      // Close PDF if open
      handleClosePdf();

      console.log("Ready for new conversation");
    } catch (error) {
      console.error("Error starting new chat:", error);
    }
  };

  const handleSelectChat = async (chatId) => {
    console.log("=== Loading conversation ===", chatId);

    try {
      setIsLoading(true);
      // Close PDF if open
      handleClosePdf();

      // Close existing WebSocket if any
      if (websocketRef.current) {
        websocketRef.current.close();
        websocketRef.current = null;
      }

      // Clear thinking states
      setThinkingSteps([]);
      setCurrentThinkingStep("");
      isNearBottomRef.current = true;
      setIsUserScrolling(false);

      // Load conversation messages
      console.log("Fetching conversation data...");
      const conversation = await conversationService.getConversation(chatId);
      console.log("Conversation data received:", conversation);

      setCurrentConversationId(chatId);

      // Parse messages from conversation
      const loadedMessages = [];
      if (
        conversation.query_responses &&
        Array.isArray(conversation.query_responses)
      ) {
        console.log(
          "Processing",
          conversation.query_responses.length,
          "query-response pairs"
        );

        conversation.query_responses.forEach((item, index) => {
          console.log(`Processing item ${index}:`, item);

          // Add user message
          loadedMessages.push({
            id: `user-${item.message_id}`,
            text: item.query,
            sender: "user",
            time: new Date(item.chat_entry_ts).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            }),
          });

          // Add bot response
          let response;
          let responseText = "No response";

          try {
            // Parse the response if it's a string
            response =
              typeof item.response === "string"
                ? JSON.parse(item.response)
                : item.response;

            console.log("Parsed response:", response);

            // Extract the actual text from various possible structures
            if (typeof response === "string") {
              responseText = response;
            } else if (response && response.response) {
              responseText = response.response;
            } else if (response && response.text) {
              responseText = response.text;
            } else if (response && response.content) {
              responseText = response.content;
            } else if (response) {
              // If response is an object but doesn't have expected keys, stringify it
              responseText = JSON.stringify(response);
            }

            console.log("Extracted response text:", responseText);
          } catch (parseError) {
            console.error("Error parsing response:", parseError, item.response);
            // If parsing fails, use the raw response
            responseText =
              typeof item.response === "string" ? item.response : "No response";
            response = {};
          }

          loadedMessages.push({
            id: `bot-${item.message_id}`,
            messageId: item.message_id,
            text: responseText,
            sender: "bot",
            time: new Date(item.chat_entry_ts).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            cypher_query: response?.cypher_query,
            similar_docs: response?.similar_docs || response?.citations,
            // Include chart_data if present in historical message
            ...(response?.chart_data && { chart_data: response.chart_data }),
          });
        });
      } else {
        console.warn(
          "No query_responses found or invalid format:",
          conversation
        );
      }

      console.log("Loaded messages:", loadedMessages);
      setMessages(loadedMessages);
      messagesRef.current = loadedMessages;
      isNearBottomRef.current = true;
      console.log("Messages state updated");
    } catch (error) {
      console.error("Error loading chat:", error);
      alert(`Failed to load chat: ${error.message}`);

      // Reset to clean state on error
      setMessages([]);
      setCurrentConversationId(null);
    } finally {
      setIsLoading(false);
      console.log("=== Conversation loading complete ===");
    }
  };

  const handleSendMessage = async (text) => {
    let conversationId = currentConversationId;

    // If no conversation exists, create one first
    if (!conversationId) {
      try {
        // Close existing WebSocket if any
        if (websocketRef.current) {
          websocketRef.current.close();
        }

        // Initiate new conversation
        const response = await conversationService.initiateConversation(
          agentType
        );
        conversationId = response.conversationId;
        setCurrentConversationId(conversationId);

        console.log("New conversation started:", conversationId);

        // Reload conversation history
        loadConversationHistory();
      } catch (error) {
        console.error("Error starting new chat:", error);
        alert("Failed to start conversation. Please try again.");
        return;
      }
    }

    // Add user message immediately
    const userMessage = {
      id: `user-${Date.now()}`,
      text: text,
      sender: "user",
      time: new Date().toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    const newMessages = [...messagesRef.current, userMessage];
    setMessages(newMessages);
    messagesRef.current = newMessages;
    setIsLoading(true);

    // Force scroll to bottom when user sends new message (like Agentic-AI-Framework)
    setTimeout(() => {
      const chatContent = document.querySelector(".chat-content");
      if (chatContent) {
        chatContent.scrollTop = chatContent.scrollHeight;
        isNearBottomRef.current = true;
      }
    }, 100);

    try {
      // Create WebSocket connection if not exists
      if (
        !websocketRef.current ||
        websocketRef.current.readyState !== WebSocket.OPEN
      ) {
        websocketRef.current = conversationService.createWebSocketConnection(
          conversationId,
          handleWebSocketMessage,
          handleWebSocketError,
          handleWebSocketClose
        );

        // Wait for connection to open
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("WebSocket connection timeout")),
            5000
          );
          websocketRef.current.onopen = () => {
            clearTimeout(timeout);
            resolve();
          };
        });
      }

      // Send message through WebSocket
      conversationService.sendMessage(websocketRef.current, text, agentType);
    } catch (error) {
      console.error("Error sending message:", error);
      setIsLoading(false);

      // Add error message
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          text: "Failed to send message. Please try again.",
          sender: "bot",
          time: new Date().toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          isError: true,
        },
      ]);
    }
  };

  const handleWebSocketMessage = (data) => {
    console.log("WebSocket message received:", data);

    // Keepalive pings from server — ignore silently
    if (data.type === "keepalive") return;

    // Progress stage updates (thinking → generating → retrying)
    if (data.type === "progress") {
      const stage = data.stage || "";
      if (stage === "generating") {
        setCurrentThinkingStep(
          `Generating response${data.step_count ? ` (${data.step_count} steps done)` : "…"}`
        );
      } else if (stage === "retrying") {
        setCurrentThinkingStep("Agent retrying — generating final answer…");
      }
      return;
    }

    // Handle both "thinking" and "thinking_token" types
    if (data.type === "thinking" || data.type === "thinking_token") {
      // Add thinking step - accumulate, don't replace
      // IMPORTANT: Maintain all reasoning and todos separately
      setThinkingSteps((prev) => {
        const newContent = data.content || "Processing...";
        const newStep = data.step || "processing";

        // Check if this is a duplicate - more thorough check
        const isDuplicate = prev.some((s) => {
          const sameStep = s.step === newStep;
          const exactMatch = s.content === newContent;
          // Check if new content is a substring of existing (or vice versa) - likely duplicate
          const contentSimilar =
            (s.content && newContent && s.content.includes(newContent)) ||
            (s.content && newContent && newContent.includes(s.content)) ||
            (s.content && newContent && s.content.trim() === newContent.trim());

          return sameStep && (exactMatch || contentSimilar);
        });

        if (isDuplicate) {
          return prev; // Don't add duplicates
        }

        // Add new step with unique ID
        return [
          ...prev,
          {
            step: newStep,
            content: newContent,
            timestamp: Date.now(), // Add timestamp to track order
            id: `thinking-${Date.now()}-${Math.random()}`, // Unique ID
          },
        ];
      });
      // DON'T set currentThinkingStep when adding to thinkingSteps - causes duplicate display
      // The content is already being added to thinkingSteps array, so we should clear currentThinkingStep
      // to prevent showing it both in the box AND below the box
      setCurrentThinkingStep("");
    } else if (data.type === "tool_call") {
      // Add tool call as thinking step
      const toolName = data.content?.tool || "tool";
      setTimeout(() => {
        setThinkingSteps((prev) => [
          ...prev,
          {
            step: "tool_call",
            content: `Calling ${toolName}...`,
          },
        ]);
        setCurrentThinkingStep(`Calling ${toolName}...`);
      }, 500);
    } else if (data.type === "token") {
      // DON'T clear thinking steps - keep them visible
      // Only clear currentThinkingStep to stop showing loading indicator
      // But keep all accumulated thinkingSteps for display
      setCurrentThinkingStep("");

      // Simple token handling like Agentic-AI-Framework - direct update (no batching delay)
      const content = data.content || "";

      setMessages((prev) => {
        if (!prev.length) return prev;
        const out = [...prev];
        const idx = out.length - 1;

        if (out[idx].sender === "bot" && !out[idx].messageId) {
          const current = out[idx].text || "";
          const newText = current + content;

          out[idx] = {
            ...out[idx],
            text: newText,
          };
        } else if (out[idx].sender === "user") {
          // Create new bot message for streaming
          out.push({
            id: `bot-streaming-${Date.now()}`,
            text: content,
            sender: "bot",
            time: new Date().toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            }),
          });
        }

        messagesRef.current = out;
        return out;
      });
    } else if (data.type === "chart") {
      // Handle chart data event
      console.log("Chart data received:", data.chart_data);

      // Store chart data in the last bot message.
      // Note: do NOT guard with !out[idx].messageId — the "final" event can arrive
      // before the "chart" event, so messageId may already be set when we get here.
      setMessages((prev) => {
        if (!prev.length) return prev;
        const out = [...prev];
        const idx = out.length - 1;

        if (out[idx].sender === "bot") {
          out[idx] = {
            ...out[idx],
            chart_data: data.chart_data,
          };
        }

        messagesRef.current = out;
        return out;
      });
    } else if (data.type === "citations") {
      // Handle citations data event
      console.log("Citations received:", data.citations);

      // Store citations in the last bot message
      setMessages((prev) => {
        if (!prev.length) return prev;
        const out = [...prev];
        const idx = out.length - 1;

        if (out[idx].sender === "bot" && !out[idx].messageId) {
          out[idx] = {
            ...out[idx],
            citations: data.citations,
          };
        }

        messagesRef.current = out;
        return out;
      });
    } else if (data.type === "complete" || data.type === "final") {
      setIsLoading(false);
      setThinkingSteps([]);
      setCurrentThinkingStep("");

      // Update the last bot message with complete info (like Agentic-AI-Framework)
      setMessages((prev) => {
        if (!prev.length) return prev;
        const out = [...prev];
        const idx = out.length - 1;

        if (out[idx].sender === "bot") {
          out[idx] = {
            ...out[idx],
            messageId: data.messageId || data.message_id,
            text: data.content || data.response || out[idx].text,
            // Include chart_data if present in final event
            ...(data.chart_data && { chart_data: data.chart_data }),
            // Include citations if present
            ...(data.citations && { citations: data.citations }),
          };
        } else {
          // Fallback: create new message
          out.push({
            id: `bot-${Date.now()}`,
            messageId: data.messageId || data.message_id,
            text: data.content || data.response || "No response",
            sender: "bot",
            time: new Date().toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            // Include chart_data if present
            ...(data.chart_data && { chart_data: data.chart_data }),
            // Include citations if present
            ...(data.citations && { citations: data.citations }),
          });
        }

        messagesRef.current = out;
        return out;
      });

      // Reload conversation history to update sidebar
      loadConversationHistory();
    } else if (data.type === "error") {
      setIsLoading(false);
      setThinkingSteps([]);
      setCurrentThinkingStep("");

      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          text: data.content || "An error occurred",
          sender: "bot",
          time: new Date().toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          isError: true,
        },
      ]);
    }
  };

  const handleWebSocketError = (error) => {
    console.error("WebSocket error:", error);
    setIsLoading(false);
    setThinkingSteps([]);
    setCurrentThinkingStep("");
  };

  const handleWebSocketClose = () => {
    console.log("WebSocket connection closed");
    setIsLoading(false);
    setThinkingSteps([]);
    setCurrentThinkingStep("");
    // Update messages to mark streaming as complete (like Agentic-AI-Framework)
    setMessages((prev) => {
      if (!prev.length) return prev;
      const out = [...prev];
      const idx = out.length - 1;
      if (out[idx].sender === "bot") {
        out[idx] = { ...out[idx] };
      }
      messagesRef.current = out;
      return out;
    });
  };

  const handleDeleteChat = async (chatId) => {
    try {
      await conversationService.deleteConversation(chatId);

      // Reload conversation history
      await loadConversationHistory();

      // Clear messages if deleted chat was current
      if (chatId === currentConversationId) {
        setMessages([]);
        setCurrentConversationId(null);
      }
    } catch (error) {
      console.error("Error deleting chat:", error);
      alert("Failed to delete chat. Please try again.");
    }
  };

  return (
    <div className="app">
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
        recentChats={recentChats}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onDeleteChat={handleDeleteChat}
        currentConversationId={currentConversationId}
        botName={getBotName()}
      />
      <button
        className={`global-collapse-toggle ${
          isSidebarCollapsed ? "collapsed" : ""
        }`}
        onClick={handleToggleSidebar}
        aria-label={isSidebarCollapsed ? "Open menu" : "Close menu"}
      >
        {isSidebarCollapsed ? (
          // Hamburger menu icon when sidebar is closed
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
          </svg>
        ) : (
          // Arrow icon when sidebar is open
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z" />
          </svg>
        )}
      </button>
      
      {/* Main Content Layout - Flex container for ChatArea and PdfViewer */}
      <div className="main-content-layout" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <ChatArea
            messages={messages}
            onSendMessage={handleSendMessage}
            userName={userName}
            isLoading={isLoading}
            currentConversationId={currentConversationId}
            thinkingSteps={thinkingSteps}
            currentThinkingStep={currentThinkingStep}
            onOpenPdf={handleOpenPdf}
          />
          
          {/* Render PDF Viewer as a sidebar if open */}
          {isPdfOpen && (
              <div className="pdf-sidebar-wrapper" style={{ width: '45%', borderLeft: '1px solid #ddd' }}>
                  <PdfViewerModal 
                    pdfUrl={pdfUrl} 
                    initialScrollTo={pdfScrollTo}
                    onClose={handleClosePdf}
                    isSidebar={true}
                  />
              </div>
          )}
      </div>
    </div>
  );
}

export default ChatPage;
