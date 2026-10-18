import { curriculum } from '../../lessons/curriculum';
import { getLesson, lessonPath } from '../../lessons/registry';
import type { Category } from '../../types/lesson';

export interface SearchItem {
  id: string;
  title: string;
  category: Category;
  keywords: string[];
  group?: string;
  /** Present only when the topic has a live lesson. */
  path?: string;
}

/** Every curriculum topic; live lessons add their keywords and a path. */
export const searchIndex: SearchItem[] = curriculum.map((topic) => {
  const lesson = getLesson(topic.id);
  return {
    id: topic.id,
    title: topic.title,
    category: topic.category,
    keywords: [...(lesson?.keywords ?? []), ...(topic.group ? [topic.group.toLowerCase()] : [])],
    ...(topic.group && { group: topic.group }),
    ...(lesson && { path: lessonPath(lesson) }),
  };
});

const MAX_RESULTS = 8;

/** Title prefix beats title substring beats keyword; live lessons win ties. */
export function searchTopics(query: string, topics: SearchItem[]): SearchItem[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];

  const scored: { item: SearchItem; score: number; order: number }[] = [];
  topics.forEach((item, order) => {
    const title = item.title.toLowerCase();
    const score = title.startsWith(q)
      ? 0
      : title.includes(q)
        ? 1
        : item.keywords.some((k) => k.toLowerCase().includes(q))
          ? 2
          : -1;
    if (score >= 0) scored.push({ item, score, order });
  });

  return scored
    .toSorted(
      (a, b) =>
        a.score - b.score || Number(b.item.path !== undefined) - Number(a.item.path !== undefined) || a.order - b.order,
    )
    .slice(0, MAX_RESULTS)
    .map((s) => s.item);
}
