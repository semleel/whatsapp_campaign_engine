"use client";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Pencil, PlusCircle, X } from "lucide-react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

export default function CampaignSchedulerPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const [scheduleData, setScheduleData] = useState({
    startDate: new Date(),
    startTime: "",
    endDate: new Date(),
    endTime: "",
    timeMessage: "",
  });

  const fetchCampaigns = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("http://localhost:3000/api/campaignschedule/schedules");
      const data = await res.json();
      setCampaigns(data);
    } catch (error) {
      console.error("Fetch campaigns error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const openAddModal = (campaign: any) => {
    setSelectedCampaign(campaign);
    setIsEditing(false);
    setScheduleData({
      startDate: new Date(),
      startTime: "",
      endDate: new Date(),
      endTime: "",
      timeMessage: "",
    });
    setShowModal(true);
  };

  const openEditModal = (campaign: any) => {
    setSelectedCampaign(campaign);
    setIsEditing(true);
    setScheduleData({
      startDate: new Date(campaign.schedule.startDate),
      startTime: campaign.schedule.startTime || "",
      endDate: new Date(campaign.schedule.endDate),
      endTime: campaign.schedule.endTime || "",
      timeMessage: campaign.schedule.timeMessage || "",
    });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    const payload = {
      campaignID: selectedCampaign.campaignid,
      startDate: scheduleData.startDate.toISOString().split("T")[0],
      startTime: scheduleData.startTime,
      endDate: scheduleData.endDate.toISOString().split("T")[0],
      endTime: scheduleData.endTime,
      timeMessage: scheduleData.timeMessage,
    };

    try {
      const url = isEditing
        ? `http://localhost:3000/api/campaignschedule/update/${selectedCampaign.schedule.id}`
        : "http://localhost:3000/api/campaignschedule/add";

      const method = isEditing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (res.ok) {
        alert(result.message);
        setShowModal(false);
        fetchCampaigns();
      } else {
        alert(result.error || "Failed to save schedule");
      }
    } catch (error) {
      console.error("Save schedule error:", error);
      alert("An error occurred while saving schedule");
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">All Campaign Schedules</h1>

      <Card>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
           <thead>
  <tr className="border-b bg-gray-100">
    <th className="p-3 text-left">Campaign Name</th>
    <th className="p-3 text-left">Status</th>
    <th className="p-3 text-left">Start Date</th>
    <th className="p-3 text-left">Start Time</th>
    <th className="p-3 text-left">End Date</th>
    <th className="p-3 text-left">End Time</th>
    <th className="p-3 text-left">Time Message</th>
    <th className="p-3 text-center">Action</th>
  </tr>
</thead>
<tbody>
  {loading ? (
    <tr>
      <td colSpan={8} className="p-4 text-center">
        Loading...
      </td>
    </tr>
  ) : campaigns.length > 0 ? (
    campaigns.map((c) => (
      <tr key={c.campaignid} className="border-b hover:bg-gray-50">
        <td className="p-3">{c.campaignname}</td>
        <td className="p-3">
          <span
            className={`px-2 py-1 rounded text-xs font-medium ${
              c.status === "Active"
                ? "bg-green-100 text-green-700"
                : c.status === "On Hold"
                ? "bg-yellow-100 text-yellow-700"
                : c.status === "Inactive"
                ? "bg-gray-200 text-gray-700"
                : "bg-blue-100 text-blue-700"
            }`}
          >
            {c.status}
          </span>
        </td>
        <td className="p-3">{c.schedule?.startDate || "-"}</td>
        <td className="p-3">{c.schedule?.startTime || "-"}</td>
        <td className="p-3">{c.schedule?.endDate || "-"}</td>
        <td className="p-3">{c.schedule?.endTime || "-"}</td>
        <td className="p-3">{c.schedule?.timeMessage || "-"}</td>
        <td className="p-3 text-center">
  {c.schedule ? (
    c.status === "Active" ? (
      <Button
        size="sm"
        variant="destructive"
        onClick={async () => {
          if (confirm("This campaign is currently Active. Do you want to Pause it before editing?")) {
            const res = await fetch(`http://localhost:3000/api/campaignschedule/pause/${c.campaignid}`, {
              method: "PUT",
            });
            const result = await res.json();
            if (res.ok) {
              alert(result.message);
              fetchCampaigns();
            } else {
              alert(result.error || "Failed to pause campaign");
            }
          }
        }}
      >
        Pause
      </Button>
    ) : (
      <Button
        size="sm"
        variant="outline"
        onClick={() => openEditModal(c)}
      >
        <Pencil className="w-4 h-4 mr-1" /> Edit
      </Button>
    )
  ) : (
    <Button size="sm" onClick={() => openAddModal(c)}>
      <PlusCircle className="w-4 h-4 mr-1" /> Add
    </Button>
  )}
</td>

      </tr>
    ))
  ) : (
    <tr>
      <td colSpan={8} className="p-4 text-center">
        No campaigns found
      </td>
    </tr>
  )}
</tbody>
          </table>
        </CardContent>
      </Card>

      {/* ✅ Modal for Add/Edit Schedule */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">
                {isEditing ? "Edit Schedule" : "Add Schedule"}
              </h2>
              <button onClick={() => setShowModal(false)}>
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Start Date</label>
                <DatePicker
                  selected={scheduleData.startDate}
                  onChange={(date: Date) => setScheduleData({ ...scheduleData, startDate: date })}
                  className="border p-2 rounded w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Start Time</label>
                <input
                  type="time"
                  className="border p-2 rounded w-full"
                  value={scheduleData.startTime}
                  onChange={(e) => setScheduleData({ ...scheduleData, startTime: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End Date</label>
                <DatePicker
                  selected={scheduleData.endDate}
                  onChange={(date: Date) => setScheduleData({ ...scheduleData, endDate: date })}
                  className="border p-2 rounded w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End Time</label>
                <input
                  type="time"
                  className="border p-2 rounded w-full"
                  value={scheduleData.endTime}
                  onChange={(e) => setScheduleData({ ...scheduleData, endTime: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Time Message</label>
                <input
                  type="text"
                  className="border p-2 rounded w-full"
                  value={scheduleData.timeMessage}
                  onChange={(e) => setScheduleData({ ...scheduleData, timeMessage: e.target.value })}
                  placeholder="Optional message"
                />
              </div>

              <Button className="w-full mt-3" onClick={handleSubmit}>
                {isEditing ? "Update Schedule" : "Add Schedule"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
