# 09 - AI & RAG Architecture (Knowledge Assistant)

## 1. Grounded Knowledge Assistant Principles

The Knowledge AI assistant is **source-grounded**, **context-transparent**, and **auditable**:
1. **Explicit Context**: The user sees and controls exactly what documents and sources are included in the model's context window.
2. **Pre-Retrieval Authorization**: Context items and retrieved chunks are filtered for user permissions **before** entering the prompt.
3. **No Hallucinated Facts**: The system prompt instructs the model to answer only using provided context, explicitly stating when information is missing.
4. **Interactive Clickable Citations**: Every claim in the assistant's response contains bracketed citation keys `[1]`, `[2]` that map to an excerpt and scroll to the referenced source section.

---

## 2. Context Model & Token Budgeting

### 2.1 Context Hierarchy
```text
Context Configuration
├── Explicitly Selected Documents (User checked in Context Drawer)
├── Explicitly Selected Sources (Attached PDFs, URLs, ADRs)
├── Current Active Document (Auto-included by default)
└── Directly Linked Documents (Top 3 backlinked or outbound linked pages)
```

### 2.2 Token Budget Allocation (Total Budget: 8,000 tokens)
- **System Prompt & Instructions**: 800 tokens (~10%)
- **Document Context (Active & Linked Docs)**: 3,600 tokens (~45%)
- **Source Chunks (PDFs, URLs, Code)**: 2,400 tokens (~30%)
- **Conversation History (Last 3 turns)**: 800 tokens (~10%)
- **Reserved Output Generation**: 4,000 tokens

Truncation Strategy:
- Documents exceeding budget are truncated by section headers, retaining Overview and Key Decisions sections first.
- Source chunks are ranked by hybrid RRF score against the user's question, and only top $K$ chunks fitting the budget are included.

---

## 3. RAG Pipeline & Streaming Architecture

```text
User Question: "What is the token refresh lifecycle?"
│
├── 1. Context Assembly & Permission Gate
│   ├── Fetch selected documents and sources
│   ├── Filter out any unauthorized IDs
│   └── Rank and select top relevant chunks
│
├── 2. Prompt Synthesis
│   ├── System instructions with strict anti-hallucination rules
│   ├── XML-tagged context blocks:
│   │   <document id="1" title="Authentication Architecture">...</document>
│   │   <source id="2" title="OAuth RFC 6749">...</source>
│   └── Formatted conversation history
│
├── 3. LLM Generation via Streaming
│   ├── LangChain ChatOpenAI / Gemini model streaming
│   ├── FastAPI returns StreamingResponse(content_type="text/event-stream")
│   └── Emits JSON events:
│       event: context_info -> {"sources_count": 2, "tokens_used": 3400}
│       event: token        -> {"content": "Token "}
│       event: token        -> {"content": "refresh "}
│       event: citation     -> {"key": 1, "title": "Auth Architecture", "excerpt": "..."}
│       event: done         -> {"message_id": "uuid"}
```

---

## 4. Reusable Knowledge AI Actions

Rather than ad-hoc chat prompts, the workspace provides standardized engineering actions:

| Action | Goal | Prompt Template / Output Schema |
|---|---|---|
| **Summarize Document** | Generate concise executive summary with bullet points. | Produces Problem, Solution, Key Constraints, Next Actions. |
| **Extract Decisions (ADR)** | Detect architecture choices and produce ADR markdown. | Context, Decision, Consequences (Positive/Negative/Neutral). |
| **Find Contradictions** | Compare two documents for conflicting statements. | Matrix of conflicting assertions, citations, and resolution recommendations. |
| **Generate Runbook** | Turn architecture/technical docs into an operational runbook. | Prerequisites, Step-by-Step Procedure, Verification, Rollback Steps. |
| **Generate Checklist** | Extract verification checklist from requirements. | Markdown `- [ ]` checklist with ownership tags. |
| **Explain Architecture** | Plain-language walkthrough of complex design. | High-level overview + data flow diagram description. |

---

## 5. Clickable Citation Schema

When the model outputs `[1]` or `[2]`, the frontend renders an interactive badge:
- **Badge Click**: Opens the source in the Context Inspector or a split view.
- **Scroll & Highlight**: Uses text snippet matching to scroll directly to the cited paragraph.
