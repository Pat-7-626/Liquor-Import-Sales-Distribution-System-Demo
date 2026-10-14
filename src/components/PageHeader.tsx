export function PageHeader({ title, subtitle, eyebrow }: { title: string; subtitle: string; eyebrow?: string }) {
  return (
    <div className="mb-6">
      {eyebrow && <p className="mb-1.5 text-xs font-medium text-gold-600">{eyebrow}</p>}
      <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.01em] text-gray-900">{title}</h1>
      <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-gray-500">{subtitle}</p>
    </div>
  );
}
