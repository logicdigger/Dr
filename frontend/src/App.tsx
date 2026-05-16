import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { api, setApiToken } from "./api";
import type { AppointmentRecord, DoctorCard, DoctorDetails, LoginResponse, SessionUser } from "./types";

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface AuthContextValue {
  token: string | null;
  user: SessionUser | null;
  signOut: () => void;
  saveSession: (session: LoginResponse) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const useAuth = (): AuthContextValue => {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("Auth context missing");
  }
  return value;
};

const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("dd_token"));
  const [user, setUser] = useState<SessionUser | null>(() => {
    const raw = localStorage.getItem("dd_user");
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  });

  useEffect(() => {
    setApiToken(token);
  }, [token]);

  const saveSession = (session: LoginResponse) => {
    setToken(session.token);
    setUser(session.user);
    localStorage.setItem("dd_token", session.token);
    localStorage.setItem("dd_user", JSON.stringify(session.user));
    setApiToken(session.token);
  };

  const signOut = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("dd_token");
    localStorage.removeItem("dd_user");
    setApiToken(null);
  };

  const value = useMemo(() => ({ token, user, signOut, saveSession }), [token, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

const Layout = ({ children }: { children: ReactNode }) => {
  const { user, signOut } = useAuth();
  return (
    <div className="page-shell">
      <header className="app-header">
        <div>
          <h1>Doctor Directory Platform</h1>
          <p>Search, book appointments, and manage virtual consultations.</p>
        </div>
        <nav className="header-nav">
          <Link to="/">Directory</Link>
          {user ? <Link to="/dashboard">Dashboard</Link> : <Link to="/auth">Login</Link>}
          {user ? (
            <button type="button" className="btn-secondary" onClick={signOut}>
              Sign Out
            </button>
          ) : null}
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
};

const DirectoryPage = () => {
  const [specialty, setSpecialty] = useState("");
  const [city, setCity] = useState("");
  const [language, setLanguage] = useState("");
  const [loading, setLoading] = useState(false);
  const [doctors, setDoctors] = useState<DoctorCard[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadDoctors = useCallback(
    async (filters?: { specialty?: string; city?: string; language?: string }) => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get<{ doctors: DoctorCard[] }>("/api/doctors", {
          params: {
            specialty: filters?.specialty ?? undefined,
            city: filters?.city ?? undefined,
            language: filters?.language ?? undefined,
          },
        });
        setDoctors(response.data.doctors);
      } catch (requestError) {
        setError("Failed to load doctors. Ensure backend is running.");
        console.error(requestError);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const runSearch = () => {
    void loadDoctors({
      specialty: specialty || undefined,
      city: city || undefined,
      language: language || undefined,
    });
  };

  useEffect(() => {
    void loadDoctors();
  }, [loadDoctors]);

  return (
    <Layout>
      <section className="card">
        <h2>Find a doctor</h2>
        <div className="grid">
          <label>
            Specialty
            <input value={specialty} onChange={(event) => setSpecialty(event.target.value)} />
          </label>
          <label>
            City
            <input value={city} onChange={(event) => setCity(event.target.value)} />
          </label>
          <label>
            Language
            <input value={language} onChange={(event) => setLanguage(event.target.value)} />
          </label>
        </div>
        <button type="button" onClick={runSearch}>
          Search
        </button>
      </section>

      {loading ? <p>Loading doctors...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      <section className="doctor-grid">
        {doctors.map((doctor) => (
          <article className="card doctor-card" key={doctor.id}>
            <h3>{doctor.fullName}</h3>
            <p>
              {doctor.specialization} • {doctor.experienceYears} years
            </p>
            <p>Fee: ${doctor.consultationFee}</p>
            <p>
              Rating: {doctor.averageRating} ({doctor.reviewCount} reviews)
            </p>
            <p>{doctor.languages.join(", ")}</p>
            <p>{doctor.clinics.map((clinic) => clinic.city).join(", ") || "Independent practice"}</p>
            <Link to={`/doctor/${doctor.slug}`}>View profile</Link>
          </article>
        ))}
      </section>
    </Layout>
  );
};

const DoctorDetailsPage = () => {
  const { slug } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [doctor, setDoctor] = useState<DoctorDetails | null>(null);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [appointmentType, setAppointmentType] = useState<"VIDEO" | "IN_CLINIC" | "PHONE">("VIDEO");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDoctor = async () => {
      try {
        const response = await api.get<{ doctor: DoctorDetails }>(`/api/doctors/${slug}`);
        setDoctor(response.data.doctor);
      } catch (requestError) {
        setError("Doctor profile not found.");
        console.error(requestError);
      }
    };
    void fetchDoctor();
  }, [slug]);

  const submitAppointment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!doctor) {
      return;
    }
    if (!user) {
      navigate("/auth");
      return;
    }
    if (user.role !== "PATIENT") {
      setError("Only patient accounts can book appointments.");
      return;
    }
    setMessage("");
    setError(null);
    try {
      await api.post("/api/appointments", {
        doctorId: doctor.id,
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        type: appointmentType,
        reason: reason || undefined,
      });
      setMessage("Appointment requested successfully.");
    } catch (requestError) {
      setError("Booking failed. Check your dates and try again.");
      console.error(requestError);
    }
  };

  if (!doctor) {
    return (
      <Layout>
        <p>{error ?? "Loading profile..."}</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <section className="card">
        <h2>{doctor.fullName}</h2>
        <p>
          {doctor.specialization} • {doctor.qualifications}
        </p>
        <p>{doctor.bio}</p>
        <p>
          {doctor.experienceYears} years experience • Fee ${doctor.consultationFee}
        </p>
        <p>Languages: {doctor.languages.join(", ")}</p>
        <p>Services: {doctor.services.join(", ")}</p>
      </section>

      <section className="card">
        <h3>Availability</h3>
        <ul>
          {doctor.availabilities.map((slot) => (
            <li key={slot.id}>
              {dayNames[slot.dayOfWeek]} {slot.startTime}-{slot.endTime} ({slot.timezone})
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3>Book appointment</h3>
        <form className="grid" onSubmit={submitAppointment}>
          <label>
            Start time
            <input type="datetime-local" required value={startAt} onChange={(event) => setStartAt(event.target.value)} />
          </label>
          <label>
            End time
            <input type="datetime-local" required value={endAt} onChange={(event) => setEndAt(event.target.value)} />
          </label>
          <label>
            Consultation type
            <select value={appointmentType} onChange={(event) => setAppointmentType(event.target.value as "VIDEO" | "IN_CLINIC" | "PHONE")}>
              <option value="VIDEO">Video</option>
              <option value="IN_CLINIC">In-clinic</option>
              <option value="PHONE">Phone</option>
            </select>
          </label>
          <label>
            Reason
            <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional" />
          </label>
          <button type="submit">Request appointment</button>
        </form>
        {message ? <p className="success-text">{message}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="card">
        <h3>Recent reviews</h3>
        {doctor.reviews.length === 0 ? <p>No reviews yet.</p> : null}
        {doctor.reviews.map((review) => (
          <article key={review.id}>
            <strong>{review.patientName}</strong> - {review.rating}/5
            <p>{review.comment}</p>
          </article>
        ))}
      </section>
    </Layout>
  );
};

const AuthPage = () => {
  const navigate = useNavigate();
  const { saveSession } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"DOCTOR" | "CLINIC_ADMIN" | "PATIENT">("PATIENT");
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
      const payload = isRegister
        ? { email, password, fullName, role, timezone: "UTC" }
        : { email, password };
      const response = await api.post<LoginResponse>(endpoint, payload);
      saveSession(response.data);
      navigate("/dashboard");
    } catch (requestError) {
      setError("Authentication failed.");
      console.error(requestError);
    }
  };

  return (
    <Layout>
      <section className="card auth-card">
        <h2>{isRegister ? "Create account" : "Sign in"}</h2>
        <form className="grid" onSubmit={submit}>
          {isRegister ? (
            <>
              <label>
                Full name
                <input value={fullName} required onChange={(event) => setFullName(event.target.value)} />
              </label>
              <label>
                Role
                <select value={role} onChange={(event) => setRole(event.target.value as "DOCTOR" | "CLINIC_ADMIN" | "PATIENT")}>
                  <option value="PATIENT">Patient</option>
                  <option value="DOCTOR">Doctor</option>
                  <option value="CLINIC_ADMIN">Clinic/Hospital</option>
                </select>
              </label>
            </>
          ) : null}
          <label>
            Email
            <input type="email" value={email} required onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Password
            <input type="password" value={password} required minLength={8} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <button type="submit">{isRegister ? "Register" : "Login"}</button>
        </form>
        <button type="button" className="btn-secondary" onClick={() => setIsRegister((value) => !value)}>
          {isRegister ? "Already have an account?" : "Need an account?"}
        </button>
        {error ? <p className="error-text">{error}</p> : null}
        <p className="small-text">
          Demo users from seed data: doctor@healthplatform.com / Password123!, patient@healthplatform.com / Password123!
        </p>
      </section>
    </Layout>
  );
};

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { token } = useAuth();
  if (!token) {
    return <Navigate to="/auth" replace />;
  }
  return <>{children}</>;
};

const DashboardPage = () => {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [analytics, setAnalytics] = useState<Record<string, number> | null>(null);
  const [doctorProfileSaved, setDoctorProfileSaved] = useState("");
  const [profilePayload, setProfilePayload] = useState({
    qualifications: "MBBS",
    specialization: "General Medicine",
    experienceYears: 8,
    languages: "English",
    services: "General Consultation",
    bio: "Provide your clinical summary here.",
    consultationFee: 30,
  });

  const loadAppointments = async () => {
    const response = await api.get<{ appointments: AppointmentRecord[] }>("/api/appointments");
    setAppointments(response.data.appointments);
  };

  useEffect(() => {
    const bootstrap = async () => {
      if (!user) {
        return;
      }
      if (user.role === "SUPER_ADMIN") {
        const response = await api.get<{ analytics: Record<string, number> }>("/api/admin/analytics");
        setAnalytics(response.data.analytics);
      } else {
        await loadAppointments();
      }
    };
    void bootstrap();
  }, [user]);

  const submitDoctorProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDoctorProfileSaved("");
    await api.post("/api/doctors/profile", {
      qualifications: profilePayload.qualifications,
      specialization: profilePayload.specialization,
      experienceYears: Number(profilePayload.experienceYears),
      languages: profilePayload.languages.split(",").map((value) => value.trim()),
      services: profilePayload.services.split(",").map((value) => value.trim()),
      bio: profilePayload.bio,
      consultationFee: Number(profilePayload.consultationFee),
      hasVideoConsultation: true,
      availabilities: [
        {
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "13:00",
          timezone: "UTC",
        },
      ],
    });
    setDoctorProfileSaved("Doctor profile saved.");
  };

  const updateStatus = async (appointmentId: string, status: "CONFIRMED" | "COMPLETED" | "CANCELLED") => {
    await api.patch(`/api/appointments/${appointmentId}/status`, { status });
    await loadAppointments();
  };

  const createVideoRoom = async (appointmentId: string) => {
    await api.post("/api/video-sessions", { appointmentId, vendor: "WEBRTC" });
    await loadAppointments();
  };

  return (
    <Layout>
      <section className="card">
        <h2>Welcome, {user?.fullName}</h2>
        <p>Role: {user?.role}</p>
      </section>

      {user?.role === "DOCTOR" ? (
        <section className="card">
          <h3>Doctor Profile Setup</h3>
          <form className="grid" onSubmit={submitDoctorProfile}>
            <label>
              Qualifications
              <input
                value={profilePayload.qualifications}
                onChange={(event) =>
                  setProfilePayload((current) => ({ ...current, qualifications: event.target.value }))
                }
              />
            </label>
            <label>
              Specialization
              <input
                value={profilePayload.specialization}
                onChange={(event) =>
                  setProfilePayload((current) => ({ ...current, specialization: event.target.value }))
                }
              />
            </label>
            <label>
              Experience (years)
              <input
                type="number"
                value={profilePayload.experienceYears}
                onChange={(event) =>
                  setProfilePayload((current) => ({ ...current, experienceYears: Number(event.target.value) }))
                }
              />
            </label>
            <label>
              Languages (comma separated)
              <input
                value={profilePayload.languages}
                onChange={(event) =>
                  setProfilePayload((current) => ({ ...current, languages: event.target.value }))
                }
              />
            </label>
            <label>
              Services (comma separated)
              <input
                value={profilePayload.services}
                onChange={(event) =>
                  setProfilePayload((current) => ({ ...current, services: event.target.value }))
                }
              />
            </label>
            <label>
              Bio
              <input
                value={profilePayload.bio}
                onChange={(event) => setProfilePayload((current) => ({ ...current, bio: event.target.value }))}
              />
            </label>
            <label>
              Consultation Fee
              <input
                type="number"
                value={profilePayload.consultationFee}
                onChange={(event) =>
                  setProfilePayload((current) => ({ ...current, consultationFee: Number(event.target.value) }))
                }
              />
            </label>
            <button type="submit">Save doctor profile</button>
          </form>
          {doctorProfileSaved ? <p className="success-text">{doctorProfileSaved}</p> : null}
        </section>
      ) : null}

      {user?.role === "SUPER_ADMIN" && analytics ? (
        <section className="card">
          <h3>Platform analytics</h3>
          <ul>
            {Object.entries(analytics).map(([key, value]) => (
              <li key={key}>
                {key}: {value}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {user?.role !== "SUPER_ADMIN" ? (
        <section className="card">
          <h3>Appointments</h3>
          {appointments.length === 0 ? <p>No appointments yet.</p> : null}
          {appointments.map((appointment) => (
            <article key={appointment.id} className="appointment-item">
              <p>
                {new Date(appointment.startAt).toLocaleString()} - {new Date(appointment.endAt).toLocaleString()}
              </p>
              <p>Type: {appointment.type}</p>
              <p>Status: {appointment.status}</p>
              <p>
                Doctor: {appointment.doctor.user.fullName} | Patient: {appointment.patient.fullName}
              </p>
              {appointment.videoSession ? (
                <p>
                  Video Room ({appointment.videoSession.vendor}):{" "}
                  <a href={appointment.videoSession.joinUrl}>{appointment.videoSession.joinUrl}</a>
                </p>
              ) : null}
              {user?.role === "DOCTOR" ? (
                <div className="row-actions">
                  <button type="button" onClick={() => void updateStatus(appointment.id, "CONFIRMED")}>
                    Confirm
                  </button>
                  <button type="button" onClick={() => void updateStatus(appointment.id, "COMPLETED")}>
                    Complete
                  </button>
                  {appointment.type === "VIDEO" ? (
                    <button type="button" className="btn-secondary" onClick={() => void createVideoRoom(appointment.id)}>
                      Create video room
                    </button>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}
    </Layout>
  );
};

const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DirectoryPage />} />
        <Route path="/doctor/:slug" element={<DoctorDetailsPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  </AuthProvider>
);

export default App;
