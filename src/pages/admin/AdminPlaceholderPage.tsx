export default function AdminPlaceholderPage({ title }: { title: string }) {
  return (
    <div className="p-6 space-y-2">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-muted-foreground">Módulo estruturado no menu tenant-level. Implementação detalhada em progresso.</p>
    </div>
  );
}
