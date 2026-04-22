import React, { useState } from "react";
import "./QlenseUploadModal.css";
import { backend_url } from "../services/api/config";

const SOURCES = [
  {
    key: "warranty",
    label: "Warranty",
    desc: "Warranty claims after vehicle sale (THAR ROXX Warranty.xlsx)",
    required: false,
  },
  {
    key: "rpt",
    label: "Offline RPT",
    desc: "In-plant defects during manufacturing (Offline data.xlsx)",
    required: false,
  },
  {
    key: "gnovac",
    label: "GNOVAC",
    desc: "GNOVAC audit findings and corrective actions (GNOVAC.xlsx)",
    required: false,
  },
  {
    key: "rfi",
    label: "RFI",
    desc: "Request For Information records (RFI.xlsx)",
    required: false,
  },
  {
    key: "esqa",
    label: "e-SQA",
    desc: "e-SQA quality concern reports (THAR ROXX e-SQA.xlsx)",
    required: false,
  },
];

export default function QlenseUploadModal({ userId, onComplete }) {
  const [files, setFiles] = useState({});         // { source: File }
  const [statuses, setStatuses] = useState({});   // { source: 'idle'|'uploading'|'done'|'error' }
  const [messages, setMessages] = useState({});   // { source: string }
  const [globalError, setGlobalError] = useState("");

  const anyFileSelected = Object.values(files).some(Boolean);
  const allDone = Object.keys(files).length > 0 &&
    Object.keys(files).every((k) => statuses[k] === "done");
  const uploading = Object.values(statuses).some((s) => s === "uploading");

  const handleFileChange = (sourceKey, file) => {
    setFiles((prev) => ({ ...prev, [sourceKey]: file || null }));
    setStatuses((prev) => ({ ...prev, [sourceKey]: "idle" }));
    setMessages((prev) => ({ ...prev, [sourceKey]: "" }));
    setGlobalError("");
  };

  const uploadOne = async (sourceKey, file) => {
    setStatuses((prev) => ({ ...prev, [sourceKey]: "uploading" }));
    setMessages((prev) => ({ ...prev, [sourceKey]: "Uploading…" }));

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(
        `${backend_url}/part-labeler/qlense-upload?userId=${userId}&dataSource=${sourceKey}`,
        { method: "POST", body: formData }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");

      setStatuses((prev) => ({ ...prev, [sourceKey]: "done" }));
      setMessages((prev) => ({
        ...prev,
        [sourceKey]: `✓ ${data.count.toLocaleString()} rows loaded`,
      }));
    } catch (err) {
      setStatuses((prev) => ({ ...prev, [sourceKey]: "error" }));
      setMessages((prev) => ({ ...prev, [sourceKey]: `✗ ${err.message}` }));
    }
  };

  const handleUploadAll = async () => {
    setGlobalError("");
    const toUpload = Object.entries(files).filter(([, f]) => f);
    if (!toUpload.length) {
      setGlobalError("Please select at least one file to upload.");
      return;
    }

    // Upload all selected files (sequentially to avoid DB locks)
    for (const [sourceKey, file] of toUpload) {
      if (statuses[sourceKey] !== "done") {
        await uploadOne(sourceKey, file);
      }
    }
  };

  const handleStartChat = () => {
    const anySuccess = Object.values(statuses).some((s) => s === "done");
    if (!anySuccess) {
      setGlobalError("Please upload at least one data file before starting.");
      return;
    }
    onComplete();
  };

  return (
    <div className="qlense-modal-overlay">
      <div className="qlense-modal">
        <div className="qlense-modal-header">
          <div className="qlense-modal-title-row">
            <span className="qlense-modal-icon">📊</span>
            <div>
              <h2 className="qlense-modal-title">Upload Quality Data</h2>
              <p className="qlense-modal-subtitle">
                Upload your Excel data files to enable the QLense Quality
                Assistant. Select one or more sources below.
              </p>
            </div>
          </div>
        </div>

        <div className="qlense-modal-body">
          {SOURCES.map((src) => {
            const status = statuses[src.key] || "idle";
            const file = files[src.key];
            const msg = messages[src.key] || "";

            return (
              <div
                key={src.key}
                className={`qlense-source-row qlense-source-row--${status}`}
              >
                <div className="qlense-source-info">
                  <span className="qlense-source-label">{src.label}</span>
                  <span className="qlense-source-desc">{src.desc}</span>
                </div>

                <div className="qlense-source-upload">
                  <label className="qlense-file-btn">
                    {file ? file.name : "Choose file"}
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      style={{ display: "none" }}
                      onChange={(e) =>
                        handleFileChange(src.key, e.target.files[0])
                      }
                      disabled={uploading}
                    />
                  </label>
                  {msg && (
                    <span
                      className={`qlense-upload-msg qlense-upload-msg--${status}`}
                    >
                      {msg}
                    </span>
                  )}
                  {status === "uploading" && (
                    <span className="qlense-spinner" />
                  )}
                </div>
              </div>
            );
          })}

          {globalError && (
            <p className="qlense-global-error">{globalError}</p>
          )}
        </div>

        <div className="qlense-modal-footer">
          {!allDone ? (
            <button
              className="qlense-btn qlense-btn--primary"
              onClick={handleUploadAll}
              disabled={!anyFileSelected || uploading}
            >
              {uploading ? "Uploading…" : "Upload Selected Files"}
            </button>
          ) : (
            <button
              className="qlense-btn qlense-btn--success"
              onClick={handleStartChat}
            >
              Start Chat →
            </button>
          )}

          {Object.values(statuses).some((s) => s === "done") && !allDone && (
            <button
              className="qlense-btn qlense-btn--ghost"
              onClick={handleStartChat}
            >
              Skip remaining & Start Chat
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
