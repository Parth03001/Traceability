import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { MoreVertical } from "lucide-react";
import "./Sidebar.css";
import { authService } from "../services/api";

const Sidebar = ({
  isCollapsed,
  onToggleCollapse,
  recentChats,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  currentConversationId,
  botName = "Traceability Bot",
}) => {
  const navigate = useNavigate();
  const [showOptionsMenu, setShowOptionsMenu] = useState(null);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const optionsMenuRef = useRef(null);
  const settingsMenuRef = useRef(null);

  const currentUsername = authService.getFullName();

  // Close options menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        optionsMenuRef.current &&
        !optionsMenuRef.current.contains(event.target)
      ) {
        setShowOptionsMenu(null);
      }
      if (
        settingsMenuRef.current &&
        !settingsMenuRef.current.contains(event.target)
      ) {
        setShowSettingsMenu(false);
      }
    };

    if (showOptionsMenu !== null || showSettingsMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showOptionsMenu, showSettingsMenu]);

  const handleDeleteClick = (e, chatId) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this conversation?")) {
      onDeleteChat(chatId);
    }
    setShowOptionsMenu(null);
  };

  const toggleOptionsMenu = (e, chatId) => {
    e.stopPropagation();
    setShowOptionsMenu(showOptionsMenu === chatId ? null : chatId);
  };

  const handleChatClick = (chatId) => {
    console.log("Chat item clicked:", chatId);
    onSelectChat(chatId);
  };

  const handleLogout = async () => {
    await authService.logout();
    setShowSettingsMenu(false);
    navigate("/");
    window.location.reload();
  };

  return (
    <div className={`sidebar ${isCollapsed ? "collapsed" : ""}`}>
      <div className="sidebar-header">
        <h1 className="chatbot-title">{botName}</h1>
        <button
          className="home-btn"
          onClick={() => navigate("/")}
          title="Go to Home"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
          </svg>
        </button>
      </div>

      <button className="new-chat-btn" onClick={onNewChat}>
        <span className="plus-icon">+</span>
        <span className="new-chat-text">New chat</span>
      </button>

      <div className="recent-section">
        <h3 className="recent-title">Recent</h3>
        <div className="recent-chats">
          {recentChats.length === 0 ? (
            <div className="no-chats">No conversations yet</div>
          ) : (
            recentChats.map((chat) => (
              <div
                key={chat.id}
                className={`chat-item ${
                  currentConversationId === chat.id ? "active" : ""
                }`}
                onClick={() => handleChatClick(chat.id)}
              >
                <div className="chat-text">{chat.message}</div>
                <button
                  className="chat-options"
                  onClick={(e) => toggleOptionsMenu(e, chat.id)}
                >
                  <MoreVertical size={16} />
                </button>
                {showOptionsMenu === chat.id && (
                  <div className="options-menu" ref={optionsMenuRef}>
                    <button onClick={(e) => handleDeleteClick(e, chat.id)}>
                      Delete
                    </button>
                  </div>
                )}
                <div className="chat-time">{chat.time}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="user-avatar">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
          </div>
          <span className="user-name">{currentUsername}</span>
        </div>
        <div className="settings-wrapper" ref={settingsMenuRef}>
          <button
            className="settings-btn"
            onClick={() => setShowSettingsMenu(!showSettingsMenu)}
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" />
            </svg>
          </button>
          {showSettingsMenu && (
            <div className="settings-menu">
              <button className="settings-menu-item logout-btn" onClick={handleLogout}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                  <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
                </svg>
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
