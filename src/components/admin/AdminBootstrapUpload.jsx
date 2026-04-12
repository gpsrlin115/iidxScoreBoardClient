import React, { useRef } from 'react';
import toast from 'react-hot-toast';
import { FiDatabase } from 'react-icons/fi';
import { importApi } from '../../api/import';
import { useLoading } from '../../hooks/useLoading';

const AdminBootstrapUpload = ({ playStyle }) => {
  const fileInputRef = useRef(null);
  const { run, isRunning } = useLoading();

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast.error('CSV 파일만 업로드 가능합니다.');
      return;
    }

    try {
      const data = await run(
        () => importApi.bootstrapAdminCsv(file, playStyle),
        `${playStyle} 데이터를 DB에 적재하는 중...`
      );
      toast.success(`DB 초기화 성공! (곡: ${data.songsImported}, 패턴: ${data.chartsImported})`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'DB 초기화 업로드에 실패했습니다.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div>
      <input
        type="file"
        accept=".csv"
        ref={fileInputRef}
        onChange={handleFileSelect}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={isRunning}
        className="h-full px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-2 transition border border-slate-700 font-medium text-sm shadow-sm"
        title="Upload total CSV to populate Song/Chart DB"
      >
        <FiDatabase className="text-accent-500" /> Init DB
      </button>
    </div>
  );
};

export default AdminBootstrapUpload;
