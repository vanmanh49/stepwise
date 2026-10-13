export default function Catalog({ category }: { category: "data-structures" | "algorithms" }) {
  return <div className="mx-auto max-w-5xl px-6 py-16">{category}</div>;
}
