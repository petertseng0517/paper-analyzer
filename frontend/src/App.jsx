import { useEffect, useRef, useState } from "react";
import axios from "axios";
import "./App.css";

const BACKEND_HOST = window.location.hostname || "127.0.0.1";
const API_BASE = `http://${BACKEND_HOST}:8000`;
const WS_BASE = `ws://${BACKEND_HOST}:8000`;

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem("papers") || "[]");
  } catch {
    return [];
  }
}

function formatText(text) {
  if (!text) return "";

  const esc = (value) =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const inline = (value) =>
    value
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/__(.+?)__/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/_(.+?)_/g, "<em>$1</em>");

  const lines = esc(text).split(/\r?\n/);
  let html = "";
  let inList = false;
  let paragraphOpen = false;
  let tableRows = [];

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

  const flushTable = () => {
    if (!tableRows.length) return;
    html += "<div class='table-wrap'><table>";
    tableRows.forEach((row, index) => {
      const cells = row.split("|").slice(1, -1);
      const tag = index === 0 ? "th" : "td";
      html += `<tr>${cells.map((cell) => `<${tag}>${inline(cell.trim())}</${tag}>`).join("")}</tr>`;
    });
    html += "</table></div>";
    tableRows = [];
  };

  lines.forEach((line) => {
    const text = line.trim();
    if (!text) {
      closeParagraph();
      closeList();
      flushTable();
      return;
    }

    if (text.startsWith("|")) {
      closeParagraph();
      closeList();
      if (!/^\|[-| :]+\|$/.test(text)) tableRows.push(text);
      return;
    }

    flushTable();

    const heading = text.match(/^(#{2,3})\s+(.*)$/);
    const listItem = text.match(/^[-*]\s+(.*)$/);

    if (heading) {
      closeParagraph();
      closeList();
      html += `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`;
    } else if (listItem) {
      closeParagraph();
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${inline(listItem[1])}</li>`;
    } else {
      if (!paragraphOpen) {
        html += "<p>";
        paragraphOpen = true;
      } else {
        html += " ";
      }
      html += inline(text);
    }
  });

  closeParagraph();
  closeList();
  flushTable();
  return html;
}

function buildPaper(file) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: file.name.replace(/\.pdf$/i, ""),
    file,
    status: "pending",
    progress: 0,
    message: "",
    result: null,
    error: null,
    version: 1,
  };
}

const BOOK_PAGES = [
  {
    left: { theme: "sage", image: "photo", layout: "wide" },
    right: { theme: "amber", image: "chart", layout: "tall" },
    turn: { theme: "moss", image: "diagram", layout: "wide" },
  },
  {
    left: { theme: "clay", image: "chart", layout: "split" },
    right: { theme: "ink", image: "diagram", layout: "wide" },
    turn: { theme: "sage", image: "map", layout: "tall" },
  },
  {
    left: { theme: "amber", image: "diagram", layout: "tall" },
    right: { theme: "sage", image: "photo", layout: "split" },
    turn: { theme: "clay", image: "chart", layout: "wide" },
  },
  {
    left: { theme: "ink", image: "map", layout: "wide" },
    right: { theme: "clay", image: "chart", layout: "split" },
    turn: { theme: "amber", image: "photo", layout: "tall" },
  },
];

const TABLECLOTH_PATTERNS = [
  "tablecloth-0",
  "tablecloth-1",
  "tablecloth-2",
  "tablecloth-3",
];

function MiniBookContent({ content, side }) {
  return (
    <>
      <span className={`page-image page-image-${side} image-${content.image} layout-${content.layout}`} />
      {side === "right" && <span className="page-corner" />}
    </>
  );
}

export default function App() {
  const [memOn, setMemOn] = useState(() => localStorage.getItem("memOn") === "true");
  const [papers, setPapers] = useState(() =>
    localStorage.getItem("memOn") === "true" ? loadSaved() : []
  );
  const [activeTab, setActiveTab] = useState(() => {
    if (localStorage.getItem("memOn") !== "true") return null;
    const saved = loadSaved();
    return saved.length ? saved[0].id : null;
  });
  const [compareResult, setCompareResult] = useState("");
  const [compareCompleted, setCompareCompleted] = useState(false);
  const [compareProgress, setCompareProgress] = useState(0);
  const [comparing, setComparing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [replaceTargetId, setReplaceTargetId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [teaActive, setTeaActive] = useState(false);
  const [pageActive, setPageActive] = useState(false);
  const [bookPageIndex, setBookPageIndex] = useState(0);
  const [tableclothPattern, setTableclothPattern] = useState(
    () => TABLECLOTH_PATTERNS[Math.floor(Math.random() * TABLECLOTH_PATTERNS.length)]
  );

  const replaceInputRef = useRef(null);
  const replaceAllInputRef = useRef(null);
  const addFilesInputRef = useRef(null);
  const analysisVersionRef = useRef(new Map());
  const pageTimerRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("memOn", String(memOn));
    if (!memOn) {
      localStorage.removeItem("papers");
      return;
    }

    const toSave = papers
      .filter((paper) => paper.status === "done")
      .map(({ id, name, status, result }) => ({ id, name, status, result }));
    localStorage.setItem("papers", JSON.stringify(toSave));
  }, [papers, memOn]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTableclothPattern((current) => {
        let next = current;
        while (next === current) {
          next = TABLECLOTH_PATTERNS[
            Math.floor(Math.random() * TABLECLOTH_PATTERNS.length)
          ];
        }
        return next;
      });
    }, 120000);

    return () => window.clearInterval(interval);
  }, []);

  const updatePaper = (id, patch) => {
    setPapers((prev) => prev.map((paper) => (paper.id === id ? { ...paper, ...patch } : paper)));
  };

  const addFiles = (fileList) => {
    const pdfs = Array.from(fileList || []).filter(
      (file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name)
    );

    if (!pdfs.length) return;

    setPapers((prev) => {
      const canAdd = Math.max(0, 5 - prev.length);
      const nextPapers = pdfs.slice(0, canAdd).map(buildPaper);
      if (nextPapers.length) setTimeout(() => setActiveTab(nextPapers[0].id), 0);
      return [...prev, ...nextPapers];
    });
    setCompareCompleted(false);
    setCompareResult("");
    setCompareProgress(0);
  };

  const analyzeOne = (paper) =>
    new Promise((resolve, reject) => {
      const currentVersion = paper.version || 1;
      analysisVersionRef.current.set(paper.id, currentVersion);
      updatePaper(paper.id, {
        status: "analyzing",
        progress: 0,
        message: "正在整理論文頁面...",
        error: null,
      });

      const formData = new FormData();
      formData.append("file", paper.file);

      axios
        .post(`${API_BASE}/analyze`, formData)
        .then((res) => {
          const taskId = res.data.task_id;
          const ws = new WebSocket(`${WS_BASE}/ws/analyze/${taskId}`);

          ws.onmessage = ({ data }) => {
            try {
              if (analysisVersionRef.current.get(paper.id) !== currentVersion) {
                ws.close();
                reject(new Error("analysis cancelled"));
                return;
              }

              const event = JSON.parse(data);
              if (event.error) {
                updatePaper(paper.id, { status: "error", error: event.error });
                ws.close();
                reject(new Error(event.error));
                return;
              }

              updatePaper(paper.id, {
                progress: event.progress || 0,
                message: event.message || "正在分析...",
              });

              if (event.completed) {
                if (event.result && !event.result.error) {
                  updatePaper(paper.id, {
                    status: "done",
                    result: event.result,
                    progress: 100,
                    message: "分析完成",
                  });
                  ws.close();
                  resolve();
                } else {
                  const message = event.result?.error || "分析失敗，請稍後再試。";
                  updatePaper(paper.id, { status: "error", error: message });
                  ws.close();
                  reject(new Error(message));
                }
              }
            } catch (error) {
              updatePaper(paper.id, { status: "error", error: "進度資料讀取失敗。" });
              ws.close();
              reject(error);
            }
          };

          ws.onerror = () => {
            updatePaper(paper.id, { status: "error", error: "無法連線到分析進度服務。" });
            reject(new Error("websocket error"));
          };
        })
        .catch(() => {
          updatePaper(paper.id, {
            status: "error",
            error: "上傳失敗，請確認 backend 是否已啟動。",
          });
          reject(new Error("upload failed"));
        });
    });

  const handleAnalyzeAll = async () => {
    const pending = papers.filter((paper) => paper.status === "pending" && paper.file);
    if (!pending.length) return;

    setAnalyzing(true);
    for (const paper of pending) {
      try {
        await analyzeOne(paper);
      } catch {
        // Keep going so one failed file does not block the rest.
      }
    }
    setAnalyzing(false);
  };

  const compareTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (compareTimerRef.current) {
        window.clearInterval(compareTimerRef.current);
      }
    };
  }, []);

  const handleCompare = async () => {
    const done = papers.filter((paper) => paper.status === "done");
    if (done.length < 2) return;

    setComparing(true);
    setCompareProgress(5);
    setCompareCompleted(false);
    setActiveTab("compare");

    if (compareTimerRef.current) {
      window.clearInterval(compareTimerRef.current);
    }
    compareTimerRef.current = window.setInterval(() => {
      setCompareProgress((current) => Math.min(95, current + Math.floor(Math.random() * 10) + 5));
    }, 400);

    try {
      const res = await axios.post(`${API_BASE}/compare`, {
        papers: done.map((paper) => ({ name: paper.name, summary: paper.result })),
      });
      setCompareResult(res.data.result);
      setCompareCompleted(true);
      setCompareProgress(100);
    } catch {
      setCompareResult("比較失敗，請確認 backend 是否已啟動。");
      setCompareCompleted(false);
      setCompareProgress(100);
    }
    setComparing(false);
    if (compareTimerRef.current) {
      window.clearInterval(compareTimerRef.current);
      compareTimerRef.current = null;
    }
  };

  const handleReplaceFile = (event) => {
    const file = event.target.files?.[0];
    if (!file || !replaceTargetId) {
      event.target.value = "";
      return;
    }

    const nextVersion = (analysisVersionRef.current.get(replaceTargetId) || 1) + 1;
    analysisVersionRef.current.set(replaceTargetId, nextVersion);
    setPapers((prev) =>
      prev.map((paper) =>
        paper.id === replaceTargetId
          ? {
              ...paper,
              file,
              name: file.name.replace(/\.pdf$/i, ""),
              status: "pending",
              progress: 0,
              message: "",
              result: null,
              error: null,
              version: nextVersion,
            }
          : paper
      )
    );
    setActiveTab(replaceTargetId);
    setReplaceTargetId(null);
    setCompareCompleted(false);
    setCompareResult("");
    event.target.value = "";
  };

  const handleReplaceAllFiles = (event) => {
    const pdfs = Array.from(event.target.files || []).filter(
      (file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name)
    );
    if (!pdfs.length) {
      event.target.value = "";
      return;
    }

    analysisVersionRef.current.clear();
    const nextPapers = pdfs.slice(0, 5).map(buildPaper);
    setPapers(nextPapers);
    setActiveTab(nextPapers[0]?.id || null);
    setCompareCompleted(false);
    setCompareResult("");
    setCompareProgress(0);
    event.target.value = "";
  };

  const toggleMem = () => {
    setMemOn((prev) => {
      const next = !prev;
      if (next) {
        const saved = loadSaved();
        if (saved.length) {
          setPapers((current) => (current.length ? current : saved));
          setActiveTab((current) => current || saved[0].id);
        }
      } else {
        localStorage.removeItem("papers");
      }
      return next;
    });
  };

  const openReplaceFile = (id) => {
    setReplaceTargetId(id);
    replaceInputRef.current?.click();
  };

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text || "").then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    });
  };

  const deletePaper = (id) => {
    setPapers((prev) => {
      const next = prev.filter((paper) => paper.id !== id);
      if (activeTab === id) setActiveTab(next[0]?.id || null);
      return next;
    });
    setCompareCompleted(false);
    setCompareResult("");
    setCompareProgress(0);
  };

  const clearAll = () => {
    setPapers([]);
    setActiveTab(null);
    setCompareCompleted(false);
    setCompareResult("");
    setCompareProgress(0);
    localStorage.removeItem("papers");
  };

  const stirTea = () => {
    setTeaActive(true);
    window.setTimeout(() => setTeaActive(false), 1100);
  };

  const replayAnimation = (setter, timerRef) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setter(false);
    window.requestAnimationFrame(() => {
      setter(true);
      timerRef.current = window.setTimeout(() => setter(false), 1200);
    });
  };

  const flipPage = () => {
    replayAnimation(setPageActive, pageTimerRef);
    window.setTimeout(() => {
      setBookPageIndex((current) => (current + 1) % BOOK_PAGES.length);
    }, 620);
  };

  const handlePageKeyDown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    flipPage();
  };

  const pending = papers.filter((paper) => paper.status === "pending" && paper.file);
  const done = papers.filter((paper) => paper.status === "done");
  const activePaper = papers.find((paper) => paper.id === activeTab);
  const isCompareView = activeTab === "compare";
  const bookPage = BOOK_PAGES[bookPageIndex];
  const nextBookPage = BOOK_PAGES[(bookPageIndex + 1) % BOOK_PAGES.length];

  const formatSize = (size) => {
    if (!size) return "已保存結果";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const statusText = {
    pending: "待分析",
    analyzing: "閱讀中",
    done: "已完成",
    error: "需重試",
  };

  return (
    <main className="app-shell">
      <section className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow">Paper Analyzer</p>
          <h1>Paper-Analyzer</h1>
          <p className="hero-desc">
            上傳 PDF 後，系統會擷取重點、整理摘要與評論；多篇完成後也能一起比較。
          </p>
          <div className="hero-actions">
            <button className="primary-btn" type="button" onClick={() => addFilesInputRef.current?.click()}>
              選擇 PDF
            </button>
            <button className={`memory-toggle ${memOn ? "is-on" : ""}`} type="button" onClick={toggleMem}>
              {memOn ? "記憶已開" : "記憶關閉"}
            </button>
          </div>
        </div>

        <div className={`reading-still-life ${tableclothPattern}`} aria-hidden="true">
          <button
            className={`open-book ${pageActive ? "is-flipped" : ""}`}
            type="button"
            aria-label="翻動書頁"
            title="翻動書頁"
            onPointerDown={flipPage}
            onKeyDown={handlePageKeyDown}
          >
            <span className={`page page-left page-theme-${bookPage.left.theme}`}>
              <MiniBookContent content={bookPage.left} side="left" />
            </span>
            <span className={`page page-right page-theme-${bookPage.right.theme}`}>
              <MiniBookContent content={bookPage.right} side="right" />
            </span>
            <span className={`turning-page page-theme-${nextBookPage.turn.theme}`}>
              <MiniBookContent content={nextBookPage.turn} side="turn" />
            </span>
            <span className="book-gutter" />
          </button>
          <button
            className={`tea-cup ${teaActive ? "is-stirred" : ""}`}
            type="button"
            aria-label="攪動茶杯"
            title="攪動茶杯"
            onClick={stirTea}
          >
            <span className="steam steam-one" />
            <span className="steam steam-two" />
            <span className="steam steam-three" />
            <span className="tea" />
          </button>
        </div>
      </section>

      <section className="workspace-grid">
        <aside className="library-panel">
          <div className="section-heading">
            <div>
              <p>Library</p>
              <h2>分析書架</h2>
            </div>
            <span>{papers.length}/5</span>
          </div>

          {papers.length === 0 ? (
            <div
              className={`upload-zone ${dragOver ? "drag-over" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setDragOver(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(false);
                addFiles(event.dataTransfer.files);
              }}
            >
              <div className="upload-mark" />
              <h3>拖曳 PDF 到這裡</h3>
              <p>一次最多保留 5 篇論文，適合專題資料快速整理與比較。</p>
              <button type="button" className="secondary-btn" onClick={() => addFilesInputRef.current?.click()}>
                瀏覽檔案
              </button>
            </div>
          ) : (
            <div className="paper-list">
              {compareCompleted && (
                <article
                  key="compare"
                  className={`paper-card compare-card ${activeTab === "compare" ? "is-active" : ""}`}
                  onClick={() => setActiveTab("compare")}
                >
                  <div className="paper-spine" />
                  <div className="paper-info">
                    <h3>比較結果</h3>
                    <p>已完成比較分析</p>
                  </div>
                  <div className="paper-actions">
                    <span className="status-pill status-done">已完成</span>
                  </div>
                </article>
              )}
              {papers.map((paper) => (
                <article
                  key={paper.id}
                  className={`paper-card ${activeTab === paper.id ? "is-active" : ""}`}
                  onClick={() => setActiveTab(paper.id)}
                >
                  <div className="paper-spine" />
                  <div className="paper-info">
                    <h3>{paper.name}</h3>
                    <p>{formatSize(paper.file?.size)}</p>
                    {paper.status === "analyzing" && (
                      <div className="mini-progress">
                        <span style={{ width: `${paper.progress}%` }} />
                      </div>
                    )}
                    {paper.error && <p className="error-text">{paper.error}</p>}
                  </div>
                  <div className="paper-actions">
                    <span className={`status-pill status-${paper.status}`}>{statusText[paper.status]}</span>
                    <button
                      type="button"
                      className="icon-btn"
                      title="重新上傳"
                      onClick={(event) => {
                        event.stopPropagation();
                        openReplaceFile(paper.id);
                      }}
                    >
                      換
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title="移除"
                      onClick={(event) => {
                        event.stopPropagation();
                        deletePaper(paper.id);
                      }}
                    >
                      刪
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {papers.length > 0 && (
            <div className="control-dock">
              <button className="primary-btn" type="button" onClick={handleAnalyzeAll} disabled={analyzing || !pending.length}>
                {analyzing ? "分析進行中" : `分析待處理 ${pending.length} 篇`}
              </button>
              <button className="secondary-btn" type="button" onClick={() => addFilesInputRef.current?.click()} disabled={papers.length >= 5}>
                新增
              </button>
              <button className="secondary-btn" type="button" onClick={() => replaceAllInputRef.current?.click()}>
                全換
              </button>
              <button className="secondary-btn" type="button" onClick={clearAll}>
                清空
              </button>
              {done.length >= 2 && !compareCompleted && (
                <button className="compare-btn" type="button" onClick={handleCompare} disabled={comparing}>
                  {comparing ? "比較中" : "比較論文"}
                </button>
              )}
            </div>
          )}
        </aside>

        <section className="reader-panel">
          <div className="section-heading">
            <div>
              <p>Reading Notes</p>
              <h2>{isCompareView ? "比較報告" : activePaper?.name || "分析結果"}</h2>
            </div>
            {activePaper && <span>{statusText[activePaper.status]}</span>}
          </div>

          {isCompareView ? (
            <ResultView
              title="跨論文比較"
              subtitle="比較摘要"
              text={compareResult}
              loading={comparing}
              progress={compareProgress}
              emptyText="正在等待比較結果。"
              copied={copiedId === "compare"}
              onCopy={() => handleCopy("compare", compareResult)}
            />
          ) : activePaper ? (
            <PaperDetail
              paper={activePaper}
              copied={copiedId === activePaper.id}
              onCopy={() => handleCopy(activePaper.id, activePaper.result)}
            />
          ) : done.length ? (
            <div className="result-grid">
              {done.map((paper) => (
                <ResultView
                  key={paper.id}
                  title={paper.name}
                  subtitle="已完成筆記"
                  text={paper.result}
                  copied={copiedId === paper.id}
                  onCopy={() => handleCopy(paper.id, paper.result)}
                />
              ))}
            </div>
          ) : (
            <div className="empty-reader">
              <div className="empty-book" />
              <h3>等待第一篇論文</h3>
              <p>上傳 PDF 後，分析摘要會像筆記頁一樣出現在這裡。</p>
            </div>
          )}
        </section>
      </section>

      <input type="file" accept="application/pdf" ref={replaceInputRef} hidden onChange={handleReplaceFile} />
      <input type="file" accept="application/pdf" multiple ref={addFilesInputRef} hidden onChange={(event) => {
        addFiles(event.target.files);
        event.target.value = "";
      }} />
      <input type="file" accept="application/pdf" multiple ref={replaceAllInputRef} hidden onChange={handleReplaceAllFiles} />
    </main>
  );
}

function PaperDetail({ paper, copied, onCopy }) {
  if (paper.status === "analyzing") {
    return (
      <div className="analysis-progress">
        <div className="progress-ring">{paper.progress}%</div>
        <div>
          <h3>正在閱讀與摘要</h3>
          <p>{paper.message || "正在分析論文內容..."}</p>
          <div className="large-progress">
            <span style={{ width: `${paper.progress}%` }} />
          </div>
        </div>
      </div>
    );
  }

  if (paper.status === "error") {
    return (
      <div className="empty-reader error-state">
        <h3>分析沒有完成</h3>
        <p>{paper.error || "請重新上傳或稍後再試。"}</p>
      </div>
    );
  }

  if (paper.status !== "done") {
    return (
      <div className="empty-reader">
        <div className="empty-book" />
        <h3>這篇還沒開始分析</h3>
        <p>按下分析後，重點、摘要與評論會整理在這張閱讀頁上。</p>
      </div>
    );
  }

  return (
    <ResultView
      title={paper.name}
      subtitle="論文閱讀筆記"
      text={paper.result}
      copied={copied}
      onCopy={onCopy}
    />
  );
}

function ResultView({ title, subtitle, text, loading = false, progress = 0, emptyText = "尚無內容", copied, onCopy }) {
  return (
    <article className="result-sheet">
      <header className="result-sheet-header">
        <div>
          <p>{subtitle}</p>
          <h3>{title}</h3>
        </div>
        {text && (
          <button className={`copy-btn ${copied ? "copied" : ""}`} type="button" onClick={onCopy}>
            {copied ? "已複製" : "複製"}
          </button>
        )}
      </header>
      {loading ? (
        <div className="analysis-progress">
          <div className="progress-ring">{progress}%</div>
          <div>
            <h3>正在比對論文</h3>
            <p>系統正在分析跨篇重點與差異，請稍候。</p>
            <div className="large-progress">
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      ) : text ? (
        <div className="result-content" dangerouslySetInnerHTML={{ __html: formatText(text) }} />
      ) : (
        <div className="analysis-placeholder">{emptyText}</div>
      )}
    </article>
  );
}
