/**
 * Admin Service
 * API calls for user management — only usable by admin role users.
 * All requests pass requester_id (admin's user_id) as query param;
 * the backend re-validates the role server-side on every call.
 */

import { backend_url } from "./config";
import authService from "./authService";

class AdminService {
  _adminId() {
    return authService.getUserId();
  }

  /**
   * Fetch all users
   * @returns {Promise<Array>}
   */
  async getUsers() {
    const res = await fetch(
      `${backend_url}/admin/users?requester_id=${this._adminId()}`
    );
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to fetch users");
    }
    const data = await res.json();
    return data.users;
  }

  /**
   * Delete a user by user_id
   * @param {number} userId
   */
  async deleteUser(userId) {
    const res = await fetch(
      `${backend_url}/admin/users/${userId}?requester_id=${this._adminId()}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to delete user");
    }
    return res.json();
  }

  /**
   * Create a new user (admin only)
   * @param {{ username, first_name, last_name, email, password, role }} userData
   */
  async createUser(userData) {
    const res = await fetch(
      `${backend_url}/admin/users?requester_id=${this._adminId()}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData),
      }
    );
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to create user");
    }
    return res.json();
  }

  /**
   * Update a user's role
   * @param {number} userId
   * @param {"admin"|"user"|"part_labeler"} role
   */
  async updateRole(userId, role) {
    const res = await fetch(
      `${backend_url}/admin/users/${userId}/role?requester_id=${this._adminId()}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      }
    );
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to update role");
    }
    return res.json();
  }
}

const adminService = new AdminService();
export default adminService;
