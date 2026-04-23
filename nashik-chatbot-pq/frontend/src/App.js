import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import "./App.css";
import LandingPage from "./components/LandingPage";
import ChatPage from "./components/ChatPage";
import PartLabeler from "./components/PartLabeler/PartLabeler";
import ZStage from "./components/ZStage/ZStage";
import AdminPanel from "./components/AdminPanel/AdminPanel";
import authService from "./services/api/authService";

/**
 * ProtectedRoute
 * - Redirects to "/" if not logged in.
 * - Redirects to "/" if user's role doesn't allow the current path.
 */
function ProtectedRoute({ children }) {
  const location = useLocation();

  if (!authService.isLoggedIn()) {
    return <Navigate to="/" replace />;
  }

  if (!authService.canAccess(location.pathname + location.search)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

/**
 * AdminRoute — only accessible by admin role.
 */
function AdminRoute({ children }) {
  if (!authService.isLoggedIn()) {
    return <Navigate to="/" replace />;
  }
  if (!authService.isAdmin()) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />

        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <ChatPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/part-labeler"
          element={
            <ProtectedRoute>
              <PartLabeler />
            </ProtectedRoute>
          }
        />

        <Route
          path="/z-stage"
          element={
            <ProtectedRoute>
              <ZStage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminPanel />
            </AdminRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
