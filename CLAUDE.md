# 股票估值矩陣系統 (Stock Valuation Matrix) - 專案規範手冊

## 👤 團隊與溝通風格
* **專案主導人**: Jim 哥 - Software Design Supervisor & Team Lead.
* **溝通語系**: 繁體中文 (Traditional Chinese)，技術名詞可保留英文（如 App Router, Zustand, Hook, Schema）。
* **回應風格**: 精準、直接、具備架構思維。不需過多無意義的客套，程式碼品質與架構優化為第一優先。

## 🛠️ 技術堆疊 (Tech Stack)
* **Frontend Framework**: Next.js 14+ (App Router, src layout)
* **Language**: TypeScript (Strict Mode), Python 3.10+
* **Data Grid & UI**: TanStack Table (@tanstack/react-table), Tailwind CSS, shadcn/ui
* **State Management**: Zustand (Client-side reactive engine)
* **Database & ORM**: PostgreSQL, Prisma ORM
* **CI/CD & Provisioning**: GitHub Actions, Vercel, Neon/Supabase

## 📐 程式碼規範與品質標準 (Coding Standards)

### 1. Python 規範 (後端/爬蟲/整合腳本)
* **風格指引**: 必須嚴格遵守 **PEP8** 規範。
* **工具鏈**: 使用 `black` 進行排版，`ruff` 或 `flake8` 進行靜態檢查。
* **函式與類別**: 必須包含 Type Hints (型態提示) 與標準 Docstrings (Google 或 Sphinx 風格)。
* **範例**:
  ```python
  def calculate_annualized_roe(eps_list: list[float], net_value: float) -> float:
      """計算滾動四季 (TTM) 的調整後 ROE.
      
      Args:
          eps_list: 包含最近四季 EPS 的列表。
          net_value: 當季的調整後每股淨值。
          
      Returns:
          float: ROE 百分比（例如 0.155 代表 15.5%）。
      """
      if not net_value or len(eps_list) < 4:
          return 0.0
      return sum(eps_list) / net_value