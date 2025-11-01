'use client';

import React, { useEffect, useState } from 'react';

interface Campaign {
  campaignid: number;
  campaignname: string;
  objective: string;
  camstatusid: number | null;
  campaignstatus?: { currentstatus: string };
}

export default function ArchivedCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchArchivedCampaigns = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/campaign/archive');
        if (!response.ok) throw new Error('Failed to fetch');
        const data = await response.json();
        setCampaigns(data);
      } catch (error) {
        console.error('Error fetching archived campaigns:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchArchivedCampaigns();
  }, []);

  if (loading) {
    return <p className="text-center mt-10">Loading archived campaigns...</p>;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Archived Campaigns</h1>

      {campaigns.length === 0 ? (
        <p>No archived campaigns found.</p>
      ) : (
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-2">ID</th>
              <th className="border border-gray-300 px-4 py-2">Name</th>
              <th className="border border-gray-300 px-4 py-2">Objective</th>
              <th className="border border-gray-300 px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.campaignid}>
                <td className="border border-gray-300 px-4 py-2">{c.campaignid}</td>
                <td className="border border-gray-300 px-4 py-2">{c.campaignname}</td>
                <td className="border border-gray-300 px-4 py-2">{c.objective}</td>
                <td className="border border-gray-300 px-4 py-2 text-red-500 font-semibold">
                  {c.campaignstatus?.currentstatus || 'Archived'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
