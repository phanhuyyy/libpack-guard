"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Brand";
import { useI18n } from "./I18nProvider";

type Listing = { path: string; parent: string | null; dirs: { name: string; path: string; hasProject: boolean }[] };
type Shortcut = { kind: "drive" | "home" | "dir"; label: string; path: string };

async function call<T>(body: object): Promise<T> {
  const res = await fetch("/api/fs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

const KIND_ICON = { drive: "drive", home: "home", dir: "folder" } as const;

/** Browse folders on this machine (listed by the local server) and pick one. */
export default function FolderPicker({ onPick, onClose }: { onPick: (path: string) => void; onClose: () => void }) {
  const { t } = useI18n();
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [listing, setListing] = useState<Listing | null>(null);
  const [typed, setTyped] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function open(p: string) {
    setLoading(true);
    setErr(null);
    try {
      const l = await call<Listing>({ path: p });
      setListing(l);
      setTyped(l.path);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    call<{ shortcuts: Shortcut[] }>({})
      .then((r) => {
        setShortcuts(r.shortcuts);
        const home = r.shortcuts.find((s) => s.kind === "home");
        if (home) open(home.path);
      })
      .catch((e) => setErr((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const labelOf = (s: Shortcut) =>
    s.kind === "drive" ? (s.label === "/" ? "/" : t("picker.drive", { d: s.label })) : s.kind === "home" ? t("picker.home") : s.label;

  return (
    <div className="picker" role="dialog" aria-label={t("picker.title")}>
      <div className="picker-head">
        <h2><Icon name="folder" /> {t("picker.title")}</h2>
        <button className="small" onClick={onClose}><Icon name="x" size={14} /> {t("picker.close")}</button>
      </div>

      <div className="chips" style={{ marginBottom: 12 }}>
        {shortcuts.map((s) => (
          <button key={s.path} className={`chip${listing?.path === s.path ? " selected" : ""}`} onClick={() => open(s.path)}>
            <Icon name={KIND_ICON[s.kind]} size={14} /> {labelOf(s)}
          </button>
        ))}
      </div>

      <form
        className="picker-path"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed.trim()) open(typed.trim());
        }}
      >
        <button type="button" className="small" disabled={!listing?.parent || loading} onClick={() => listing?.parent && open(listing.parent)} title={t("picker.upTitle")}>
          <Icon name="up" size={14} /> {t("picker.up")}
        </button>
        <input type="text" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t("picker.placeholder")} aria-label={t("picker.placeholder")} />
        <button type="submit" className="small">{t("picker.open")}</button>
      </form>

      {err && <p className="notice err" style={{ margin: "10px 0 0" }}><Icon name="alert" size={16} /> <span>{err}</span></p>}

      <div className="picker-list">
        {loading && <div className="muted" style={{ padding: 12 }}>{t("picker.loading")}</div>}
        {!loading && listing && listing.dirs.length === 0 && <div className="muted" style={{ padding: 12 }}>{t("picker.empty")}</div>}
        {!loading &&
          listing?.dirs.map((d) => (
            <button key={d.path} className="picker-item" onClick={() => open(d.path)} title={d.path}>
              <Icon name="folder" size={16} />
              <span className="grow">{d.name}</span>
              {d.hasProject && <span className="badge project">{t("picker.hasProject")}</span>}
            </button>
          ))}
      </div>

      <div className="picker-foot">
        <span className="path">{listing?.path ?? ""}</span>
        <button className="primary" disabled={!listing || loading} onClick={() => listing && onPick(listing.path)}>
          <Icon name="check" size={16} /> {t("picker.choose")}
        </button>
      </div>
    </div>
  );
}
