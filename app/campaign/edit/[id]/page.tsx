'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function EditCampaignPage() {
  const { id } = useParams();
  const router = useRouter();

  const [form, setForm] = useState({
    campaignName: '',
    objective: '',
    targetRegionID: '',
    userFlowID: '',
    camStatusID: '',
  });

  const [regions, setRegions] = useState<any[]>([]);
  const [userFlows, setUserFlows] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  // ✅ Fetch dropdown data + campaign details
  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch reference data
        const [regionRes, userFlowRes, statusRes, campaignRes] = await Promise.all([
          fetch('http://localhost:3000/api/reference/regions'),
          fetch('http://localhost:3000/api/reference/userflows'),
          fetch('http://localhost:3000/api/reference/campaignstatus'),
          fetch(`http://localhost:3000/api/campaign/${id}`),
        ]);

        const [regionData, userFlowData, statusData, campaignData] = await Promise.all([
          regionRes.json(),
          userFlowRes.json(),
          statusRes.json(),
          campaignRes.json(),
        ]);

        setRegions(regionData);
        setUserFlows(userFlowData);
        setStatuses(statusData);

        // Fill in campaign data
        setForm({
          campaignName: campaignData.campaignname || '',
          objective: campaignData.objective || '',
          targetRegionID: campaignData.targetregionid?.toString() || '',
          userFlowID: campaignData.userflowid?.toString() || '',
          camStatusID: campaignData.camstatusid?.toString() || '',
        });
      } catch (err) {
        console.error('Error fetching data:', err);
        setMessage('❌ Failed to load campaign data.');
      } finally {
        setLoading(false);
      }
    }

    if (id) fetchData();
  }, [id]);

  // ✅ Handle updates
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const res = await fetch(`http://localhost:3000/api/campaign/update/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        setMessage('✅ Campaign updated successfully!');
        setTimeout(() => router.push('/campaign/list'), 1000);
      } else {
        setMessage('❌ Failed to update campaign');
      }
    } catch (err) {
      console.error(err);
      setMessage('❌ Network error.');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div className="max-w-2xl mx-auto mt-10 p-6 bg-white rounded-2xl shadow-lg">
      <h1 className="text-2xl font-bold mb-4">✏️ Edit Campaign</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          name="campaignName"
          value={form.campaignName}
          onChange={handleChange}
          placeholder="Campaign Name"
          className="w-full border p-2 rounded"
        />

        <input
          type="text"
          name="objective"
          value={form.objective}
          onChange={handleChange}
          placeholder="Objective"
          className="w-full border p-2 rounded"
        />

        {/* ✅ Dropdown for Target Region */}
        <select
          name="targetRegionID"
          value={form.targetRegionID}
          onChange={handleChange}
          className="w-full border p-2 rounded"
        >
          <option value="">-- Select Region --</option>
          {regions.map((r) => (
            <option key={r.regionid} value={r.regionid}>
              {r.regionname}
            </option>
          ))}
        </select>

        {/* ✅ Dropdown for User Flow */}
        <select
          name="userFlowID"
          value={form.userFlowID}
          onChange={handleChange}
          className="w-full border p-2 rounded"
        >
          <option value="">-- Select User Flow --</option>
          {userFlows.map((u) => (
            <option key={u.userflowid} value={u.userflowid}>
              {u.userflowname}
            </option>
          ))}
        </select>

        {/* ✅ Dropdown for Campaign Status */}
        <select
          name="camStatusID"
          value={form.camStatusID}
          onChange={handleChange}
          className="w-full border p-2 rounded"
        >
          <option value="">-- Select Status --</option>
          {statuses.map((s) => (
            <option key={s.camstatusid} value={s.camstatusid}>
              {s.currentstatus}
            </option>
          ))}
        </select>

        <button
          type="submit"
          className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700"
        >
          Save Changes
        </button>
      </form>

      {message && <p className="mt-4 text-center text-gray-700">{message}</p>}
    </div>
  );
}
