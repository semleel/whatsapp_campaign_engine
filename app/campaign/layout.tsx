export default function CampaignLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Campaign Engine</h2>
      </div>
      {children}
    </div>
  );
}
