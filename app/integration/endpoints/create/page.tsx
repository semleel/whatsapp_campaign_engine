"use client";
import { useRouter } from "next/navigation";
import EndpointForm from "@/components/EndpointForm";
import type { EndpointConfig } from "@/lib/types";
import { Api } from "@/lib/client";
import { useState } from "react";

export default function NewEndpointPage() {
    const router = useRouter();
    const [saving, setSaving] = useState(false);

    const initial: EndpointConfig = {
        name: "",
        method: "GET",
        url: "",
        description: "",
        headers: [],
        query: [],
        bodyTemplate: "",
        auth: { type: "none" },
        timeoutMs: 8000,
        retries: 0,
        backoffMs: 300,
        parameters: [],
    };

    return (
        <div className="space-y-6">
            <h3 className="text-lg font-semibold">New Endpoint</h3>
            <div className="rounded-xl border p-4">
                <EndpointForm
                    initial={initial}
                    submitting={saving}
                    onCancel={() => router.push("/integration/endpoints")}
                    onSubmit={async (data) => {
                        setSaving(true);
                        await Api.createEndpoint(data);
                        router.push("/integration/endpoints");
                    }}
                />
            </div>
        </div>
    );
}
