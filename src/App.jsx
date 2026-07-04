import React, { useEffect, useState } from 'react';
import { vctTeamsData } from './vctData';

const championHistorySeed = [];
const HALL_OF_FAME_STORAGE_KEY = 'gaffer-hall-of-fame';

const readHallOfFameFromStorage = () => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HALL_OF_FAME_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const writeHallOfFameToStorage = (entries) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HALL_OF_FAME_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore storage write errors
  }
};

const getTeamOVR = (teamName, fallbackOvr = 0) => {
  const roster = vctTeamsData[teamName]?.roster || [];
  if (!roster.length) return fallbackOvr;
  const total = roster.reduce((sum, player) => sum + player.ovr, 0);
  return Math.round(total / roster.length);
};

const buildHallOfFameEntries = (extraEntries = []) => {
  const mergedEntries = [...championHistorySeed, ...extraEntries].map((entry) => ({
    ...entry,
    ovr: getTeamOVR(entry.team, entry.ovr || 0),
  }));

  const uniqueEntries = mergedEntries.reduce((acc, entry) => {
    const existing = acc.find((item) => item.team === entry.team);
    if (existing) {
      existing.titles += entry.titles || 1;
      existing.title = entry.title || existing.title;
      existing.region = entry.region || existing.region;
      existing.ovr = Math.max(existing.ovr, entry.ovr || 0);
      return acc;
    }

    acc.push({ ...entry, titles: entry.titles || 1 });
    return acc;
  }, []);

  return uniqueEntries
    .sort((a, b) => b.titles - a.titles || b.ovr - a.ovr || a.team.localeCompare(b.team))
    .slice(0, 5)
    .map((entry, index) => ({ rank: index + 1, ...entry }));
};

function App() {
  // --- STATE UTAMA ---
  const [teamName, setTeamName] = useState('');
  const [isTeamNameSet, setIsTeamNameSet] = useState(false);
  const [currentScreen, setCurrentScreen] = useState('menu'); 
  const [mySquad, setMySquad] = useState([]);
  const [currentDrawnTeam, setCurrentDrawnTeam] = useState(null);
  
  // --- STATE ANIMASI AUTO-ROLL ---
  const [isRolling, setIsRolling] = useState(false);
  const [rollDisplayTeam, setRollDisplayTeam] = useState('ROSTER INCOMING...');

  // --- STATE SIMULASI MATCH & TOURNAMENT ---
  const [matchStatus, setMatchStatus] = useState('idle'); 
  const [tournament, setTournament] = useState(null);
  const [enemyTeam, setEnemyTeam] = useState(null);
  const [myScore, setMyScore] = useState(0);
  const [enemyScore, setEnemyScore] = useState(0);
  const [liveCommentary, setLiveCommentary] = useState('');
  const [matchLogs, setMatchLogs] = useState([]);
  const [isOvertime, setIsOvertime] = useState(false);

  // --- DATA RIWAYAT JUARA (HALL OF FAME) ---
  const [hallOfFameData, setHallOfFameData] = useState(() => buildHallOfFameEntries());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');

  // Filter Skuad
  const squadPlayers = mySquad.filter(member => member.role !== "Coach");
  const squadCoach = mySquad.find(member => member.role === "Coach");
  const isCoachFilled = !!squadCoach;
  const totalSquadCount = mySquad.length;
  const isLastPick = totalSquadCount === 5;

  const calculateOVR = (squadArray) => {
    if (squadArray.length === 0) return 0;
    const total = squadArray.reduce((acc, curr) => acc + curr.ovr, 0);
    return Math.round(total / squadArray.length);
  };
  const myOVR = calculateOVR(mySquad);

  const loadHallOfFame = async () => {
    const storageEntries = readHallOfFameFromStorage();
    if (storageEntries.length) {
      setHallOfFameData(buildHallOfFameEntries(storageEntries));
    } else {
      setHallOfFameData(buildHallOfFameEntries());
    }

    setIsSyncing(true);
    setSyncError('');

    try {
      const response = await fetch('/api/hall-of-fame');
      if (!response.ok) {
        throw new Error('Failed to load Hall of Fame from API');
      }

      const data = await response.json();
      if (Array.isArray(data) && data.length) {
        const mappedData = data.map((entry, index) => ({ rank: index + 1, ...entry }));
        writeHallOfFameToStorage(mappedData.map(({ rank, ...rest }) => rest));
        setHallOfFameData(mappedData);
      }
    } catch {
      if (!storageEntries.length) {
        setSyncError('Belum ada data hall of fame di server.');
      }
    }

    setIsSyncing(false);
  };

  const registerChampionToHallOfFame = async (championName, championRegion, championTitle = 'World Champion', championOvr = 0) => {
    setHallOfFameData((prev) => {
      const nextEntries = prev.map(({ rank, ...rest }) => rest);
      const existingIndex = nextEntries.findIndex((entry) => entry.team === championName);

      if (existingIndex >= 0) {
        nextEntries[existingIndex] = {
          ...nextEntries[existingIndex],
          region: championRegion || nextEntries[existingIndex].region,
          title: championTitle,
          titles: nextEntries[existingIndex].titles + 1,
          ovr: Math.max(nextEntries[existingIndex].ovr, championOvr),
        };
      } else {
        nextEntries.push({
          team: championName,
          region: championRegion,
          title: championTitle,
          titles: 1,
          ovr: championOvr,
        });
      }

      writeHallOfFameToStorage(nextEntries);
      return buildHallOfFameEntries(nextEntries);
    });

    setIsSyncing(true);
    try {
      const response = await fetch('/api/hall-of-fame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team: championName,
          region: championRegion,
          title: championTitle,
          titles: 1,
          ovr: championOvr,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to sync champion');
      }
    } catch {
      setSyncError('Gagal memperbarui hall of fame.');
    }

    await loadHallOfFame();
    setIsSyncing(false);
  };

  const executeRoll = () => {
    const teamNames = Object.keys(vctTeamsData);
    const randomIndex = Math.floor(Math.random() * teamNames.length);
    const selectedTeamName = teamNames[randomIndex];
    setCurrentDrawnTeam({ name: selectedTeamName, ...vctTeamsData[selectedTeamName] });
    setIsRolling(false);
  };

  const drawRandomTeam = () => {
    setIsRolling(true);
    let counter = 0;
    const teamNames = Object.keys(vctTeamsData);
    const interval = setInterval(() => {
      setRollDisplayTeam(teamNames[Math.floor(Math.random() * teamNames.length)]);
      counter++;
      if (counter > 6) {
        clearInterval(interval);
        executeRoll();
      }
    }, 100);
  };

  const selectMember = (member) => {
    if (totalSquadCount >= 6) return;
    const updatedSquad = [...mySquad, { ...member, originalTeam: currentDrawnTeam.name }];
    setMySquad(updatedSquad);
    setCurrentDrawnTeam(null);

    if (updatedSquad.length < 6) {
      setIsRolling(true);
      let counter = 0;
      const teamNames = Object.keys(vctTeamsData);
      
      const interval = setInterval(() => {
        setRollDisplayTeam(teamNames[Math.floor(Math.random() * teamNames.length)]);
        counter++;
        if (counter > 7) {
          clearInterval(interval);
          const randomIndex = Math.floor(Math.random() * teamNames.length);
          const selectedTeamName = teamNames[randomIndex];
          setCurrentDrawnTeam({ name: selectedTeamName, ...vctTeamsData[selectedTeamName] });
          setIsRolling(false);
        }
      }, 90);
    }
  };

  // ==========================================
  // TOURNAMENT ENGINE
  // ==========================================
  
  const initTournamentBracket = () => {
    const allTeamKeys = Object.keys(vctTeamsData);
    const shuffledKeys = allTeamKeys.sort(() => 0.5 - Math.random());
    const selectedEnemies = shuffledKeys.slice(0, 15).map(key => ({
      id: key,
      name: key,
      ovr: calculateOVR(vctTeamsData[key].roster),
      roster: vctTeamsData[key].roster,
      isUser: false
    }));

    const userTeamData = {
      id: 'user',
      name: teamName,
      ovr: myOVR,
      roster: mySquad,
      isUser: true
    };

    const top16 = [userTeamData, ...selectedEnemies];
    const bracketTeams = top16.sort(() => 0.5 - Math.random());

    const matchups = [];
    for(let i = 0; i < 8; i++) {
      matchups.push({ t1: bracketTeams[i*2], t2: bracketTeams[i*2+1] });
    }

    setTournament({ stage: 'RO16', matchups, champion: null });
    setMatchStatus('bracket');
  };

  const startBracketMatch = () => {
    const userMatch = tournament.matchups.find(m => m.t1.isUser || m.t2.isUser);
    const enemy = userMatch.t1.isUser ? userMatch.t2 : userMatch.t1;
    
    setEnemyTeam(enemy);
    setMyScore(0);
    setEnemyScore(0);
    setIsOvertime(false);
    setMatchLogs([]);
    setLiveCommentary(`⚔️ Server aktif! Timmu berhadapan dengan ${enemy.name}...`);
    setMatchStatus('ready');
  };

  const startMatchSimulation = () => {
    setMatchStatus('simulating');
    let mScore = 0;
    let eScore = 0;
    let currentRound = 1;
    let intervalDuration = 900;
    
    const enemyOVR = enemyTeam.ovr;
    const myWinChance = 0.5 + (myOVR - enemyOVR) * 0.02; 

    // --- BANK DATA 50 KOSAKATA KOMENTATOR TAKTIS ---
    const userCommentaries = [
      "melakukan entry frag gila dengan Jett dash melewati smoke",
      "berhasil mengamankan 3k kill bersih saat musuh mencoba push site",
      "menggagalkan defuse musuh di detik terakhir berkat lineup utility yang presisi",
      "membaca pergerakan flank musuh dan memenangkan duel krusial",
      "menjatuhkan duelists musuh dengan headshot tapping Odin yang tidak terduga",
      "memperlihatkan rotasi super cepat, mengecoh pertahanan musuh",
      "melakukan retake tajam bersama tim, mengamankan site dalam hitungan detik",
      "memenangkan duel 1v2 kopong tanpa armor! Clutch luar biasa",
      "mengamankan poin berharga lewat strategi anti-eco yang sangat disiplin",
      "berhasil mencuri senjata Vandal musuh dan meratakan sisa pemain lawan",
      "melancarkan spray transfer gila, menumbangkan dua pemain sekaligus",
      "menutup pergerakan musuh dengan utility slow dan molly yang on-point",
      "melakukan wallbang tak masuk akal menembus smoke pertahanan lawan",
      "menghukum kesalahan rotasi musuh dengan ambush senyap dari belakang",
      "menembak jatuh operator musuh dari sudut tersulit, membuka ruang gerak",
      "mengamankan spike plant di detik-detik kritis di bawah tekanan waktu",
      "memimpin eksekusi site A yang sangat rapi dan tanpa cela",
      "membuat momentum bangkit setelah memenangkan situasi eco round (Thrifted)",
      "memotong rotasi musuh di area mid dengan timing yang luar biasa sempurna",
      "menunjukkan mekanik aim kelas dunia, menyapu bersih lini belakang musuh",
      "membaca trik tipuan musuh, posisi site berhasil dipertahankan penuh",
      "melancarkan counter-strat instan yang membuat musuh kebingungan",
      "mendapatkan trade-kill cepat sehingga keunggulan jumlah pemain tetap terjaga",
      "menggunakan ultimate-nya dengan eksekusi sempurna untuk memecah formasi musuh",
      "memaksa musuh melakukan kesalahan fatal berkat koordinasi crosshair placement"
    ];

    const enemyCommentaries = [
      "menembus pertahanan kita dengan eksekusi line-up utilitas yang mematikan",
      "mengamankan entry frag cepat menggunakan Operator dari jarak jauh",
      "melakukan flank senyap tanpa terdeteksi radar, merusak lini belakang kita",
      "berhasil melakukan defuse spike di tengah kepungan smoke yang tebal",
      "memenangkan duel aim murni di area mid dan membuka celah formasi",
      "menghukum rotasi kita yang terlalu lambat dan langsung mengunci site seberang",
      "memperlihatkan koordinasi retake yang sangat rapi dan sulit dibendung",
      "melakukan clutch 1v3 yang mustahil dengan sisa HP sangat tipis",
      "membaca pergerakan kita dan melakukan jiggle peek yang sangat menyebalkan",
      "berhasil menumbangkan pemegang spike kita sebelum sempat melakukan plant",
      "memanfaatkan keunggulan buy-round untuk menekan ekonomi tim kita",
      "menggagalkan eksekusi site kita menggunakan ultimate utilitas pertahanan area",
      "melakukan spray transfer bersih yang meruntuhkan skema push bersama",
      "menjebak tim kita dalam crossfire jebakan yang sudah mereka siapkan sejak awal",
      "mendapatkan blind-kill sempurna memanfaatkan flash buta ke arah tim kita",
      "memaksa tim kita melakukan save senjata setelah mendominasi jalannya ronde",
      "menutup ruang gerak kita di choke point dengan smoke pertahanan berlapis",
      "memotong jalur escape kita dengan koordinasi utility molly yang membakar site",
      "memenangkan duel krusial pembuka ronde yang merusak mental bermain tim",
      "membalikkan keadaan dari situasi tertinggal jumlah pemain secara mengejutkan",
      "menemukan celah kosong di pertahanan B dan langsung menanam spike",
      "memperlihatkan kedisplinan tinggi menahan sudut, menembak mati lurker kita",
      "menggagalkan defuse kita dengan spamming peluru menembus dinding tipis",
      "melakukan pop-flash agresif keluar smoke dan meratakan barisan depan kita",
      "berhasil mencuri poin berharga lewat skema eco-rush tak terduga"
    ];

    const runSimulationLoop = () => {
      const isRegularWin = (mScore === 13 || eScore === 13) && Math.abs(mScore - eScore) >= 1 && (mScore < 12 || eScore < 12);
      const isOvertimeWin = (mScore >= 14 || eScore >= 14) && Math.abs(mScore - eScore) >= 2;

      if (isRegularWin || isOvertimeWin) {
        setMatchStatus('finished');
        setLiveCommentary(mScore > eScore 
          ? `👑 GGS! Tim ${teamName.toUpperCase()} mengamankan kemenangan!` 
          : `❌ DEFEAT. Perjalanan tim ${teamName.toUpperCase()} di turnamen terhenti.`);
        return;
      }

      if (mScore === 12 && eScore === 12 && !isOvertime) {
        setIsOvertime(true);
        const otLog = "🚨 OVERTIME! Ketegangan memuncak di skor 12-12.";
        setLiveCommentary(otLog);
        setMatchLogs(prev => [otLog, ...prev]);
        setTimeout(() => { nextRound(); }, 1000);
        return;
      }

      nextRound();
    };

    const nextRound = () => {
      const roll = Math.random();
      let logText = '';
      const myPlayers = mySquad.filter(p => p.role !== 'Coach');
      const enemyPlayers = enemyTeam.roster.filter(p => p.role !== 'Coach');
      const randomMyPlayer = myPlayers[Math.floor(Math.random() * myPlayers.length)]?.name || 'Pemain';
      const randomEnemyPlayer = enemyPlayers[Math.floor(Math.random() * enemyPlayers.length)]?.name || 'Musuh';

      const prefix = mScore >= 12 && eScore >= 12 ? "⚠️ [OT] " : `Round ${currentRound}: `;

      if (roll < myWinChance) {
        mScore++;
        const randomComm = userCommentaries[Math.floor(Math.random() * userCommentaries.length)];
        // FORMAT BARU: [Nama Pemain] [Aksi] - [NAMA TIM KAMU] MENANG ROUND!
        logText = `${prefix}${randomMyPlayer} ${randomComm} — ${teamName.toUpperCase()} MENANG ROUND!`;
        setMyScore(mScore);
      } else {
        eScore++;
        const randomComm = enemyCommentaries[Math.floor(Math.random() * enemyCommentaries.length)];
        // FORMAT BARU: [Nama Pemain] [Aksi] - [NAMA TIM MUSUH] MENANG ROUND!
        logText = `${prefix}${randomEnemyPlayer} ${randomComm} — ${enemyTeam.name.toUpperCase()} MENANG ROUND!`;
        setEnemyScore(eScore);
      }

      setLiveCommentary(logText);
      setMatchLogs(prev => [logText, ...prev]);
      currentRound++;
      setTimeout(runSimulationLoop, intervalDuration);
    };

    setTimeout(runSimulationLoop, intervalDuration);
  };

  const advanceTournament = () => {
    const currentMatchups = tournament.matchups;
    
    const winners = currentMatchups.map(match => {
      if (match.t1.isUser || match.t2.isUser) {
        const userWon = myScore > enemyScore;
        return userWon ? (match.t1.isUser ? match.t1 : match.t2) : (match.t1.isUser ? match.t2 : match.t1);
      } else {
        const winChance = 0.5 + (match.t1.ovr - match.t2.ovr) * 0.02;
        return Math.random() < winChance ? match.t1 : match.t2;
      }
    });

    if (tournament.stage === 'FINAL') {
      const championTeam = winners[0];
      const championName = championTeam.name;
      const championRegion = vctTeamsData[championName]?.region || 'Global';
      registerChampionToHallOfFame(championName, championRegion, 'World Champion', championTeam.ovr || 0);
      setTournament({...tournament, stage: 'CHAMPION', champion: championTeam});
      setMatchStatus('champion');
      return;
    }

    let nextStage = '';
    if (tournament.stage === 'RO16') nextStage = 'QF';
    else if (tournament.stage === 'QF') nextStage = 'SF';
    else if (tournament.stage === 'SF') nextStage = 'FINAL';

    const isUserStillAlive = winners.some(w => w.isUser);

    if (isUserStillAlive) {
      const nextMatchups = [];
      for (let i = 0; i < winners.length; i += 2) {
        nextMatchups.push({ t1: winners[i], text: winners[i+1], t2: winners[i+1] });
      }
      setTournament({ stage: nextStage, matchups: nextMatchups, champion: null });
      setMatchStatus('bracket');
    } else {
      let currentWinners = winners;
      while (currentWinners.length > 1) {
        const nextW = [];
        for (let i = 0; i < currentWinners.length; i += 2) {
          const chance = 0.5 + (currentWinners[i].ovr - currentWinners[i+1].ovr) * 0.02;
          nextW.push(Math.random() < chance ? currentWinners[i] : currentWinners[i+1]);
        }
        currentWinners = nextW;
      }
      const championTeam = currentWinners[0];
      const championName = championTeam.name;
      const championRegion = vctTeamsData[championName]?.region || 'Global';
      registerChampionToHallOfFame(championName, championRegion, 'World Champion', championTeam.ovr || 0);
      setTournament({...tournament, stage: 'CHAMPION', champion: championTeam});
      setMatchStatus('champion');
    }
  };

  useEffect(() => {
    loadHallOfFame();
  }, []);

  const getStageDisplayName = (stage) => {
    if(stage === 'RO16') return 'BABAK 16 BESAR';
    if(stage === 'QF') return 'QUARTER-FINAL (8 BESAR)';
    if(stage === 'SF') return 'SEMI-FINAL (4 BESAR)';
    if(stage === 'FINAL') return 'GRAND FINAL VCT';
    return '';
  };

  const resetGame = () => {
    setMySquad([]);
    setCurrentDrawnTeam(null);
    setEnemyTeam(null);
    setTournament(null);
    setMatchStatus('idle');
    setIsOvertime(false);
    setCurrentScreen('menu');
  };

  // --- SCREEN 1: LANDING REGISTER TIM (LIGHT BLUE + BOLD RED ACCENT) ---
  if (!isTeamNameSet) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.16),_transparent_35%),linear-gradient(135deg,_#180304_0%,_#2b0507_38%,_#0d0d0d_100%)] flex items-center justify-center p-6 font-sans relative overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-red-500/20 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-0 right-0 w-[420px] h-[420px] bg-black/40 rounded-full blur-[90px] pointer-events-none"></div>
        
        <div className="bg-white p-6 sm:p-8 lg:p-12 rounded-[2.5rem] border border-black/5 shadow-[0_20px_50px_rgba(0,0,0,0.15)] max-w-2xl w-full text-center z-10 relative">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter text-red-500 mb-4 font-serif uppercase leading-none drop-shadow-sm">
            GAFFER<br/>DRAFT
          </h1>
          <p className="text-neutral-600 text-base sm:text-lg mb-10 tracking-wide font-medium max-w-md mx-auto leading-relaxed">
            Mulai petualangan manajerialmu. Bentuk formasi impian dan kuasai sirkuit liga VCT global.
          </p>
          <div className="text-left mb-10">
            <label className="block text-xs font-black text-red-500 uppercase tracking-[0.2em] mb-4 ml-1">
              REGISTRASI NAMA SKUAD BARU
            </label>
            <input 
              type="text" 
              placeholder="Contoh: PRX FAANGAFF" 
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              className="w-full bg-neutral-50 border border-neutral-200 rounded-2xl p-5 sm:p-7 text-neutral-900 font-black focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/30 transition-all text-lg sm:text-2xl shadow-inner placeholder-neutral-400"
            />
          </div>
          <button 
            disabled={!teamName.trim()}
            onClick={() => setIsTeamNameSet(true)}
            className="w-full bg-red-500 hover:bg-red-600 disabled:bg-neutral-300 disabled:text-neutral-500 text-white font-black py-5 sm:py-7 rounded-2xl text-base sm:text-xl tracking-[0.1em] uppercase transition-all shadow-[0_10px_30px_rgba(239,68,68,0.3)] hover:shadow-[0_15px_40px_rgba(220,38,38,0.4)] transform hover:-translate-y-1 disabled:shadow-none disabled:transform-none disabled:cursor-not-allowed"
          >
            Masuk Ruang Manager ⚙️
          </button>
        </div>
      </div>
    );
  }

  // --- SCREEN 2: PILIHAN MENU UTAMA (DASHBOARD) ---
  if (currentScreen === 'menu') {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.14),_transparent_35%),linear-gradient(135deg,_#180304_0%,_#2b0507_38%,_#0d0d0d_100%)] text-neutral-800 flex flex-col items-center justify-center p-6 font-sans relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(239,68,68,0.22),transparent_28%)] pointer-events-none"></div>
        
        <div className="bg-white/95 border border-black/5 p-6 sm:p-8 lg:p-10 rounded-[2rem] shadow-[0_24px_60px_rgba(0,0,0,0.14)] max-w-5xl w-full text-center relative z-10 backdrop-blur-sm">
          <span className="text-xs font-mono font-bold text-red-500 tracking-widest block uppercase mb-2">WELCOME MANAGER</span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-neutral-800 tracking-wide uppercase font-serif mb-4">{teamName}</h1>
          <p className="text-neutral-600 text-sm mb-10 max-w-lg mx-auto leading-relaxed">Silakan pilih mode operasi taktis untuk mengelola tim atau melihat peringkat liga saat ini.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <button 
              onClick={() => setCurrentScreen('draft')}
              className="group relative bg-neutral-50 border border-neutral-200 rounded-3xl p-6 sm:p-8 text-left transition-all duration-300 shadow-sm overflow-hidden hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(239,68,68,0.15)] hover:border-red-500/50"
            >
              <div className="text-3xl sm:text-4xl mb-4 relative z-10">🎮</div>
              <h3 className="text-lg sm:text-xl font-black text-neutral-900 uppercase tracking-wide group-hover:text-red-500 transition-colors relative z-10">VCT DRAFT MODE</h3>
              <p className="text-sm text-neutral-500 mt-2 leading-relaxed relative z-10">Mulai mengacak pack roster pemain, menyusun formasi, lalu terjun ke Bracket Turnamen 16 Besar.</p>
            </button>
            <button 
              onClick={() => setCurrentScreen('hall_of_fame')}
              className="group relative bg-neutral-50 border border-neutral-200 rounded-3xl p-6 sm:p-8 text-left transition-all duration-300 shadow-sm overflow-hidden hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(239,68,68,0.15)] hover:border-red-500/50"
            >
              <div className="text-3xl sm:text-4xl mb-4 relative z-10">🏆</div>
              <h3 className="text-lg sm:text-xl font-black text-neutral-900 uppercase tracking-wide group-hover:text-red-500 transition-colors relative z-10">HALL OF FAME</h3>
              <p className="text-sm text-neutral-500 mt-2 leading-relaxed relative z-10">Lihat tabel papan peringkat tim-tim papan atas sirkuit liga global dengan OVR tertinggi.</p>
            </button>
          </div>
          <button 
            onClick={() => { setTeamName(''); setIsTeamNameSet(false); }}
            className="mt-10 text-xs text-neutral-500 hover:text-red-500 font-bold tracking-widest uppercase underline underline-offset-8 transition-colors"
          >
            ← Ganti Nama Skuad
          </button>
        </div>
      </div>
    );
  }

  // --- SCREEN 3: HALL OF FAME (LEADERBOARD LIGA) ---
  if (currentScreen === 'hall_of_fame') {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.14),_transparent_35%),linear-gradient(135deg,_#180304_0%,_#2b0507_38%,_#0d0d0d_100%)] text-neutral-800 flex flex-col items-center justify-center p-6 font-sans relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.16),transparent_25%)] pointer-events-none"></div>
        <div className="bg-white/95 border border-black/5 p-4 sm:p-6 lg:p-8 rounded-3xl shadow-[0_24px_60px_rgba(0,0,0,0.14)] max-w-6xl w-full z-10 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3 border-b border-neutral-200 pb-6 mb-8">
            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-red-500 font-serif uppercase tracking-wide">🏆 HALL OF FAME</h2>
              <p className="text-sm sm:text-base text-neutral-500 mt-1 font-medium">Riwayat juara akan muncul di sini setelah ada tim yang berhasil menjuarai turnamen.</p>
              {isSyncing && <p className="text-xs text-red-500 font-bold uppercase tracking-widest mt-2">Menyinkronkan data...</p>}
              {syncError && <p className="text-xs text-red-500 mt-2">{syncError}</p>}
            </div>
            <button onClick={() => setCurrentScreen('menu')} className="bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 text-neutral-700 font-bold px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider shadow transition-colors self-start sm:self-auto">← Kembali</button>
          </div>
          <div className="overflow-hidden border border-neutral-200 rounded-2xl bg-neutral-50">
            {hallOfFameData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="text-5xl mb-4">🏟️</div>
                <h3 className="text-xl font-black text-neutral-800 uppercase tracking-wide mb-2">BELUM ADA JUARA</h3>
                <p className="text-sm text-neutral-500 max-w-md leading-relaxed">
                  Daftar hall of fame masih kosong. Saat ada tim yang berhasil menjuarai turnamen, riwayat mereka akan muncul di sini.
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-neutral-100 border-b border-neutral-200 text-neutral-600 text-[11px] font-bold tracking-widest uppercase">
                    <th className="py-4 px-6 text-center w-20">RANK</th>
                    <th className="py-4 px-6">TEAM NAME</th>
                    <th className="py-4 px-6 text-center w-28">TEAM OVR</th>
                    <th className="py-4 px-6">REGION</th>
                    <th className="py-4 px-6">ACHIEVEMENT</th>
                  </tr>
                </thead>
                <tbody className="text-base divide-y divide-neutral-200 font-medium">
                  {hallOfFameData.map((data) => (
                    <tr key={data.rank} className="hover:bg-neutral-100 transition-colors duration-200">
                      <td className="py-4 px-6 text-center font-mono font-black text-red-500 text-lg">#{data.rank}</td>
                      <td className="py-4 px-6 font-black text-neutral-800 tracking-wide uppercase text-base">{data.team}</td>
                      <td className="py-4 px-6 text-center font-mono font-black text-red-500 text-lg">{data.ovr}</td>
                      <td className="py-4 px-6"><span className="bg-white border border-neutral-300 px-3 py-1 rounded-md text-xs font-mono font-bold text-neutral-600">{data.region}</span></td>
                      <td className="py-4 px-6 text-neutral-600 font-bold text-xs uppercase tracking-wider">{data.title}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- SCREEN 4: VCT DRAFT MODE & TOURNAMENT SCREEN ---
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.14),_transparent_35%),linear-gradient(135deg,_#180304_0%,_#2b0507_38%,_#0d0d0d_100%)] text-neutral-800 p-6 font-sans flex flex-col items-center selection:bg-red-500 selection:text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(239,68,68,0.22),transparent_28%)] pointer-events-none"></div>
      <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 lg:px-4 relative z-10">
        
        {/* TOP HEADER STATUS BAR */}
        <header className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center px-4 py-4 sm:px-8 sm:py-6 bg-white/95 backdrop-blur-sm border border-black/5 rounded-[1.75rem] mb-8 shadow-[0_18px_45px_rgba(0,0,0,0.08)]">
          <div className="flex items-center gap-3 sm:gap-6">
            <button 
              onClick={() => {
                if (mySquad.length > 0 && matchStatus !== 'champion') {
                  if (window.confirm("Keluar sekarang? Turnamen dan Skuad yang sudah disusun akan hangus.")) {
                    resetGame();
                  }
                } else {
                  resetGame();
                }
              }}
              className="bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl text-[11px] sm:text-xs uppercase border border-neutral-300 transition-all shadow-sm flex items-center justify-center gap-2 hover:-translate-y-0.5"
            >
              <span>←</span> MENU
            </button>
            <div>
              <span className="text-[10px] font-mono font-bold text-red-500 tracking-widest block uppercase mb-0.5">LEAGUE DRAFT STAGE</span>
              <h1 className="text-lg sm:text-2xl md:text-3xl lg:text-4xl font-black text-neutral-800 tracking-wide uppercase font-serif">{teamName}</h1>
            </div>
          </div>
          <div className="bg-neutral-50 px-4 py-2 sm:px-6 sm:py-2.5 rounded-xl border border-neutral-200 text-center flex items-center gap-3 sm:gap-5 shadow-inner">
            <span className="text-[10px] sm:text-xs text-neutral-500 font-bold tracking-widest uppercase">TEAM OVR</span>
            <span className="text-3xl sm:text-4xl lg:text-5xl font-black text-red-500 font-mono">{myOVR}</span>
          </div>
        </header>

        {/* --- STATE: DRAFTING PHASE --- */}
        {matchStatus === 'idle' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* KIRI: Tactical Board */}
            <div className="lg:col-span-4 flex flex-col w-full">
              <div className="relative w-full bg-white rounded-none p-6 shadow-[0_20px_50px_rgba(0,0,0,0.10)] border border-black/5 h-[700px] flex flex-col items-center justify-start overflow-hidden">
                <div className="absolute inset-0 border-[3px] border-neutral-200/50 rounded-none m-4 pointer-events-none flex flex-col justify-between">
                  <div className="w-full h-1/2 border-b-[3px] border-neutral-200/50 relative">
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-32 h-32 border-[3px] border-neutral-200/50 rounded-full translate-y-1/2"></div>
                  </div>
                </div>

                {/* COACH CARD CONTAINER */}
                <div className="flex justify-center w-full z-10 mt-2 mb-4">
                  {squadCoach ? (
                    <div className="w-[150px] h-[205px] bg-gradient-to-b from-[#40125c] to-[#1a082e] rounded-none border border-purple-400/50 relative flex flex-col justify-between p-3 shadow-[0_12px_30px_rgba(0,0,0,0.18)] transform hover:scale-105 transition-transform duration-300">
                      <div className="text-white font-black text-[32px] leading-none text-center w-full mb-1 relative z-10">🧠</div>
                      <div className="flex-grow flex items-center justify-center text-center relative z-10">
                        <span className="text-white font-black text-[24px] uppercase tracking-wide leading-tight break-all">{squadCoach.name}</span>
                      </div>
                      <div className="text-center text-purple-200 font-black text-[12px] uppercase tracking-[0.2em] relative z-10">COACH</div>
                    </div>
                  ) : (
                    <div className={`w-[110px] h-[110px] rounded-none border-2 border-dashed flex flex-col items-center justify-center text-center transition-all duration-300 ${isLastPick ? 'border-red-500 bg-red-50 text-red-500 animate-pulse' : 'border-neutral-300 bg-neutral-50 text-neutral-400'}`}>
                      <span className="text-[26px] font-black">🧠</span><span className="text-[12px] font-bold tracking-widest uppercase mt-1">COACH</span>
                    </div>
                  )}
                </div>

                {/* ALL 5 PLAYER CARDS */}
                <div className="flex justify-between items-end w-full z-10 px-1 mt-auto mb-4 gap-2.5">
                  {[0, 1, 2, 3, 4].map((idx) => (
                    squadPlayers[idx] ? (
                      <div key={squadPlayers[idx].id} className="w-[118px] h-[152px] bg-gradient-to-b from-[#9e1620] to-[#540b12] rounded-none border border-red-500/40 relative flex flex-col justify-between p-2.5 shadow-[0_10px_24px_rgba(0,0,0,0.16)] transform hover:-translate-y-2 hover:shadow-[0_14px_30px_rgba(239,68,68,0.18)] transition-transform duration-300">
                        <div className="text-white font-black text-[28px] leading-none relative z-10">{squadPlayers[idx].ovr}</div>
                        <div className="flex-grow flex items-center justify-center text-center relative z-10">
                          <span className="text-white font-black text-[18px] uppercase tracking-wide leading-tight break-all">{squadPlayers[idx].name}</span>
                        </div>
                        <div className="text-center text-red-100 font-bold text-[11px] uppercase tracking-widest relative z-10">{squadPlayers[idx].role}</div>
                      </div>
                    ) : (
                      <div key={idx} className="w-[108px] h-[120px] rounded-none border-2 border-dashed border-neutral-300 bg-neutral-50 flex flex-col items-center justify-center text-neutral-400">
                        <span className="text-[11px] font-bold uppercase tracking-widest">SLOT {idx + 1}</span>
                      </div>
                    )
                  ))}
                </div>

              </div>
            </div>

            {/* KANAN: Draft Selection Pool OR Ikut Tourney Panel */}
            <div className="lg:col-span-8 bg-white/95 border border-black/5 rounded-none p-5 sm:p-6 lg:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.10)] min-h-[760px] flex flex-col w-full relative overflow-hidden backdrop-blur-sm">
              
              {totalSquadCount === 6 ? (
                <div className="w-full flex-grow flex flex-col items-center justify-center py-20 text-center z-10">
                  <h2 className="text-5xl font-black text-red-500 tracking-widest mb-6 font-serif uppercase">SKUAD LENGKAP</h2>
                  <p className="text-base text-neutral-600 mb-10 tracking-wide px-10 leading-relaxed">
                    Formasi sempurna telah tercipta dengan rata-rata <span className="text-red-500 font-black text-lg bg-red-50 px-2 py-0.5 rounded">OVR {myOVR}</span>.<br/><br/>
                    Periksa kembali racikan tim andalanmu di panel kiri. Jika sudah yakin, tekan tombol di bawah ini untuk mendaftarkan skuadmu ke <span className="text-neutral-800 font-bold">Bracket Champions Tournament 16 Besar</span>.
                  </p>
                  <button onClick={initTournamentBracket} className="bg-red-500 hover:bg-red-600 text-white font-black px-12 py-5 rounded-2xl text-xl tracking-widest uppercase shadow-lg transition-all transform hover:-translate-y-1">
                    🏆 Daftarkan ke Tourney
                  </button>
                </div>
              ) : isRolling ? (
                <div className="w-full flex-grow flex flex-col items-center justify-center py-24 text-center z-10">
                  <div className="w-16 h-16 border-4 border-red-500 border-t-transparent rounded-full animate-spin mb-8"></div>
                  <span className="text-sm uppercase font-mono font-bold text-red-500 tracking-[0.3em] animate-pulse">SCOUTING NEXT TEAM...</span>
                  <h3 className="text-4xl font-black text-neutral-800 font-serif mt-4 bg-neutral-50 px-8 py-5 rounded-2xl border border-neutral-200 uppercase tracking-wide min-w-[320px] shadow-inner">{rollDisplayTeam}</h3>
                </div>
              ) : !currentDrawnTeam ? (
                <div className="w-full flex-grow flex flex-col items-center justify-center py-24 text-center z-10">
                  <p className="text-neutral-600 text-base mb-8 font-medium tracking-wide max-w-sm">Acak opsi tim pertamamu untuk menyusun roster mematikan.</p>
                  <button onClick={drawRandomTeam} className="bg-red-500 hover:bg-red-600 text-white font-black px-10 py-5 rounded-2xl text-base tracking-widest uppercase shadow-md transition-all transform hover:scale-105">
                    🎯 Mulai Acak Draft
                  </button>
                </div>
              ) : (
                <div className="w-full flex flex-col z-10">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 bg-neutral-50 border border-neutral-200 p-5 sm:p-6 rounded-none shadow-inner">
                    <div className="max-w-full sm:max-w-[75%]">
                      <span className="text-[10px] font-bold text-red-500 block tracking-[0.2em] uppercase font-mono mb-2">DRAFT POOL ACTIVE</span>
                      <h3 className="text-2xl sm:text-3xl lg:text-4xl font-black text-neutral-800 uppercase font-serif tracking-wide leading-tight break-words">{currentDrawnTeam.name}</h3>
                    </div>
                    <div className="bg-red-50 border border-red-200 px-5 py-2.5 rounded-2xl font-mono font-black text-sm text-red-500 whitespace-nowrap">{currentDrawnTeam.region}</div>
                  </div>
                  <p className="text-sm text-neutral-500 mb-5 font-medium tracking-wide border-b border-neutral-200 pb-4">Pilih dan rekrut satu pemain/pelatih ke dalam formasimu:</p>
                  
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 xl:gap-4 w-full">
                    {currentDrawnTeam.roster.map((player) => {
                      const disableCard = (player.role === "Coach" && isCoachFilled) || (isLastPick && !isCoachFilled && player.role !== "Coach");
                      return (
                        <button
                          key={player.id}
                          disabled={disableCard}
                          onClick={() => selectMember(player)}
                          className={`group flex items-center justify-between gap-3 p-4 sm:p-5 rounded-none border transition-all duration-300 relative overflow-hidden text-left min-h-[118px]
                            ${disableCard 
                              ? 'bg-neutral-50 border-neutral-200 opacity-50 cursor-not-allowed text-neutral-400' 
                              : player.role === 'Coach'
                                ? 'bg-white border-purple-200 hover:bg-purple-50/50 hover:border-purple-400 hover:shadow-[0_14px_35px_rgba(168,85,247,0.15)] cursor-pointer transform hover:-translate-y-1'
                                : 'bg-white border-neutral-200 hover:bg-red-50/30 hover:border-red-400 hover:shadow-[0_14px_35px_rgba(239,68,68,0.15)] cursor-pointer transform hover:-translate-y-1'
                            }`}
                        >
                          {!disableCard && (
                            <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${player.role === 'Coach' ? 'bg-purple-500' : 'bg-red-500'}`}></div>
                          )}

                          <div className="flex flex-col z-10 pl-2 pr-2 min-w-0">
                            <span className="font-black text-[20px] sm:text-[22px] text-neutral-800 uppercase tracking-wide leading-tight mb-2 break-words">{player.name}</span>
                            <span className="font-bold text-[12px] sm:text-[13px] uppercase tracking-widest text-neutral-500 group-hover:text-neutral-700 transition-colors">{currentDrawnTeam.name}</span>
                          </div>
                          
                          <div className="flex flex-col items-end z-10 text-right min-w-[70px]">
                            <span className={`font-black text-[24px] sm:text-[28px] font-mono leading-none ${disableCard ? 'text-neutral-300' : player.role === 'Coach' ? 'text-purple-600' : 'text-red-500'}`}>{player.ovr}</span>
                            <span className="font-bold text-[12px] sm:text-[13px] uppercase tracking-widest mt-2 text-neutral-500">{player.role}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- STATE: TOURNAMENT BRACKET OVERVIEW --- */}
        {matchStatus === 'bracket' && tournament && (
          <div className="max-w-6xl mx-auto bg-white p-5 sm:p-6 lg:p-8 rounded-none border border-black/5 shadow-[0_20px_50px_rgba(0,0,0,0.1)] w-full relative overflow-hidden">
            <div className="text-center mb-12 border-b border-neutral-200 pb-8 relative z-10">
              <span className="text-sm font-mono font-bold text-red-500 tracking-[0.3em] block uppercase mb-3">CHAMPIONS BRACKET STAGE</span>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-neutral-800 font-serif uppercase tracking-wide">{getStageDisplayName(tournament.stage)}</h2>
            </div>
            
            <div className="relative z-10 mb-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {tournament.matchups.map((match, idx) => {
                  const isUserMatch = match.t1.isUser || match.t2.isUser;
                  return (
                    <div key={idx} className={`relative flex justify-between items-center p-4 sm:p-5 rounded-none border transition-all duration-300 overflow-hidden ${isUserMatch ? 'border-red-400 bg-red-50/50 shadow-md transform hover:scale-[1.02] z-20' : 'border-neutral-200 bg-neutral-50 hover:bg-neutral-100 z-10'}`}>
                      <div className={`font-black uppercase w-5/12 text-center text-lg md:text-xl truncate z-10 ${match.t1.isUser ? 'text-red-500' : 'text-neutral-700'}`}>
                        {match.t1.name} <span className="text-[12px] text-neutral-500 block mt-1.5 font-mono">OVR {match.t1.ovr}</span>
                      </div>
                      <div className="w-2/12 flex justify-center z-10">
                        <div className={`text-[11px] font-black py-2 px-4 rounded-xl border ${isUserMatch ? 'bg-red-100 border-red-300 text-red-500' : 'bg-white border-neutral-300 text-neutral-600'}`}>VS</div>
                      </div>
                      <div className={`font-black uppercase w-5/12 text-center text-lg md:text-xl truncate z-10 ${match.t2.isUser ? 'text-red-500' : 'text-neutral-700'}`}>
                        {match.t2.name} <span className="text-[12px] text-neutral-500 block mt-1.5 font-mono">OVR {match.t2.ovr}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="flex justify-center relative z-10 mt-4">
              <button onClick={startBracketMatch} className="bg-red-500 hover:bg-red-600 text-white font-black px-12 py-4 rounded-none text-lg tracking-[0.2em] uppercase shadow-md transition-all transform hover:-translate-y-1">
                Mulai Pertandingan ⚔️
              </button>
            </div>
          </div>
        )}

        {/* --- STATE: MATCH IN PROGRESS OR FINISHED --- */}
        {(matchStatus === 'ready' || matchStatus === 'simulating' || matchStatus === 'finished') && enemyTeam && (
           <div className="max-w-6xl mx-auto">
             <div className="bg-white rounded-none border border-black/5 shadow-[0_20px_50px_rgba(0,0,0,0.1)] overflow-hidden flex flex-col items-center">
                
                {/* Scoreboard Header - HIGHLIGHT RAKSASA PADA ANGKA SKOR */}
                <div className="w-full bg-gradient-to-b from-neutral-50 to-neutral-100 p-8 sm:p-10 border-b border-neutral-200 flex flex-col items-center justify-center relative overflow-hidden">
                  
                  {/* Angka Skor Utama Ditonjolkan Besar Di Sini */}
                  <div className="flex flex-col items-center justify-center z-10 mb-8">
                    <div className="flex items-center gap-10 bg-white px-16 py-8 rounded-[3rem] border-2 border-red-500/10 shadow-[0_25px_60px_rgba(239,68,68,0.12)]">
                      {/* Skor Skuad Kita */}
                      <span className="text-[5.5rem] md:text-[8.5rem] lg:text-[10rem] font-black text-red-500 font-mono tracking-tighter tabular-nums leading-none drop-shadow-sm select-none">
                        {myScore}
                      </span>
                      {/* Strip Pembatas Tengah */}
                      <span className="text-neutral-300 font-black text-4xl md:text-5xl self-center px-3 select-none">-</span>
                      {/* Skor Skuad Musuh */}
                      <span className="text-[5.5rem] md:text-[8.5rem] lg:text-[10rem] font-black text-neutral-800 font-mono tracking-tighter tabular-nums leading-none drop-shadow-sm select-none">
                        {enemyScore}
                      </span>
                    </div>
                    {isOvertime && (
                      <span className="text-xs font-black text-red-600 tracking-[0.4em] mt-5 uppercase bg-red-100 px-5 py-2 rounded-full shadow-sm animate-pulse">
                        🚨 OVERTIME DETECTED 🚨
                      </span>
                    )}
                  </div>

                  {/* Informasi Nama Tim Dipindah ke Sisi Bawah Skor Secara Simetris */}
                  <div className="w-full max-w-5xl flex justify-between items-center px-4 sm:px-8 mt-2 border-t border-neutral-200/60 pt-6">
                    {/* Nama Tim Kita */}
                    <div className="w-5/12 text-right pr-6">
                      <h3 className="text-3xl md:text-4xl font-black text-red-500 uppercase tracking-wide truncate">
                        {teamName}
                      </h3>
                      <span className="text-xs text-neutral-500 font-mono mt-1.5 block font-bold uppercase tracking-widest">
                        OUR SQUAD • OVR {myOVR}
                      </span>
                    </div>

                    {/* Badge VS Kecil */}
                    <div className="w-2/12 flex justify-center">
                      <span className="text-xs font-black text-neutral-400 font-mono bg-neutral-200/70 px-4 py-1.5 rounded-xl border border-neutral-300/40 uppercase tracking-widest">VS</span>
                    </div>

                    {/* Nama Tim Lawan */}
                    <div className="w-5/12 text-left pl-6">
                      <h3 className="text-2xl md:text-4xl font-black text-neutral-700 uppercase tracking-wide truncate">
                        {enemyTeam.name}
                      </h3>
                      <span className="text-xs text-neutral-500 font-mono mt-1.5 block font-bold uppercase tracking-widest">
                        ENEMY TEAM • OVR {enemyTeam.ovr}
                      </span>
                    </div>
                  </div>

                </div>

                {/* Match Action Area */}
                <div className="w-full p-5 sm:p-8 lg:p-10 flex flex-col items-center">
                  <div className={`text-center p-5 sm:p-6 rounded-none border w-full max-w-3xl mb-8 ${matchStatus === 'finished' ? 'bg-red-50 border-red-300' : 'bg-neutral-50 border-neutral-200 shadow-inner'}`}>
                    <p className={`text-xl font-bold tracking-wide leading-relaxed ${matchStatus === 'finished' ? 'text-red-500 drop-shadow-xs' : 'text-neutral-700'}`}>
                      {liveCommentary}
                    </p>
                  </div>

                  {matchStatus === 'ready' && (
                    <button onClick={startMatchSimulation} className="bg-red-500 hover:bg-red-600 text-white font-black px-12 py-4 rounded-none text-lg tracking-[0.2em] uppercase shadow-md transition-transform transform hover:scale-[1.03]">
                      START SIMULATION ▶
                    </button>
                  )}

                  {matchStatus === 'finished' && (
                    <button onClick={advanceTournament} className="bg-neutral-800 hover:bg-neutral-900 text-white font-black px-10 py-4 rounded-none text-lg tracking-widest uppercase shadow-md transition-all transform hover:-translate-y-1">
                      Lanjutkan Turnamen ➔
                    </button>
                  )}

                  {/* Match Logs */}
                  <div className="w-full max-w-3xl mt-10">
                    <h4 className="text-xs text-neutral-500 font-bold uppercase tracking-[0.2em] border-b border-neutral-200 pb-3 mb-5">MATCH LOGS</h4>
                    <div className="h-56 overflow-y-auto pr-3 space-y-3 text-sm font-medium text-neutral-700 flex flex-col custom-scrollbar">
                      {matchLogs.map((log, i) => (
                        <div key={i} className="bg-neutral-50 p-3 rounded-none border border-neutral-200 border-l-4 border-l-red-500">{log}</div>
                      ))}
                    </div>
                  </div>
                </div>
             </div>
           </div>
        )}

        {/* --- STATE: TOURNAMENT CHAMPION --- */}
        {matchStatus === 'champion' && tournament.champion && (
          <div className="max-w-5xl mx-auto bg-white p-5 sm:p-8 lg:p-14 rounded-[3rem] border border-red-300 shadow-[0_20px_60px_rgba(239,68,68,0.15)] text-center mt-10 relative overflow-hidden">
             <div className="text-6xl sm:text-7xl lg:text-8xl mb-8 relative z-10 animate-bounce">🏆</div>
             <h2 className="text-sm font-mono font-bold text-red-500 tracking-[0.3em] block uppercase mb-4 relative z-10">VCT GRAND CHAMPION</h2>
             <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black text-neutral-800 font-serif uppercase tracking-wide mb-8 relative z-10">{tournament.champion.name}</h1>
             
             <p className="text-base sm:text-lg text-neutral-600 font-medium mb-12 relative z-10 leading-relaxed max-w-xl mx-auto">
               {tournament.champion.isUser 
                 ? "Luar biasa, Manager! Susunan pemain dan taktikmu berhasil mendominasi turnamen hingga mengklaim gelar juara dunia." 
                 : `Timmu harus mengakui keunggulan lawan kali ini. ${tournament.champion.name} berhasil keluar sebagai juara dunia.`}
             </p>
             
             <button onClick={resetGame} className="relative z-10 bg-red-500 hover:bg-red-600 text-white font-black px-12 py-5 rounded-2xl text-xl tracking-[0.1em] uppercase shadow-md transition-all transform hover:-translate-y-1">
               Kembali ke Menu Utama
             </button>
          </div>
        )}

      </div>
      
      {/* Custom Styles */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f5f5f5; 
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #ddd; 
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #ccc; 
        }
      `}} />
    </div>
  );
}

export default App;