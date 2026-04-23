import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import adminService from "../../services/api/adminService";
import authService from "../../services/api/authService";
import utilityLogo from "../../assests/image.png";
import "./AdminPanel.css";

const ROLES = ["admin", "user", "part_labeler", "part_labeler_field", "part_labeler_plant"];

const EMPTY_FORM = { username: "", first_name: "", last_name: "", email: "", password: "", role: "user" };

function AdminPanel() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null); // user_id pending delete
  const [roleChanging, setRoleChanging] = useState({}); // { user_id: true }
  const [showAddUser, setShowAddUser] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [addLoading, setAddLoading] = useState(false);

  const currentUserId = authService.getUserId();

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await adminService.getUsers();
      setUsers(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return;
    try {
      await adminService.deleteUser(confirmDelete);
      setActionMsg("User deleted successfully.");
      setUsers((prev) => prev.filter((u) => u.user_id !== confirmDelete));
    } catch (e) {
      setError(e.message);
    } finally {
      setConfirmDelete(null);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setAddLoading(true);
    setError("");
    try {
      await adminService.createUser(addForm);
      setActionMsg(`User "${addForm.username}" created with role "${addForm.role}".`);
      setShowAddUser(false);
      setAddForm(EMPTY_FORM);
      await loadUsers();
    } catch (e) {
      setError(e.message);
    } finally {
      setAddLoading(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    setRoleChanging((prev) => ({ ...prev, [userId]: true }));
    setError("");
    try {
      await adminService.updateRole(userId, newRole);
      setUsers((prev) =>
        prev.map((u) => (u.user_id === userId ? { ...u, role: newRole } : u))
      );
      setActionMsg(`Role updated to "${newRole}".`);
    } catch (e) {
      setError(e.message);
    } finally {
      setRoleChanging((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const roleBadgeClass = (role) => {
    if (role === "admin") return "badge badge-admin";
    if (role === "user")  return "badge badge-user";
    return "badge badge-pl"; // all part_labeler variants
  };

  return (
    <div className="admin-panel">
      {/* Header */}
      <div className="admin-header">
        <div className="admin-header-left">
          <button className="back-btn" onClick={() => navigate("/")}>
            ← Back
          </button>
          <h1 className="admin-title">Admin Panel</h1>
        </div>
        <div className="admin-header-right">
          <img src={utilityLogo} alt="Utility Logo" className="admin-nav-logo" />
          <span className="admin-subtitle">
            Logged in as <strong>{authService.getFullName()}</strong>
          </span>
          <button className="add-user-btn" onClick={() => { setShowAddUser(true); setError(""); }}>
            + Add User
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="admin-body">

      {/* Status messages */}
      {error && (
        <div className="admin-alert admin-alert-error" onClick={() => setError("")}>
          {error} <span className="alert-close">✕</span>
        </div>
      )}
      {actionMsg && (
        <div className="admin-alert admin-alert-success" onClick={() => setActionMsg("")}>
          {actionMsg} <span className="alert-close">✕</span>
        </div>
      )}

      {/* Stats bar */}
      {!loading && (
        <div className="admin-stats">
          <div className="stat-chip">
            <span className="stat-num">{users.length}</span> Total Users
          </div>
          <div className="stat-chip">
            <span className="stat-num">{users.filter((u) => u.role === "admin").length}</span> Admins
          </div>
          <div className="stat-chip">
            <span className="stat-num">{users.filter((u) => u.role === "user").length}</span> Users
          </div>
          <div className="stat-chip">
            <span className="stat-num">{users.filter((u) => u.role.startsWith("part_labeler")).length}</span> Part Labelers
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="admin-table-wrap">
        {loading ? (
          <div className="admin-loading">Loading users…</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Username</th>
                <th>Full Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, idx) => (
                <tr key={u.user_id} className={u.user_id === currentUserId ? "row-self" : ""}>
                  <td className="td-num">{idx + 1}</td>
                  <td className="td-username">{u.username}</td>
                  <td>{u.first_name} {u.last_name}</td>
                  <td className="td-email">{u.email}</td>
                  <td>
                    <span className={roleBadgeClass(u.role)}>{u.role}</span>
                  </td>
                  <td className="td-date">
                    {u.created_at ? u.created_at.slice(0, 10) : "—"}
                  </td>
                  <td className="td-actions">
                    {/* Role dropdown */}
                    <select
                      className="role-select"
                      value={u.role}
                      disabled={roleChanging[u.user_id] || u.user_id === currentUserId}
                      onChange={(e) => handleRoleChange(u.user_id, e.target.value)}
                      title={u.user_id === currentUserId ? "Cannot change your own role" : "Change role"}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>

                    {/* Delete button */}
                    <button
                      className="delete-btn"
                      disabled={u.user_id === currentUserId}
                      title={u.user_id === currentUserId ? "Cannot delete your own account" : "Delete user"}
                      onClick={() => setConfirmDelete(u.user_id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>Confirm Delete</h2>
            <p>
              Are you sure you want to delete user{" "}
              <strong>{users.find((u) => u.user_id === confirmDelete)?.username}</strong>?
              This cannot be undone.
            </p>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button className="modal-confirm" onClick={handleDeleteConfirm}>
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      </div>{/* end admin-body */}

      {/* Add User Modal */}
      {showAddUser && (
        <div className="modal-overlay" onClick={() => setShowAddUser(false)}>
          <div className="modal-box modal-box-form" onClick={(e) => e.stopPropagation()}>
            <h2>Add New User</h2>
            <form onSubmit={handleAddUser} className="add-user-form">
              <div className="form-row">
                <div className="form-field">
                  <label>Username</label>
                  <input
                    type="text"
                    value={addForm.username}
                    onChange={(e) => setAddForm((f) => ({ ...f, username: e.target.value }))}
                    placeholder="e.g. john_doe"
                    required
                  />
                </div>
                <div className="form-field">
                  <label>Role</label>
                  <select
                    value={addForm.role}
                    onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value }))}
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>First Name</label>
                  <input
                    type="text"
                    value={addForm.first_name}
                    onChange={(e) => setAddForm((f) => ({ ...f, first_name: e.target.value }))}
                    placeholder="First name"
                    required
                  />
                </div>
                <div className="form-field">
                  <label>Last Name</label>
                  <input
                    type="text"
                    value={addForm.last_name}
                    onChange={(e) => setAddForm((f) => ({ ...f, last_name: e.target.value }))}
                    placeholder="Last name"
                    required
                  />
                </div>
              </div>
              <div className="form-field">
                <label>Email</label>
                <input
                  type="email"
                  value={addForm.email}
                  onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="user@example.com"
                  required
                />
              </div>
              <div className="form-field">
                <label>Password</label>
                <input
                  type="password"
                  value={addForm.password}
                  onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Set a password"
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="modal-cancel" onClick={() => { setShowAddUser(false); setAddForm(EMPTY_FORM); }}>
                  Cancel
                </button>
                <button type="submit" className="modal-confirm" disabled={addLoading}>
                  {addLoading ? "Creating…" : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default AdminPanel;
