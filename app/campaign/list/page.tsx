'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation'; // ✅ import router

interface Campaign {
  campaignid: number;
  campaignname: string;
  userflowname: string;
  regionname: string;
  currentstatus: string;
}

export default function CampaignListPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const router = useRouter(); // ✅ initialize router

  useEffect(() => {
    fetch('http://localhost:3000/api/campaign/list')
      .then((res) => res.json())
      .then((data) => setCampaigns(data))
      .catch((err) => console.error('Error fetching campaigns:', err))
      .finally(() => setLoading(false));
  }, []);

  // ✅ navigate using router.push instead of window.location.href
  const handleEdit = (id: number) => {
    router.push(`/campaign/edit/${id}`);
  };

  const handleArchive = async (id: number) => {
    if (!confirm('Are you sure you want to archive this campaign?')) return;

    try {
      const res = await fetch(`http://localhost:3000/api/campaign/archive/${id}`, {
        method: 'PUT',
      });
      if (res.ok) {
        setMessage('✅ Campaign archived successfully');
        setCampaigns(campaigns.filter((c) => c.campaignid !== id));
      } else {
        setMessage('❌ Failed to archive campaign');
      }
    } catch (err) {
      console.error(err);
      setMessage('❌ Network error.');
    }
  };

  if (loading) return <p>Loading campaigns...</p>;

  return (
    <div className="max-w-4xl mx-auto mt-10 p-6 bg-white rounded-2xl shadow-lg">
      <h1 className="text-2xl font-bold mb-4">📋 Campaign List</h1>

      <table className="w-full border-collapse border border-gray-300 text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2 text-left">Campaign Name</th>
            <th className="border p-2 text-left">User Flow</th>
            <th className="border p-2 text-left">Target</th>
            <th className="border p-2 text-left">Status</th>
            <th className="border p-2 text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr key={c.campaignid}>
              <td className="border p-2">{c.campaignname}</td>
              <td className="border p-2">{c.userflowname}</td>
              <td className="border p-2">{c.regionname}</td>
              <td className="border p-2">
                <span
                  className={`px-2 py-1 rounded text-white ${
                    c.currentstatus === 'Active'
                      ? 'bg-green-600'
                      : c.currentstatus === 'Expired'
                      ? 'bg-red-600'
                      : 'bg-gray-500'
                  }`}
                >
                  {c.currentstatus}
                </span>
              </td>
              <td className="border p-2 text-center space-x-2">
                <button
                  onClick={() => handleEdit(c.campaignid)} // ✅ uses router.push
                  className="text-blue-600 hover:text-blue-800"
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleArchive(c.campaignid)}
                  className="text-red-600 hover:text-red-800"
                >
                  🗑️
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {message && <p className="mt-4 text-center text-gray-700">{message}</p>}
    </div>
  );
}
