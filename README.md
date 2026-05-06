# 📄 論文分析工具

> **TAICA — 生成式AI的人文導論** 課程期末專案
> 指導老師：國立台灣大學 謝舒凱 教授

上傳學術論文 PDF，自動生成繁體中文**摘要、優點與缺點**。

使用本地端 LLM（Ollama + Qwen2.5），無需付費 API、資料不外傳。

---

## 功能

- 📤 支援拖曳或點擊上傳 PDF（中英文論文皆可）
- 📊 即時進度條顯示分析狀態
- 🧠 自動生成：論文摘要、優點（Pros）、缺點（Cons）
- 📋 一鍵複製分析結果

---

## 技術架構

```
前端（React + Vite）
    ↓ HTTP / WebSocket
後端（FastAPI + Python）
    ↓
PDF 解析（PyMuPDF）→ 文字分段 → 逐段分析（Ollama）→ 生成總結
```

| 層級 | 技術 |
|------|------|
| 前端 | React 18、Vite、Axios |
| 後端 | FastAPI、Uvicorn |
| PDF 解析 | PyMuPDF |
| LLM | Ollama + Qwen2.5:7b（本地端） |
| 即時通訊 | WebSocket |

---

## 環境需求

- Python 3.11+
- Node.js 18+
- [Ollama](https://ollama.com) 已安裝並下載模型

---

## 安裝步驟

### 1. 下載模型

```bash
ollama pull qwen2.5:7b
```

### 2. 安裝後端套件

```bash
cd backend
python -m venv ../venv
source ../venv/bin/activate      # Windows: ..\venv\Scripts\activate
pip install -r requirements.txt
```

### 3. 安裝前端套件

```bash
cd frontend
npm install
```

---

## 啟動方式

**Terminal 1 — 後端：**

```bash
cd backend
source ../venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000 --ws wsproto
```

**Terminal 2 — 前端：**

```bash
cd frontend
npm run dev
```

開啟瀏覽器：`http://localhost:5173`

---

## 使用說明

1. 將 PDF 論文拖曳到上傳區，或點擊選擇檔案
2. 點擊「開始分析」
3. 等待進度條跑完（依論文長度約需 3-10 分鐘）
4. 查看分析結果，可點擊右上角「複製」按鈕複製內容

---

## 注意事項

- 請確認 Ollama 服務正在運行（`ollama serve`）
- 建議論文在 20 頁以內，過長會花較多時間
- 掃描版 PDF（無文字層）無法分析

---

## 團隊成員

| 姓名 | 學校 |
|------|------|
| 莊千響 | 銘傳大學 |
| 葉耀斌 | 銘傳大學 |
| 張照均 | 國立東華大學 |
| 曾建瑋 | 國立東華大學 |

---

`v0.2` · 2026-05-06 · 開發中
