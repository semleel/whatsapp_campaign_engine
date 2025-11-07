export default function IntegrationLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <h2 className="text-xl font-semibold">Backend Integration & Live Campaign API</h2>
            </div>
            {children}
        </div>
    );
}
