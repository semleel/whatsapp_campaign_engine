"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import EndpointForm from "@/components/EndpointForm";
import type { EndpointConfig } from "@/lib/types";
import { Api } from "@/lib/client";

export default function EditEndpointPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const [initial, setInitial] = useState<EndpointConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const ep = await Api.getEndpoint(id);
                setInitial(ep);
            } finally {
                setLoading(false);
            }
        })();
    }, [id]);

    if (loading) return <div>Loading…</div>;
    if (!initial) return <div className="text-zinc-500">Endpoint not found.</div>;

    return (
        <div className="space-y-6">
            <h3 className="text-lg font-semibold">Edit Endpoint</h3>
            <div className="rounded-xl border p-4">
                <EndpointForm
                    initial={initial}
                    submitting={saving}
                    onCancel={() => router.push("/integration/endpoints")}
                    onSubmit={async (data) => {
                        setSaving(true);
                        await Api.updateEndpoint(id, data);
                        router.push("/integration/endpoints");
                    }}
                />
            </div>
        </div>
    );
}
