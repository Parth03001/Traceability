/**
 * Authentication Service
 * Handles signup, login, logout and session management
 */

import { backend_url } from "./config";

class AuthService {
  /**
   * Sign up a new user
   * @param {string} username
   * @param {string} firstName
   * @param {string} lastName
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{user_id: number, username: string, first_name: string, last_name: string, message: string}>}
   */
  async signup(username, firstName, lastName, email, password) {
    const response = await fetch(`${backend_url}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        first_name: firstName,
        last_name: lastName,
        email,
        password,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Signup failed");
    }

    const data = await response.json();
    return data;
  }

  /**
   * Log in an existing user
   * @param {string} username
   * @param {string} password
   * @returns {Promise<{user_id: number, username: string, message: string}>}
   */
  async login(username, password) {
    const response = await fetch(`${backend_url}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Login failed");
    }

    const data = await response.json();

    // Save session to sessionStorage
    sessionStorage.setItem("user_id", data.user_id);
    sessionStorage.setItem("username", data.username);
    sessionStorage.setItem("first_name", data.first_name || "");
    sessionStorage.setItem("last_name", data.last_name || "");
    sessionStorage.setItem("role", data.role || "user");
    sessionStorage.setItem("isLoggedIn", "true");

    return data;
  }

  /**
   * Log out the current user and clear session
   */
  async logout() {
    try {
      await fetch(`${backend_url}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      console.error("Logout API call failed:", e);
    }

    // Always clear session regardless of API result
    sessionStorage.removeItem("user_id");
    sessionStorage.removeItem("username");
    sessionStorage.removeItem("first_name");
    sessionStorage.removeItem("last_name");
    sessionStorage.removeItem("role");
    sessionStorage.removeItem("isLoggedIn");
  }

  /**
   * Check if user is currently logged in
   * @returns {boolean}
   */
  isLoggedIn() {
    return sessionStorage.getItem("isLoggedIn") === "true";
  }

  /**
   * Get current user ID from session
   * @returns {number|null}
   */
  getUserId() {
    const id = sessionStorage.getItem("user_id");
    return id ? parseInt(id, 10) : null;
  }

  /**
   * Get current username from session
   * @returns {string|null}
   */
  getUsername() {
    return sessionStorage.getItem("username");
  }

  /**
   * Get user's full name from session
   * @returns {string}
   */
  getFullName() {
    const first = sessionStorage.getItem("first_name") || "";
    const last = sessionStorage.getItem("last_name") || "";
    const full = `${first} ${last}`.trim();
    return full || this.getUsername() || "User";
  }

  /**
   * Get current user role from session
   * @returns {"admin"|"user"|"part_labeler"}
   */
  getUserRole() {
    return sessionStorage.getItem("role") || "user";
  }

  /**
   * Check if current user is an admin
   * @returns {boolean}
   */
  isAdmin() {
    return this.getUserRole() === "admin";
  }

  /**
   * Check if current user has access to a given route
   * part_labeler → only /part-labeler
   * user / admin  → all routes
   * @param {string} path
   * @returns {boolean}
   */
  async resetPassword(username, currentPassword, newPassword) {
    const response = await fetch(`${backend_url}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, current_password: currentPassword, new_password: newPassword }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Password reset failed");
    }
    return response.json();
  }

  canAccess(path) {
    const role = this.getUserRole();
    if (role === "admin" || role === "user") return true;
    if (role === "part_labeler") return path.startsWith("/part-labeler");
    if (role === "part_labeler_field") return path.startsWith("/part-labeler") && !path.includes("mode=plant");
    if (role === "part_labeler_plant") return (path.startsWith("/part-labeler") && path.includes("mode=plant")) || path.startsWith("/z-stage");
    return false;
  }
}

const authService = new AuthService();
export default authService;
