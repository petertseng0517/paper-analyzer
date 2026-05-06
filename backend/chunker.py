import re

SECTION_HEADERS = [
    r"abstract", r"摘要", r"introduction", r"引言", r"緒論", r"related work",
    r"相關工作", r"文獻回顧", r"background", r"背景",
    r"methodology", r"方法論", r"method", r"方法",
    r"experiment", r"實驗", r"result", r"結果",
    r"discussion", r"討論", r"conclusion", r"結論",
    r"reference", r"參考文獻"
]

def chunk_by_section(text: str, max_words: int = 1500) -> list[str]:
    pattern = "|".join(SECTION_HEADERS)
    regex = re.compile(f"(?i)(^({pattern}).*$)", re.MULTILINE)
    parts = regex.split(text)
    sections = [s.strip() for s in parts if s.strip()]

    final_chunks = []
    for section in sections:
        words = section.split()
        if len(words) > max_words:
            # 太長就切小塊
            for i in range(0, len(words), max_words):
                chunk = " ".join(words[i:i + max_words])
                final_chunks.append(chunk)
        else:
            final_chunks.append(section)

    return final_chunks