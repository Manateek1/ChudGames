import { useEffect, useMemo, useState } from "react";
export function Handbook() {
  const [text, setText] = useState(""),
    [search, setSearch] = useState(""),
    [chapter, setChapter] = useState("14"),
    [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/buildblox-handbook.txt", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.text();
      })
      .then(setText)
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, []);
  const chapters = useMemo(
    () =>
      Array.from(
        text.matchAll(
          /^(\d\d) {2}([^\n]+)\r?\n=+\r?\n([\s\S]*?)(?=^\d\d {2}[^\n]+\r?\n=+|(?![\s\S]))/gm,
        ),
        (m) => ({ id: m[1], title: m[2].trim(), body: m[3].trim() }),
      ),
    [text],
  );
  const selected = chapters.find((c) => c.id === chapter);
  const passages = search.trim()
    ? chapters
        .flatMap((c) =>
          c.body
            .split(/\r?\n\s*\r?\n/)
            .filter((p) => p.toLowerCase().includes(search.toLowerCase()))
            .map((body) => ({ chapter: c.id, body })),
        )
        .slice(0, 55)
    : [];
  return (
    <div className="tw-book">
      <div className="tw-fields">
        <label>
          Chapter
          <select
            value={chapter}
            onChange={(e) => {
              setChapter(e.target.value);
              setSearch("");
            }}
          >
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id} · {c.title.toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search handbook
          <input
            value={search}
            placeholder="Item, creature or mechanic"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {error ? (
        <a href="/buildblox-handbook.txt">Open the full handbook</a>
      ) : !text ? (
        <p>Loading handbook…</p>
      ) : search ? (
        <div>
          {passages.length ? (
            passages.map((p, i) => <pre key={i}>{p.body}</pre>)
          ) : (
            <p>No matching passages.</p>
          )}
        </div>
      ) : (
        <pre>{selected?.body}</pre>
      )}
    </div>
  );
}
