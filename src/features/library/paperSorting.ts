import type { Paper } from "../../domain/paper/Paper";

export type PaperSort =
  | "created-desc"
  | "created-asc"
  | "title-asc"
  | "title-desc"
  | "author-asc"
  | "author-desc";

const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });

function text(value?: string) {
  return value?.trim() ?? "";
}

function compareText(left: string, right: string, direction = 1) {
  if (!left && right) return 1;
  if (left && !right) return -1;
  return direction * collator.compare(left, right);
}

function compareDate(left: string, right: string, direction = 1) {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (!Number.isFinite(leftTime) && Number.isFinite(rightTime)) return 1;
  if (Number.isFinite(leftTime) && !Number.isFinite(rightTime)) return -1;
  return direction * (leftTime - rightTime);
}

export function sortPapers(papers: Paper[], sort: PaperSort) {
  return [...papers].sort((left, right) => {
    let result = 0;
    switch (sort) {
      case "created-desc": result = compareDate(left.created_at, right.created_at, -1); break;
      case "created-asc": result = compareDate(left.created_at, right.created_at); break;
      case "title-asc": result = compareText(text(left.title) || text(left.file_name), text(right.title) || text(right.file_name)); break;
      case "title-desc": result = compareText(text(left.title) || text(left.file_name), text(right.title) || text(right.file_name), -1); break;
      case "author-asc": result = compareText(text(left.authors[0]), text(right.authors[0])); break;
      case "author-desc": result = compareText(text(left.authors[0]), text(right.authors[0]), -1); break;
    }
    return result || collator.compare(left.id, right.id);
  });
}
