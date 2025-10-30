'use client';

import { useState, useEffect } from 'react';

interface Region {
  regionid: string;
  regionname: string;
}

interface UserFlow {
  userflowid: string;
  userflowname: string;
}

interface CampaignStatus {
  camstatusid: string;
  currentstatus: string;
}

export default function CreateCampaignPage() {
  const [formData, setFormData] = useState({
    campaignName: '',
    objective: '',
    targetRegionID: '',
    userFlowID: '',
    camStatusID: '',
    campaignScheduleID: ''
  });

  const [regions, setRegions] = useState<{ id: string; name: string }[]>([]);
  const [userFlows, setUserFlows] = useState<{ id: string; name: string }[]>([]);
  const [statuses, setStatuses] = useState<{ id: string; name: string }[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    // 🔹 Fetch Regions
    fetch('http://localhost:3000/api/reference/regions')
      .then(res => res.json())
      .then((data: Region[]) =>
        setRegions(data.map(r => ({ id: r.regionid, name: r.regionname })))
      )
      .catch(err => console.error('Error fetching regions:', err));

    // 🔹 Fetch User Flows
    fetch('http://localhost:3000/api/reference/userflows')
      .then(res => res.json())
      .then((data: UserFlow[]) =>
        setUserFlows(data.map(u => ({ id: u.userflowid, name: u.userflowname })))
      )
      .catch(err => console.error('Error fetching user flows:', err));

    // 🔹 Fetch Campaign Statuses
    fetch('http://localhost:3000/api/reference/campaignstatus')
      .then(res => res.json())
      .then((data: CampaignStatus[]) =>
        setStatuses(data.map(s => ({ id: s.camstatusid, name: s.currentstatus })))
      )
      .catch(err => console.error('Error fetching statuses:', err));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setMessage('Submitting...');

  // Convert empty string fields to null
  const cleanedData = Object.fromEntries(
    Object.entries(formData).map(([key, value]) => [key, value === '' ? null : value])
  );

  try {
    const res = await fetch('http://localhost:3000/api/campaign/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cleanedData),
    });

    const data = await res.json();
    if (res.ok) {
      setMessage('✅ Campaign created successfully!');
    } else {
      setMessage(`❌ Error: ${data.error || 'Unknown error'}`);
    }
  } catch (err) {
    setMessage('❌ Network error.');
    console.error(err);
  }
};

  return (
    <div className="max-w-xl mx-auto mt-10 p-6 bg-white rounded-2xl shadow-lg">
      <h1 className="text-2xl font-bold mb-4">🎯 Create New Campaign</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          name="campaignName"
          placeholder="Campaign Name"
          value={formData.campaignName}
          onChange={handleChange}
          className="w-full p-2 border rounded"
          required
        />

        <input
          type="text"
          name="objective"
          placeholder="Objective"
          value={formData.objective}
          onChange={handleChange}
          className="w-full p-2 border rounded"
          required
        />

        {/* Target Region */}
        <select
          name="targetRegionID"
          value={formData.targetRegionID}
          onChange={handleChange}
          className="w-full p-2 border rounded"
          required
        >
          <option value="">Select Target Region</option>
          {regions.map(region => (
            <option key={region.id} value={region.id}>
              {region.name}
            </option>
          ))}
        </select>

        {/* User Flow */}
        <select
          name="userFlowID"
          value={formData.userFlowID}
          onChange={handleChange}
          className="w-full p-2 border rounded"
          required
        >
          <option value="">Select User Flow</option>
          {userFlows.map(flow => (
            <option key={flow.id} value={flow.id}>
              {flow.name}
            </option>
          ))}
        </select>

        {/* ✅ Campaign Status */}
        <select
          name="camStatusID"
          value={formData.camStatusID}
          onChange={handleChange}
          className="w-full p-2 border rounded"
          required
        >
          <option value="">Select Campaign Status</option>
          {statuses.map(status => (
            <option key={status.id} value={status.id}>
              {status.name}
            </option>
          ))}
        </select>

        {/* <input
          type="text"
          name="campaignScheduleID"
          placeholder="Campaign Schedule ID"
          value={formData.campaignScheduleID}
          onChange={handleChange}
          className="w-full p-2 border rounded"
        /> */}

        <button
          type="submit"
          className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700"
        >
          Create Campaign
        </button>
      </form>

      {message && <p className="mt-4 text-center text-gray-700">{message}</p>}
    </div>
  );
}
