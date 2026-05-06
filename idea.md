- 想法: 使用本地端模型來輸出論文的摘要與優缺點。
- 原因：因為如果沒有買LLM會員，你的token使用量有限，4.5篇論文用量可能就沒了。

架構:
[使用者上傳 PDF]
        ↓
[Step 1] pdf_parser.py
    使用 PyMuPDF 解析 PDF，提取純文字
        ↓
[Step 2] chunker.py
    偵測論文章節標題（Abstract / Introduction /
    Methodology / Results / Conclusion 等）
    將全文切成多個語意完整的段落
    若單段超過 1500 字，再做二次切割
        ↓
[Step 3] analyzer.py — 第一階段
    對每個段落呼叫 Qwen2.5:7b
    提取該段的重點（繁體中文條列）
        ↓
[Step 4] analyzer.py — 第二階段
    彙整所有段落重點
    一次生成完整的：
    
論文摘要 Summary
優點 Pros
缺點 Cons
  ↓
[回傳結果至瀏覽器顯示]