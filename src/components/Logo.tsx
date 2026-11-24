export function Logo({ label = 'Min Voice' }: { label?: string }) {
  return (
    <div className="logo">
      <span className="logo-mark" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
