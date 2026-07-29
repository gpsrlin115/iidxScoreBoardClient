import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { FiActivity, FiStar, FiAward, FiCheckCircle, FiTarget } from 'react-icons/fi';
import useDashboard from '../hooks/useDashboard';
import { FullPageSpinner } from '../components/common/Spinner';
import ErrorView from '../components/common/ErrorView';
import { CLEAR_TYPE_LABELS, normalizeClearType } from '../utils/clearTypes';

/**
 * 🎓 학습 포인트: StatCard 컴포넌트 분리
 * 대시보드에서 반복되는 통계 카드를 별도 컴포넌트로 분리합니다.
 * props로 아이콘, 라벨, 값, 색상을 전달받아 렌더링합니다.
 */
const StatCard = ({ icon: Icon, label, value, colorClass }) => (
  <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 shadow-sm flex items-center gap-4">
    <div className={`p-3 rounded-lg bg-slate-700/50 ${colorClass}`}>
      <Icon size={24} />
    </div>
    <div>
      <p className="text-slate-400 text-sm">{label}</p>
      <p className="text-2xl font-bold text-white font-mono mt-0.5">
        {value.toLocaleString()}
      </p>
    </div>
  </div>
);

const Dashboard = () => {
  const { stats, recentScores, isLoading, error, refetch } = useDashboard();

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <FullPageSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorView
        status={error.status}
        message={error.message}
        variant="page"
        onRetry={error.retryable ? refetch : undefined}
      />
    );
  }

  // 🎓 클리어 비율 계산 (총 플레이 기반)
  const playedCount = stats.total;
  const fcPercent = playedCount > 0 ? (stats.fullCombo / playedCount) * 100 : 0;
  const exHardPercent = playedCount > 0 ? (stats.exHard / playedCount) * 100 : 0;
  const hardPercent = playedCount > 0 ? (stats.hard / playedCount) * 100 : 0;
  const clearPercent = playedCount > 0 ? (stats.clear / playedCount) * 100 : 0;
  // 나머지는 Failed/Assist 등
  const otherPercent = Math.max(0, 100 - (fcPercent + exHardPercent + hardPercent + clearPercent));

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <FiActivity className="text-primary-500" />
          플레이 요약
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          현재 등록된 전체 스코어 현황입니다.
        </p>
      </div>

      {/* ── 1. 통계 카드 행 ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard icon={FiTarget} label="Play Count" value={stats.total} colorClass="text-slate-300" />
        <StatCard icon={FiStar} label="FULL COMBO" value={stats.fullCombo} colorClass="text-[#fecaca]" />
        <StatCard icon={FiAward} label="EX HARD" value={stats.exHard} colorClass="text-[#fef08a]" />
        <StatCard icon={FiAward} label="HARD" value={stats.hard} colorClass="text-white" />
        <StatCard icon={FiCheckCircle} label="CLEAR" value={stats.clear} colorClass="text-[#bfdbfe]" />
      </div>

      {/* ── 2. 클리어 분포 차트 ── */}
      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
        <h2 className="text-lg font-bold text-white mb-4">클리어 분포</h2>
        
        {/*
          🎓 막대 차트를 CSS Flex와 퍼센테이지 width만으로 구현합니다.
          Chart.js 같은 무거운 라이브러리 없이도 휼륭한 시각화가 가능합니다.
        */}
        <div className="h-6 w-full flex rounded-full overflow-hidden bg-slate-700 mb-4">
          <div style={{ width: `${fcPercent}%` }} className="bg-gradient-to-r from-pink-500 to-yellow-400 transition-all duration-500" title={`FC: ${fcPercent.toFixed(1)}%`} />
          <div style={{ width: `${exHardPercent}%` }} className="bg-yellow-400 transition-all duration-500" title={`EX HARD: ${exHardPercent.toFixed(1)}%`} />
          <div style={{ width: `${hardPercent}%` }} className="bg-white transition-all duration-500" title={`HARD: ${hardPercent.toFixed(1)}%`} />
          <div style={{ width: `${clearPercent}%` }} className="bg-blue-400 transition-all duration-500" title={`CLEAR: ${clearPercent.toFixed(1)}%`} />
          <div style={{ width: `${otherPercent}%` }} className="bg-slate-500 transition-all duration-500" title={`OTHER: ${otherPercent.toFixed(1)}%`} />
        </div>

        {/* 범례 (Legend) */}
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-gradient-to-r from-pink-500 to-yellow-400" />
            <span className="text-slate-300">FC ({fcPercent.toFixed(1)}%)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-yellow-400" />
            <span className="text-slate-300">EX HARD ({exHardPercent.toFixed(1)}%)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-white" />
            <span className="text-slate-300">HARD ({hardPercent.toFixed(1)}%)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-400" />
            <span className="text-slate-300">CLEAR ({clearPercent.toFixed(1)}%)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-slate-500" />
            <span className="text-slate-300">OTHER ({otherPercent.toFixed(1)}%)</span>
          </div>
        </div>
      </div>

      {/* ── 3. 최근 갱신 내역 ── */}
      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-white">최근 갱신 (Recent)</h2>
          <Link to="/scores" className="text-sm text-primary-400 hover:text-primary-300 transition">
            전체보기 →
          </Link>
        </div>

        {recentScores.length === 0 ? (
          <p className="text-slate-500 text-center py-8">최근 플레이 기록이 없습니다.</p>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {recentScores.map((score) => {
              const clearType = normalizeClearType(score.bestClearType) ?? 'NO_PLAY';

              return (
              <div key={score.id} className="py-4 flex justify-between items-center group">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      score.chart.playStyle === 'SP' ? 'bg-pink-500/20 text-pink-400' : 'bg-purple-500/20 text-purple-400'
                    }`}>
                      {score.chart.playStyle}
                    </span>
                    <span className="text-slate-400 text-sm font-mono">☆{score.chart.level}</span>
                    <span className="text-xs text-slate-500 bg-slate-700 px-1.5 py-0.5 rounded">
                      {score.chart.chartType}
                    </span>
                  </div>
                  <p className="text-white font-medium text-lg mt-1 group-hover:text-primary-400 transition">
                    {score.song.title}
                  </p>
                </div>

                <div className="text-right">
                  <div className="flex items-center justify-end gap-2 mb-1">
                    <span className={`px-2 py-1 rounded text-xs font-bold border
                      ${clearType === 'FULLCOMBO_CLEAR' ? 'bg-gradient-to-r from-pink-500/20 to-yellow-500/20 text-pink-300 border-pink-500/50' :
                        clearType === 'EX_HARD_CLEAR' ? 'bg-yellow-900/30 text-yellow-500 border-yellow-700/50' :
                        clearType === 'HARD_CLEAR' ? 'bg-white/10 text-white border-white/30' :
                        clearType === 'CLEAR' ? 'bg-blue-900/30 text-blue-400 border-blue-700/50' :
                        clearType === 'EASY_CLEAR' ? 'bg-green-900/30 text-green-400 border-green-700/50' :
                        clearType === 'ASSIST_CLEAR' ? 'bg-purple-900/30 text-purple-400 border-purple-700/50' :
                        'bg-slate-800 text-slate-400 border-slate-600'}
                    `}>
                      {CLEAR_TYPE_LABELS[clearType] ?? clearType}
                    </span>
                    <span className={`font-bold font-mono text-lg
                      ${score.bestDjLevel === 'AAA' ? 'text-yellow-400' :
                        score.bestDjLevel === 'AA' ? 'text-slate-300' :
                        score.bestDjLevel === 'A' ? 'text-green-400' : 'text-slate-500'}
                    `}>
                      {score.bestDjLevel}
                    </span>
                  </div>
                  {score.bestPlayedAt && (
                    <p className="text-xs text-slate-500">
                      {format(new Date(score.bestPlayedAt), 'yyyy-MM-dd')}
                    </p>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
