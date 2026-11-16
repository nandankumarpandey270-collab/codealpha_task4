import { useState } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  Video, Mail, Lock, User, Eye, EyeOff,
  ArrowRight, ShieldCheck, Sparkles
} from "lucide-react";

import Dashboard from "./dashboard";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function App() {
  const [signup, setSignup] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [token, setToken] = useState(() => localStorage.getItem("mf_token") || "");
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("mf_user");
    return saved ? JSON.parse(saved) : null;
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      if (signup) {
        const res = await axios.post(`${API_URL}/api/auth/register`, {
          name,
          email,
          password
        });
        setMessage(res.data.message || "Signup successful! Please sign in.");
        setSignup(false);
        setShowPassword(false);
      } else {
        const res = await axios.post(`${API_URL}/api/auth/login`, {
          email,
          password
        });
        localStorage.setItem("mf_token", res.data.token);
        localStorage.setItem("mf_user", JSON.stringify(res.data.user));
        setToken(res.data.token);
        setUser(res.data.user);
      }
    } catch (err) {
      setMessage(err.response?.data?.message || "Authentication failed. Check server.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("mf_token");
    localStorage.removeItem("mf_user");
    setToken("");
    setUser(null);
  };

  if (token && user) {
    return <Dashboard user={user} token={token} onLogout={handleLogout} />;
  }

  return (
    <main className="auth-page">
      <div className="glow glow-one" />
      <div className="glow glow-two" />
      <div className="grid-bg" />

      <motion.section
        className="auth-wrapper"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
      >
        <div className="brand">
          <div className="brand-icon">
            <Video size={27} />
          </div>
          <span>
            Meet<span className="brand-highlight">Flow</span>
          </span>
        </div>

        <div className="auth-card">
          <div className="card-heading">
            <div className="sparkle-icon">
              <Sparkles size={24} />
            </div>
            <h1>{signup ? "Create Account" : "Welcome Back"}</h1>
            <p>
              {signup
                ? "Create your account and start connecting."
                : "Sign in to continue your meetings."}
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <AnimatePresence initial={false}>
              {signup && (
                <motion.div
                  className="form-group"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <label>Full Name</label>
                  <div className="input-box">
                    <User size={19} />
                    <input
                      type="text"
                      placeholder="Enter your full name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required={signup}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="form-group">
              <label>Email Address</label>
              <div className="input-box">
                <Mail size={19} />
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Password</label>
              <div className="input-box">
                <Lock size={19} />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="eye-button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
            </div>

            <button className="submit-button" type="submit" disabled={loading}>
              {loading ? "Please wait..." : signup ? "Create Account" : "Sign In"}
              <ArrowRight size={19} />
            </button>

            {message && (
              <p className="status-message" role="status">
                {message}
              </p>
            )}
          </form>

          <div className="secure-section">
            <div className="secure-line" />
            <span>SECURE CONNECTION</span>
            <p>
              <ShieldCheck size={17} />
              JWT Auth & AES-256 Encrypted Rooms.
            </p>
          </div>

          <div className="switch-account">
            {signup ? "Already have an account?" : "New to MeetFlow?"}
            <button
              type="button"
              onClick={() => {
                setSignup(!signup);
                setMessage("");
                setShowPassword(false);
              }}
            >
              {signup ? "Sign In" : "Create Account"}
            </button>
          </div>
        </div>

        <footer className="auth-footer">
          © 2026 MeetFlow. Connect. Collaborate. Create.
        </footer>
      </motion.section>
    </main>
  );
}