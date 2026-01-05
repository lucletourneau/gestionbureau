import React, { useState, useEffect, useMemo } from 'react';
import { 
  Clock, Users, Plus, Trash2, AlertCircle, Check, 
  FileText, ChevronLeft, ChevronRight, Calendar as CalendarIcon, 
  Save, X, ArrowRight, Cloud, CloudOff, CalendarCheck, Settings, Printer, Edit3, Zap
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAnalytics } from "firebase/analytics";
import { 
  getAuth, signInAnonymously, onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, collection, addDoc, deleteDoc, doc, 
  onSnapshot, writeBatch, query, updateDoc 
} from 'firebase/firestore';

// --- CONFIGURATION CONSTANTES ---

const BUFFER_MINUTES = 30; // Temps de transition obligatoire entre deux personnes différentes

const ROOMS = [
  { id: 'R1', name: 'Bureau 4', type: 'individual', capacity: 1, color: 'bg-blue-100 border-blue-300' },
  { id: 'R2', name: 'Bureau 3', type: 'family', capacity: 4, color: 'bg-purple-100 border-purple-300' },
  { id: 'R3', name: 'Bureau 1', type: 'variable', capacity: 3, color: 'bg-green-100 border-green-300' },
  { id: 'R4', name: 'Bureau 2', type: 'variable', capacity: 3, color: 'bg-green-100 border-green-300' },
  { id: 'CONF', name: 'Salle Conférence', type: 'conference', capacity: 8, color: 'bg-orange-100 border-orange-300' },
];

const EMPLOYEE_COLORS = [
  '#4F46E5', '#3B82F6', '#06B6D4', '#10B981', '#22C55E', '#84CC16', 
  '#EAB308', '#F59E0B', '#EF4444', '#EC4899', '#D946EF', '#8B5CF6'
];

const EMPLOYEE_PATTERNS = [
  { id: 'solid', label: 'Plein' },
  { id: 'v-lines', label: 'Lignes V' },
  { id: 'h-lines', label: 'Lignes H' },
  { id: 'dots', label: 'Points' },
  { id: 'slant', label: 'Biais' },
  { id: 'zigzag', label: 'Zigzag' },
  { id: 'stars', label: 'Étoiles' },
  { id: 'diamonds', label: 'Losanges' }
];

const TIME_SLOTS = [];
for (let i = 8; i <= 20; i++) {
  TIME_SLOTS.push(`${i < 10 ? '0' + i : i}:00`);
  TIME_SLOTS.push(`${i < 10 ? '0' + i : i}:30`);
}

const WEEK_DAYS = [
  { key: 'monday', label: 'Lundi' },
  { key: 'tuesday', label: 'Mardi' },
  { key: 'wednesday', label: 'Mercredi' },
  { key: 'thursday', label: 'Jeudi' },
  { key: 'friday', label: 'Vendredi' },
  { key: 'saturday', label: 'Samedi' },
  { key: 'sunday', label: 'Dimanche' },
];

// --- SCRIPTS EXTERNES POUR PDF ---
const loadScript = (src) => {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
};

// --- HELPER DATE LOCALE ---
const getLocalDate = (dateStr) => {
  if (!dateStr) return new Date();
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// --- COMPOSANTS UTILITAIRES ---

const GlobalPatternDefs = () => (
  <svg className="absolute w-0 h-0 pointer-events-none" style={{ position: 'absolute', top: -9999, left: -9999 }}>
    <defs>
      <pattern id="sched-v-lines" width="4" height="4" patternUnits="userSpaceOnUse">
        <path d="M 0 0 V 4" stroke="white" strokeWidth="1" />
      </pattern>
      <pattern id="sched-h-lines" width="4" height="4" patternUnits="userSpaceOnUse">
        <path d="M 0 0 H 4" stroke="white" strokeWidth="1" />
      </pattern>
      <pattern id="sched-dots" width="6" height="6" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1.2" fill="white" />
      </pattern>
      <pattern id="sched-slant" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <path d="M 0 0 V 6" stroke="white" strokeWidth="1.5" />
      </pattern>
      <pattern id="sched-zigzag" width="10" height="10" patternUnits="userSpaceOnUse">
        <path d="M 0 5 L 5 0 L 10 5" fill="none" stroke="white" strokeWidth="1" />
      </pattern>
      <pattern id="sched-stars" width="10" height="10" patternUnits="userSpaceOnUse">
        <path d="M 5 1 L 6 4 L 9 4 L 7 6 L 8 9 L 5 7 L 2 9 L 3 6 L 1 4 L 4 4 Z" fill="white" />
      </pattern>
      <pattern id="sched-diamonds" width="8" height="8" patternUnits="userSpaceOnUse">
        <path d="M 4 0 L 8 4 L 4 8 L 0 4 Z" fill="white" />
      </pattern>
    </defs>
  </svg>
);

const Modal = ({ isOpen, onClose, title, children, maxWidth = "max-w-md" }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
      <div className={`bg-white rounded-lg shadow-xl w-full ${maxWidth} max-h-[90vh] overflow-y-auto animate-fadeIn`}>
        <div className="flex justify-between items-center p-4 border-b border-[#002B35]/10">
          <h3 className="font-bold text-lg text-[#002B35]">{title}</h3>
          <button onClick={onClose} className="text-[#002B35]/50 hover:text-[#EC6730]"><X size={20} /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
};

const MessageBox = ({ message, type = 'info', onClose }) => {
  if (!message) return null;
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] animate-bounce">
      <div className={`${type === 'error' ? 'bg-red-600' : 'bg-[#EC6730]'} text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-2`}>
        {type === 'error' ? <AlertCircle size={18}/> : <Check size={18}/>}
        <span className="font-bold">{message}</span>
        <button onClick={onClose} className="ml-2 hover:opacity-70"><X size={14}/></button>
      </div>
    </div>
  );
};

const SwatchPastille = ({ color, pattern, size = "w-6 h-6" }) => {
  const getPatternOverlay = () => {
    switch(pattern) {
      case 'v-lines': return <rect width="100%" height="100%" fill="url(#v-lines-pat)" />;
      case 'h-lines': return <rect width="100%" height="100%" fill="url(#h-lines-pat)" />;
      case 'dots': return <rect width="100%" height="100%" fill="url(#dots-pat)" />;
      case 'slant': return <rect width="100%" height="100%" fill="url(#slant-pat)" />;
      case 'zigzag': return <rect width="100%" height="100%" fill="url(#zigzag-pat)" />;
      case 'stars': return <rect width="100%" height="100%" fill="url(#stars-pat)" />;
      case 'diamonds': return <rect width="100%" height="100%" fill="url(#diamonds-pat)" />;
      default: return null;
    }
  };

  return (
    <div className={`${size} rounded-full border border-gray-300 overflow-hidden relative shadow-sm inline-block align-middle`} style={{ backgroundColor: color }}>
      <svg className="absolute inset-0 w-full h-full opacity-40">
        <defs>
          <pattern id="v-lines-pat" width="4" height="4" patternUnits="userSpaceOnUse">
            <path d="M 0 0 V 4" stroke="white" strokeWidth="1" />
          </pattern>
          <pattern id="h-lines-pat" width="4" height="4" patternUnits="userSpaceOnUse">
            <path d="M 0 0 H 4" stroke="white" strokeWidth="1" />
          </pattern>
          <pattern id="dots-pat" width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.2" fill="white" />
          </pattern>
          <pattern id="slant-pat" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <path d="M 0 0 V 6" stroke="white" strokeWidth="1.5" />
          </pattern>
          <pattern id="zigzag-pat" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 0 5 L 5 0 L 10 5" fill="none" stroke="white" strokeWidth="1" />
          </pattern>
          <pattern id="stars-pat" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 5 1 L 6 4 L 9 4 L 7 6 L 8 9 L 5 7 L 2 9 L 3 6 L 1 4 L 4 4 Z" fill="white" />
          </pattern>
          <pattern id="diamonds-pat" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M 4 0 L 8 4 L 4 8 L 0 4 Z" fill="white" />
          </pattern>
        </defs>
        {getPatternOverlay()}
      </svg>
    </div>
  );
};

const RecurringScheduleForm = ({ isOpen, onClose, employee, bookings, db, appId, allEmployees }) => {
  const [range, setRange] = useState({ start: '', end: '' });
  const [weekSchedule, setWeekSchedule] = useState({});
  const [step, setStep] = useState('form');
  const [previewData, setPreviewData] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setRange({ start: '', end: '' });
      setWeekSchedule({});
      setStep('form');
      setPreviewData(null);
      setIsSaving(false);
    }
  }, [isOpen, employee]);

  const handleDayToggle = (dayKey) => {
    setWeekSchedule(prev => ({
      ...prev,
      [dayKey]: prev[dayKey]
        ? { ...prev[dayKey], active: !prev[dayKey].active }
        : { start: '09:00', end: '17:00', active: true }
    }));
  };

  const handleTimeChange = (dayKey, field, value) => {
    setWeekSchedule(prev => ({
      ...prev,
      [dayKey]: { ...prev[dayKey], [field]: value }
    }));
  };

  const getMinsSafe = (t) => {
    if (!t || typeof t !== 'string' || !t.includes(':')) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const handlePreview = () => {
    if (!range.start || !range.end) {
      setMsg({ text: "Veuillez sélectionner une date de début et de fin.", type: 'error' });
      return;
    }
    if (range.start > range.end) {
      setMsg({ text: "La date de fin doit être après la date de début.", type: 'error' });
      return;
    }

    try {
      const [yS, mS, dS] = range.start.split('-').map(Number);
      const [yE, mE, dE] = range.end.split('-').map(Number);
      const startUTC = Date.UTC(yS, mS - 1, dS);
      const endUTC = Date.UTC(yE, mE - 1, dE);
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;

      let finalBookingsToDelete = [];
      let finalNewBookings = [];

      for (let time = startUTC; time <= endUTC; time += ONE_DAY_MS) {
        const currentD = new Date(time);
        const dayIndex = currentD.getUTCDay();
        const dayKey = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dayIndex];
        const dayConfig = weekSchedule[dayKey];
        const dateStr = currentD.toISOString().split('T')[0];

        if (dayConfig && dayConfig.active) {
          const reqStart = getMinsSafe(dayConfig.start);
          const reqEnd = getMinsSafe(dayConfig.end);
          const existingBookingsToday = bookings.filter(b => b.date === dateStr);

          const nonOverlapping = [];
          const overlapping = [];

          existingBookingsToday.forEach(b => {
            if (b.employeeId === employee.id) return; 
            const bStart = getMinsSafe(b.startTime);
            const bEnd = getMinsSafe(b.endTime);
            if (reqStart < bEnd + BUFFER_MINUTES && reqEnd > bStart - BUFFER_MINUTES) {
              overlapping.push(b);
            } else {
              nonOverlapping.push(b);
            }
          });

          const pool = [];
          pool.push({
            type: 'new',
            employeeId: employee.id,
            startTime: dayConfig.start,
            endTime: dayConfig.end,
            startMins: reqStart,
            endMins: reqEnd,
            employeeObj: employee
          });

          overlapping.forEach(b => {
            const empObj = allEmployees.find(e => e.id === b.employeeId);
            if (empObj) {
              pool.push({
                type: 'existing',
                originalBooking: b,
                employeeId: b.employeeId,
                startTime: b.startTime,
                endTime: b.endTime,
                startMins: getMinsSafe(b.startTime),
                endMins: getMinsSafe(b.endTime),
                employeeObj: empObj
              });
            } else {
              nonOverlapping.push(b);
            }
          });

          pool.sort((a, b) => {
            const optionsA = 1 + (a.employeeObj.altRooms ? a.employeeObj.altRooms.length : 0);
            const optionsB = 1 + (b.employeeObj.altRooms ? b.employeeObj.altRooms.length : 0);
            return optionsA - optionsB;
          });

          pool.forEach(request => {
            let assignedRoomId = 'CONFLICT';
            const candidates = [request.employeeObj.defaultRoom, ...(request.employeeObj.altRooms || [])];

            for (let roomId of candidates) {
              const isBlockedByFixed = nonOverlapping.some(fixed => {
                 const fixedStart = getMinsSafe(fixed.startTime);
                 const fixedEnd = getMinsSafe(fixed.endTime);
                 return fixed.roomId === roomId && 
                        (request.startMins < fixedEnd + BUFFER_MINUTES && request.endMins > fixedStart - BUFFER_MINUTES);
              });

              const isBlockedByPool = finalNewBookings.some(newB => {
                if (newB.date !== dateStr || newB.roomId !== roomId) return false;
                const newBStart = getMinsSafe(newB.startTime);
                const newBEnd = getMinsSafe(newB.endTime);
                const isSamePerson = newB.employeeId === request.employeeId;
                const buffer = isSamePerson ? 0 : BUFFER_MINUTES;
                return (request.startMins < newBEnd + buffer && request.endMins > newBStart - buffer);
              });

              if (!isBlockedByFixed && !isBlockedByPool) {
                assignedRoomId = roomId;
                break;
              }
            }

            if (request.type === 'existing') {
              finalBookingsToDelete.push(request.originalBooking);
            }

            finalNewBookings.push({
              employeeId: request.employeeId,
              date: dateStr,
              startTime: request.startTime,
              endTime: request.endTime,
              roomId: assignedRoomId,
              isSpontaneous: false
            });
          });
        }
      }

      const selfOldBookings = bookings.filter(b =>
        b.employeeId === employee.id &&
        b.date >= range.start &&
        b.date <= range.end
      );

      selfOldBookings.forEach(b => {
        if (!finalBookingsToDelete.find(del => del.id === b.id)) {
          finalBookingsToDelete.push(b);
        }
      });

      setPreviewData({
        bookingsToDelete: finalBookingsToDelete,
        newBookings: finalNewBookings
      });
      setStep('preview');

    } catch (e) {
      console.error(e);
      setMsg({ text: "Erreur de calcul : " + e.message, type: 'error' });
    }
  };

  const handleConfirm = async () => {
    if (!previewData || !db) return;
    setIsSaving(true);

    try {
      const batch = writeBatch(db);

      previewData.bookingsToDelete.forEach(b => {
        if (b.id) {
          const ref = doc(db, 'artifacts', appId, 'public', 'data', 'bookings', b.id);
          batch.delete(ref);
        }
      });

      previewData.newBookings.forEach(b => {
        const ref = doc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'));
        batch.set(ref, b);
      });

      await batch.commit();
      setMsg({ text: "Planning optimisé et mis à jour !", type: 'success' });
      setTimeout(onClose, 1500);

    } catch (e) {
      console.error("Erreur batch:", e);
      setMsg({ text: "Erreur lors de la sauvegarde : " + e.message, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Gérer l'horaire de ${employee.name}`} maxWidth="max-w-2xl">
      <MessageBox message={msg?.text} type={msg?.type} onClose={() => setMsg(null)} />
      {step === 'form' ? (
        <div className="space-y-6">
          <div className="bg-[#EC6730]/10 p-3 rounded text-sm text-[#002B35] border border-[#EC6730]/30 flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 text-[#EC6730]" />
            <div>
              <strong>Optimisation activée :</strong> Le système va réorganiser automatiquement les bureaux des autres professionnels si nécessaire pour satisfaire les priorités.
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-[#002B35]">Date de début</label>
              <input type="date" className="w-full border p-2 rounded mt-1" value={range.start} onChange={e => setRange({ ...range, start: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-bold text-[#002B35]">Date de fin</label>
              <input type="date" className="w-full border p-2 rounded mt-1" value={range.end} onChange={e => setRange({ ...range, end: e.target.value })} />
            </div>
          </div>

          <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2 border rounded p-3 bg-gray-50">
            <label className="block text-sm font-bold mb-3 text-[#002B35]">Semaine type :</label>
            {WEEK_DAYS.map(day => {
              const config = weekSchedule[day.key] || { active: false, start: '09:00', end: '17:00' };
              return (
                <div key={day.key} className={`flex items-center gap-4 p-3 rounded border transition-colors ${config.active ? 'bg-white border-[#EC6730] shadow-sm' : 'bg-gray-100 border-transparent opacity-75'}`}>
                  <div className="w-32 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.active}
                      onChange={() => handleDayToggle(day.key)}
                      className="w-5 h-5 accent-[#EC6730] rounded cursor-pointer"
                    />
                    <span className={`font-medium ${config.active ? 'text-[#002B35]' : 'text-[#002B35]/50'}`}>{day.label}</span>
                  </div>
                  {config.active && (
                    <div className="flex items-center gap-2 flex-1 animate-fadeIn">
                      <select
                        value={config.start}
                        onChange={(e) => handleTimeChange(day.key, 'start', e.target.value)}
                        className="border rounded p-1 text-sm bg-white"
                      >
                        {TIME_SLOTS.slice(0, -1).map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <span className="text-[#002B35]/50">à</span>
                      <select
                        value={config.end}
                        onChange={(e) => handleTimeChange(day.key, 'end', e.target.value)}
                        className="border rounded p-1 text-sm bg-white"
                      >
                        {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button onClick={handlePreview} className="w-full bg-[#EC6730] text-white py-3 rounded font-bold hover:opacity-90 flex items-center justify-center gap-2 shadow-md transition-transform transform active:scale-95">
            <ArrowRight size={18} /> Calculer l'optimisation
          </button>
        </div>
      ) : (
        <div className="space-y-6 text-center py-4">
          <h4 className="text-xl font-bold text-[#002B35]">Résultat de l'optimisation</h4>

          <div className="grid grid-cols-2 gap-4 text-left">
            <div className="bg-red-50 p-4 rounded border border-red-100">
              <div className="text-red-500 font-bold text-lg mb-1">{previewData?.bookingsToDelete.length}</div>
              <div className="text-sm text-red-700">Modifications / Déplacements.</div>
            </div>
            <div className="bg-green-50 p-4 rounded border border-green-100">
              <div className="text-green-600 font-bold text-lg mb-1">{previewData?.newBookings.length}</div>
              <div className="text-sm text-green-700">Nouvelles réservations.</div>
            </div>
          </div>

          <p className="text-[#002B35]/60 text-sm italic">
            Confirmer l'application de ce planning optimisé ?
          </p>

          <div className="flex gap-4 pt-4">
            <button disabled={isSaving} onClick={() => setStep('form')} className="flex-1 py-3 rounded border border-gray-300 text-[#002B35] font-medium hover:bg-gray-50">
              Retour
            </button>
            <button disabled={isSaving} onClick={handleConfirm} className="flex-1 py-3 rounded bg-green-600 text-white font-bold hover:bg-green-700 shadow-lg flex items-center justify-center gap-2">
              {isSaving ? <span className="animate-spin">⌛</span> : <Check size={18} />}
              {isSaving ? 'Sauvegarde...' : 'Confirmer'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};

// --- APPLICATION PRINCIPALE ---

export default function App() {
  const [activeTab, setActiveTab] = useState('schedule');
  // Initialisation de currentDate en date locale
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    // Méthode simple : YYYY-MM-DD local
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  // ÉTATS GLOBAUX POUR MODALES
  const [managedEmployee, setManagedEmployee] = useState(null); // Employé en cours d'édition/gestion
  const [isEmployeeEditOpen, setIsEmployeeEditOpen] = useState(false);
  const [isScheduleManagerOpen, setIsScheduleManagerOpen] = useState(false);

  const [user, setUser] = useState(null);
  const [db, setDb] = useState(null);
  
  // App ID fixe pour la version de production
  const appId = "gestion-priorite-psycho";

  const [employees, setEmployees] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    const loadPdfScripts = async () => {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js');
    };
    loadPdfScripts();

    // Configuration Firebase pour le déploiement
   const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

    const app = initializeApp(firebaseConfig);
    const analytics = getAnalytics(app); 
    const auth = getAuth(app);
    const firestore = getFirestore(app);
    setDb(firestore);

    const initAuth = async () => {
        // Authentification anonyme standard
        await signInAnonymously(auth);
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return;

    const unsubEmp = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'employees'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEmployees(data);
    });

    const unsubBook = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBookings(data);
    });

    return () => {
      unsubEmp();
      unsubBook();
    };
  }, [user, db, appId]);

  const addEmployee = async (emp) => {
    if (!db) return;
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'employees'), emp);
  };

  const updateEmployee = async (id, data) => {
      if(!db) return;
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'employees', id), data);
  };

  const removeEmployee = async (id) => {
    if (!db) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'employees', id));
  };

  const addBooking = async (booking) => {
    if (!db) return;
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), booking);
  };

  const updateBooking = async (id, data) => {
    if (!db) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', id), data);
  };

  const removeBooking = async (id) => {
    if (!db) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', id));
  };

  const getMinutes = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  };

  const checkAvailability = (date, startTime, endTime, roomId, employeeId = null, excludeBookingId = null, customBookingsList = null) => {
    const start = getMinutes(startTime);
    const end = getMinutes(endTime);
    const listToCheck = customBookingsList || bookings;

    const conflicts = listToCheck.filter(b => {
      if (b.roomId === 'CONFLICT') return false;
      if (b.date !== date || b.roomId !== roomId) return false;
      if (excludeBookingId && b.id === excludeBookingId) return false;

      const bStart = getMinutes(b.startTime);
      const bEnd = getMinutes(b.endTime);

      const isSamePerson = employeeId && b.employeeId === employeeId;
      const buffer = isSamePerson ? 0 : BUFFER_MINUTES;

      return (start < bEnd + buffer && end > bStart - buffer);
    });

    return conflicts;
  };

  const toggleAltRoom = (roomId, target, setTarget) => {
    if (target.altRooms.includes(roomId)) {
      setTarget({ ...target, altRooms: target.altRooms.filter(id => id !== roomId) });
    } else {
      if (target.altRooms.length >= 3) {
        setMsg({ text: "Vous ne pouvez sélectionner que 3 bureaux alternatifs maximum.", type: 'error' });
        return;
      }
      setTarget({ ...target, altRooms: [...target.altRooms, roomId] });
    }
  };

  const isCombinationTaken = (color, pattern, excludeId = null) => {
    return employees.some(e =>
      e.id !== excludeId &&
      e.color === color &&
      e.pattern === pattern
    );
  };

  const handleUpdateEmployee = async () => {
      if (!managedEmployee.name) return;
      if (isCombinationTaken(managedEmployee.color, managedEmployee.pattern, managedEmployee.id)) {
          setMsg({ text: "Cette combinaison couleur/motif est déjà prise par un autre professionnel.", type: 'error' });
          return;
      }
      await updateEmployee(managedEmployee.id, {
          name: managedEmployee.name,
          defaultRoom: managedEmployee.defaultRoom,
          altRooms: managedEmployee.altRooms,
          color: managedEmployee.color,
          pattern: managedEmployee.pattern
      });
      setIsEmployeeEditOpen(false);
      await runGlobalReoptimization(managedEmployee);
  };

  const [isOptimizing, setIsOptimizing] = useState(false);

  const runGlobalReoptimization = async (updatedEmp = null) => {
    setIsOptimizing(true);
    try {
        const batch = writeBatch(db);
        const today = new Date();
        const horizon = new Date();
        horizon.setDate(today.getDate() + 30); 
        
        for (let d = new Date(today); d <= horizon; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            const dayBookings = bookings.filter(b => b.date === dateStr);
            if (dayBookings.length === 0) continue;
            
            const fixedBookings = dayBookings.filter(b => b.isSpontaneous);
            const empBookings = dayBookings.filter(b => !b.isSpontaneous);
            
            const pool = empBookings.map(b => {
                const empObj = (updatedEmp && b.employeeId === updatedEmp.id) ? updatedEmp : employees.find(e => e.id === b.employeeId);
                return {
                    original: b,
                    empObj,
                    startMins: getMinutes(b.startTime),
                    endMins: getMinutes(b.endTime)
                };
            }).filter(p => p.empObj); 
            
            pool.sort((a, b) => {
                const optA = 1 + (a.empObj.altRooms?.length || 0);
                const optB = 1 + (b.empObj.altRooms?.length || 0);
                return optA - optB;
            });
            
            const currentDayAssignments = [];
            
            pool.forEach(request => {
                let assignedRoomId = 'CONFLICT';
                const candidates = [request.empObj.defaultRoom, ...(request.empObj.altRooms || [])];
                
                for (let roomId of candidates) {
                    const blockedByFixed = fixedBookings.some(f => {
                        const fStart = getMinutes(f.startTime);
                        const fEnd = getMinutes(f.endTime);
                        return f.roomId === roomId && 
                               (request.startMins < fEnd + BUFFER_MINUTES && request.endMins > fStart - BUFFER_MINUTES);
                    });

                    const blockedByPool = currentDayAssignments.some(a => {
                        if (a.roomId !== roomId) return false;
                        const aStart = getMinutes(a.startTime);
                        const aEnd = getMinutes(a.endTime);
                        const isSame = a.employeeId === request.original.employeeId;
                        const buffer = isSame ? 0 : BUFFER_MINUTES;
                        
                        return (request.startMins < aEnd + buffer && request.endMins > aStart - buffer);
                    });
                    
                    if (!blockedByFixed && !blockedByPool) {
                        assignedRoomId = roomId;
                        break;
                    }
                }
                
                if (assignedRoomId !== request.original.roomId) {
                    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'bookings', request.original.id);
                    batch.update(ref, { roomId: assignedRoomId });
                }
                
                currentDayAssignments.push({ ...request.original, roomId: assignedRoomId });
            });
        }
        
        await batch.commit();
        setMsg({ text: "Optimisation du planning effectuée.", type: 'success' });
    } catch (e) {
        console.error(e);
        setMsg({ text: "Erreur optimisation : " + e.message, type: 'error' });
    } finally {
        setIsOptimizing(false);
    }
  };

  const AppointmentView = () => {
    const [selectedEmpId, setSelectedEmpId] = useState('');
    const [date, setDate] = useState(currentDate);
    const [duration, setDuration] = useState(60);
    const [selectedSlot, setSelectedSlot] = useState(null);

    useEffect(() => {
      setSelectedSlot(null);
    }, [selectedEmpId, date, duration]);

    const handleApply = async () => {
      if (!selectedSlot || !selectedEmpId) return;

      await addBooking({
        employeeId: selectedEmpId,
        date: date,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        roomId: selectedSlot.roomId,
        isSpontaneous: true,
        title: "Rendez-vous"
      });
      setMsg({ text: "Rendez-vous appliqué avec succès !", type: 'success' });
      setSelectedSlot(null);
    };

    const selectedEmployee = employees.find(e => e.id === selectedEmpId);

    const availability = useMemo(() => {
      if (!selectedEmpId || !date) return {};

      const slotsByRoom = {};

      ROOMS.forEach(room => {
        const freeSlots = [];
        const lastPossibleStart = 20 * 60 + 30 - duration;

        TIME_SLOTS.forEach(time => {
          const startMins = getMinutes(time);
          if (startMins > lastPossibleStart) return;

          const endTime = getEndTime(time, duration);

          if (checkAvailability(date, time, endTime, room.id, selectedEmpId).length === 0) {
            freeSlots.push({ startTime: time, endTime });
          }
        });
        slotsByRoom[room.id] = freeSlots;
      });
      return slotsByRoom;
    }, [selectedEmpId, date, duration, bookings]);

    const getEndTime = (startStr, durationMins) => {
        const startMins = getMinutes(startStr);
        const endMins = startMins + durationMins;
        const h = Math.floor(endMins / 60);
        const m = endMins % 60;
        return `${h < 10 ? '0' + h : h}:${m < 10 ? '0' + m : m}`;
    };

    return (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded shadow grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
          <div>
            <label className="block text-sm font-bold text-[#002B35] mb-1">1. Professionnel</label>
            <select
              className="w-full border p-2 rounded"
              value={selectedEmpId}
              onChange={e => setSelectedEmpId(e.target.value)}
            >
              <option value="">-- Choisir un professionnel --</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-[#002B35] mb-1">2. Date du rendez-vous</label>
            <input
              type="date"
              className="w-full border p-2 rounded"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-[#002B35] mb-1">Durée</label>
            <select
              className="w-full border p-2 rounded"
              value={duration}
              onChange={e => setDuration(parseInt(e.target.value))}
            >
              <option value={30}>30 min</option>
              <option value={60}>1h 00</option>
              <option value={90}>1h 30</option>
              <option value={120}>2h 00</option>
            </select>
          </div>
        </div>

        {selectedEmpId && (
          <div className="space-y-6">
            {selectedEmployee && (
              <div className="bg-white p-6 rounded shadow border-l-4 border-[#EC6730]">
                <h3 className="font-bold text-lg mb-4 text-[#002B35] flex items-center">
                  <Check className="mr-2 text-[#EC6730]" size={20} /> Bureaux Préférés
                </h3>

                <div className="mb-4">
                  <div className="font-semibold text-sm text-[#002B35]/70 mb-2">
                    Défaut : {ROOMS.find(r => r.id === selectedEmployee.defaultRoom)?.name}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {availability[selectedEmployee.defaultRoom]?.length > 0 ? (
                      availability[selectedEmployee.defaultRoom].map(slot => (
                        <button
                          key={slot.startTime}
                          onClick={() => setSelectedSlot({ roomId: selectedEmployee.defaultRoom, ...slot })}
                          className={`px-3 py-1 rounded text-sm border transition-colors ${selectedSlot?.roomId === selectedEmployee.defaultRoom && selectedSlot?.startTime === slot.startTime
                            ? 'bg-[#EC6730] text-white border-[#EC6730] shadow-md'
                            : 'bg-[#EC6730]/10 text-[#002B35] border-[#EC6730]/30 hover:bg-[#EC6730]/20'
                            }`}
                        >
                          {slot.startTime}
                        </button>
                      ))
                    ) : (
                      <span className="text-gray-400 italic text-sm">Aucune disponibilité</span>
                    )}
                  </div>
                </div>

                {selectedEmployee.altRooms.length > 0 && (
                  <div>
                    <div className="font-semibold text-sm text-[#002B35]/70 mb-2">Alternatives :</div>
                    {selectedEmployee.altRooms.map(altId => (
                      <div key={altId} className="mb-3">
                        <span className="text-xs text-[#002B35]/50 block mb-1">{ROOMS.find(r => r.id === altId)?.name}</span>
                        <div className="flex flex-wrap gap-2">
                          {availability[altId]?.length > 0 ? (
                            availability[altId].map(slot => (
                              <button
                                key={slot.startTime}
                                onClick={() => setSelectedSlot({ roomId: altId, ...slot })}
                                className={`px-3 py-1 rounded text-sm border transition-colors ${selectedSlot?.roomId === altId && selectedSlot?.startTime === slot.startTime
                                  ? 'bg-[#EC6730] text-white border-[#EC6730] shadow-md'
                                  : 'bg-[#EC6730]/10 text-[#002B35] border-[#EC6730]/30 hover:bg-[#EC6730]/20'
                                  }`}
                              >
                                {slot.startTime}
                              </button>
                            ))
                          ) : (
                            <span className="text-gray-400 italic text-sm">Aucune disponibilité</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="bg-white p-6 rounded shadow">
              <h3 className="font-bold text-lg mb-4 text-[#002B35]">Autres Bureaux</h3>
              <div className="space-y-4">
                {ROOMS.filter(r => r.id !== selectedEmployee?.defaultRoom && !selectedEmployee?.altRooms.includes(r.id)).map(room => (
                  <div key={room.id}>
                    <div className="font-semibold text-sm text-[#002B35]/70 mb-2">{room.name}</div>
                    <div className="flex flex-wrap gap-2">
                      {availability[room.id]?.length > 0 ? (
                        availability[room.id].map(slot => (
                          <button
                            key={slot.startTime}
                            onClick={() => setSelectedSlot({ roomId: room.id, ...slot })}
                            className={`px-3 py-1 rounded text-sm border transition-colors ${selectedSlot?.roomId === room.id && selectedSlot?.startTime === slot.startTime
                              ? 'bg-[#002B35] text-white border-[#002B35] shadow-md'
                              : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                              }`}
                          >
                            {slot.startTime}
                          </button>
                        ))
                      ) : (
                        <span className="text-gray-400 italic text-sm">Aucune disponibilité</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {selectedSlot && (
          <div className="fixed bottom-8 right-8 right-8 md:w-96 bg-[#002B35] text-white p-4 rounded-lg shadow-xl flex flex-col gap-3 animate-slideUp z-50">
            <div>
              <div className="text-sm text-gray-400">Confirmer le rendez-vous</div>
              <div className="font-bold text-lg">
                {selectedEmployee?.name}
              </div>
              <div className="text-sm">
                {new Date(date).toLocaleDateString('fr-FR')} à <span className="font-bold text-[#EC6730]">{selectedSlot.startTime}</span>
              </div>
              <div className="text-xs text-gray-400 mt-1">
                Bureau : {ROOMS.find(r => r.id === selectedSlot.roomId)?.name}
              </div>
            </div>
            <button
              onClick={handleApply}
              className="w-full bg-[#EC6730] hover:opacity-90 text-white py-2 rounded font-bold flex justify-center items-center gap-2"
            >
              <Check size={18} /> Appliquer
            </button>
          </div>
        )}
      </div>
    );
  };

  const ScheduleView = () => {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    
    const [editingBooking, setEditingBooking] = useState(null); 
    const [conflictInfo, setConflictInfo] = useState(null); 
    const [isDeleting, setIsDeleting] = useState(false); 
    const [conflictSelection, setConflictSelection] = useState(null);

    const [newBooking, setNewBooking] = useState({
      employeeId: '',
      title: '',
      date: currentDate,
      startTime: '09:00',
      endTime: '10:00',
      roomId: '',
      isSpontaneous: false
    });
    const [suggestion, setSuggestion] = useState(null);

    const changeDate = (days) => {
      const [y, m, d] = currentDate.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      date.setDate(date.getDate() + days);
      
      const newY = date.getFullYear();
      const newM = String(date.getMonth() + 1).padStart(2, '0');
      const newD = String(date.getDate()).padStart(2, '0');
      setCurrentDate(`${newY}-${newM}-${newD}`);
    };

    const conflicts = bookings.filter(b => b.roomId === 'CONFLICT');
    const conflictsToday = conflicts.filter(b => b.date === currentDate);

    useEffect(() => {
      if (!newBooking.employeeId || newBooking.isSpontaneous) {
        setSuggestion(null);
        return;
      }
      const emp = employees.find(e => e.id === newBooking.employeeId);
      if (!emp) return;

      if (checkAvailability(newBooking.date, newBooking.startTime, newBooking.endTime, emp.defaultRoom, newBooking.employeeId).length === 0) {
        setSuggestion({ status: 'ok', msg: `Salle par défaut (${ROOMS.find(r => r.id === emp.defaultRoom)?.name}) disponible.`, roomId: emp.defaultRoom });
        setNewBooking(prev => ({ ...prev, roomId: emp.defaultRoom }));
        return;
      }
      for (let altId of emp.altRooms) {
        if (checkAvailability(newBooking.date, newBooking.startTime, newBooking.endTime, altId, newBooking.employeeId).length === 0) {
          setSuggestion({ status: 'warning', msg: `Défaut occupé. Alternative: ${ROOMS.find(r => r.id === altId)?.name}.`, roomId: altId });
          setNewBooking(prev => ({ ...prev, roomId: altId }));
          return;
        }
      }
      setSuggestion({ status: 'error', msg: 'Aucun bureau préféré disponible.', roomId: '' });
    }, [newBooking.employeeId, newBooking.date, newBooking.startTime, newBooking.endTime, bookings]);

    const handleSaveAdd = async () => {
      let finalRoomId = newBooking.roomId;
      if (!finalRoomId || checkAvailability(newBooking.date, newBooking.startTime, newBooking.endTime, finalRoomId, newBooking.employeeId).length > 0) {
        finalRoomId = 'CONFLICT';
      }

      await addBooking({ ...newBooking, roomId: finalRoomId });
      setIsAddModalOpen(false);
      setNewBooking({ ...newBooking, title: '', isSpontaneous: false });
      setMsg({ text: "Réservation enregistrée", type: 'success' });
    };

    const handleSlotClick = (b) => {
        setEditingBooking({ ...b }); 
        setConflictInfo(null);
    };

    const handleConflictClick = (b) => {
        setConflictSelection(b);
    };

    const openEditFromConflict = () => {
        setEditingBooking({ ...conflictSelection });
        setConflictSelection(null);
    };

    const openScheduleFromConflict = () => {
        const emp = employees.find(e => e.id === conflictSelection.employeeId);
        if (emp) {
            setManagedEmployee(emp);
            setIsScheduleManagerOpen(true);
        } else {
            setMsg({ text: "Impossible de gérer l'horaire : professionnel introuvable ou événement.", type: 'error' });
        }
        setConflictSelection(null);
    };

    const openEmployeeFromConflict = () => {
        const emp = employees.find(e => e.id === conflictSelection.employeeId);
        if (emp) {
            setManagedEmployee(emp);
            setIsEmployeeEditOpen(true);
        } else {
            setMsg({ text: "Impossible de gérer le professionnel : professionnel introuvable.", type: 'error' });
        }
        setConflictSelection(null);
    };

    useEffect(() => {
        setIsDeleting(false);
    }, [editingBooking]);

    const handleEditSubmit = async () => {
        if(!editingBooking) return;

        const collisions = checkAvailability(
            editingBooking.date, 
            editingBooking.startTime, 
            editingBooking.endTime, 
            editingBooking.roomId,
            editingBooking.employeeId,
            editingBooking.id
        );

        if (collisions.length > 0) {
            const collision = collisions[0];
            const conflictingEmp = employees.find(e => e.id === collision.employeeId);
            const conflictName = conflictingEmp ? conflictingEmp.name : (collision.title || "Inconnu");
            
            setConflictInfo({
                name: conflictName,
                startTime: collision.startTime,
                endTime: collision.endTime,
                roomName: ROOMS.find(r => r.id === collision.roomId)?.name || "Bureau inconnu"
            });
            return;
        }

        await updateBooking(editingBooking.id, {
            date: editingBooking.date,
            startTime: editingBooking.startTime,
            endTime: editingBooking.endTime,
            roomId: editingBooking.roomId,
        });

        setEditingBooking(null); 
        setMsg({ text: "Modification enregistrée. Ré-optimisation en cours...", type: 'info' });
        
        await runGlobalReoptimization();
    };

    const handleDelete = async () => {
        await removeBooking(editingBooking.id);
        setEditingBooking(null);
        setMsg({ text: "Réservation effacée.", type: 'success' });
        await runGlobalReoptimization();
    };

    return (
      <div className="space-y-4 relative">
        {editingBooking && (
            <Modal isOpen={true} onClose={() => setEditingBooking(null)} title="Modifier la réservation">
                {!conflictInfo ? (
                    <div className="space-y-4">
                        <div className="p-3 bg-gray-100 rounded text-sm mb-2">
                            <span className="font-bold">Professionnel/Titre : </span> 
                            {employees.find(e => e.id === editingBooking.employeeId)?.name || editingBooking.title}
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-[#002B35] mb-1">Date</label>
                                <input 
                                    type="date" 
                                    className="w-full border p-2 rounded" 
                                    value={editingBooking.date}
                                    onChange={e => setEditingBooking({...editingBooking, date: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-[#002B35] mb-1">Bureau</label>
                                <select 
                                    className="w-full border p-2 rounded"
                                    value={editingBooking.roomId}
                                    onChange={e => setEditingBooking({...editingBooking, roomId: e.target.value})}
                                >
                                    {ROOMS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-[#002B35] mb-1">Début</label>
                                <select className="w-full border p-2 rounded" value={editingBooking.startTime} onChange={e => setEditingBooking({...editingBooking, startTime: e.target.value})}>
                                    {TIME_SLOTS.slice(0, -1).map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-[#002B35] mb-1">Fin</label>
                                <select className="w-full border p-2 rounded" value={editingBooking.endTime} onChange={e => setEditingBooking({...editingBooking, endTime: e.target.value})}>
                                    {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="flex gap-2 pt-4 border-t mt-4 items-center">
                            {!isDeleting ? (
                                <button onClick={() => setIsDeleting(true)} className="px-4 py-2 text-red-600 border border-red-200 rounded hover:bg-red-50 flex items-center gap-2">
                                    <Trash2 size={16}/> Effacer
                                </button>
                            ) : (
                                <div className="flex gap-2">
                                    <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded font-bold hover:bg-red-700 text-sm">
                                        Confirmer ?
                                    </button>
                                    <button onClick={() => setIsDeleting(false)} className="px-3 py-2 text-gray-600 border rounded hover:bg-gray-50 text-sm">
                                        Non
                                    </button>
                                </div>
                            )}
                            <div className="flex-1"></div>
                            <button onClick={() => setEditingBooking(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Annuler</button>
                            <button onClick={handleEditSubmit} className="px-4 py-2 bg-[#EC6730] text-white rounded font-bold hover:opacity-90">
                                Soumettre
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 animate-fadeIn">
                        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="text-red-500 mt-1" size={24}/>
                                <div>
                                    <h4 className="font-bold text-red-800 text-lg">Conflit Détecté !</h4>
                                    <p className="text-red-700 text-sm mt-1">
                                        Ce créneau est en conflit avec <strong>{conflictInfo.name}</strong>.
                                    </p>
                                    <p className="text-red-600 text-xs mt-1">
                                        Il faut respecter 30 min de transition entre deux personnes.
                                    </p>
                                    <p className="text-red-600 text-xs mt-1">
                                        Occupant actuel : {conflictInfo.startTime} - {conflictInfo.endTime}
                                    </p>
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex gap-2 pt-4">
                            <button 
                                onClick={() => setEditingBooking(null)} 
                                className="flex-1 py-3 border border-gray-300 rounded text-gray-700 font-medium hover:bg-gray-50"
                            >
                                Annuler
                            </button>
                            <button 
                                onClick={() => setConflictInfo(null)} 
                                className="flex-1 py-3 bg-[#002B35] text-white rounded font-bold hover:opacity-90"
                            >
                                Modifier la demande
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        )}

        <Modal isOpen={!!conflictSelection} onClose={() => setConflictSelection(null)} title="Action requise">
            <div className="space-y-3">
                <div className="bg-red-50 p-3 rounded text-red-800 text-sm mb-4">
                    Conflit : <strong>{conflictSelection && (employees.find(e => e.id === conflictSelection.employeeId)?.name || conflictSelection.title)}</strong>
                    <br/>
                    <span className="text-xs">{conflictSelection?.startTime} - {conflictSelection?.endTime}</span>
                </div>
                
                <button onClick={openEditFromConflict} className="w-full p-3 text-left border rounded hover:bg-gray-50 flex items-center gap-2">
                    <Edit3 size={18} className="text-gray-500"/>
                    <div>
                        <div className="font-bold text-[#002B35]">Modifier la plage</div>
                        <div className="text-xs text-gray-500">Changer l'heure ou la date manuellement.</div>
                    </div>
                </button>

                <button onClick={openScheduleFromConflict} className="w-full p-3 text-left border rounded hover:bg-gray-50 flex items-center gap-2">
                    <CalendarIcon size={18} className="text-gray-500"/>
                    <div>
                        <div className="font-bold text-[#002B35]">Gérer l'horaire du professionnel</div>
                        <div className="text-xs text-gray-500">Modifier ses préférences récurrentes.</div>
                    </div>
                </button>

                <button onClick={openEmployeeFromConflict} className="w-full p-3 text-left border rounded hover:bg-gray-50 flex items-center gap-2">
                    <Users size={18} className="text-gray-500"/>
                    <div>
                        <div className="font-bold text-[#002B35]">Gérer le professionnel</div>
                        <div className="text-xs text-gray-500">Modifier ses bureaux préférés ou sa couleur.</div>
                    </div>
                </button>
            </div>
        </Modal>

        {conflicts.length > 0 && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
            <div className="flex items-center">
              <AlertCircle className="text-red-500 mr-2" />
              <div>
                <p className="font-bold text-red-700">Attention : {conflicts.length} réservation(s) en conflit (pas de bureau disponible).</p>
                {conflictsToday.length > 0 && (
                  <p className="text-sm text-red-600">Dont {conflictsToday.length} pour la date sélectionnée ({currentDate}).</p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between bg-white p-4 rounded shadow">
          <div className="flex items-center gap-2">
             <button onClick={() => changeDate(-1)} className="p-2 hover:bg-gray-100 rounded text-[#002B35]"><ChevronLeft /></button>
          </div>
          
          <div className="text-center">
            <h2 className="text-xl font-bold capitalize text-[#002B35]">
              {(() => {
                const [y, m, d] = currentDate.split('-').map(Number);
                const localDate = new Date(y, m - 1, d);
                return localDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
              })()}
            </h2>
            <input
              type="date"
              value={currentDate}
              onChange={(e) => setCurrentDate(e.target.value)}
              className="mt-1 text-sm border rounded p-1"
            />
          </div>

          <div className="flex items-center gap-2">
             <button onClick={() => changeDate(1)} className="p-2 hover:bg-gray-100 rounded text-[#002B35]"><ChevronRight /></button>
             <div className="h-6 w-px bg-gray-300 mx-2"></div> 
             <button 
                onClick={() => runGlobalReoptimization()}
                disabled={isOptimizing}
                className="p-2 bg-[#002B35] text-white rounded hover:opacity-90" 
                title="Ré-optimiser le planning"
             >
                {isOptimizing ? <span className="animate-spin text-xs">⌛</span> : <Zap size={20} className="fill-yellow-400 text-yellow-400"/>}
             </button>
          </div>
        </div>

        <div className="bg-white rounded shadow overflow-x-auto pb-4">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[150px_1fr] border-b bg-gray-50 sticky top-0 z-20">
              <div className="p-3 font-bold text-[#002B35]/70 text-sm">Bureaux</div>
              <div className="relative h-10">
                {TIME_SLOTS.filter((_, i) => i % 2 === 0).map((time, i) => (
                  <div key={time} className="absolute text-xs text-[#002B35]/50 -translate-x-1/2" style={{ left: `${(i / (TIME_SLOTS.length / 2)) * 100}%` }}>
                    {time}
                  </div>
                ))}
              </div>
            </div>

            {conflictsToday.length > 0 && (
              <div className="grid grid-cols-[150px_1fr] border-b bg-red-50 h-24">
                <div className="p-3 border-r flex flex-col justify-center text-red-600 font-bold text-sm">
                  À REPLACER ⚠️
                </div>
                <div className="relative h-full w-full">
                  {TIME_SLOTS.filter((_, i) => i % 2 === 0).map((_, i) => (
                    <div key={i} className="absolute h-full border-r border-red-100" style={{ left: `${(i / (TIME_SLOTS.length / 2)) * 100}%` }}></div>
                  ))}
                  {conflictsToday.map(b => {
                    const startMin = getMinutes(b.startTime);
                    const endMin = getMinutes(b.endTime);
                    const duration = (20 * 60 + 30) - (8 * 60);
                    const left = ((startMin - (8 * 60)) / duration) * 100;
                    const width = ((endMin - startMin) / duration) * 100;
                    const emp = employees.find(e => e.id === b.employeeId);

                    return (
                      <div key={b.id}
                        className="absolute top-2 bottom-2 bg-red-200 border-l-4 border-red-600 px-2 text-xs flex flex-col justify-center rounded shadow cursor-pointer hover:bg-red-300"
                        style={{ left: `${left}%`, width: `${width}%` }}
                        onClick={() => handleConflictClick(b)}
                      >
                        <span className="font-bold truncate">{emp?.name || b.title}</span>
                        <span className="text-[10px]">{b.startTime}-{b.endTime}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {ROOMS.map(room => (
              <div key={room.id} className="grid grid-cols-[150px_1fr] border-b hover:bg-gray-50 transition-colors h-24 relative group">
                <div className="p-3 border-r flex flex-col justify-center bg-white z-10">
                  <span className="font-bold text-sm text-[#002B35]">{room.name}</span>
                  <span className="text-xs text-[#002B35]/60">{room.type} ({room.capacity}p)</span>
                </div>
                <div className="relative h-full w-full bg-white">
                  {TIME_SLOTS.filter((_, i) => i % 2 === 0).map((_, i) => (
                    <div key={i} className="absolute h-full border-r border-gray-100" style={{ left: `${(i / (TIME_SLOTS.length / 2)) * 100}%` }}></div>
                  ))}

                  {bookings
                    .filter(b => b.date === currentDate && b.roomId === room.id)
                    .map(b => {
                      const startMin = getMinutes(b.startTime);
                      const endMin = getMinutes(b.endTime);
                      const duration = (20 * 60 + 30) - (8 * 60);

                      const left = ((startMin - (8 * 60)) / duration) * 100;
                      const width = ((endMin - startMin) / duration) * 100;

                      const emp = employees.find(e => e.id === b.employeeId);
                      
                      let containerStyle = { left: `${left}%`, width: `${width}%` };
                      let containerClasses = `absolute top-1 bottom-1 rounded px-2 text-xs flex flex-col justify-center overflow-hidden shadow-sm border-l-4 cursor-pointer hover:z-30 hover:shadow-md transition-all`;
                      let textColorClass = "text-[#002B35]"; 
                      
                      if (b.isSpontaneous) {
                          containerClasses += " bg-orange-100 border-orange-500";
                      } else if (emp) {
                          containerStyle.backgroundColor = emp.color;
                          containerClasses += " border-black/20";
                          textColorClass = "text-white drop-shadow-md"; 
                      } else {
                          containerClasses += " bg-[#DAEBEF] border-[#EC6730]";
                      }

                      return (
                        <div
                          key={b.id}
                          className={containerClasses}
                          style={containerStyle}
                          title={`${emp?.name || b.title} (${b.startTime}-${b.endTime})`}
                          onClick={() => handleSlotClick(b)} 
                        >
                          {!b.isSpontaneous && emp && emp.pattern !== 'solid' && (
                              <svg className="absolute inset-0 w-full h-full opacity-30 pointer-events-none">
                                  <rect width="100%" height="100%" fill={`url(#sched-${emp.pattern})`} />
                              </svg>
                          )}
                          
                          <div className={`relative z-10 truncate ${textColorClass}`}>
                              <span className="font-bold truncate block">{b.isSpontaneous ? b.title : emp?.name}</span>
                              <span className="hidden sm:inline text-[10px] opacity-90">{b.startTime}-{b.endTime}</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="fixed bottom-8 right-8 z-40">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="bg-[#EC6730] text-white p-4 rounded-full shadow-lg hover:opacity-90 flex items-center gap-2 transform hover:scale-105 transition-transform"
          >
            <Plus size={24} /> <span className="font-bold hidden md:inline">Ajouter</span>
          </button>
        </div>

        <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Ajout rapide">
          <div className="space-y-4">
            <div className="flex bg-[#DAEBEF] p-1 rounded">
              <button
                className={`flex-1 py-1 text-sm rounded ${!newBooking.isSpontaneous ? 'bg-white shadow text-[#002B35]' : 'text-[#002B35]/60'}`}
                onClick={() => setNewBooking({ ...newBooking, isSpontaneous: false })}
              >Professionnel</button>
              <button
                className={`flex-1 py-1 text-sm rounded ${newBooking.isSpontaneous ? 'bg-white shadow text-[#002B35]' : 'text-[#002B35]/60'}`}
                onClick={() => setNewBooking({ ...newBooking, isSpontaneous: true, employeeId: '' })}
              >Événement</button>
            </div>

            {!newBooking.isSpontaneous ? (
              <div>
                <label className="block text-sm font-medium text-[#002B35]">Professionnel</label>
                <select className="w-full border p-2 rounded mt-1" value={newBooking.employeeId} onChange={e => setNewBooking({ ...newBooking, employeeId: e.target.value })}>
                  <option value="">-- Choisir --</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-[#002B35]">Titre</label>
                <input type="text" className="w-full border p-2 rounded mt-1" value={newBooking.title} onChange={e => setNewBooking({ ...newBooking, title: e.target.value })} placeholder="Ex: Maintenance" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium text-[#002B35]">Date</label>
                <input type="date" className="w-full border p-2 rounded mt-1" value={newBooking.date} onChange={e => setNewBooking({ ...newBooking, date: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-[#002B35]">Début</label>
                  <select className="w-full border p-2 rounded mt-1" value={newBooking.startTime} onChange={e => setNewBooking({ ...newBooking, startTime: e.target.value })}>
                    {TIME_SLOTS.slice(0, -1).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-[#002B35]">Fin</label>
                  <select className="w-full border p-2 rounded mt-1" value={newBooking.endTime} onChange={e => setNewBooking({ ...newBooking, endTime: e.target.value })}>
                    {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {suggestion && !newBooking.isSpontaneous && (
              <div className={`p-2 text-xs rounded border ${suggestion.status === 'ok' ? 'bg-green-50 border-green-200 text-green-700' :
                  suggestion.status === 'warning' ? 'bg-orange-50 border-orange-200 text-orange-700' :
                    'bg-red-50 border-red-200 text-red-700'
                }`}>
                {suggestion.msg}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-[#002B35]">Bureau</label>
              <select className="w-full border p-2 rounded mt-1" value={newBooking.roomId} onChange={e => setNewBooking({ ...newBooking, roomId: e.target.value })}>
                <option value="">-- Sélectionner --</option>
                {ROOMS.map(r => {
                  const free = checkAvailability(newBooking.date, newBooking.startTime, newBooking.endTime, r.id, newBooking.employeeId).length === 0;
                  return <option key={r.id} value={r.id} className={!free ? 'text-red-500' : ''}>{r.name} {!free ? '(Occupé)' : ''}</option>
                })}
              </select>
            </div>

            <button onClick={handleSaveAdd} className="w-full bg-[#EC6730] text-white py-2 rounded font-bold hover:opacity-90">Confirmer</button>
          </div>
        </Modal>
      </div>
    );
  };

  const EmployeeView = () => {
    const [newEmp, setNewEmp] = useState({ name: '', defaultRoom: 'R1', altRooms: [], color: '#4F46E5', pattern: 'solid' });

    const handleAdd = async () => {
      if (!newEmp.name) return;
      if (isCombinationTaken(newEmp.color, newEmp.pattern)) {
        setMsg({ text: "Cette combinaison couleur/motif est déjà prise par un autre professionnel.", type: 'error' });
        return;
      }
      await addEmployee(newEmp);
      setNewEmp({ name: '', defaultRoom: 'R1', altRooms: [], color: '#4F46E5', pattern: 'solid' });
      setMsg({ text: "Professionnel ajouté", type: 'success' });
    };

    const openScheduleModal = (emp) => {
      setManagedEmployee(emp);
      setIsScheduleManagerOpen(true);
    };

    const openEditModal = (emp) => {
        setManagedEmployee({ ...emp }); 
        setIsEmployeeEditOpen(true);
    };

    return (
      <div className="space-y-8">
        <div className="bg-white p-6 rounded shadow border-l-4 border-[#EC6730]">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-[#002B35]"><Plus size={20} /> Créer un Professionnel</h3>
          <div className="grid md:grid-cols-4 gap-6 items-start">
            <div className="md:col-span-1 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-[#002B35]/50 mb-1">Nom complet</label>
                <input
                    type="text"
                    className="w-full border p-2 rounded"
                    placeholder="Ex: Dr. Martin"
                    value={newEmp.name}
                    onChange={(e) => setNewEmp({ ...newEmp, name: e.target.value })}
                />
              </div>
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                    <label className="block text-xs font-bold uppercase text-[#002B35]/50 mb-1">Pastille</label>
                    <div className="flex gap-2 items-center border p-2 rounded bg-gray-50 h-10">
                        <SwatchPastille color={newEmp.color} pattern={newEmp.pattern} />
                        <span className="text-[10px] text-gray-400">Aperçu</span>
                    </div>
                </div>
              </div>
            </div>

            <div className="md:col-span-1 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-[#002B35]/50 mb-1">Bureau Par Défaut</label>
                <select
                    className="w-full border p-2 rounded"
                    value={newEmp.defaultRoom}
                    onChange={(e) => setNewEmp({ ...newEmp, defaultRoom: e.target.value })}
                >
                    {ROOMS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-[#002B35]/50 mb-1">Motif</label>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border p-2 rounded">
                  {EMPLOYEE_PATTERNS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setNewEmp({...newEmp, pattern: p.id})}
                      className={`flex items-center gap-2 p-1 rounded border transition-all ${newEmp.pattern === p.id ? 'border-[#EC6730] bg-[#EC6730]/10 ring-1 ring-[#EC6730]' : 'border-transparent hover:bg-gray-50'}`}
                    >
                      <SwatchPastille color={newEmp.color} pattern={p.id} size="w-6 h-6" />
                      <span className="text-xs text-left truncate">{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="md:col-span-2 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-[#002B35]/50 mb-1">Couleur</label>
                <div className="grid grid-cols-6 gap-1">
                    {EMPLOYEE_COLORS.map(c => (
                        <button 
                            key={c} 
                            onClick={() => setNewEmp({...newEmp, color: c})}
                            className={`h-8 w-full rounded border-2 transition-all ${newEmp.color === c ? 'border-black scale-110 shadow-sm z-10' : 'border-transparent hover:scale-105'}`}
                            style={{ backgroundColor: c }}
                        />
                    ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-[#002B35]/50 mb-1">
                    Alternatives (Max 3)
                </label>
                <div className="flex flex-wrap gap-2">
                    {ROOMS.filter(r => r.id !== newEmp.defaultRoom).map(r => {
                      const index = newEmp.altRooms.indexOf(r.id);
                      const isSelected = index !== -1;
                      return (
                        <button
                            key={r.id}
                            onClick={() => toggleAltRoom(r.id, newEmp, setNewEmp)}
                            className={`px-2 py-1 text-xs rounded border flex items-center gap-2 transition-colors ${isSelected ? 'bg-[#EC6730]/10 border-[#EC6730] text-[#EC6730] font-bold' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                        >
                            {isSelected && (
                                <span className="flex items-center justify-center bg-[#EC6730] text-white w-4 h-4 rounded-full text-[10px]">
                                    {index + 1}
                                </span>
                            )}
                            {r.name}
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
          <button onClick={handleAdd} className="mt-6 bg-[#EC6730] text-white px-6 py-2 rounded hover:opacity-90 w-full md:w-auto font-bold shadow-sm">Ajouter le professionnel</button>
        </div>

        <div className="grid gap-4">
          {employees.map(emp => (
            <div key={emp.id} className="bg-white p-4 rounded shadow flex flex-col md:flex-row justify-between items-center gap-4 transition-hover hover:shadow-md">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-bold text-lg border">
                    {emp.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                        <h4 className="font-bold text-lg leading-none text-[#002B35]">{emp.name}</h4>
                        <SwatchPastille color={emp.color || '#4F46E5'} pattern={emp.pattern || 'solid'} size="w-5 h-5" />
                    </div>
                    <div className="flex gap-2 text-xs text-[#002B35]/60 mt-1">
                      <span>Défaut: <b>{ROOMS.find(r => r.id === emp.defaultRoom)?.name}</b></span>
                      <span>•</span>
                      <span>Alt: {emp.altRooms.map(id => ROOMS.find(r => r.id === id)?.name).join(', ') || 'Aucun'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 w-full md:w-auto">
                <button
                  onClick={() => openEditModal(emp)}
                  className="flex-1 md:flex-none bg-gray-100 text-[#002B35] border border-gray-200 px-4 py-2 rounded hover:bg-gray-200 flex items-center justify-center gap-2"
                >
                  <Settings size={16} /> Gérer le professionnel
                </button>
                <button
                  onClick={() => openScheduleModal(emp)}
                  className="flex-1 md:flex-none bg-[#EC6730]/10 text-[#EC6730] border border-[#EC6730]/30 px-4 py-2 rounded hover:bg-[#EC6730]/20 flex items-center justify-center gap-2"
                >
                  <CalendarIcon size={16} /> Gérer l'horaire
                </button>
                <button onClick={() => removeEmployee(emp.id)} className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded">
                  <Trash2 size={20} />
                </button>
              </div>
            </div>
          ))}
          {employees.length === 0 && <div className="text-center py-10 text-[#002B35]/50">Aucun professionnel (synchronisé).</div>}
        </div>
      </div>
    );
  };

  const ReportView = () => {
    const [startDate, setStartDate] = useState(currentDate);
    const [endDate, setEndDate] = useState(currentDate);
    const [reportData, setReportData] = useState([]);

    const [selectedSlot, setSelectedSlot] = useState(null);
    const [bookingEmployeeId, setBookingEmployeeId] = useState('');
    const [bookingDuration, setBookingDuration] = useState(60);

    const generateReport = () => {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const data = [];

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const daySlots = { date: dateStr, rooms: {} };

        ROOMS.forEach(room => {
          const freeHours = [];
          for (let h = 8; h < 20; h++) {
            const timeStr = `${h < 10 ? '0' + h : h}:00`;
            const endTimeStr = `${h + 1 < 10 ? '0' + (h + 1) : h + 1}:00`;
            // Pour le rapport, on peut vouloir voir la dispo pure ou avec buffer
            // Ici on vérifie avec buffer=0 ou pas de user ID specifique pour voir si c'est libre en general
            if (checkAvailability(dateStr, timeStr, endTimeStr, room.id).length === 0) {
              freeHours.push(timeStr);
            }
          }
          daySlots.rooms[room.name] = freeHours;
        });
        data.push(daySlots);
      }
      setReportData(data);
    };

    const handleSlotClick = (date, roomName, time) => {
      const room = ROOMS.find(r => r.name === roomName);
      if (room) {
        setSelectedSlot({
          date: date,
          roomId: room.id,
          roomName: room.name,
          startTime: time
        });
        setBookingEmployeeId('');
      }
    };

    const handleConfirmBooking = async () => {
      if (!selectedSlot || !bookingEmployeeId) return;

      const startMins = getMinutes(selectedSlot.startTime);
      const endMins = startMins + bookingDuration;
      const h = Math.floor(endMins / 60);
      const m = endMins % 60;
      const endTime = `${h < 10 ? '0' + h : h}:${m < 10 ? '0' + m : m}`;

      await addBooking({
        employeeId: bookingEmployeeId,
        date: selectedSlot.date,
        startTime: selectedSlot.startTime,
        endTime: endTime,
        roomId: selectedSlot.roomId,
        isSpontaneous: false,
        title: "Réservation Rapport"
      });

      setMsg({ text: "Réservation effectuée !", type: 'success' });
      setSelectedSlot(null);
      generateReport();
    };

    return (
      <div className="bg-white p-6 rounded shadow space-y-6 relative">
        <h3 className="font-bold text-lg text-[#002B35]">Rapport de disponibilité</h3>
        <div className="flex flex-col md:flex-row gap-4 items-end border-b pb-6">
          <div>
            <label className="block text-sm font-medium mb-1 text-[#002B35]">Du</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border p-2 rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-[#002B35]">Au</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border p-2 rounded" />
          </div>
          <button onClick={generateReport} className="bg-[#EC6730] text-white px-4 py-2 rounded hover:opacity-90 h-10 w-full md:w-auto">
            Générer Rapport
          </button>
        </div>

        <div className="space-y-6">
          {reportData.length > 0 ? reportData.map((day, idx) => (
            <div key={idx} className="border rounded-lg overflow-hidden">
              <div className="bg-[#DAEBEF] p-3 font-bold border-b text-[#002B35]">
                {new Date(day.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              <div className="p-4 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(day.rooms).map(([roomName, hours]) => (
                  <div key={roomName} className={`border p-3 rounded text-sm ${hours.length === 0 ? 'bg-gray-100 opacity-60' : ''}`}>
                    <strong className="block text-[#002B35] mb-2">{roomName}</strong>
                    {hours.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {hours.map(h => (
                          <button
                            key={h}
                            onClick={() => handleSlotClick(day.date, roomName, h)}
                            className="bg-[#EC6730]/10 text-[#EC6730] px-2 py-1 rounded text-xs border border-[#EC6730]/30 hover:bg-[#EC6730]/20 hover:scale-105 transition-transform"
                            title="Réserver ce créneau"
                          >
                            {h}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="text-red-500 italic text-xs">Complet / Indisponible</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )) : (
            <div className="text-center text-[#002B35]/50 py-10 bg-gray-50 rounded border-dashed border-2">
              <FileText className="mx-auto h-12 w-12 text-[#002B35]/30 mb-2" />
              <p>Sélectionnez une plage de dates pour identifier les "trous" dans l'horaire.</p>
            </div>
          )}
        </div>

        {selectedSlot && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 animate-fadeIn">
              <h3 className="font-bold text-lg mb-4 text-[#002B35]">Réserver ce créneau</h3>

              <div className="space-y-4 mb-6">
                <div className="text-sm text-[#002B35]/80 bg-[#DAEBEF] p-3 rounded border">
                  <div><strong>Date :</strong> {new Date(selectedSlot.date).toLocaleDateString('fr-FR')}</div>
                  <div><strong>Heure :</strong> {selectedSlot.startTime}</div>
                  <div><strong>Lieu :</strong> {selectedSlot.roomName}</div>
                </div>

                <div>
                  <label className="block text-sm font-bold mb-1 text-[#002B35]">Professionnel</label>
                  <select
                    className="w-full border p-2 rounded"
                    value={bookingEmployeeId}
                    onChange={e => setBookingEmployeeId(e.target.value)}
                  >
                    <option value="">-- Sélectionner --</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold mb-1 text-[#002B35]">Durée</label>
                  <select
                    className="w-full border p-2 rounded"
                    value={bookingDuration}
                    onChange={e => setBookingDuration(parseInt(e.target.value))}
                  >
                    <option value={60}>1h 00</option>
                    <option value={90}>1h 30</option>
                    <option value={120}>2h 00</option>
                    <option value={30}>30 min</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setSelectedSlot(null)} className="flex-1 py-2 text-[#002B35] border rounded hover:bg-gray-50">Annuler</button>
                <button
                  onClick={handleConfirmBooking}
                  disabled={!bookingEmployeeId}
                  className={`flex-1 py-2 text-white rounded font-bold ${!bookingEmployeeId ? 'bg-gray-300' : 'bg-[#EC6730] hover:opacity-90'}`}
                >
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // --- VUE IMPRESSION PDF ---
  const PrintView = () => {
    const [targetType, setTargetType] = useState('employee');
    const [targetId, setTargetId] = useState('');
    const [mondayDate, setMondayDate] = useState(() => {
        const d = new Date();
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Lundi de cette semaine
        return new Date(d.setDate(diff)).toISOString().split('T')[0];
    });

    const generatePDF = async () => {
        if (!targetId) {
            setMsg({ text: "Veuillez sélectionner une cible.", type: 'error' });
            return;
        }

        // Vérifier si jsPDF est chargé
        if (!window.jspdf) {
            setMsg({ text: "Outil PDF non chargé. Réessayez dans un instant.", type: 'error' });
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'in',
            format: 'letter' // 8.5 x 11 inches
        });

        const weekDays = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(mondayDate);
            d.setDate(d.getDate() + i);
            weekDays.push(d.toISOString().split('T')[0]);
        }

        const targetName = targetType === 'employee' 
            ? employees.find(e => e.id === targetId)?.name 
            : ROOMS.find(r => r.id === targetId)?.name;

        // Titre
        doc.setFontSize(18);
        doc.text(`Planning : ${targetName}`, 0.5, 0.6);
        doc.setFontSize(12);
        doc.text(`Semaine du ${new Date(mondayDate).toLocaleDateString('fr-FR')} au ${new Date(weekDays[6]).toLocaleDateString('fr-FR')}`, 0.5, 0.9);

        // Préparation des données du tableau
        const head = [['Heure', ...WEEK_DAYS.map(wd => wd.label)]];
        const body = [];

        // Modification ici : on utilise une variable timeMins pour vérifier l'occupation horaire
        TIME_SLOTS.filter((_, i) => i % 2 === 0).forEach(time => {
            const row = [time];
            const currentTimeMins = getMinutes(time);

            weekDays.forEach(date => {
                // On cherche une réservation ACTIVE à cette heure (start <= current < end)
                const activeBooking = bookings.find(b => {
                    const isTarget = targetType === 'employee' ? b.employeeId === targetId : b.roomId === targetId;
                    if (b.date !== date || !isTarget) return false;
                    
                    const start = getMinutes(b.startTime);
                    const end = getMinutes(b.endTime);
                    
                    return currentTimeMins >= start && currentTimeMins < end;
                });

                if (activeBooking) {
                    const room = ROOMS.find(r => r.id === activeBooking.roomId)?.name || "Inconnu";
                    const emp = employees.find(e => e.id === activeBooking.employeeId)?.name || "Inconnu";
                    
                    // Contenu : juste le nom
                    const content = targetType === 'employee' ? room : emp;
                    row.push(content);
                } else {
                    row.push('');
                }
            });
            body.push(row);
        });

        doc.autoTable({
            head: head,
            body: body,
            startY: 1.2,
            styles: { fontSize: 8, cellPadding: 0.1 },
            headStyles: { fillStyle: 'F', fillColor: [79, 70, 229] },
            columnStyles: { 0: { cellWidth: 0.6, fontStyle: 'bold' } },
            margin: { left: 0.5, right: 0.5 }
        });

        doc.save(`Planning_${targetName}_${mondayDate}.pdf`);
        setMsg({ text: "PDF généré !", type: 'success' });
    };

    return (
        <div className="bg-white p-6 rounded shadow space-y-6">
            <h3 className="font-bold text-lg text-[#002B35] flex items-center gap-2">
                <Printer size={20}/> Impression de planning
            </h3>

            <div className="grid md:grid-cols-3 gap-6 items-end border-b pb-6">
                <div>
                    <label className="block text-sm font-medium mb-1 text-[#002B35]">1. Quoi imprimer ?</label>
                    <select className="w-full border p-2 rounded" value={targetType} onChange={e => {setTargetType(e.target.value); setTargetId('');}}>
                        <option value="employee">Un Professionnel</option>
                        <option value="room">Un Bureau</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1 text-[#002B35]">2. Sélectionner</label>
                    <select className="w-full border p-2 rounded" value={targetId} onChange={e => setTargetId(e.target.value)}>
                        <option value="">-- Choisir --</option>
                        {targetType === 'employee' ? 
                            employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>) :
                            ROOMS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)
                        }
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1 text-[#002B35]">3. Semaine du (Lundi)</label>
                    <input 
                        type="date" 
                        className="w-full border p-2 rounded" 
                        value={mondayDate} 
                        onChange={e => {
                            const d = new Date(e.target.value);
                            const day = d.getUTCDay();
                            const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
                            setMondayDate(new Date(d.setUTCDate(diff)).toISOString().split('T')[0]);
                        }} 
                    />
                </div>
            </div>

            <div className="flex flex-col items-center py-10 bg-gray-50 rounded border-2 border-dashed">
                <Printer className="w-16 h-16 text-[#002B35]/30 mb-4" />
                <p className="text-[#002B35]/60 mb-6 text-center max-w-md">
                    Générez un document PDF optimisé pour le format <b>Lettre Nord-Américain</b> (8.5" x 11"). Idéal pour afficher sur la porte d'un bureau ou remettre à un professionnel.
                </p>
                <button 
                    onClick={generatePDF}
                    disabled={!targetId}
                    className={`flex items-center gap-2 px-8 py-3 rounded font-bold text-white shadow-lg transition-all ${!targetId ? 'bg-gray-300' : 'bg-[#EC6730] hover:opacity-90 hover:scale-105 active:scale-95'}`}
                >
                    <FileText size={20}/> Générer le PDF
                </button>
            </div>
        </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#DAEBEF] font-sans text-[#002B35] pb-20">
      <GlobalPatternDefs />
      <MessageBox message={msg?.text} type={msg?.type} onClose={() => setMsg(null)} />
      <header className="bg-white shadow-sm z-50 sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              {/* Remplacement de l'icône par le Logo */}
              {/* NOTE: L'image ne s'affichera que si le fichier est présent dans le dossier public du projet réel */}
              <img 
                src="PrioritePsycho_Logo_Officiel_RGB.jpg" 
                alt="Logo Priorité Psycho" 
                className="h-12 w-auto object-contain"
                onError={(e) => {
                  e.target.style.display = 'none'; // Cache l'image brisée
                  e.target.nextSibling.style.display = 'flex'; // Affiche le fallback
                }}
              />
              
              {/* Fallback (s'affiche si l'image n'est pas trouvée) */}
              <div className="hidden items-center gap-2 p-1 border border-dashed border-gray-300 rounded bg-gray-50" title="Placez l'image 'PrioritePsycho_Logo_Officiel_RGB.jpg' dans le dossier public">
                <div className="bg-[#EC6730] text-white p-1 rounded">
                  <Users size={18} />
                </div>
                <span className="text-xs text-gray-400 italic">Logo (Manquant dans l'aperçu)</span>
              </div>
              
              {/* Nouveau Titre */}
              <h1 className="text-xl font-bold text-[#002B35] hidden sm:block">Gestion Priorité Psycho</h1>
            </div>
            <div className="flex items-center gap-4">
              {user ? (
                <span className="text-xs flex items-center text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-200">
                  <Cloud size={12} className="mr-1" /> En ligne
                </span>
              ) : (
                <span className="text-xs flex items-center text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                  <CloudOff size={12} className="mr-1" /> Connexion...
                </span>
              )}
              <nav className="flex space-x-2 sm:space-x-4">
                <button
                  onClick={() => setActiveTab('schedule')}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center ${activeTab === 'schedule' ? 'bg-[#EC6730]/10 text-[#EC6730]' : 'text-[#002B35]/60 hover:text-[#002B35]'}`}
                >
                  <Clock className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">Planning</span>
                </button>
                <button
                  onClick={() => setActiveTab('appointments')}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center ${activeTab === 'appointments' ? 'bg-[#EC6730]/10 text-[#EC6730]' : 'text-[#002B35]/60 hover:text-[#002B35]'}`}
                >
                  <CalendarCheck className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">Rendez-vous</span>
                </button>
                <button
                  onClick={() => setActiveTab('employees')}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center ${activeTab === 'employees' ? 'bg-[#EC6730]/10 text-[#EC6730]' : 'text-[#002B35]/60 hover:text-[#002B35]'}`}
                >
                  <Users className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">Professionnels</span>
                </button>
                <button
                  onClick={() => setActiveTab('report')}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center ${activeTab === 'report' ? 'bg-[#EC6730]/10 text-[#EC6730]' : 'text-[#002B35]/60 hover:text-[#002B35]'}`}
                >
                  <FileText className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">Rapports</span>
                </button>
                <button
                  onClick={() => setActiveTab('print')}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center ${activeTab === 'print' ? 'bg-[#EC6730]/10 text-[#EC6730]' : 'text-[#002B35]/60 hover:text-[#002B35]'}`}
                >
                  <Printer className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">Impression</span>
                </button>
              </nav>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'schedule' && <ScheduleView />}
        {activeTab === 'appointments' && <AppointmentView />}
        {activeTab === 'employees' && <EmployeeView />}
        {activeTab === 'report' && <ReportView />}
        {activeTab === 'print' && <PrintView />}
      </main>

      {/* Global Modals rendered here to be accessible from anywhere */}
      {isEmployeeEditOpen && managedEmployee && (
        <Modal isOpen={isEmployeeEditOpen} onClose={() => setIsEmployeeEditOpen(false)} title="Modifier le professionnel" maxWidth="max-w-xl">
            <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-bold text-[#002B35] mb-1">Nom complet</label>
                        <input
                            type="text"
                            className="w-full border p-2 rounded"
                            value={managedEmployee.name}
                            onChange={(e) => setManagedEmployee({ ...managedEmployee, name: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-[#002B35] mb-1">Bureau Par Défaut</label>
                        <select
                            className="w-full border p-2 rounded"
                            value={managedEmployee.defaultRoom}
                            onChange={(e) => setManagedEmployee({ ...managedEmployee, defaultRoom: e.target.value })}
                        >
                            {ROOMS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-bold text-[#002B35] mb-1">Couleur</label>
                        <div className="grid grid-cols-6 gap-1">
                            {EMPLOYEE_COLORS.map(c => (
                                <button 
                                    key={c} 
                                    onClick={() => setManagedEmployee({...managedEmployee, color: c})}
                                    className={`h-7 rounded border-2 ${managedEmployee.color === c ? 'border-black scale-110 shadow-sm z-10' : 'border-transparent hover:scale-105'}`}
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                        </div>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-[#002B35] mb-1">Motif</label>
                            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border p-2 rounded">
                              {EMPLOYEE_PATTERNS.map(p => (
                                <button
                                  key={p.id}
                                  onClick={() => setManagedEmployee({...managedEmployee, pattern: p.id})}
                                  className={`flex items-center gap-2 p-1 rounded border transition-all ${managedEmployee.pattern === p.id ? 'border-[#EC6730] bg-[#EC6730]/10 ring-1 ring-[#EC6730]' : 'border-transparent hover:bg-gray-50'}`}
                                >
                                  <SwatchPastille color={managedEmployee.color} pattern={p.id} size="w-6 h-6" />
                                  <span className="text-xs text-left truncate">{p.label}</span>
                                </button>
                              ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-3 bg-gray-50 p-2 rounded border">
                            <SwatchPastille color={managedEmployee.color} pattern={managedEmployee.pattern} size="w-8 h-8" />
                            <span className="text-xs font-bold text-[#002B35]">Aperçu final</span>
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-bold text-[#002B35] mb-1">Bureaux Alternatifs (Max 3)</label>
                    <div className="flex flex-wrap gap-2 mt-2">
                        {ROOMS.filter(r => r.id !== managedEmployee.defaultRoom).map(r => {
                          const index = managedEmployee.altRooms.indexOf(r.id);
                          const isSelected = index !== -1;
                          return (
                            <button
                                key={r.id}
                                onClick={() => toggleAltRoom(r.id, managedEmployee, setManagedEmployee)}
                                className={`px-2 py-1 text-xs rounded border flex items-center gap-2 transition-colors ${isSelected ? 'bg-[#EC6730]/10 border-[#EC6730] text-[#EC6730] font-bold' : 'bg-white text-gray-600'}`}
                            >
                                {isSelected && (
                                    <span className="flex items-center justify-center bg-[#EC6730] text-white w-4 h-4 rounded-full text-[10px]">
                                        {index + 1}
                                    </span>
                                )}
                                {r.name}
                            </button>
                          );
                        })}
                    </div>
                </div>
                <div className="pt-4 border-t">
                    <p className="text-xs text-orange-600 font-medium mb-3 flex items-center gap-1">
                        <AlertCircle size={14}/> Note : Enregistrer déclenchera une ré-optimisation des bureaux pour les 30 prochains jours.
                    </p>
                    <button 
                        onClick={handleUpdateEmployee} 
                        className="w-full bg-[#EC6730] text-white py-2 rounded font-bold hover:opacity-90 shadow flex items-center justify-center gap-2"
                    >
                        <Save size={18}/> Enregistrer les modifications
                    </button>
                </div>
            </div>
        </Modal>
      )}

      {isScheduleManagerOpen && managedEmployee && (
        <RecurringScheduleForm
          isOpen={isScheduleManagerOpen}
          onClose={() => setIsScheduleManagerOpen(false)}
          employee={managedEmployee}
          bookings={bookings}
          db={db}
          appId={appId}
          allEmployees={employees}
        />
      )}
    </div>
  );
}
