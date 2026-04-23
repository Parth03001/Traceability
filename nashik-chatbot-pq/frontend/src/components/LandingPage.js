import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./LandingPage.css";
import traceabilityIcon from "../assests/traceability.png";
import qualityIcon from "../assests/quality.png";
import guidelineIcon from "../assests/guideline.png";
import supportIcon from "../assests/support.png";
import dashboardIcon from "../assests/dashboard.png";
import utilityLogo from "../assests/image.png";
import mahindraRiseLogo from "../assests/mahindra_rise_logo.png";
import { authService } from "../services/api";

const BASE_ENABLED = ["traceability", "guideline", "part-labeler", "part-labeler-plant", "z-stage"];
const PART_LABELER_ALLOWED = ["part-labeler", "part-labeler-plant"];

const ROLE_ALLOWED = {
  part_labeler:       ["part-labeler", "part-labeler-plant"],
  part_labeler_field: ["part-labeler"],
  part_labeler_plant: ["part-labeler-plant", "z-stage"],
};

function LandingPage() {
  const navigate = useNavigate();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [justLoggedIn, setJustLoggedIn] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetUsername, setResetUsername] = useState("");
  const [resetCurrentPassword, setResetCurrentPassword] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setIsLoggedIn(authService.isLoggedIn());
  }, []);

  const currentRole = authService.getUserRole();

  const features = [
    {
      id: "traceability",
      title: "Traceability",
      icon: traceabilityIcon,
      description: "Track and trace quality issues across the production chain",
      route: "/chat?feature=traceability",
    },
    {
      id: "guideline",
      title: "Qlense guideline and standard",
      icon: guidelineIcon,
      description: "Access quality guidelines and industry standards",
      route: "/chat?feature=guideline",
    },
    {
      id: "part-labeler",
      title: "Part Sense Visualizer Field",
      icon: dashboardIcon,
      description: "Interactive failure trend analysis",
      route: "/part-labeler",
    },
    {
      id: "part-labeler-plant",
      title: "Part Sense Visualizer Plant",
      icon: dashboardIcon,
      description: "Interactive failure trend analysis across all data sources",
      route: "/part-labeler?mode=plant",
    },
    {
      id: "z-stage",
      title: "Z-Stage Layout Preparation",
      icon: dashboardIcon,
      description: "Design and visualize production layouts with Z-Stage",
      route: "/z-stage",
    },
    {
      id: "quality-assistant",
      title: "Qlense Quality assistant",
      icon: qualityIcon,
      description: "AI-powered quality analysis and insights",
      route: "/chat?feature=quality-assistant",
    },
    {
      id: "diagnostic",
      title: "Diagnostic support system",
      icon: supportIcon,
      description: "Advanced diagnostic tools for quality control",
      route: "/chat?feature=diagnostic",
    },
  ];

  const handleGetStarted = (route) => navigate(route);

  const handleLogout = async () => {
    await authService.logout();
    setIsLoggedIn(false);
    setJustLoggedIn(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await authService.login(username, password);
      setJustLoggedIn(true);
      setIsLoggedIn(true);
      setUsername("");
      setPassword("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await authService.signup(username, firstName, lastName, email, password);
      await authService.login(username, password);
      setJustLoggedIn(true);
      setIsLoggedIn(true);
      setUsername("");
      setFirstName("");
      setLastName("");
      setPassword("");
      setEmail("");
      setIsSignup(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsSignup(!isSignup);
    setError("");
    setUsername("");
    setFirstName("");
    setLastName("");
    setPassword("");
    setEmail("");
  };

  const openForgotPassword = () => {
    setIsForgotPassword(true);
    setError("");
    setResetUsername("");
    setResetCurrentPassword("");
    setResetNewPassword("");
    setResetConfirmPassword("");
    setResetSuccess("");
  };

  const closeForgotPassword = () => {
    setIsForgotPassword(false);
    setError("");
    setResetSuccess("");
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError("");
    setResetSuccess("");
    if (resetNewPassword !== resetConfirmPassword) {
      setError("New password and confirm password do not match.");
      return;
    }
    if (resetNewPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      await authService.resetPassword(resetUsername, resetCurrentPassword, resetNewPassword);
      setResetSuccess("Password reset successfully! You can now log in.");
      setResetUsername("");
      setResetCurrentPassword("");
      setResetNewPassword("");
      setResetConfirmPassword("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="landing-page">

      {/* ── TOP NAVBAR ── */}
      <nav className="landing-navbar">
        {/* Left: app logo */}
        <div className="navbar-left">
          <img src={utilityLogo} alt="Mahindra Utility Logo" className="navbar-logo" />
        </div>

        {/* Center: welcome + role badge (only when logged in) */}
        <div className="navbar-center">
          {isLoggedIn && (
            <span className="navbar-welcome">
              Welcome,&nbsp;<strong>{authService.getFullName()}</strong>
              <span className="user-role-badge">{currentRole}</span>
            </span>
          )}
        </div>

        {/* Right: Mahindra Rise logo + Logout */}
        <div className="navbar-right">
          <img src={mahindraRiseLogo} alt="Mahindra Rise Logo" className="navbar-logo" />
          {isLoggedIn && (
            <button className="user-logout-btn" onClick={handleLogout}>
              Logout
            </button>
          )}
        </div>
      </nav>

      {/* ── MAIN CONTENT ── */}
      <div className="landing-content">

        {/* Left: AI text + cars */}
        <div className="left-section">
          <div className="ai-solution-text">
            <h1 className="main-heading">
              <span className="word word-1">AI-Powered</span>
              <span className="word word-2">Quality</span>
              <span className="word word-3">Management</span>
            </h1>
            <p className="sub-heading">
              Intelligent solutions for traceability, quality assurance, and
              diagnostic support
            </p>
          </div>
        </div>

        {/* Right: Auth form OR Feature cards */}
        {!isLoggedIn ? (
          <div className="auth-container">
            {isForgotPassword ? (
              <div className="auth-card">
                <h2 className="auth-title">Reset Password</h2>
                <p className="auth-subtitle">Verify your current password, then set a new one</p>

                {error && <div className="auth-error">{error}</div>}
                {resetSuccess && <div className="auth-success">{resetSuccess}</div>}

                {!resetSuccess && (
                  <form onSubmit={handleResetPassword}>
                    <div className="auth-name-row">
                      <div className="auth-field">
                        <label>Username</label>
                        <input
                          type="text"
                          value={resetUsername}
                          onChange={(e) => setResetUsername(e.target.value)}
                          placeholder="Enter your username"
                          required
                        />
                      </div>
                      <div className="auth-field">
                        <label>Current Password</label>
                        <input
                          type="password"
                          value={resetCurrentPassword}
                          onChange={(e) => setResetCurrentPassword(e.target.value)}
                          placeholder="Your current password"
                          required
                        />
                      </div>
                    </div>
                    <div className="auth-name-row">
                      <div className="auth-field">
                        <label>New Password</label>
                        <input
                          type="password"
                          value={resetNewPassword}
                          onChange={(e) => setResetNewPassword(e.target.value)}
                          placeholder="New password"
                          required
                        />
                      </div>
                      <div className="auth-field">
                        <label>Confirm New Password</label>
                        <input
                          type="password"
                          value={resetConfirmPassword}
                          onChange={(e) => setResetConfirmPassword(e.target.value)}
                          placeholder="Confirm new password"
                          required
                        />
                      </div>
                    </div>
                    <button type="submit" className="auth-submit-btn" disabled={loading}>
                      {loading ? "Resetting…" : "Reset Password"}
                    </button>
                  </form>
                )}

                <div className="auth-toggle">
                  <button className="auth-toggle-btn" onClick={closeForgotPassword}>
                    ← Back to Login
                  </button>
                </div>
              </div>
            ) : (
            <div className="auth-card">
              <h2 className="auth-title">
                {isSignup ? "Create Account" : "Welcome Back"}
              </h2>
              <p className="auth-subtitle">
                {isSignup ? "Sign up to get started" : "Login to access your dashboard"}
              </p>

              {error && <div className="auth-error">{error}</div>}

              <form onSubmit={isSignup ? handleSignup : handleLogin}>
                {isSignup ? (
                  <div className="auth-name-row">
                    <div className="auth-field">
                      <label>Username</label>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Enter your username"
                        required
                      />
                    </div>
                    <div className="auth-field">
                      <label>Email</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your email"
                        required
                      />
                    </div>
                  </div>
                ) : (
                  <div className="auth-field">
                    <label>Username</label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter your username"
                      required
                    />
                  </div>
                )}

                {isSignup && (
                  <div className="auth-name-row">
                    <div className="auth-field">
                      <label>First Name</label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="First name"
                        required
                      />
                    </div>
                    <div className="auth-field">
                      <label>Last Name</label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Last name"
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="auth-field">
                  <label>Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                  />
                </div>

                <button type="submit" className="auth-submit-btn" disabled={loading}>
                  {loading ? "Please wait..." : isSignup ? "Sign Up" : "Login"}
                </button>
              </form>

              <div className="auth-toggle">
                {isSignup ? (
                  <span>
                    Already have an account?{" "}
                    <button className="auth-toggle-btn" onClick={toggleMode}>Login</button>
                  </span>
                ) : (
                  <span>
                    Don't have an account?{" "}
                    <button className="auth-toggle-btn" onClick={toggleMode}>Sign Up</button>
                  </span>
                )}
              </div>

              {!isSignup && (
                <div className="auth-forgot">
                  <button className="auth-forgot-btn" onClick={openForgotPassword}>
                    Reset Password
                  </button>
                </div>
              )}
            </div>
            )}
          </div>
        ) : (
          <>
            {(() => {
              const allowedIds = ROLE_ALLOWED[currentRole];
              const visibleFeatures = features.filter(f =>
                allowedIds ? allowedIds.includes(f.id) : true
              );
              const adminCard = currentRole === "admin" ? 1 : 0;
              const totalVisible = visibleFeatures.length + adminCard;
              const isSingleCol = totalVisible <= 4;

              return (
                <div className={`features-container${isSingleCol ? " features-single-col" : ""}${justLoggedIn ? " features-enter" : ""}`}>
                  {visibleFeatures.map((feature, index) => {
                    const isEnabled = BASE_ENABLED.includes(feature.id);
                    return (
                      <div
                        key={feature.id}
                        className={`feature-card ${justLoggedIn ? "feature-card-enter" : ""}`}
                        style={
                          justLoggedIn
                            ? { animationDelay: `${index * 0.12}s`, ...(!isEnabled && { cursor: "not-allowed", opacity: 0.6 }) }
                            : !isEnabled
                            ? { cursor: "not-allowed", opacity: 0.6 }
                            : { cursor: "pointer" }
                        }
                        onClick={() => isEnabled && handleGetStarted(feature.route)}
                      >
                        <div className="feature-content">
                          <img src={feature.icon} alt={feature.title} className="feature-icon" />
                          <div className="feature-info">
                            <h3 className="feature-title">{feature.title}</h3>
                            <p className="feature-description">{feature.description}</p>
                          </div>
                        </div>
                        <button
                          className="get-started-btn"
                          onClick={(e) => { e.stopPropagation(); if (isEnabled) handleGetStarted(feature.route); }}
                          disabled={!isEnabled}
                          style={!isEnabled ? { cursor: "not-allowed" } : {}}
                        >
                          Get started
                          <span className="arrow-icon">&rarr;</span>
                        </button>
                      </div>
                    );
                  })}

                  {/* Admin Panel — only for admin role */}
                  {currentRole === "admin" && (
                    <div
                      className={`feature-card feature-card-admin ${justLoggedIn ? "feature-card-enter" : ""}`}
                      style={{ cursor: "pointer" }}
                      onClick={() => handleGetStarted("/admin")}
                    >
                      <div className="feature-content">
                        <img src={dashboardIcon} alt="Admin Panel" className="feature-icon" />
                        <div className="feature-info">
                          <h3 className="feature-title">Admin Panel</h3>
                          <p className="feature-description">Manage users, assign roles, and control access</p>
                        </div>
                      </div>
                      <button
                        className="get-started-btn"
                        onClick={(e) => { e.stopPropagation(); handleGetStarted("/admin"); }}
                      >
                        Open
                        <span className="arrow-icon">&rarr;</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}

export default LandingPage;
