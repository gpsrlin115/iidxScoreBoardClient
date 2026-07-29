import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiUploadCloud, FiFile, FiX, FiCheckCircle } from 'react-icons/fi';
import { importApi } from '../api/import';
import Button from '../components/common/Button';
import { toAppError } from '../utils/httpError';

/**
 * 🎓 학습 포인트: 파일 입력을 다루는 두 가지 방법
 *
 * 1. 기본 방식: <input type="file" onChange={handler} />
 *    - 단순하지만 스타일 커스터마이징이 힘듦
 *    - 브라우저 기본 UI가 그대로 노출됨
 *
 * 2. 커스텀 방식: 숨긴 input + 커스텀 UI
 *    - <input type="file" ref={fileInputRef} className="hidden" />
 *    - 커스텀 버튼 클릭 시 fileInputRef.current.click() 호출
 *    - 원하는 대로 디자인 가능 (드래그 앤 드롭 영역 등)
 *
 * 🎓 useRef란?
 * DOM 요소를 직접 참조할 때 사용합니다.
 * ref={fileInputRef}로 붙이면 fileInputRef.current가 그 DOM 요소를 가리킵니다.
 * useState와 다른 점: ref 변경 시 리렌더링이 발생하지 않습니다.
 *
 * 🎓 드래그 앤 드롭 이벤트
 * - onDragOver: 파일을 드래그해서 영역 위에 올렸을 때
 * - onDrop: 드래그한 파일을 놓았을 때
 * - e.dataTransfer.files[0]: 드롭된 파일 객체
 */

// 업로드 결과 통계 카드
const StatCard = ({ label, value, color = 'text-white' }) => (
  <div className="bg-slate-800 rounded-xl p-4 text-center">
    <p className={`text-3xl font-bold font-mono ${color}`}>{value}</p>
    <p className="text-slate-400 text-xs mt-1">{label}</p>
  </div>
);

const CsvUpload = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null); // 숨긴 file input을 참조

  // ─── 상태 ───
  const [file, setFile] = useState(null);           // 선택된 파일 객체
  const [playStyle, setPlayStyle] = useState('SP'); // SP / DP 선택
  const [isDragging, setIsDragging] = useState(false); // 드래그 중인지
  const [uploadState, setUploadState] = useState('idle'); // idle | uploading | success | error
  const [progress, setProgress] = useState(0);      // 업로드 진행률 %
  const [result, setResult] = useState(null);        // API 응답 결과

  // ─── 파일 유효성 검사 ───
  const validateFile = (selectedFile) => {
    if (!selectedFile) return false;
    if (!selectedFile.name.endsWith('.csv')) {
      toast.error('CSV 파일만 업로드 가능합니다.');
      return false;
    }
    if (selectedFile.size > 10 * 1024 * 1024) { // 10MB
      toast.error('파일 크기는 10MB 이하만 가능합니다.');
      return false;
    }
    return true;
  };

  const handleFileSelect = (selectedFile) => {
    if (validateFile(selectedFile)) {
      setFile(selectedFile);
      setUploadState('idle');
      setResult(null);
    }
  };

  // ─── 드래그 앤 드롭 핸들러 ───
  const handleDragOver = (e) => {
    e.preventDefault(); // 브라우저 기본 동작(파일 열기) 방지
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files[0]);
  };

  // ─── 업로드 실행 ───
  const handleUpload = async () => {
    if (!file) return;
    setUploadState('uploading');
    setProgress(0);

    try {
      const data = await importApi.uploadCsv(file, playStyle, setProgress);
      setResult(data);
      setUploadState('success');
      toast.success(`${data.scoresImported + data.scoresUpdated}개 스코어 처리 완료!`);
    } catch (err) {
      setUploadState('error');
      const msg = toAppError(err, { fallback: '업로드 중 오류가 발생했습니다.' }).message;
      toast.error(msg);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">CSV 업로드</h1>
        <p className="text-slate-400 text-sm mt-1">
          e-amusement gate에서 다운로드한 CSV 파일을 업로드하세요.
        </p>
      </div>

      {/* ── SP / DP 선택 ── */}
      <div className="flex gap-3">
        {['SP', 'DP'].map((style) => (
          <button
            key={style}
            onClick={() => setPlayStyle(style)}
            className={`flex-1 py-3 rounded-xl font-bold text-lg transition border-2 ${
              playStyle === style
                ? 'border-primary-500 bg-primary-500/20 text-primary-400'
                : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600'
            }`}
          >
            {style}
          </button>
        ))}
      </div>

      {/* ── 드래그 앤 드롭 + 파일 선택 영역 ── */}
      {/**
        * 🎓 왜 label을 쓸까요?
        * <label htmlFor="file-input">은 클릭하면 연결된 input이 활성화됩니다.
        * 즉, 숨긴 input을 직접 클릭시키는 것과 같은 효과입니다.
        * ref.current.click()을 써도 되지만, label이 더 HTML 시맨틱에 맞습니다.
        */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition
          ${isDragging
            ? 'border-primary-500 bg-primary-500/10'
            : file
            ? 'border-green-600 bg-green-900/10'
            : 'border-slate-700 hover:border-slate-500 bg-slate-800/40'
          }`}
      >
        {/* 숨겨진 실제 file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files[0])}
        />

        {file ? (
          /* 파일 선택된 상태 */
          <div className="flex items-center justify-center gap-3">
            <FiFile className="text-green-400 text-3xl flex-shrink-0" />
            <div className="text-left">
              <p className="text-white font-medium">{file.name}</p>
              <p className="text-slate-400 text-sm">
                {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation(); // 부모 div의 onClick 막기
                setFile(null);
                setUploadState('idle');
              }}
              className="ml-auto text-slate-500 hover:text-red-400 p-1 transition"
            >
              <FiX size={20} />
            </button>
          </div>
        ) : (
          /* 파일 미선택 상태 */
          <div>
            <FiUploadCloud className="text-slate-500 text-5xl mx-auto mb-3" />
            <p className="text-slate-300 font-medium">
              CSV 파일을 드래그하거나 클릭하여 선택
            </p>
            <p className="text-slate-600 text-sm mt-1">최대 10MB, .csv 형식</p>
          </div>
        )}
      </div>

      {/* ── 업로드 진행률 바 ── */}
      {uploadState === 'uploading' && (
        <div>
          <div className="flex justify-between text-sm text-slate-400 mb-1">
            <span>업로드 중...</span>
            <span>{progress}%</span>
          </div>
          {/**
            * 🎓 인라인 style로 width를 동적 설정
            * Tailwind는 동적 값(w-[45%] 등)을 빌드 시 생성하지 못합니다.
            * 퍼센트처럼 런타임에 숫자가 바뀌는 경우 인라인 style을 사용합니다.
            */}
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 transition-all duration-300 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* ── 업로드 성공 결과 ── */}
      {uploadState === 'success' && result && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-400">
            <FiCheckCircle size={20} />
            <span className="font-semibold">업로드 완료!</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="곡 추가" value={result.songsImported} color="text-primary-400" />
            <StatCard label="차트 추가" value={result.chartsImported} color="text-primary-400" />
            <StatCard label="신규 스코어" value={result.scoresImported} color="text-green-400" />
            <StatCard label="스코어 갱신" value={result.scoresUpdated} color="text-yellow-400" />
          </div>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => navigate('/scores')}
          >
            스코어 목록 보기 →
          </Button>
        </div>
      )}

      {/* ── 업로드 버튼 ── */}
      {uploadState !== 'success' && (
        <Button
          className="w-full"
          onClick={handleUpload}
          isLoading={uploadState === 'uploading'}
          disabled={!file || uploadState === 'uploading'}
        >
          <FiUploadCloud />
          {uploadState === 'uploading' ? '업로드 중...' : '업로드'}
        </Button>
      )}

      {/* ── 안내 ── */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4 text-sm text-slate-400 space-y-1">
        <p className="font-medium text-slate-300">📋 파일 준비 방법</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>e-amusement gate 로그인</li>
          <li>IIDX 플레이 데이터 → 성적 다운로드 (CSV)</li>
          <li>위에서 SP/DP 선택 후 파일 업로드</li>
        </ol>
      </div>
    </div>
  );
};

export default CsvUpload;
