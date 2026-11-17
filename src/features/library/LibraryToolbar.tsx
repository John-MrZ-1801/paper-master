import { CompareIcon, FolderIcon, PlusIcon, SearchIcon } from "../../components/Icons";
import type { PaperSort } from "./paperSorting";

interface Props {
  search: string;
  compareCount: number;
  loading: boolean;
  sort: PaperSort;
  onSearch(value: string): void;
  onSort(value: PaperSort): void;
  onImportPdf(): void;
  onImportFolder(): void;
  onCompare(): void;
  onFillMissing?(): void;
  selectedKeyword?: string;
  onFillScores?(): void;
}

export function LibraryToolbar({ search, compareCount, loading, sort, onSearch, onSort, onImportPdf, onImportFolder, onCompare, onFillMissing,selectedKeyword,onFillScores }: Props) {
  return (
    <header className="library-toolbar">
      <label className="search-box"><SearchIcon/><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search title, authors, abstract, tags…" aria-label="Search papers"/>{loading && <span className="mini-spinner"/>}</label>
      <div className="toolbar-actions">
        <label className="sort-control"><span>排序</span><select aria-label="论文排序方式" value={sort} onChange={(event) => onSort(event.target.value as PaperSort)}>
          <option value="created-desc">添加时间：新到旧</option>
          <option value="created-asc">添加时间：旧到新</option>
          <option value="title-asc">论文名称：A 到 Z</option>
          <option value="title-desc">论文名称：Z 到 A</option>
          <option value="author-asc">第一作者：A 到 Z</option>
          <option value="author-desc">第一作者：Z 到 A</option>
          {selectedKeyword&&<option value="keyword-score-desc">“{selectedKeyword}”创新分：高到低</option>}
          {selectedKeyword&&<option value="keyword-score-asc">“{selectedKeyword}”创新分：低到高</option>}
        </select></label>
        <button className="button secondary compact" onClick={onImportFolder}><FolderIcon/>Folder</button>
        <button className="button primary compact" onClick={onImportPdf}><PlusIcon/>Import PDF</button>
        <button className="button secondary compact" disabled={compareCount < 2} onClick={onCompare}><CompareIcon/>Compare{compareCount ? ` (${compareCount})` : ""}</button>
        {onFillMissing && <button className="button secondary compact" onClick={onFillMissing} title="使用 Settings 中保存的真实模型，补齐当前筛选内的未分析论文；已有结果和人工修改保留">补齐待分析</button>}
        {onFillScores && <button className="button secondary compact" onClick={onFillScores} title="使用当前 AI 服务，为当前筛选内尚未评分的论文和关键词生成评分">补齐待评分</button>}
      </div>
    </header>
  );
}
