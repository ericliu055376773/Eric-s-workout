import React, { useState, useEffect, useMemo } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Dumbbell, 
  Pill, 
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
  Timer,
  Weight,
  TrendingUp,
  TrendingDown,
  History,
  Minus,
  Save // 加入了之前遺漏的 Save 圖示
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
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceLine 
} from 'recharts';

// --- Firebase 初始化 ---
const firebaseConfig = {
  apiKey: 'AIzaSyA6uB6guqyv1DZI51AzmQ3plXdOFEkHRm0',
  authDomain: 'ertic-workout.firebaseapp.com',
  projectId: 'ertic-workout',
  storageBucket: 'ertic-workout.firebasestorage.app',
  messagingSenderId: '555462032713',
  appId: '1:555462032713:web:20160aa28994dfa443ae98'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const firestoreAppId = 'fitness-tracker-app-v3';

// 預設設定資料
const DEFAULT_SETTINGS = {
  parts: ['胸', '背', '腿', '肩', '手', '核心', '有氧', '休息'],
  restTimer: 60,
  targetWeight: 70, 
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
  const [view, setView] = useState('main'); 
  
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [allLogs, setAllLogs] = useState({});
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  
  const [trainingParts, setTrainingParts] = useState([]);
  const [dailyExercises, setDailyExercises] = useState([]);
  const [supplements, setSupplements] = useState({});
  const [dailyWeight, setDailyWeight] = useState(''); 
  
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isDirty, setIsDirty] = useState(false); 

  const [timeLeft, setTimeLeft] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  const [newPart, setNewPart] = useState('');
  const [settingActivePart, setSettingActivePart] = useState('胸');
  const [newExercise, setNewExercise] = useState('');
  
  const [newPeriod, setNewPeriod] = useState('');
  const [settingActivePeriod, setSettingActivePeriod] = useState('起床');
  const [newSupp, setNewSupp] = useState('');

  const [analysisPart, setAnalysisPart] = useState('胸');

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

  // --- 統計分析邏輯 ---

  // 1. 各部位近期的總重量 (用於訓練分析底部的卡片)
  const latestPartsVolume = useMemo(() => {
    const result = {};
    const sortedDates = Object.keys(allLogs).sort((a, b) => b.localeCompare(a));
    
    settings.parts.forEach(part => {
      if (part === '休息') return;
      let found = false;
      
      // 先找當前畫面是否有輸入 (優先顯示今天目前的數據)
      if (trainingParts.includes(part)) {
        const currentVol = dailyExercises
          .filter(e => e.part === part)
          .reduce((sum, e) => sum + (Number(e.sets) * Number(e.weight)), 0);
          
        if (currentVol > 0) {
          result[part] = { date: selectedDate, volume: currentVol };
          found = true;
        }
      }
      
      // 畫面上沒有，往歷史紀錄找
      if (!found) {
        for (const date of sortedDates) {
          const log = allLogs[date];
          if (log.trainingParts?.includes(part)) {
            const vol = log.exercises
              ?.filter(e => e.part === part)
              .reduce((sum, e) => sum + (Number(e.sets) * Number(e.weight)), 0) || 0;
            if (vol > 0) {
              result[part] = { date, volume: vol };
              break;
            }
          }
        }
      }
    });
    return result;
  }, [allLogs, settings.parts, trainingParts, dailyExercises, selectedDate]);

  // 2. 獲取每個動作「上次」的紀錄 (用於首頁動態顯示進步狀態)
  const previousExercisesRecords = useMemo(() => {
    const records = {};
    // 只找 selectedDate "之前" 的紀錄
    const sortedDates = Object.keys(allLogs)
      .filter(d => d < selectedDate)
      .sort((a, b) => b.localeCompare(a));

    for (const date of sortedDates) {
      const log = allLogs[date];
      if (!log.exercises) continue;
      
      log.exercises.forEach(ex => {
        const key = `${ex.part}_${ex.name}`;
        // 如果這個動作還沒有被記錄到，就把這天（最接近的一次）的紀錄存起來
        if (!records[key]) {
          records[key] = {
            date,
            sets: ex.sets,
            weight: ex.weight,
            volume: Number(ex.sets) * Number(ex.weight)
          };
        }
      });
    }
    return records;
  }, [allLogs, selectedDate]);

  // 3. 體重圖表分析
  const weightAnalytics = useMemo(() => {
    const data = [];
    Object.keys(allLogs).forEach(date => {
      if (allLogs[date].weight) {
        data.push({
          date: date.substring(5), 
          fullDate: date,
          weight: Number(allLogs[date].weight)
        });
      }
    });
    
    data.sort((a, b) => a.fullDate.localeCompare(b.fullDate));

    if (data.length === 0) return { data: [], latest: 0, highest: 0, lowest: 0 };

    const weights = data.map(d => d.weight);
    const latest = weights[weights.length - 1];
    const highest = Math.max(...weights);
    const lowest = Math.min(...weights);

    return { data, latest, highest, lowest };
  }, [allLogs]);

  // 4. 部位訓練總量比較 (用於訓練分析的頂部卡片)
  const partAnalytics = useMemo(() => {
    const logsList = Object.values(allLogs)
      .sort((a, b) => b.date.localeCompare(a.date)); 

    let currentLog = null;
    let previousLog = null;

    for (const log of logsList) {
      if (log.trainingParts && log.trainingParts.includes(analysisPart) && log.exercises) {
        if (!currentLog) {
          currentLog = log;
        } else if (!previousLog) {
          previousLog = log;
          break; 
        }
      }
    }

    const calcVolume = (log, part) => {
      if (!log || !log.exercises) return 0;
      return log.exercises
        .filter(ex => ex.part === part)
        .reduce((sum, ex) => sum + (Number(ex.sets) * Number(ex.weight)), 0);
    };

    const currentVolume = calcVolume(currentLog, analysisPart);
    const previousVolume = calcVolume(previousLog, analysisPart);

    let actualCurrentVolume = currentVolume;
    let actualCurrentDate = currentLog ? currentLog.date : '--';
    
    const todayLogTempVolume = dailyExercises
      .filter(ex => ex.part === analysisPart && trainingParts.includes(analysisPart))
      .reduce((sum, ex) => sum + (Number(ex.sets) * Number(ex.weight)), 0);

    if (trainingParts.includes(analysisPart) && todayLogTempVolume > 0 && selectedDate >= (currentLog?.date || '')) {
       actualCurrentVolume = todayLogTempVolume;
       actualCurrentDate = selectedDate;
       if (selectedDate !== currentLog?.date) {
         previousLog = currentLog;
       }
    }

    const actualPreviousVolume = calcVolume(previousLog, analysisPart);
    const actualPreviousDate = previousLog ? previousLog.date : '--';

    const diff = actualCurrentVolume - actualPreviousVolume;
    const isIncrease = diff > 0;
    const isDecrease = diff < 0;

    return {
      current: { volume: actualCurrentVolume, date: actualCurrentDate },
      previous: { volume: actualPreviousVolume, date: actualPreviousDate },
      diff: Math.abs(diff),
      isIncrease,
      isDecrease
    };
  }, [allLogs, analysisPart, dailyExercises, trainingParts, selectedDate]);

  // --- Firebase Effects ---

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
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
    const settingsRef = doc(db, 'artifacts', firestoreAppId, 'users', user.uid, 'config', 'settings');
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
        if (!data.parts.includes(analysisPart)) {
          setAnalysisPart(data.parts[0] || '');
        }
      } else {
        setDoc(settingsRef, DEFAULT_SETTINGS);
      }
    });
    return () => unsubscribe();
  }, [user, settingActivePart, settingActivePeriod, analysisPart]);

  useEffect(() => {
    if (!user || !db) return;
    setLoading(true);
    const logsRef = collection(db, 'artifacts', firestoreAppId, 'users', user.uid, 'daily_logs');
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
      setDailyWeight(log.weight || ''); 
    } else {
      setTrainingParts([]);
      setDailyExercises([]);
      setSupplements({});
      setDailyWeight(''); 
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

  // --- 自動儲存防呆機制 ---
  useEffect(() => {
    if (!isDirty || !user || !db) return;
    const timer = setTimeout(() => {
      handleSaveLog(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, [isDirty, trainingParts, dailyExercises, supplements, dailyWeight]);

  // --- 操作處理 ---
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
      const logDocRef = doc(db, 'artifacts', firestoreAppId, 'users', user.uid, 'daily_logs', selectedDate);
      await setDoc(logDocRef, {
        date: selectedDate,
        trainingParts,
        exercises: filteredExercises,
        supplements,
        weight: dailyWeight, 
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
      const settingsRef = doc(db, 'artifacts', firestoreAppId, 'users', user.uid, 'config', 'settings');
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
          <div className="flex gap-2">
            {view === 'main' ? (
              <>
                <button onClick={() => setView('trainingAnalytics')} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-emerald-400 transition-colors">
                  <Activity size={24} />
                </button>
                <button onClick={() => setView('weightAnalytics')} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-pink-400 transition-colors">
                  <TrendingUp size={24} />
                </button>
              </>
            ) : (
              <button onClick={() => setView('main')} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 transition-colors">
                <ArrowLeft size={24} />
              </button>
            )}
          </div>
          
          <h1 className="text-xl font-bold text-emerald-400 flex items-center gap-2">
            {view === 'settings' ? <Settings size={22}/> : view === 'weightAnalytics' ? <TrendingUp size={22} className="text-pink-500"/> : view === 'trainingAnalytics' ? <Activity size={22} className="text-emerald-500"/> : <Flame size={22} className="text-orange-500"/>}
            {view === 'settings' ? '設定中心' : view === 'weightAnalytics' ? '體重分析' : view === 'trainingAnalytics' ? '訓練分析' : 'Fitness Tracker'}
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
          </div>
        )}
      </header>

      {/* --- Main Content --- */}
      <main className="max-w-md mx-auto p-4 space-y-6">
        
        {view === 'main' ? (
          <>
            {/* Training Parts Selection */}
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

            {/* Exercise Menus */}
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
                          
                          {exercisesForPart.map(ex => {
                            // 計算並比對進步狀態
                            const prevRecord = previousExercisesRecords[`${part}_${ex.name}`];
                            const currentVolume = Number(ex.sets || 0) * Number(ex.weight || 0);
                            
                            let progressStatus = null; 
                            let diff = 0;
                            if (prevRecord && currentVolume > 0) {
                              diff = currentVolume - prevRecord.volume;
                              if (diff > 0) progressStatus = 'up';
                              else if (diff < 0) progressStatus = 'down';
                              else progressStatus = 'same';
                            }

                            return (
                              <div key={ex.id} className="bg-zinc-950/50 p-2.5 rounded-xl border border-zinc-800/50 space-y-3">
                                <div className="grid grid-cols-[1fr_4rem_4rem_2rem] gap-2 items-center">
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

                                {/* 上次紀錄與進步狀態顯示 */}
                                <div className="bg-zinc-900/80 rounded-lg p-2 text-[11px] flex justify-between items-center border border-zinc-800/50">
                                  {prevRecord ? (
                                    <div className="flex items-center gap-1.5 text-zinc-400">
                                      <History size={12} className="text-zinc-500" />
                                      <span>上次 ({prevRecord.date.substring(5)}): {prevRecord.sets}組 x {prevRecord.weight}kg</span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1.5 text-zinc-600">
                                      <History size={12} />
                                      <span>無歷史紀錄</span>
                                    </div>
                                  )}
                                  
                                  {progressStatus === 'up' && (
                                    <div className="flex items-center gap-1 text-yellow-400 font-bold bg-yellow-400/10 px-2 py-0.5 rounded-full">
                                      <TrendingUp size={12} /> 進步 {diff}kg
                                    </div>
                                  )}
                                  {progressStatus === 'down' && (
                                    <div className="flex items-center gap-1 text-red-400 font-bold bg-red-400/10 px-2 py-0.5 rounded-full">
                                      <TrendingDown size={12} /> 退步 {Math.abs(diff)}kg
                                    </div>
                                  )}
                                  {progressStatus === 'same' && (
                                    <div className="flex items-center gap-1 text-zinc-500 font-bold bg-zinc-800 px-2 py-0.5 rounded-full">
                                      <Minus size={12} /> 持平
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            )}

            {/* Supplements List */}
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

            {/* Daily Weight Tracker */}
            <section className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-pink-500/10 rounded-lg">
                  <Weight className="text-pink-400" size={20} />
                </div>
                <div>
                  <h2 className="text-sm text-zinc-300 font-bold">今日體重</h2>
                  {settings.targetWeight && (
                    <p className="text-[10px] text-zinc-500 mt-0.5">目標: {settings.targetWeight} kg</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={dailyWeight}
                  onChange={(e) => {
                    setDailyWeight(e.target.value);
                    setIsDirty(true);
                  }}
                  placeholder="0.0"
                  className="w-24 bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-right text-lg font-bold text-pink-400 focus:outline-none focus:border-pink-500 transition-colors shadow-inner"
                />
                <span className="text-sm font-medium text-zinc-500">kg</span>
              </div>
            </section>

          </>
        ) : view === 'trainingAnalytics' ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="text-emerald-400" size={20} />
                <h2 className="font-bold text-zinc-100">部位重量分析</h2>
              </div>

              <div className="mb-6">
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  {settings.parts.map(part => {
                    if (part === '休息') return null;
                    return (
                      <button
                        key={part}
                        onClick={() => setAnalysisPart(part)}
                        className={`whitespace-nowrap px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                          analysisPart === part
                            ? 'bg-emerald-500 text-zinc-950 shadow-md'
                            : 'bg-zinc-950 border border-zinc-800 text-zinc-400 hover:border-zinc-600'
                        }`}
                      >
                        {part}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-zinc-950/50 rounded-xl border border-zinc-800 p-4 space-y-4">
                <h3 className="text-sm text-zinc-400 text-center font-medium">【{analysisPart}】訓練總量比較</h3>
                
                <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
                  <div className="text-center bg-zinc-900 rounded-lg p-3 border border-zinc-800">
                    <div className="text-[10px] text-zinc-500 mb-1">上次紀錄 ({partAnalytics.previous.date})</div>
                    <div className="text-xl font-bold text-zinc-300">{partAnalytics.previous.volume.toLocaleString()}</div>
                  </div>
                  
                  <div className="text-zinc-600">
                    <ArrowLeft size={20} className="rotate-180" />
                  </div>

                  <div className="text-center bg-zinc-900 rounded-lg p-3 border border-emerald-500/30">
                    <div className="text-[10px] text-emerald-500 mb-1">最新紀錄 ({partAnalytics.current.date})</div>
                    <div className="text-xl font-bold text-emerald-400">{partAnalytics.current.volume.toLocaleString()}</div>
                  </div>
                </div>

                <div className="pt-2 flex justify-center">
                   {partAnalytics.current.date === '--' && partAnalytics.previous.date === '--' ? (
                     <span className="text-sm text-zinc-500">尚無訓練紀錄</span>
                   ) : partAnalytics.isIncrease ? (
                     <div className="flex items-center gap-1 text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-full text-sm font-medium">
                       <TrendingUp size={16} /> 進步了 {partAnalytics.diff.toLocaleString()} kg!
                     </div>
                   ) : partAnalytics.isDecrease ? (
                     <div className="flex items-center gap-1 text-red-400 bg-red-400/10 px-3 py-1 rounded-full text-sm font-medium">
                       <TrendingDown size={16} /> 退步了 {partAnalytics.diff.toLocaleString()} kg
                     </div>
                   ) : (
                     <div className="flex items-center gap-1 text-zinc-400 bg-zinc-800 px-3 py-1 rounded-full text-sm font-medium">
                       <Minus size={16} /> 持平
                     </div>
                   )}
                </div>
              </div>
            </section>

            {/* 各部位近期重量總覽 (取代原本的週/月總重量) */}
            <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-sm">
              <h3 className="font-bold text-zinc-100 mb-4 flex items-center gap-2">
                <History size={18} className="text-zinc-400" /> 各部位近期重量紀錄
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {settings.parts.map(part => {
                  if (part === '休息') return null;
                  const record = latestPartsVolume[part];
                  return (
                    <div key={part} className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 flex flex-col justify-center">
                      <span className="text-xs text-zinc-400 mb-1 flex items-center justify-between">
                        {part}
                        <span className="text-[10px] text-zinc-600">{record ? record.date.substring(5) : '--'}</span>
                      </span>
                      <span className="font-bold text-zinc-200 text-xl leading-none">
                        {record ? record.volume.toLocaleString() : 0} <span className="text-xs font-medium text-zinc-500">kg</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        ) : view === 'weightAnalytics' ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <TrendingUp className="text-pink-400" size={20} />
                <h2 className="font-bold text-zinc-100">體重趨勢分析</h2>
              </div>
              
              {weightAnalytics.data.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 text-sm bg-zinc-950/50 rounded-xl border border-dashed border-zinc-800">
                  <Weight className="mx-auto mb-2 opacity-50" size={32} />
                  目前還沒有任何體重紀錄喔！<br/>回到首頁輸入體重開始追蹤。
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="bg-zinc-950/50 p-3 rounded-xl border border-zinc-800">
                      <div className="text-xs text-zinc-500 mb-1">最新體重</div>
                      <div className="text-xl font-bold text-pink-400">{weightAnalytics.latest} kg</div>
                    </div>
                    <div className="bg-zinc-950/50 p-3 rounded-xl border border-zinc-800">
                      <div className="text-xs text-zinc-500 mb-1">距離目標 ({settings.targetWeight}kg)</div>
                      <div className="text-xl font-bold text-zinc-200">
                        {settings.targetWeight ? (
                          (weightAnalytics.latest - settings.targetWeight) > 0 
                            ? `+${(weightAnalytics.latest - settings.targetWeight).toFixed(1)} kg`
                            : `${(weightAnalytics.latest - settings.targetWeight).toFixed(1)} kg`
                        ) : '--'}
                      </div>
                    </div>
                    <div className="bg-zinc-950/50 p-3 rounded-xl border border-zinc-800">
                      <div className="text-xs text-zinc-500 mb-1">歷史最高</div>
                      <div className="text-lg font-bold text-zinc-300">{weightAnalytics.highest} kg</div>
                    </div>
                    <div className="bg-zinc-950/50 p-3 rounded-xl border border-zinc-800">
                      <div className="text-xs text-zinc-500 mb-1">歷史最低</div>
                      <div className="text-lg font-bold text-zinc-300">{weightAnalytics.lowest} kg</div>
                    </div>
                  </div>

                  {weightAnalytics.data.length >= 2 ? (
                    <div className="h-64 w-full bg-zinc-950/80 p-4 rounded-xl border border-zinc-800 pt-8">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={weightAnalytics.data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                          <XAxis dataKey="date" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                          <YAxis domain={['dataMin - 1', 'dataMax + 1']} stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} width={30} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                            itemStyle={{ color: '#f472b6' }}
                          />
                          {settings.targetWeight && (
                            <ReferenceLine y={settings.targetWeight} stroke="#10b981" strokeDasharray="3 3" label={{ position: 'top', value: '目標', fill: '#10b981', fontSize: 10 }} />
                          )}
                          <Line type="monotone" dataKey="weight" stroke="#f472b6" strokeWidth={3} dot={{ fill: '#f472b6', strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-zinc-500 text-xs bg-zinc-950/50 rounded-xl border border-zinc-800">
                      需要至少兩天的體重紀錄才能繪製趨勢線喔！
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        ) : (
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

            {/* 6. 目標體重設定 */}
            <section className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="bg-zinc-800/40 p-4 border-b border-zinc-800 flex items-center gap-2">
                <Weight size={18} className="text-pink-400"/>
                <h2 className="font-bold">6. 目標體重設定</h2>
              </div>
              <div className="p-4 space-y-4">
                <div className="flex items-center gap-4 bg-zinc-950/50 rounded-xl p-3 border border-zinc-800/50">
                  <div className="flex-1">
                    <div className="text-sm font-bold text-zinc-300">設定目標體重</div>
                    <div className="text-xs text-zinc-500 mt-1">設定後會顯示在首頁的體重紀錄旁</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={settings.targetWeight || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        saveSettingsToDB({ ...settings, targetWeight: val ? Number(val) : '' });
                      }}
                      className="w-20 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-center text-sm font-mono text-pink-400 focus:outline-none focus:border-pink-500 shadow-inner"
                    />
                    <span className="text-sm text-zinc-500 font-medium">kg</span>
                  </div>
                </div>
              </div>
            </section>

          </div>
        )}
      </main>

      {/* Floating Save Button (Only visible on main page) */}
      {view === 'main' && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-zinc-950 via-zinc-950 to-transparent pointer-events-none z-10">
          <div className="max-w-md mx-auto pointer-events-auto flex gap-3">
            
            <button
              onClick={isTimerRunning ? stopTimer : startTimer}
              className={`flex-1 h-[60px] rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg overflow-hidden relative ${
                isTimerRunning
                  ? 'bg-zinc-900 border-2 border-yellow-500/50 text-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.2)]'
                  : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:bg-zinc-700'
              }`}
            >
              <Timer size={24} />
              {isTimerRunning ? (
                <span className="text-xl font-mono tracking-wider">{formatTime(timeLeft)}</span>
              ) : (
                <span className="text-lg">計時器</span>
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
                  已同步
                </>
              ) : isDirty ? (
                <>
                  <Save size={24} />
                  未同步
                </>
              ) : (
                <>
                  <CheckCircle2 size={24} />
                  已同步
                </>
              )}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
