import React, { useState } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import {
  Video, Plus, Calendar, Clock, Users,
  Settings, LogOut, Home, History, Moon,
  Sun, Link, Bell, X
} from "lucide-react";
import MeetingRoom from "./MeetingRoom";
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function Dashboard({ user, token, onLogout }) {
  const [dark, setDark] = useState(true);
  const [showJoin, setShowJoin] = useState(false);
  const [meetingCode, setMeetingCode] = useState("");
  const [activeRoom, setActiveRoom] = useState(null);
  const [meetings, setMeetings] = useState([
    {
      id: 1,
      roomId: "MF-TEAM01",
      title: "Team Discussion",
      date: "Today",
      time: "10:30 AM",
      members: 4,
      status: "Upcoming"
    },
    {
      id: 2,
      roomId: "MF-REV02",
      title: "Project Review",
      date: "Tomorrow",
      time: "2:00 PM",
      members: 6,
      status: "Upcoming"
    }
  ]);

  if (activeRoom) {
    return (
      <MeetingRoom
        roomId={activeRoom}
        user={user}
        token={token}
        onLeave={() => setActiveRoom(null)}
      />
    );
  }

  const bg = dark ? "#10111b" : "#f4f5fb";
  const panel = dark ? "#191b29" : "#ffffff";
  const color = dark ? "#ffffff" : "#171827";
  const muted = dark ? "#999caf" : "#74778a";
  const border = dark ? "#292b3b" : "#e6e7ef";

  const createMeeting = async () => {
    try {
      const res = await axios.post(
        `${API_URL}/api/meetings`,
        { title: "Instant Collaboration Room" },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const roomId = res.data.meeting.roomId;

      const newMeeting = {
        id: Date.now(),
        roomId,
        title: "Instant Collaboration Room",
        date: "Today",
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        }),
        members: 1,
        status: "Live"
      };

      setMeetings((prev) => [newMeeting, ...prev]);

      if (navigator.clipboard) {
        navigator.clipboard.writeText(roomId).catch(() => {});
      }

      setActiveRoom(roomId);
    } catch {
      alert("Server se connect nahi ho paya. Pehle terminal mein 'node server.cjs' chalayein.");
    }
  };

  const joinMeeting = () => {
    if (!meetingCode.trim()) {
      alert("Please enter a meeting code");
      return;
    }

    setActiveRoom(meetingCode.trim().toUpperCase());
    setShowJoin(false);
    setMeetingCode("");
  };

  const initials = (user?.name || "NP")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div style={{
      minHeight: "100vh",
      background: bg,
      color,
      fontFamily: "Inter, Arial, sans-serif",
      display: "flex",
      transition: "0.3s"
    }}>

      <style>{`
        * { box-sizing: border-box; }
        button { cursor: pointer; font-family: inherit; }

        .mf-sidebar {
          width: 245px;
          padding: 28px 18px;
          border-right: 1px solid ${border};
          background: ${panel};
          flex-shrink: 0;
        }

        .mf-main {
          flex: 1;
          padding: 30px;
          min-width: 0;
        }

        .mf-nav {
          display: flex;
          align-items: center;
          gap: 13px;
          padding: 13px;
          margin: 8px 0;
          border-radius: 12px;
          color: ${muted};
          cursor: pointer;
          transition: 0.2s;
        }

        .mf-nav:hover, .mf-nav.active {
          background: #7048ef22;
          color: #9c7cff;
        }

        .mf-card {
          background: ${panel};
          border: 1px solid ${border};
          border-radius: 18px;
          padding: 22px;
        }

        .mf-action {
          border: 0;
          border-radius: 12px;
          padding: 14px 18px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
        }

        .mf-primary {
          background: #7652f5;
          color: white;
        }

        .mf-secondary {
          background: ${dark ? "#292b3b" : "#eeeefa"};
          color: ${color};
        }

        .mf-input {
          width: 100%;
          padding: 14px;
          border-radius: 10px;
          border: 1px solid ${border};
          background: ${bg};
          color: ${color};
          outline: none;
          margin: 12px 0;
        }

        .mf-modal {
          position: fixed;
          inset: 0;
          z-index: 10;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 20px;
          background: #0009;
        }

        @media(max-width: 760px) {
          .mf-sidebar { display: none; }
          .mf-main { padding: 18px; }
          .mf-stats { grid-template-columns: repeat(2,1fr) !important; }
          .mf-actions { flex-direction: column; }
          .mf-actions button { width: 100%; }
        }

        @media(max-width: 420px) {
          .mf-stats { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Sidebar */}
      <aside className="mf-sidebar">
        <h2 style={{
          color: "#9575ff",
          display: "flex",
          alignItems: "center",
          gap: 10
        }}>
          <Video size={28} /> MeetFlow
        </h2>

        <p style={{ color: muted, fontSize: 12, marginTop: 35 }}>MENU</p>

        <div className="mf-nav active">
          <Home size={19} /> Dashboard
        </div>

        <div className="mf-nav" onClick={createMeeting}>
          <Video size={19} /> Meetings
        </div>

        <div className="mf-nav">
          <Calendar size={19} /> Schedule
        </div>

        <div className="mf-nav">
          <History size={19} /> History
        </div>

        <div className="mf-nav">
          <Users size={19} /> Contacts
        </div>

        <p style={{ color: muted, fontSize: 12, marginTop: 40 }}>GENERAL</p>

        <div className="mf-nav">
          <Settings size={19} /> Settings
        </div>

        <div className="mf-nav" onClick={onLogout}>
          <LogOut size={19} /> Logout
        </div>

        <div style={{
          marginTop: 70,
          padding: 15,
          background: "#7652f51a",
          borderRadius: 14
        }}>
          <Video color="#9575ff" size={25} />
          <p style={{ fontWeight: 600 }}>MeetFlow Pro</p>
          <p style={{ color: muted, fontSize: 12 }}>
            Collaborate without limits.
          </p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="mf-main">

        {/* Header */}
        <header style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 35
        }}>
          <div>
            <h2 style={{ margin: 0 }}>Dashboard</h2>
            <p style={{ color: muted, marginTop: 8 }}>
              Welcome back, {user?.name || "User"} 👋
            </p>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button
              className="mf-action mf-secondary"
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <button className="mf-action mf-secondary">
              <Bell size={18} />
            </button>

            <div style={{
              width: 42,
              height: 42,
              borderRadius: "50%",
              background: "#7652f5",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontWeight: "bold"
            }}>
              {initials}
            </div>
          </div>
        </header>

        {/* Welcome Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mf-card"
          style={{
            background: "linear-gradient(120deg,#6545dc,#9270fa)",
            border: 0,
            padding: 30,
            marginBottom: 25,
            color: "#fff"
          }}
        >
          <h1 style={{ marginTop: 0 }}>
            Connect. Collaborate. Create.
          </h1>

          <p style={{ color: "#eee5ff" }}>
            Start a meeting or join your team instantly.
          </p>

          <div className="mf-actions" style={{
            display: "flex",
            gap: 12,
            marginTop: 25
          }}>
            <button
              className="mf-action"
              style={{ background: "white", color: "#6545dc" }}
              onClick={createMeeting}
            >
              <Plus size={18} /> New Meeting
            </button>

            <button
              className="mf-action"
              style={{
                background: "#ffffff25",
                color: "white",
                border: "1px solid #ffffff50"
              }}
              onClick={() => setShowJoin(true)}
            >
              <Link size={18} /> Join Meeting
            </button>
          </div>
        </motion.div>

        {/* Stats */}
        <div className="mf-stats" style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 18,
          marginBottom: 30
        }}>
          {[
            { title: "Total Meetings", value: meetings.length, icon: Video },
            { title: "Team Members", value: "12", icon: Users },
            { title: "Hours Online", value: "24", icon: Clock }
          ].map((item, index) => (
            <motion.div
              key={index}
              whileHover={{ y: -5 }}
              className="mf-card"
            >
              <item.icon color="#9270fa" size={25} />
              <h2 style={{ marginBottom: 5 }}>{item.value}</h2>
              <p style={{ color: muted, margin: 0 }}>{item.title}</p>
            </motion.div>
          ))}
        </div>

        {/* Recent Meetings */}
        <section className="mf-card">
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20
          }}>
            <h3>Recent Meetings</h3>
            <span style={{ color: "#9270fa", fontSize: 13 }}>
              Click any meeting to join
            </span>
          </div>

          {meetings.map((meeting) => (
            <div
              key={meeting.id}
              onClick={() => meeting.roomId && setActiveRoom(meeting.roomId)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                padding: 16,
                borderTop: `1px solid ${border}`,
                cursor: "pointer"
              }}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{
                  background: "#7652f522",
                  padding: 12,
                  borderRadius: 12
                }}>
                  <Video color="#9270fa" />
                </div>

                <div>
                  <strong>{meeting.title}</strong>
                  <p style={{ color: muted, fontSize: 12, margin: "6px 0" }}>
                    {meeting.date} · {meeting.time} · ID: {meeting.roomId}
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ color: muted, fontSize: 12, display: "flex", gap: 5 }}>
                  <Users size={14} /> {meeting.members}
                </span>

                <span style={{ color: "#9b80ff", fontSize: 12 }}>
                  {meeting.status}
                </span>
              </div>
            </div>
          ))}
        </section>

        <p style={{
          textAlign: "center",
          color: muted,
          marginTop: 35,
          fontSize: 12
        }}>
          © 2026 MeetFlow. All rights reserved.
        </p>

      </main>

      {/* Join Meeting Modal */}
      {showJoin && (
        <div className="mf-modal" onClick={() => setShowJoin(false)}>
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="mf-card"
            style={{ width: "100%", maxWidth: 400 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}>
              <h3>Join a Meeting</h3>
              <button
                onClick={() => setShowJoin(false)}
                style={{ background: "transparent", color, border: 0 }}
              >
                <X />
              </button>
            </div>

            <p style={{ color: muted, fontSize: 13 }}>
              Enter your meeting room ID below.
            </p>

            <input
              className="mf-input"
              placeholder="e.g. MF-A1B2C3D4"
              value={meetingCode}
              onChange={(e) => setMeetingCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") joinMeeting();
              }}
            />

            <button
              className="mf-action mf-primary"
              style={{ width: "100%" }}
              onClick={joinMeeting}
            >
              Join Now
            </button>
          </motion.div>
        </div>
      )}

    </div>
  );
}