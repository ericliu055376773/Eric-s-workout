import React, { useState, useEffect, useMemo } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Dumbbell, 
  Pill, 
  Save, 
  Calendar,
  CheckCircle2,
  Loader2,
  Settings,
  X,
  Plus,
  Trash2,
  ArrowLeft,
  Activity,
  Target, 
  Clock,
  Flame,
  Timer
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  onSnapshot 
} from 'firebase/firestore';

// --- Firebase 初始化 ---
// ⚠️ 已經填入您的 Firebase 專案設定
const firebaseConfig = {
  apiKey: "AIzaSyA6uB6guqyv1DZI51AzmQ3plXdOFEkHRm0",
  authDomain: "ertic-workout.firebaseapp.com",
  projectId: "ertic-workout",
  storageBucket: "ertic-workout.firebasestorage.app",
  messagingSenderId: "555462032713",
  appId: "1:555462032713:web:20160aa28994dfa443ae98"
};

// 檢查是否有設定檔，避免無設定時傳入空物件導致全站白畫面崩潰
const isFirebaseConfigured = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("請填寫");

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
const auth = isFirebaseConfigured ? getAuth(app) : null;
const db = isFirebaseConfigured ? getFirestore(app) : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'fitness-tracker-app-v3';

// 預設設定資料 (升級為支援自訂部位與分段補品)
const DEFAULT_SETTINGS = {
  parts: ['胸', '背', '腿', '肩', '手', '核心', '有氧', '休息'],
  restTimer: 60,
  supplementPeriods: ['起床', '早餐', '午餐', '晚餐', '練前', '練中', '練後', '睡前', '隨時'],
  supplements: {
    '起床': ['綜合維他命', 'B群', '益生菌'],
    '練前': ['肌酸', '氮泵'],
    '練後': ['乳清蛋白'],
    '睡前': ['魚油', 'ZMA']
  },
  exercises: {
    '胸': ['槓鈴平胸臥推', '啞鈴上胸臥推', '機械飛鳥', '伏地挺身'],
    '背': ['滑輪下拉', '槓鈴划船', '引體向上', '單臂啞鈴划船'],
    '腿': ['槓鈴深蹲', '羅馬尼亞硬舉', '腿推舉', '分腿蹲'],
    '肩': ['啞鈴肩推', '側平舉', '滑輪面拉'],
    '手': ['二頭彎舉', '三頭下壓'],
    '核心': ['仰臥起坐', '棒式', '俄羅斯轉體'],
    '有氧': ['跑步機', '飛輪', '橢圓機'],
    '休息': []
  }
};

export default function FitnessApp() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('main'); // 'main' | 'settings'
  
  // 設定狀態
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  
  // 日誌與時間狀態
  const [allLogs, setAllLogs] = useState({});
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  
  // 當日表單狀態
  const [trainingParts, setTrainingParts] = useState([]);
  const [dailyExercises, setDailyExercises] = useState([]);
  const [supplements, setSupplements] = useState({});
  
  // UI 狀態
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isDirty, setIsDirty] = useState(false); // 防呆機制：追蹤是否有未儲存的變更

  // 計時器狀態
  const [timeLeft, setTimeLeft] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  // 後台專用狀態
  const [newPart, setNewPart] = useState('');
  const [settingActivePart, setSettingActivePart] = useState('胸');
  const [newExercise, setNewExercise] = useState('');
  
  const [newPeriod, setNewPeriod] = useState('');
  const [settingActivePeriod, setSettingActivePeriod] = useState('起床');
  const [newSupp, setNewSupp] = useState('');

  function getTodayString() {
    const today = new Date();
    const offset = today.getTimezoneOffset() * 60000;
    return (new Date(today.getTime() - offset)).toISOString().split('T')[0];
  }

  function changeDate(days) {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + days);
    const offset = current.getTimezoneOffset() * 60000;
    setSelectedDate((new Date(current.getTime() - offset)).toISOString().split('T')[0]);
    setSaveSuccess(false);
    setIsDirty(false);
  }

  const playBeep = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.5, ctx.currentTime);
      osc.start();
      setTimeout(() => {
        osc.stop();
        ctx.close();
      }, 400);
    } catch(e) { console.error("Audio beep failed", e) }
  };

  const startTimer = () => {
    setTimeLeft(settings.restTimer || 60);
    setIsTimerRunning(true);
  };

  const stopTimer = () => {
    setIsTimerRunning(false);
    setTimeLeft(0);
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const totalDailyWeight = useMemo(() => {
    return dailyExercises
      .filter(ex => trainingParts.includes(ex.part))
      .reduce((sum, ex) => sum + (Number(ex.sets) * Number(ex.weight)), 0);
  }, [dailyExercises, trainingParts]);

  const stats = useMemo(() => {
    let weekly = 0;
    let monthly = 0;

    const curr = new Date(selectedDate);
    const currentMonth = selectedDate.substring(0, 7);

    const day = curr.getDay() === 0 ? 7 : curr.getDay();
    const weekStart = new Date(curr);
    weekStart.setDate(curr.getDate() - day + 1);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const offset = curr.getTimezoneOffset() * 60000;
    const weekStartStr = new Date(weekStart.getTime() - offset).toISOString().split('T')[0];
    const weekEndStr = new Date(weekEnd.getTime() - offset).toISOString().split('T')[0];

    Object.values(allLogs).forEach(log => {
      const logDate = log.date;
      if (!log.exercises) return;

      let logTotal = 0;
      log.exercises.forEach(ex => {
        if (log.trainingParts && log.trainingParts.includes(ex.part)) {
          logTotal += (Number(ex.sets) * Number(ex.weight));
        }
      });

      if (logDate.startsWith(currentMonth)) {
        monthly += logTotal;
      }
      if (logDate >= weekStartStr && logDate <= weekEndStr) {
        weekly += logTotal;
      }
    });

    const savedTodayLog = allLogs[selectedDate];
    let savedTodayTotal = 0;
    if (savedTodayLog && savedTodayLog.exercises) {
      savedTodayLog.exercises.forEach(ex => {
        if (savedTodayLog.trainingParts && savedTodayLog.trainingParts.includes(ex.part)) {
          savedTodayTotal += (Number(ex.sets) * Number(ex.weight));
        }
      });
    }
    
    const diff = totalDailyWeight - savedTodayTotal;
    
    return { 
      weekly: weekly + diff, 
      monthly: monthly + diff 
    };
  }, [allLogs, selectedDate, totalDailyWeight]);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth error:", error);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    const settingsRef = doc(db, 'artifacts', appId, 'users', user.uid, 'config', 'settings');
    const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        let data = docSnap.data();
        if (!data.parts) data.parts = DEFAULT_SETTINGS.parts;
        if (Array.isArray(data.supplements)) {
          data.supplements = { '未分類': data.supplements };
        }
        if (!data.supplementPeriods) {
          data.supplementPeriods = Object.keys(data.supplements).length > 0 
            ? Object.keys(data.supplements) 
            : DEFAULT_SETTINGS.supplementPeriods;
        }
        if (!data.restTimer) data.restTimer = DEFAULT_SETTINGS.restTimer;
        
        setSettings(data);
        if (!data.parts.includes(settingActivePart)) {
          setSettingActivePart(data.parts[0] || '');
        }
        if (data.supplementPeriods && !data.supplementPeriods.includes(settingActivePeriod)) {
          setSettingActivePeriod(data.supplementPeriods[0] || '');
        }
      } else {
        setDoc(settingsRef, DEFAULT_SETTINGS);
      }
    });
    return () => unsubscribe();
  }, [user, settingActivePart, settingActivePeriod]);

  useEffect(() => {
    if (!user || !db) return;
    setLoading(true);
    const logsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'daily_logs');
    const unsubscribe = onSnapshot(logsRef, (snapshot) => {
      const logsObj = {};
      snapshot.docs.forEach(doc => {
        logsObj[doc.id] = doc.data();
      });
      setAllLogs(logsObj);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (allLogs[selectedDate]) {
      const log = allLogs[selectedDate];
      setTrainingParts(log.trainingParts || []);
      setDailyExercises(log.exercises || []);
      setSupplements(log.supplements || {});
    } else {
      setTrainingParts([]);
      setDailyExercises([]);
      setSupplements({});
    }
    setSaveSuccess(false);
    setIsDirty(false);
  }, [selectedDate, allLogs]);

  useEffect(() => {
    let interval = null;
    if (isTimerRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (isTimerRunning && timeLeft === 0) {
      setIsTimerRunning(false);
      playBeep();
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, timeLeft]);

  useEffect(() => {
    if (!isDirty || !user || !db) return;
    const timer = setTimeout(() => {
      handleSaveLog(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, [isDirty, trainingParts, dailyExercises, supplements]);

  const toggleTrainingPart = (part) => {
    setTrainingParts(prev => {
      if (prev.includes(part)) return prev.filter(p => p !== part);
      return [...prev, part];
    });
    setIsDirty(true);
  };

  const addExercise = (part) => {
    const defaultName = settings.exercises[part]?.[0] || '';
    setDailyExercises(prev => [
      ...prev,
      { id: Date.now().toString(), part, name: defaultName, sets: 0, weight: 0 }
    ]);
    setIsDirty(true);
  };

  const updateExercise = (id, field, value) => {
    setDailyExercises(prev => prev.map(ex => 
      ex.id === id ? { ...ex, [field]: value } : ex
    ));
    setIsDirty(true);
  };

  const removeExercise = (id) => {
    setDailyExercises(prev => prev.filter(ex => ex.id !== id));
    setIsDirty(true);
  };

  const toggleSupplement = (period, supp) => {
    const key = `${period}_${supp}`;
    setSupplements(prev => ({ ...prev, [key]: !prev[key] }));
    setIsDirty(true);
  };

  const handleSaveLog = async (silent = false) => {
    if (!user || !db) return;
    if (!silent) setSaving(true);
    try {
      const filteredExercises = dailyExercises.filter(ex => trainingParts.includes(ex.part));
      const logDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'daily_logs', selectedDate);
      await setDoc(logDocRef, {
        date: selectedDate,
        trainingParts,
        exercises: filteredExercises,
        supplements,
        updatedAt: new Date().toISOString()
      });
      setDailyExercises(filteredExercises);
      setIsDirty(false);
      if (!silent) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (error) {
      console.error("Save error:", error);
    } finally {
      if (!silent) setSaving(false);
    }
  };

  const saveSettingsToDB = async (newSettings) => {
    if (!user || !db) return;
    try {
      const settingsRef = doc(db, 'artifacts', appId, 'users', user.uid, 'config', 'settings');
      await setDoc(settingsRef, newSettings);
    } catch (error) {
      console.error("Settings save error:", error);
    }
  };

  const handleAddPart = () => {
    if (!newPart.trim() || settings.parts.includes(newPart.trim())) return;
    const updated = { ...settings, parts: [...settings.parts, newPart.trim()] };
    saveSettingsToDB(updated);
    setNewPart('');
  };

  const handleRemovePart = (part) => {
    const updatedParts = settings.parts.filter(p => p !== part);
    const updated = { ...settings, parts: updatedParts };
    saveSettingsToDB(updated);
    if (settingActivePart === part) {
      setSettingActivePart(updatedParts[0] || '');
    }
  };

  const handleAddExerciseToSettings = () => {
    if (!newExercise.trim() || !settingActivePart) return;
    const currentList = settings.exercises[settingActivePart] || [];
    if (currentList.includes(newExercise.trim())) return;
    
    const updated = {
      ...settings,
      exercises: { ...settings.exercises, [settingActivePart]: [...currentList, newExercise.trim()] }
    };
    saveSettingsToDB(updated);
    setNewExercise('');
  };

  const handleRemoveExerciseFromSettings = (part, exName) => {
    const updated = {
      ...settings,
      exercises: { ...settings.exercises, [part]: settings.exercises[part].filter(e => e !== exName) }
    };
    saveSettingsToDB(updated);
  };

  const handleAddPeriod = () => {
    if (!newPeriod.trim() || (settings.supplementPeriods || []).includes(newPeriod.trim())) return;
    const updated = {
      ...settings,
      supplementPeriods: [...(settings.supplementPeriods || []), newPeriod.trim()],
      supplements: { ...settings.supplements, [newPeriod.trim()]: [] }
    };
    saveSettingsToDB(updated);
    setNewPeriod('');
  };

  const handleRemovePeriod = (period) => {
    const updatedPeriods = (settings.supplementPeriods || []).filter(p => p !== period);
    const updatedSupplements = { ...settings.supplements };
    delete updatedSupplements[period];
    
    const updated = {
      ...settings,
      supplementPeriods: updatedPeriods,
      supplements: updatedSupplements
    };
    saveSettingsToDB(updated);
    if (settingActivePeriod === period) {
      setSettingActivePeriod(updatedPeriods[0] || '');
    }
  };

  const handleAddSupplement = () => {
    if (!newSupp.trim()) return;
    const currentSuppsInPeriod = settings.supplements[settingActivePeriod] || [];
    if (currentSuppsInPeriod.includes(newSupp.trim())) return;

    const updated = {
      ...settings,
      supplements: { ...settings.supplements, [settingActivePeriod]: [...currentSuppsInPeriod, newSupp.trim()] }
    };
    saveSettingsToDB(updated);
    setNewSupp('');
  };

  const handleRemoveSupplement = (period, suppName) => {
    const updated = {
      ...settings,
      supplements: { ...settings.supplements, [period]: settings.supplements[period].filter(s => s !== suppName) }
    };
    saveSettingsToDB(updated);
  };

  if (!isFirebaseConfigured) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-100 p-6">
        <div className="bg-red-900/20 border border-red-500/50 rounded-2xl p-6 max-w-md w-full shadow-lg">
          <h2 className="text-xl font-bold text-red-400 mb-4 flex items-center gap-2">⚠️ 缺少 Firebase 設定檔</h2>
          <div className="space-y-4 text-sm text-zinc-300 leading-relaxed">
            <p>目前的「白畫面」是因為 React 缺少資料庫連線資訊，導致執行崩潰。</p>
            <p>請在程式碼大約 <strong>第 35 行</strong> 的 <code className="bg-zinc-800 text-emerald-400 px-1.5 py-0.5 rounded">firebaseConfig</code> 變數中填入您的專案金鑰。</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans pb-28">
      {/* --- Header --- */}
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-20 shadow-md">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          {view === 'settings' ? (
            <button onClick={() => setView('main')} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 transition-colors">
              <ArrowLeft size={24} />
            </button>
          ) : <div className="w-10"></div>}
          
          <h1 className="text-xl font-bold text-emerald-400 flex items-center gap-2">
            {view === 'settings' ? <Settings size={22}/> : <Flame size={22} className="text-orange-500"/>}
            {view === 'settings' ? '設定中心' : 'Fitness Tracker'}
          </h1>
          
          {view === 'main' ? (
            <button onClick={() => setView('settings')} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 transition-colors">
              <Settings size={24} />
            </button>
          ) : <div className="w-10"></div>}
        </div>

        {view === 'main' && (
          <div className="max-w-md mx-auto px-4 pb-4 space-y-3">
            <div className="flex items-center justify-between bg-zinc-950 rounded-xl p-2 border border-zinc-800">
              <button onClick={() => changeDate(-1)} className="p-2 hover:bg-zinc-800 rounded-md transition-colors text-zinc-400">
                <ChevronLeft size={20} />
              </button>
              <div className="flex items-center gap-2 font-medium">
                <Calendar size={18} className="text-emerald-500" />
                <span className="tracking-wide">
                  {selectedDate === getTodayString() ? '今天 ' : ''}{selectedDate}
                </span>
              </div>
              <button 
                onClick={() => changeDate(1)}
                className="p-2 hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-30 text-zinc-400"
                disabled={selectedDate === getTodayString()}
              >
                <ChevronRight size={20} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="bg-zinc-800/40 border border-zinc-700/50 rounded-xl p-3 flex flex-col items-center justify-center">
                <span className="text-[10px] text-zinc-400 mb-1 flex items-center gap-1"><Activity size={12}/>今日</span>
                <span className="font-bold text-zinc-100 text-lg leading-none">{totalDailyWeight.toLocaleString()}</span>
              </div>
              <div className="bg-emerald-900/20 border border-emerald-800/30 rounded-xl p-3 flex flex-col items-center justify-center">
                <span className="text-[10px] text-emerald-500 mb-1 flex items-center gap-1"><Target size={12}/>本週</span>
                <span className="font-bold text-emerald-400 text-lg leading-none">{stats.weekly.toLocaleString()}</span>
              </div>
              <div className="bg-blue-900/20 border border-blue-800/30 rounded-xl p-3 flex flex-col items-center justify-center">
                <span className="text-[10px] text-blue-500 mb-1 flex items-center gap-1"><Target size={12}/>本月</span>
                <span className="font-bold text-blue-400 text-lg leading-none">{stats.monthly.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* --- 內容區塊 --- */}
      <main className="max-w-md mx-auto p-4 space-y-6">
        
        {view === 'main' ? (
          <>
            {/* 訓練部位選擇 */}
            <section className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
              <h2 className="text-sm text-zinc-400 font-medium mb-3 flex items-center gap-2">
                <Dumbbell size={16} /> 選擇今日訓練部位
              </h2>
              <div className="flex flex-wrap gap-2">
                {settings.parts.map(part => {
                  const isSelected = trainingParts.includes(part);
                  return (
                    <button
                      key={part}
                      onClick={() => toggleTrainingPart(part)}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-all duration-200 border-2 ${
                        isSelected 
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]' 
                          : 'bg-zinc-950 border-zinc-700/50 text-zinc-400 hover:border-zinc-500'
                      }`}
                    >
                      {part}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 訓練詳細菜單 */}
            {trainingParts.length > 0 && (
              <section className="space-y-4">
                {trainingParts.map(part => {
                  if (part === '休息') return null;
                  const exercisesForPart = dailyExercises.filter(ex => ex.part === part);
                  
                  return (
                    <div key={part} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-800/50">
                        <h3 className="font-bold text-emerald-400 flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                          {part} 菜單
                        </h3>
                        <button 
                          onClick={() => addExercise(part)}
                          className="flex items-center gap-1 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg text-zinc-200 transition-colors"
                        >
                          <Plus size={14} /> 新增動作
                        </button>
                      </div>

                      {exercisesForPart.length === 0 ? (
                        <p className="text-zinc-500 text-sm text-center py-4 bg-zinc-950/30 rounded-xl border border-dashed border-zinc-800">尚未新增動作</p>
                      ) : (
                        <div className="space-y-3">
                          <div className="grid grid-cols-[1fr_4rem_4rem_2rem] gap-2 text-[10px] text-zinc-500 font-medium px-1 uppercase tracking-wider">
                            <div>動作名稱</div>
                            <div className="text-center">組數</div>
                            <div className="text-center">重量</div>
                            <div></div>
                          </div>
                          
                          {exercisesForPart.map(ex => (
                            <div key={ex.id} className="grid grid-cols-[1fr_4rem_4rem_2rem] gap-2 items-center bg-zinc-950/50 p-2 rounded-xl border border-zinc-800/50">
                              <select 
                                value={ex.name}
                                onChange={(e) => updateExercise(ex.id, 'name', e.target.value)}
                                className="bg-zinc-800 text-sm text-zinc-200 rounded-lg p-2 border border-zinc-700 focus:outline-none focus:border-emerald-500"
                              >
                                <option value="" disabled>請選擇</option>
                                {(settings.exercises[part] || []).map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                              
                              <input 
                                type="number" 
                                min="0"
                                value={ex.sets || ''}
                                onChange={(e) => updateExercise(ex.id, 'sets', e.target.value)}
                                className="bg-zinc-800 text-sm text-center text-zinc-200 rounded-lg p-2 border border-zinc-700 focus:outline-none focus:border-emerald-500 w-full font-mono"
                                placeholder="0"
                              />
                              
                              <input 
                                type="number" 
                                min="0"
                                value={ex.weight || ''}
                                onChange={(e) => updateExercise(ex.id, 'weight', e.target.value)}
                                className="bg-zinc-800 text-sm text-center text-zinc-200 rounded-lg p-2 border border-zinc-700 focus:outline-none focus:border-emerald-500 w-full font-mono"
                                placeholder="0"
                              />
                              
                              <button 
                                onClick={() => removeExercise(ex.id)}
                                className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors flex justify-center"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            )}

            {/* 補給品區塊 */}
            <section className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm text-zinc-400 font-medium flex items-center gap-2">
                  <Pill size={16} /> 今日補給清單
                </h2>
              </div>
              
              {Object.keys(settings.supplements || {}).length === 0 || 
               Object.values(settings.supplements).every(arr => arr.length === 0) ? (
                <p className="text-zinc-500 text-sm text-center py-4 bg-zinc-950/30 rounded-xl border border-dashed border-zinc-800">尚未設定補給品，請至後台新增。</p>
              ) : (
                <div className="space-y-4">
                  {Object.entries(settings.supplements).map(([period, supps]) => {
                    if (!supps || supps.length === 0) return null;
                    return (
                      <div key={period} className="bg-zinc-950/50 rounded-xl p-3 border border-zinc-800/50">
                        <div className="text-xs font-bold text-zinc-500 mb-2 flex items-center gap-1">
                          <Clock size={12} /> {period}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {supps.map(supp => {
                            const isChecked = !!supplements[`${period}_${supp}`];
                            return (
                              <button
                                key={supp}
                                onClick={() => toggleSupplement(period, supp)}
                                className={`flex items-center justify-between p-2.5 rounded-lg border transition-all duration-200 ${
                                  isChecked
                                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.1)]'
                                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600'
                                }`}
                              >
                                <span className="text-sm font-medium truncate">{supp}</span>
                                {isChecked && <CheckCircle2 size={16} className="text-blue-500 shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        ) : (
          /* ================= 後台設定 ================= */
          <div className="space-y-6">
            
            {/* 1. 訓練大部位管理 */}
            <section className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="bg-zinc-800/40 p-4 border-b border-zinc-800 flex items-center gap-2">
                <Target size={18} className="text-orange-400"/>
                <h2 className="font-bold">1. 自訂大部位清單</h2>
              </div>
              <div className="p-4 space-y-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newPart}
                    onChange={(e) => setNewPart(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddPart()}
                    placeholder="新增部位 (如：前臂、頸部)..."
                    className="flex-1 bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
                  />
                  <button onClick={handleAddPart} className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">新增</button>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  {settings.parts.map(part => (
                    <div key={part} className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 rounded-lg pl-3 pr-1 py-1 shadow-sm">
                      <span className="text-sm text-zinc-300 font-medium">{part}</span>
                      <button onClick={() => handleRemovePart(part)} className="p-1 text-zinc-500 hover:text-red-400 hover:bg-zinc-700 rounded-md transition-colors"><X size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* 2. 訓練動作管理 */}
            <section className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="bg-zinc-800/40 p-4 border-b border-zinc-800 flex items-center gap-2">
                <Dumbbell size={18} className="text-emerald-400"/>
                <h2 className="font-bold">2. 各部位動作菜單</h2>
              </div>
              <div className="p-4 space-y-4">
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  {settings.parts.map(part => (
                    <button
                      key={part}
                      onClick={() => setSettingActivePart(part)}
                      className={`whitespace-nowrap px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                        settingActivePart === part
                          ? 'bg-emerald-500 text-zinc-950 shadow-md'
                          : 'bg-zinc-950 border border-zinc-800 text-zinc-400 hover:border-zinc-600'
                      }`}
                    >
                      {part}
                    </button>
                  ))}
                </div>
                {settingActivePart ? (
                  <div className="bg-zinc-950/50 rounded-xl p-4 border border-zinc-800/80 space-y-4">
                    <h3 className="text-emerald-400 font-bold text-sm">新增【{settingActivePart}】的動作</h3>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newExercise}
                        onChange={(e) => setNewExercise(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddExerciseToSettings()}
                        placeholder="例如：槓鈴平胸臥推..."
                        className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-emerald-500"
                      />
                      <button onClick={handleAddExerciseToSettings} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">新增</button>
                    </div>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                      {(settings.exercises[settingActivePart] || []).length === 0 && <p className="text-zinc-600 text-sm py-2">目前沒有動作選項。</p>}
                      {(settings.exercises[settingActivePart] || []).map(ex => (
                        <div key={ex} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                          <span className="text-sm text-zinc-200">{ex}</span>
                          <button onClick={() => handleRemoveExerciseFromSettings(settingActivePart, ex)} className="text-zinc-500 hover:text-red-400 p-1.5 hover:bg-zinc-800 rounded-md transition-colors"><Trash2 size={16} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : <p className="text-zinc-500 text-sm">請先在上方建立部位。</p>}
              </div>
            </section>

            {/* 3. 補給品時段管理 */}
            <section className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="bg-zinc-800/40 p-4 border-b border-zinc-800 flex items-center gap-2">
                <Clock size={18} className="text-blue-400"/>
                <h2 className="font-bold">3. 補給品時段管理</h2>
              </div>
              <div className="p-4 space-y-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newPeriod}
                    onChange={(e) => setNewPeriod(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddPeriod()}
                    placeholder="新增時段 (如：下午茶、練前)..."
                    className="flex-1 bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                  />
                  <button onClick={handleAddPeriod} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">新增</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(settings.supplementPeriods || []).map(period => (
                    <div key={period} className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 rounded-lg pl-3 pr-1 py-1 shadow-sm">
                      <span className="text-sm text-zinc-300 font-medium">{period}</span>
                      <button onClick={() => handleRemovePeriod(period)} className="p-1 text-zinc-500 hover:text-red-400 hover:bg-zinc-700 rounded-md transition-colors"><X size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* 4. 分段補給品設定 */}
            <section className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="bg-zinc-800/40 p-4 border-b border-zinc-800 flex items-center gap-2">
                <Pill size={18} className="text-blue-400"/>
                <h2 className="font-bold">4. 分段補給品設定</h2>
              </div>
              <div className="p-4 space-y-4">
                <div className="flex gap-2">
                  <select
                    value={settingActivePeriod}
                    onChange={(e) => setSettingActivePeriod(e.target.value)}
                    className="bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
                  >
                    {(settings.supplementPeriods || []).map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={newSupp}
                    onChange={(e) => setNewSupp(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddSupplement()}
                    placeholder="新增補品名稱..."
                    className="flex-1 bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                  <button onClick={handleAddSupplement} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors shrink-0">新增</button>
                </div>
                <div className="space-y-3">
                  {Object.keys(settings.supplements || {}).map(period => {
                    const supps = settings.supplements[period];
                    if (!supps || supps.length === 0) return null;
                    return (
                      <div key={period} className="bg-zinc-950/50 rounded-xl p-3 border border-zinc-800/50">
                        <div className="text-xs font-bold text-zinc-400 mb-2">{period}</div>
                        <div className="flex flex-wrap gap-2">
                          {supps.map(supp => (
                            <div key={supp} className="flex items-center gap-1 bg-zinc-800 border border-zinc-700 rounded-lg pl-3 pr-1 py-1">
                              <span className="text-sm text-zinc-200">{supp}</span>
                              <button onClick={() => handleRemoveSupplement(period, supp)} className="p-1 text-zinc-500 hover:text-red-400 hover:bg-zinc-700 rounded-md transition-colors"><X size={14} /></button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* 5. 休息計時器設定 */}
            <section className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="bg-zinc-800/40 p-4 border-b border-zinc-800 flex items-center gap-2">
                <Timer size={18} className="text-yellow-400"/>
                <h2 className="font-bold">5. 休息計時器設定</h2>
              </div>
              <div className="p-4 space-y-4">
                <div className="flex items-center gap-4 bg-zinc-950/50 rounded-xl p-3 border border-zinc-800/50">
                  <div className="flex-1">
                    <div className="text-sm font-bold text-zinc-300">預設倒數時間</div>
                    <div className="text-xs text-zinc-500 mt-1">設定您每組動作間常用的休息秒數 (預設60秒)</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      value={settings.restTimer || 60}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (val > 0) saveSettingsToDB({ ...settings, restTimer: val });
                      }}
                      className="w-20 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-center text-sm font-mono text-yellow-400 focus:outline-none focus:border-yellow-500 shadow-inner"
                    />
                    <span className="text-sm text-zinc-500 font-medium">秒</span>
                  </div>
                </div>
              </div>
            </section>

          </div>
        )}
      </main>

      {/* 浮動儲存按鈕 (僅首頁顯示) */}
      {view === 'main' && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-zinc-950 via-zinc-950 to-transparent pointer-events-none z-10">
          <div className="max-w-md mx-auto pointer-events-auto flex gap-3">
            
            <button
              onClick={isTimerRunning ? stopTimer : startTimer}
              className={`h-[60px] rounded-2xl font-bold flex flex-col items-center justify-center transition-all shadow-lg shrink-0 overflow-hidden relative ${
                isTimerRunning
                  ? 'w-[80px] bg-zinc-900 border-2 border-yellow-500/50 text-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.2)]'
                  : 'w-[60px] bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:bg-zinc-700'
              }`}
            >
              {isTimerRunning ? (
                <span className="text-lg font-mono tracking-wider">{formatTime(timeLeft)}</span>
              ) : (
                <Timer size={24} />
              )}
            </button>

            <button
              onClick={() => handleSaveLog(false)}
              disabled={saving || (!isDirty && saveSuccess)}
              className={`flex-1 h-[60px] rounded-2xl font-black text-lg flex items-center justify-center gap-2 transition-all duration-300 shadow-xl ${
                saveSuccess && !isDirty
                  ? 'bg-emerald-400 text-zinc-950 shadow-[0_0_30px_rgba(52,211,153,0.5)]'
                  : isDirty
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95'
                  : 'bg-zinc-800 text-emerald-500 border border-zinc-700'
              }`}
            >
              {saving ? (
                <Loader2 className="animate-spin" size={24} />
              ) : saveSuccess && !isDirty ? (
                <>
                  <CheckCircle2 size={24} />
                  儲存成功！
                </>
              ) : isDirty ? (
                <>
                  <Save size={24} />
                  手動儲存
                </>
              ) : (
                <>
                  <CheckCircle2 size={24} />
                  資料已自動同步
                </>
              )}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
