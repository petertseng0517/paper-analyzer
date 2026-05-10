import { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";

const BACKEND_HOST = window.location.hostname || "127.0.0.1";
const API_BASE = `http://${BACKEND_HOST}:8000`;
const WS_BASE = `ws://${BACKEND_HOST}:8000`;

const THEMES = [
  { bg: "radial-gradient(circle at top left, rgba(96,165,250,0.12), transparent 28%), radial-gradient(circle at bottom right, rgba(45,212,191,0.10), transparent 30%), #0f1117", glow: "rgba(37,99,235,0.18)" },
  { bg: "radial-gradient(circle at top right, rgba(139,92,246,0.14), transparent 28%), radial-gradient(circle at bottom left, rgba(236,72,153,0.10), transparent 30%), #0f0f17", glow: "rgba(124,58,237,0.18)" },
  { bg: "radial-gradient(circle at top left, rgba(16,185,129,0.12), transparent 28%), radial-gradient(circle at bottom right, rgba(59,130,246,0.10), transparent 30%), #0a1510", glow: "rgba(5,150,105,0.18)" },
  { bg: "radial-gradient(circle at top, rgba(6,182,212,0.12), transparent 28%), radial-gradient(circle at bottom, rgba(99,102,241,0.10), transparent 30%), #0a1215", glow: "rgba(8,145,178,0.18)" },
];

function loadSaved() {
  try { return JSON.parse(localStorage.getItem("papers") || "[]"); }
  catch { return []; }
}

function formatText(text) {
  if (!text) return "";
  const esc = (v) =>
    v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (v) =>
    v.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
     .replace(/\*(.+?)\*/g, "<em>$1</em>")
     .replace(/__(.+?)__/g, "<strong>$1</strong>")
     .replace(/_(.+?)_/g, "<em>$1</em>");

  const lines = esc(text).split(/?
/);
  let html = "", inList = false, pOpen = false;
  let tableBuf = [];

  const closePara = () => { if (pOpen) { html += "</p>"; pOpen = false; } };
  const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
  const flushTable = () => {
    if (!tableBuf.length) return;
    html += "<div class='table-wrap'><table>";
    tableBuf.forEach((row, i) => {
      const cells = row.split("|").slice(1, -1);
      const tag = i === 0 ? "th" : "td";
      html += "<tr>" + cells.map(c => `<${tag}>${inline(c.trim())}</${tag}>`).join("") + "</tr>";
    });
    html += "</table></div>";
    tableBuf = [];
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t) { closePara(); closeList(); flushTable(); continue; }

    if (t.startsWith("|")) {
      closePara(); closeList();
      if (/^\|[-| :]+\|$/.test(t)) continue;
      tableBuf.push(t);
      continue;
    }
    if (tableBuf.length) flushTable();

    const hm = t.match(/^(#{2,3})\s+(.*)$/);
    const lm = t.match(/^-\s+(.*)$/);

    if (hm) {
      closePara(); closeList();
      html += `<h${hm[1].length}>${inline(hm[2])}</h${hm[1].length}>`;
    } else if (lm) {
      closePara();
      if (!inList) { inList = true; html += "<ul>"; }
      html += `<li>${inline(lm[1])}</li>`;
    } else {
      if (!pOpen) { pOpen = true; html += "<p>"; } else html += " ";
      html += inline(t);
    }
  }

  closePara(); closeList(); flushTable();
  return html;
}

export default function App() {
  const [themeIdx, setThemeIdx] = useState(0);
  const [memOn, setMemOn] = useState(() => localStorage.getItem("memOn") === "true");
  const [papers, setPapers] = useState(() =>
    localStorage.getItem("memOn") === "true" ? loadSaved() : []
  );
  const [activeTab, setActiveTab] = useState(() => {
    if (localStorage.getItem("memOn") !== "true") return null;
    const saved = loadSaved();
    return saved.length > 0 ? saved[0].id : null;
  });
  const [compareResult, setCompareResult] = useState("");
  const [comparing, setComparing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    document.body.style.background = THEMES[0].bg;
    document.body.style.transition = "background 0.7s ease";
  }, []);

  // Persist done papers to localStorage when memory is on
  useEffect(() => {
    localStorage.setItem("memOn", String(memOn));
    if (memOn) {
      const toSave = papers
        .filter(p => p.status === "done")
        .map(({ id, name, status, result }) => ({ id, name, status, result }));
      localStorage.setItem("papers", JSON.stringify(toSave));
    } else {
      localStorage.removeItem("papers");
    }
  }, [papers, memOn]);

  const updatePaper = (id, patch) =>
    setPapers(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));

  const addFiles = (fileList) => {
    const pdfs = Array.from(fileList).filter(f => f.type === "application/pdf");
    setPapers(prev => {
      const canAdd = Math.max(0, 5 - prev.length);
      const toAdd = pdfs.slice(0, canAdd).map(f => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: f.name.replace(/\.pdf$/i, ""),
        file: f,
        status: "pending",
        progress: 0,
        message: "",
        result: null,
        error: null,
      }));
      if (toAdd.length > 0) setTimeout(() => setActiveTab(toAdd[0].id), 0);
      return [...prev, ...toAdd];
    });
  };

  const deletePaper = (id) => {
    setPapers(prev => {
      const next = prev.filter(p => p.id !== id);
      if (activeTab === id) setActiveTab(next.length > 0 ? next[0].id : null);
      return next;
    });
  };

  const clearAll = () => {
    setPapers([]);
    setActiveTab(null);
    setCompareResult("");
    localStorage.removeItem("papers");
  };

  const analyzeOne = (paper) =>
    new Promise((resolve, reject) => {
      updatePaper(paper.id, { status: "analyzing", progress: 0, message: "上傳中..." });
      const fd = new FormData();
      fd.append("file", paper.file);

      axios.post(`${API_BASE}/analyze`, fd)
        .then(res => {
          const tid = res.data.task_id;
          setTimeout(() => {
            const ws = new WebSocket(`${WS_BASE}/ws/analyze/${tid}`);
            ws.onmessage = ({ data }) => {
              try {
                const d = JSON.parse(data);
                if (d.error) {
                  updatePaper(paper.id, { status: "error", error: d.error });
                  ws.close(); reject(d.error); return;
                }
                updatePaper(paper.id, { progress: d.progress, message: d.message });
                if (d.completed) {
                  if (d.result && !d.result.error) {
                    updatePaper(paper.id, { status: "done", result: d.result, progress: 100 });
                    ws.close(); resolve();
                  } else {
                    const msg = d.result?.error || "分析失敗";
                    updatePaper(paper.id, { status: "error", error: msg });
                    ws.close(); reject(msg);
                  }
                }
              } catch {
                updatePaper(paper.id, { status: "error", error: "資料解析失敗" });
                ws.close(); reject();
              }
            };
            ws.onerror = () => {
              updatePaper(paper.id, { status: "error", error: "連線錯誤，請重試" });
              reject();
            };
          }, 1000);
        })
        .catch(() => {
          updatePaper(paper.id, { status: "error", error: "上傳失敗，請確認 backend 是否正常運行" });
          reject();
        });
    });

  const handleAnalyzeAll = async () => {
    const pending = papers.filter(p => p.status === "pending" && p.file);
    if (!pending.length) return;
    setAnalyzing(true);
    for (const p of pending) {
      try { await analyzeOne(p); } catch {}
    }
    setAnalyzing(false);
  };

  const handleCompare = async () => {
    const done = papers.filter(p => p.status === "done");
    if (done.length < 2) return;
    setComparing(true);
    setActiveTab("compare");
    try {
      const res = await axios.post(`${API_BASE}/compare`, {
        papers: done.map(p => ({ name: p.name, summary: p.result })),
      });
      setCompareResult(res.data.result);
    } catch {
      setCompareResult("比較失敗，請確認 backend 是否正常運行。");
    }
    setComparing(false);
  };

  const toggleMem = () => {
    setMemOn(prev => {
      if (prev) localStorage.removeItem("papers");
      return !prev;
    });
  };

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const cycleTheme = () => {
    const n = (themeIdx + 1) % THEMES.length;
    setThemeIdx(n);
    document.body.style.background = THEMES[n].bg;
  };

  const pending = papers.filter(p => p.status === "pending" && p.file);
  const done = papers.filter(p => p.status === "done");
  const activePaper = papers.find(p => p.id === activeTab);

  return (
    <>
      <div onClick={cycleTheme} style={{ position: "fixed", inset: 0, zIndex: 0, cursor: "pointer" }} />

      <div
        className="app-container"
        onClick={e => e.stopPropagation()}
        style={{ position: "relative", zIndex: 1, boxShadow: `0 18px 60px ${THEMES[themeIdx].glow}` }}
      >
        {/* Header */}
        <header className="app-header">
          <div className="header-row">
            <div>
              <h1 className="app-title">📄 論文分析工具</h1>
              <p className="app-subtitle">上傳學術論文 PDF，自動生成繁體中文摘要、優點與缺點</p>
              <p className="app-hint">點擊背景可切換主題</p>
            </div>
            <div className="mem-wrap" onClick={e => e.stopPropagation()}>
              <span className="mem-label">記憶功能</span>
              <button className={`mem-btn ${memOn ? "mem-on" : "mem-off"}`} onClick={toggleMem}>
                {memOn ? "ON" : "OFF"}
              </button>
            </div>
          </div>
        </header>

        {/* Upload */}
        {papers.length < 5 && (
          <div
            className={`upload-area ${dragOver ? "drag-over" : ""}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={e => { e.preventDefault(); setDragOver(false); }}
            onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
          >
            <input
              type="file"
              accept=".pdf"
              multiple
              className="upload-input"
              onChange={e => addFiles(e.target.files)}
            />
            <div className="upload-content">
              <span className="upload-icon">📤</span>
              <p className="upload-text">拖曳 PDF 至此，或點擊選擇</p>
              <p className="upload-subtext">最多 5 個 · 已選 {papers.length}/5</p>
            </div>
          </div>
        )}

        {/* Action Bar */}
        {papers.length > 0 && (
          <div className="action-bar" onClick={e => e.stopPropagation()}>
            <button
              className="analyze-button"
              onClick={handleAnalyzeAll}
              disabled={analyzing || !pending.length}
            >
              {analyzing
                ? <span className="loading-text"><div className="spinner" />分析中...</span>
                : `開始分析（${pending.length} 個待處理）`}
            </button>
            {done.length >= 2 && (
              <button className="compare-btn" onClick={handleCompare} disabled={comparing}>
                {comparing
                  ? <span className="loading-text"><div className="spinner" />比較中...</span>
                  : "⚖️ 比較所有論文"}
              </button>
            )}
            <button className="clear-btn" onClick={clearAll}>🗑️ 清除全部</button>
          </div>
        )}

        {/* Tabs */}
        {papers.length > 0 && (
          <div className="tabs-bar" onClick={e => e.stopPropagation()}>
            {papers.map(p => (
              <button
                key={p.id}
                className={`tab-btn ${activeTab === p.id ? "tab-active" : ""}`}
                onClick={() => setActiveTab(p.id)}
              >
                <span className="tab-icon">
                  {p.status === "done" ? "✅" : p.status === "error" ? "❌" : p.status === "analyzing" ? "⏳" : "📄"}
                </span>
                <span className="tab-name" title={p.name}>
                  {p.name.length > 16 ? p.name.slice(0, 14) + "…" : p.name}
                </span>
                {p.status === "analyzing" && <span className="tab-pct">{p.progress}%</span>}
                <span className="tab-x" onClick={ev => { ev.stopPropagation(); deletePaper(p.id); }}>×</span>
              </button>
            ))}
            {(compareResult || comparing) && (
              <button
                className={`tab-btn ${activeTab === "compare" ? "tab-active" : ""}`}
                onClick={() => setActiveTab("compare")}
              >
                ⚖️ 比較結果
              </button>
            )}
          </div>
        )}

        {/* Tab divider */}
        {papers.length > 0 && <div className="tabs-divider" />}

        {/* Content */}
        <div className="tab-content">
          {activeTab === "compare" ? (
            <div className="result-container">
              <div className="result-header-row">
                <h2 className="result-header">⚖️ 論文比較分析</h2>
                {!comparing && compareResult && (
                  <button
                    className={`copy-btn ${copiedId === "compare" ? "copied" : ""}`}
                    onClick={() => handleCopy("compare", compareResult)}
                  >
                    {copiedId === "compare" ? "已複製 ✓" : "複製"}
                  </button>
                )}
              </div>
              {comparing ? (
                <div className="placeholder">
                  <div className="spinner large" />
                  <p>正在比較所有論文，請稍候...</p>
                </div>
              ) : (
                <div className="result-content" dangerouslySetInnerHTML={{ __html: formatText(compareResult) }} />
              )}
            </div>
          ) : activePaper ? (
            <>
              {activePaper.status === "pending" && (
                <div className="placeholder">
                  <span style={{ fontSize: 40 }}>📄</span>
                  <p style={{ color: "#9ca3af", marginTop: 10 }}>
                    點擊「開始分析」以分析此論文
                  </p>
                </div>
              )}
              {activePaper.status === "analyzing" && (
                <div className="progress-container">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${activePaper.progress}%` }} />
                  </div>
                  <div className="progress-text">
                    <span className="progress-percentage">{activePaper.progress}%</span>
                    <span className="progress-message">{activePaper.message}</span>
                  </div>
                </div>
              )}
              {activePaper.status === "error" && (
                <div className="error-message">⚠️ {activePaper.error}</div>
              )}
              {activePaper.status === "done" && activePaper.result && (
                <div className="result-container">
                  <div className="result-header-row">
                    <h2 className="result-header">📊 分析結果</h2>
                    <button
                      className={`copy-btn ${copiedId === activePaper.id ? "copied" : ""}`}
                      onClick={() => handleCopy(activePaper.id, activePaper.result)}
                    >
                      {copiedId === activePaper.id ? "已複製 ✓" : "複製"}
                    </button>
                  </div>
                  <div className="result-content" dangerouslySetInnerHTML={{ __html: formatText(activePaper.result) }} />
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
