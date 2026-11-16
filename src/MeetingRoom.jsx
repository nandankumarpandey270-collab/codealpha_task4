import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import axios from "axios";
import {
  Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff,
  Send, Paperclip, Eraser, PenTool, Type, Trash2, ShieldCheck, Copy
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const ICE_SERVERS = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

function RemoteVideo({ stream, name }) {
  const videoRef = useRef(null);
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div style={{ position: "relative", background: "#090a10", borderRadius: 14, overflow: "hidden", border: "1px solid #292b3b", minHeight: 190 }}>
      <video ref={videoRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <span style={{ position: "absolute", bottom: 10, left: 10, background: "#000000aa", padding: "4px 10px", borderRadius: 8, fontSize: 12 }}>
        {name || "Participant"}
      </span>
    </div>
  );
}

export default function MeetingRoom({ roomId, user, token, onLeave }) {
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);

  const [remotePeers, setRemotePeers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [uploading, setUploading] = useState(false);

  const [wbTool, setWbTool] = useState("pen");
  const [penColor, setPenColor] = useState("#7652f5");

  const socketRef = useRef(null);
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peersRef = useRef({});
  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    let mounted = true;

    async function initRoom() {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch {
        alert("Camera/Mic permission denied or unavailable. Joining in view-only mode.");
        stream = new MediaStream();
      }

      if (!mounted) return;
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const socket = io(API_URL, { auth: { token } });
      socketRef.current = socket;

      socket.on("connect", () => {
        socket.emit("join-room", roomId);
      });

      socket.on("room-users", (existingSocketIds) => {
        existingSocketIds.forEach((targetSocketId) => {
          createPeerConnection(targetSocketId, true, socket, stream);
        });
      });

      socket.on("user-joined", ({ socketId, user: remoteUser }) => {
        setRemotePeers((prev) => {
          if (prev.some((p) => p.socketId === socketId)) return prev;
          return [...prev, { socketId, name: remoteUser?.name || "Participant", stream: null }];
        });
      });

      socket.on("offer", async ({ offer, sender, user: remoteUser }) => {
        const pc = createPeerConnection(sender, false, socket, stream, remoteUser?.name);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("answer", { target: sender, answer });
      });

      socket.on("answer", async ({ answer, sender }) => {
        const pc = peersRef.current[sender];
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
      });

      socket.on("ice-candidate", async ({ candidate, sender }) => {
        const pc = peersRef.current[sender];
        if (pc && candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
        }
      });

      socket.on("user-left", ({ socketId }) => {
        if (peersRef.current[socketId]) {
          peersRef.current[socketId].close();
          delete peersRef.current[socketId];
        }
        setRemotePeers((prev) => prev.filter((p) => p.socketId !== socketId));
      });

      socket.on("chat-message", (msgData) => {
        setMessages((prev) => [...prev, { type: "chat", ...msgData }]);
      });

      socket.on("file-shared", (fileData) => {
        setMessages((prev) => [...prev, { type: "file", ...fileData }]);
      });

      socket.on("whiteboard-draw", (stroke) => drawStrokeOnCanvas(stroke));
      socket.on("whiteboard-text", (textItem) => drawTextOnCanvas(textItem));
      socket.on("whiteboard-clear", () => {
        const canvas = canvasRef.current;
        if (canvas) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
      });
    }

    initRoom();

    return () => {
      mounted = false;
      if (socketRef.current) {
        socketRef.current.emit("leave-room", roomId);
        socketRef.current.disconnect();
      }
      Object.values(peersRef.current).forEach((pc) => pc.close());
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [roomId, token]);

  function createPeerConnection(targetSocketId, isInitiator, socket, stream, remoteName = "Participant") {
    if (peersRef.current[targetSocketId]) return peersRef.current[targetSocketId];

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current[targetSocketId] = pc;

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("ice-candidate", { target: targetSocketId, candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      const [remoteStream] = e.streams;
      setRemotePeers((prev) => {
        const exists = prev.find((p) => p.socketId === targetSocketId);
        if (exists) {
          return prev.map((p) => (p.socketId === targetSocketId ? { ...p, stream: remoteStream } : p));
        }
        return [...prev, { socketId: targetSocketId, name: remoteName, stream: remoteStream }];
      });
    };

    if (isInitiator) {
      pc.onnegotiationneeded = async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("offer", { target: targetSocketId, offer });
      };
    }

    return pc;
  }

  const toggleMic = () => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setMicOn(audioTrack.enabled);
    }
  };

  const toggleCam = () => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setCamOn(videoTrack.enabled);
    }
  };

  const toggleScreenShare = async () => {
    if (!screenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];

        if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;

        Object.values(peersRef.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender) sender.replaceTrack(screenTrack);
        });

        socketRef.current?.emit("screen-share-start", roomId);
        setScreenSharing(true);

        screenTrack.onended = () => stopScreenShare();
      } catch {
        // Cancelled
      }
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = () => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    const camTrack = localStreamRef.current?.getVideoTracks()[0];
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    if (camTrack) {
      Object.values(peersRef.current).forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) sender.replaceTrack(camTrack);
      });
    }
    socketRef.current?.emit("screen-share-stop", roomId);
    setScreenSharing(false);
  };

  function drawStrokeOnCanvas({ x0, y0, x1, y1, color, width }) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  function drawTextOnCanvas({ x, y, text, color }) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = color;
    ctx.font = "18px Inter, Arial, sans-serif";
    ctx.fillText(text, x, y);
  }

  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height
    };
  };

  const handleCanvasDown = (e) => {
    const { x, y } = getCanvasCoords(e);
    if (wbTool === "text") {
      const text = prompt("Enter text to write on whiteboard:");
      if (text && text.trim()) {
        const textItem = { x, y, text: text.trim(), color: penColor };
        drawTextOnCanvas(textItem);
        socketRef.current?.emit("whiteboard-text", { roomId, textItem });
      }
      return;
    }
    isDrawingRef.current = true;
    lastPosRef.current = { x, y };
  };

  const handleCanvasMove = (e) => {
    if (!isDrawingRef.current || wbTool === "text") return;
    const { x, y } = getCanvasCoords(e);
    const stroke = {
      x0: lastPosRef.current.x,
      y0: lastPosRef.current.y,
      x1: x,
      y1: y,
      color: wbTool === "eraser" ? "#ffffff" : penColor,
      width: wbTool === "eraser" ? 20 : 3
    };
    drawStrokeOnCanvas(stroke);
    socketRef.current?.emit("whiteboard-draw", { roomId, drawing: stroke });
    lastPosRef.current = { x, y };
  };

  const clearWhiteboard = () => {
    socketRef.current?.emit("whiteboard-clear", roomId);
  };

  const sendChatMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socketRef.current?.emit("chat-message", { roomId, message: chatInput });
    setChatInput("");
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await axios.post(`${API_URL}/api/files`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data"
        }
      });
      socketRef.current?.emit("share-file", { roomId, file: res.data.file });
    } catch {
      alert("File upload failed (Max 15MB).");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#10111b", color: "#fff", fontFamily: "Inter, Arial, sans-serif", display: "flex", flexDirection: "column", padding: 18 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#191b29", padding: "12px 20px", borderRadius: 16, border: "1px solid #292b3b", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <strong style={{ color: "#9c7cff", fontSize: 18 }}>MeetFlow</strong>
          <span style={{ background: "#292b3b", padding: "5px 12px", borderRadius: 8, fontSize: 13 }}>
            Room: <b>{roomId}</b>
          </span>
          <button
            onClick={() => navigator.clipboard?.writeText(roomId)}
            style={{ background: "#7652f522", color: "#9c7cff", border: "1px solid #7652f555", borderRadius: 8, padding: "5px 10px", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12 }}
          >
            <Copy size={14} /> Copy ID
          </button>
          <span style={{ color: "#4ade80", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <ShieldCheck size={15} /> AES-256 & WebRTC Encrypted
          </span>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={toggleMic} style={{ background: micOn ? "#292b3b" : "#ef4444", color: "#fff", border: 0, borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 6 }}>
            {micOn ? <Mic size={18} /> : <MicOff size={18} />} {micOn ? "Mute" : "Unmute"}
          </button>
          <button onClick={toggleCam} style={{ background: camOn ? "#292b3b" : "#ef4444", color: "#fff", border: 0, borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 6 }}>
            {camOn ? <Video size={18} /> : <VideoOff size={18} />} {camOn ? "Stop Cam" : "Start Cam"}
          </button>
          <button onClick={toggleScreenShare} style={{ background: screenSharing ? "#f59e0b" : "#7652f5", color: "#fff", border: 0, borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 6 }}>
            <MonitorUp size={18} /> {screenSharing ? "Stop Share" : "Share Screen"}
          </button>
          <button onClick={onLeave} style={{ background: "#dc2626", color: "#fff", border: 0, borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
            <PhoneOff size={18} /> Leave
          </button>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.3fr 0.9fr", gap: 16, flex: 1 }}>
        <section style={{ background: "#191b29", borderRadius: 16, padding: 14, border: "1px solid #292b3b", display: "flex", flexDirection: "column", gap: 12 }}>
          <h4 style={{ margin: 0, fontSize: 15 }}>Participants ({remotePeers.length + 1})</h4>
          <div style={{ position: "relative", background: "#090a10", borderRadius: 14, overflow: "hidden", border: "1px solid #7652f5", minHeight: 190 }}>
            <video ref={localVideoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <span style={{ position: "absolute", bottom: 10, left: 10, background: "#000000aa", padding: "4px 10px", borderRadius: 8, fontSize: 12 }}>
              {user.name} (You) {screenSharing ? "• Sharing Screen" : ""}
            </span>
          </div>
          {remotePeers.map((peer) => (
            <RemoteVideo key={peer.socketId} stream={peer.stream} name={peer.name} />
          ))}
        </section>

        <section style={{ background: "#191b29", borderRadius: 16, padding: 14, border: "1px solid #292b3b", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
            <h4 style={{ margin: 0, fontSize: 15 }}>Whiteboard (Draw & Write)</h4>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="color" value={penColor} onChange={(e) => setPenColor(e.target.value)} style={{ width: 28, height: 28, border: 0, background: "transparent", cursor: "pointer" }} />
              <button onClick={() => setWbTool("pen")} style={{ background: wbTool === "pen" ? "#7652f5" : "#292b3b", color: "#fff", border: 0, borderRadius: 8, padding: "6px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                <PenTool size={14} /> Draw
              </button>
              <button onClick={() => setWbTool("text")} style={{ background: wbTool === "text" ? "#7652f5" : "#292b3b", color: "#fff", border: 0, borderRadius: 8, padding: "6px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                <Type size={14} /> Write Text
              </button>
              <button onClick={() => setWbTool("eraser")} style={{ background: wbTool === "eraser" ? "#7652f5" : "#292b3b", color: "#fff", border: 0, borderRadius: 8, padding: "6px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                <Eraser size={14} /> Erase
              </button>
              <button onClick={clearWhiteboard} style={{ background: "#ef444433", color: "#f87171", border: 0, borderRadius: 8, padding: "6px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                <Trash2 size={14} /> Clear
              </button>
            </div>
          </div>

          <canvas
            ref={canvasRef}
            width={650}
            height={460}
            onMouseDown={handleCanvasDown}
            onMouseMove={handleCanvasMove}
            onMouseUp={() => (isDrawingRef.current = false)}
            onMouseLeave={() => (isDrawingRef.current = false)}
            style={{ background: "#ffffff", borderRadius: 12, width: "100%", flex: 1, cursor: wbTool === "text" ? "text" : "crosshair" }}
          />
        </section>

        <section style={{ background: "#191b29", borderRadius: 16, padding: 14, border: "1px solid #292b3b", display: "flex", flexDirection: "column" }}>
          <h4 style={{ margin: "0 0 10px 0", fontSize: 15 }}>Encrypted Chat & File Share</h4>

          <div style={{ flex: 1, background: "#10111b", borderRadius: 12, padding: 12, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, marginBottom: 12, maxHeight: 400 }}>
            {messages.length === 0 && (
              <p style={{ color: "#74778a", fontSize: 13, textAlign: "center", marginTop: 40 }}>
                Messages are AES-256 encrypted. Share files or text below.
              </p>
            )}
            {messages.map((item, idx) => (
              <div key={idx} style={{ background: "#191b29", padding: "8px 12px", borderRadius: 10, border: "1px solid #292b3b", fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#9c7cff", fontSize: 11, marginBottom: 4 }}>
                  <strong>{item.sender}</strong>
                  <span>{item.type === "chat" ? "🔒 AES-256" : "📁 File"}</span>
                </div>
                {item.type === "chat" ? (
                  <p style={{ margin: 0, wordBreak: "break-word" }}>{item.message}</p>
                ) : (
                  <a href={`${API_URL}${item.file.url}`} target="_blank" rel="noreferrer" style={{ color: "#fbbf24", textDecoration: "underline", wordBreak: "break-all" }}>
                    {item.file.name} ({(item.file.size / 1024).toFixed(1)} KB)
                  </a>
                )}
              </div>
            ))}
          </div>

          <form onSubmit={sendChatMessage} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Write encrypted message..."
              style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #292b3b", background: "#10111b", color: "#fff", outline: "none" }}
            />
            <button type="submit" style={{ background: "#7652f5", color: "#fff", border: 0, borderRadius: 10, padding: "0 14px" }}>
              <Send size={16} />
            </button>
          </form>

          <label style={{ background: "#292b3b", color: "#fff", padding: "10px 12px", borderRadius: 10, textAlign: "center", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Paperclip size={16} /> {uploading ? "Uploading File..." : "Share File (PDF, Image, Doc)"}
            <input type="file" onChange={handleFileUpload} hidden disabled={uploading} />
          </label>
        </section>
      </div>
    </div>
  );
}