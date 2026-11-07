export default function Loading() {
  return (
    <div className="skeleton" aria-busy="true" aria-live="polite">
      <div className="lg" />
      <div style={{ width: "30%" }} />
      <div className="block" />
      <div className="block" />
    </div>
  );
}
