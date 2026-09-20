# 15 - Multi-Agent Execution DAG & Orchestration Model

## 1. Multi-Agent Dependency Graph

The refactor is executed by coordinated specialized agents following strict dependency constraints:

```mermaid
graph TD
    P0[Phase 0: Repository Discovery - Agent B] --> P1[Phase 1: Target Architecture - Agent C]
    P1 --> P2[Phase 2: Migration Foundation - Agent K]
    
    %% Parallel Foundation Stream
    P2 --> P3[Phase 3: Backend Foundation - Agent D]
    P2 --> P4[Phase 4: Workspace Shell - Agent E]
    P2 --> P8[Phase 8: Properties & Tags - Agent C]
    
    %% Explorer & Editor Streams
    P4 --> P5[Phase 5: Knowledge Explorer - Agent E]
    P4 --> P6[Phase 6: Document Editor & Autosave - Agent E]
    P3 --> P7[Phase 7: WikiLinks & Backlinks Backend - Agent D]
    
    %% Connected Documents Convergence
    P6 --> P7UI[Phase 7: WikiLink AutoComplete & Preview UI - Agent E]
    P7 --> P7UI
    P7UI --> P9[Phase 9: Tabs & Quick Switcher - Agent E]
    
    %% Search & Graph Streams
    P3 --> P10[Phase 10: FTS & Hybrid Search - Agent F]
    P7 --> P11[Phase 11: Knowledge Graph Service & UI - Agent C/E]
    
    %% Sources & Research Streams
    P3 --> P12[Phase 12: Open Notebook Sources - Agent D/E]
    P10 --> P13[Phase 13: Semantic Retrieval - Agent F]
    P12 --> P13
    
    %% AI & RAG Streams
    P13 --> P14[Phase 14: AI Context Architecture - Agent G]
    P14 --> P15[Phase 15: Grounded AI Assistant & Streaming - Agent G/E]
    P15 --> P16[Phase 16: Reusable AI Actions - Agent G]
    P15 --> P17[Phase 17: Clickable Citations - Agent G/E]
    
    %% Hardening & Quality Gates
    P17 --> P18[Phase 18: Security Hardening - Agent J]
    P18 --> P19[Phase 19: Performance Engineering Pass - Agent H]
    P19 --> P20[Phase 20-29: Smoothness, Workers, Database Optimization - Agent H/D/L]
    P20 --> P30[Phase 30: E2E Testing Suite - Agent I]
    P30 --> P36[Phase 36: Final Review & Release - Agent M]
```

---

## 2. Phase Gate Checklists

Before transitioning between major streams, each phase gate must be satisfied:

1. **Gate 1 (Foundation Gate)**:
   - Alembic migration tested against disposable PostgreSQL database.
   - 100% existing documents and spaces intact.
   - Core CRUD and backlink indexes functional.
2. **Gate 2 (Workspace Gate)**:
   - 3-panel layout resizable and state persisted in localStorage.
   - Tab manager switching tabs in <16ms without layout jumps.
   - Autosave working reliably with non-blocking status indicator.
3. **Gate 3 (Intelligence Gate)**:
   - Full-text search and Quick Switcher responding <150ms.
   - WikiLinks resolving bidirectionally; backlinks panel populated.
   - Sources ingesting and chunking properly.
4. **Gate 4 (AI & Release Gate)**:
   - AI assistant streaming responses with clickable citations.
   - Pre-retrieval authorization verified (zero data leakage).
   - E2E Playwright test suite passes completely.
