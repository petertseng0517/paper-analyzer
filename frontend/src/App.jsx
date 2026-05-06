import { useState, useRef, useEffect } from "react";
import axios from "axios";
import "./App.css";

export default function App() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [taskId, setTaskId] = useState(null);
  const [copied, setCopied] = useState(false);
  const websocketRef = useRef(null);
  const BACKEND_HOST = window.location.hostname || "127.0.0.1";
  const API_BASE = `http://${BACKEND_HOST}:8000`;
  const WS_BASE = `ws://${BACKEND_HOST}:8000`;

  const handleSubmit = async () => {
    if (!file) return;
    setLoading(true);
    setResult("");
    setError("");
    setProgress(0);
    setProgressMessage("準備開始分析...");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await axios.post(`${API_BASE}/analyze`, formData);
      const newTaskId = res.data.task_id;
      setTaskId(newTaskId);
      console.log("Task created with ID:", newTaskId);

      // 稍微延遲一下確保後端準備好
      setTimeout(() => {
        connectWebSocket(newTaskId);
      }, 500);

    } catch (err) {
      setError("上傳失敗，請確認 backend 是否正常運行。");
      setLoading(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type === "application/pdf") {
      setFile(files[0]);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.type === "application/pdf") {
      setFile(selectedFile);
    }
  };

  const connectWebSocket = (taskId) => {
    console.log("Connecting to WebSocket for task:", taskId);
    console.log("WebSocket URL:", `${WS_BASE}/ws/analyze/${taskId}`);

    try {
      const ws = new WebSocket(`${WS_BASE}/ws/analyze/${taskId}`);
      websocketRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected successfully");
      };

      ws.onmessage = (event) => {
        try {
          console.log("Raw WebSocket message:", event.data);
          const data = JSON.parse(event.data);
          console.log("Parsed WebSocket message:", data);

          // 檢查是否是錯誤消息
          if (data.error) {
            console.error("WebSocket error message:", data.error);
            setError(`伺服器錯誤: ${data.error}`);
            setLoading(false);
            ws.close();
            return;
          }

          setProgress(data.progress);
          setProgressMessage(data.message);

          if (data.completed) {
            setLoading(false);
            if (data.result && !data.result.error) {
              setResult(data.result);
            } else {
              setError(data.result?.error || "分析過程中發生錯誤");
            }
            ws.close();
          }
        } catch (e) {
          console.error("Error parsing WebSocket message:", e);
          console.error("Raw message:", event.data);
          setError("接收數據時發生錯誤");
          setLoading(false);
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        console.error("WebSocket readyState:", ws.readyState);
        setError("連線錯誤，請重試");
        setLoading(false);
      };

      ws.onclose = (event) => {
        console.log("WebSocket closed:", event.code, event.reason);
      };

    } catch (e) {
      console.error("Error creating WebSocket:", e);
      setError("無法建立連線，請重試");
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(result).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

const formatResultText = (text) => {
  if (!text) return "";

  const escapeHtml = (value) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const formatInlineMarkdown = (value) =>
    value
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/__(.+?)__/g, "<strong>$1</strong>")
      .replace(/_(.+?)_/g, "<em>$1</em>");

  const lines = escapeHtml(text).split(/\r?\n/);
  let html = "";
  let inList = false;
  let paragraphOpen = false;

  const closeParagraph = () => {
    if (paragraphOpen) {
      html += "</p>";
      paragraphOpen = false;
    }
  };

  const closeList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      closeParagraph();
      closeList();
      return;
    }

    const headingMatch = trimmed.match(/^(#{2,3})\s+(.*)$/);
    const listMatch = trimmed.match(/^-\s+(.*)$/);

    if (headingMatch) {
      closeParagraph();
      closeList();
        const level = headingMatch[1].length;
      const content = formatInlineMarkdown(headingMatch[2]);
      html += `<h${level}>${content}</h${level}>`;
    } else if (listMatch) {
      closeParagraph();
      if (!inList) {
        inList = true;
        html += "<ul>";
      }
      html += `<li>${formatInlineMarkdown(listMatch[1])}</li>`;
    } else {
      if (!paragraphOpen) {
        paragraphOpen = true;
        html += "<p>";
      } else {
        html += " ";
      }
      html += formatInlineMarkdown(trimmed);
    }
  });

  closeParagraph();
  closeList();
  return html;
};

  return (
    <div className="app-container">
      <header className="app-header">
        <h1 className="app-title">📄 論文分析工具</h1>
        <p className="app-subtitle">
          上傳學術論文 PDF，自動生成繁體中文摘要、優點與缺點
        </p>
      </header>

      {/* 上傳區域 */}
      <div
        className={`upload-area ${dragOver ? 'drag-over' : ''} ${file ? 'file-selected' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".pdf"
          onChange={handleFileChange}
          className="upload-input"
        />
        <div className="upload-content">
          <span className="upload-icon">{file ? '📄' : '📤'}</span>
          <p className="upload-text">
            {file ? '檔案已選擇' : '拖曳 PDF 檔案至此處，或點擊選擇'}
          </p>
          <p className="upload-subtext">
            支援 PDF 格式，檔案大小限制 50MB
          </p>
          {file && (
            <p className="file-name">✅ {file.name}</p>
          )}
        </div>
      </div>

      {/* 進度指示器 */}
      {loading && (
        <div className="progress-container">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <div className="progress-text">
            <span className="progress-percentage">{progress}%</span>
            <span className="progress-message">{progressMessage}</span>
          </div>
        </div>
      )}

      {/* 送出按鈕 */}
      <button
        onClick={handleSubmit}
        disabled={!file || loading}
        className="analyze-button"
      >
        {loading ? (
          <span className="loading-text">
            <div className="spinner"></div>
            分析中...
          </span>
        ) : (
          "開始分析"
        )}
      </button>

      {/* 錯誤訊息 */}
      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}

      {/* 結果顯示 */}
      {result && (
        <div className="result-container">
          <div className="result-header">
            <h2 className="result-title">📊 分析結果</h2>
            <button className={`copy-button ${copied ? "copied" : ""}`} onClick={handleCopy}>
              {copied ? "已複製 ✓" : "複製"}
            </button>
          </div>
          <div
            className="result-content"
            dangerouslySetInnerHTML={{ __html: formatResultText(result) }}
          />
        </div>
      )}
    </div>
  );
}